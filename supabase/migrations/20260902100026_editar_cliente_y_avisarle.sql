-- ============================================================
-- Editar un cliente desde el portal, y avisarle
-- ============================================================
-- La pantalla de Clientes solo dejaba mirar. Corregir un teléfono mal escrito
-- o el documento de una empresa había que hacerlo pidiéndole al cliente que
-- entrara a su perfil, y mientras tanto el despacho salía con el dato malo.
--
-- POR QUÉ UNA FUNCIÓN Y NO UN `update` DESDE EL NAVEGADOR:
--
--   1. RLS no lo permitiría. `profiles_admin_total` deja escribir solo al
--      administrador y `profiles_update_propio` solo al dueño de la fila. Un
--      asesor con `users.manage` —que es quien atiende al cliente— no podría
--      corregir nada. Aquí la puerta la abre el PERMISO, no el rol.
--   2. El aviso al cliente no puede ser opcional. Si el `update` viviera en el
--      navegador, cualquier otra pantalla, un script o una corrección a mano
--      cambiarían los datos sin que el cliente se enterara. Metiéndolos en la
--      misma función y en la misma transacción, no hay forma de actualizar sin
--      avisar: o pasan las dos cosas, o no pasa ninguna.
--   3. `notifications` solo acepta inserciones de administrador
--      (`notifications_insert_admin`), así que el aviso tenía que salir de
--      aquí de todos modos.
--
-- EL AVISO DICE QUÉ, CUÁNDO Y QUIÉN. Un «tus datos fueron actualizados» a
-- secas obliga al cliente a revisar su perfil campo por campo para descubrir
-- qué le tocaron; y sin el nombre de quien lo hizo, no tiene a quién
-- preguntarle. Se listan los campos con su valor anterior y el nuevo.
--
-- SE LEE EL VALOR DESPUÉS DE GUARDAR, no el que llegó. Los disparadores de
-- normalización pasan nombres y direcciones a mayúsculas y quitan los puntos
-- del documento, así que anunciar lo que se envió diría «Juan perez» cuando la
-- base guardó «JUAN PEREZ». El cliente vería en su perfil algo distinto de lo
-- que dice su aviso.
--
-- SI NO CAMBIA NADA, NO SE AVISA. Abrir el formulario, no tocar nada y
-- guardar es lo más normal del mundo; mandar un aviso por eso enseña al
-- cliente a ignorarlos.

-- ------------------------------------------------------------
-- Texto legible de un cambio
-- ------------------------------------------------------------
create or replace function public.describir_cambio(
  _etiqueta text, _antes text, _despues text
) returns text
language sql
immutable
as $$
  select _etiqueta || ': '
       || coalesce(nullif(trim(_antes), ''), '(vacío)')
       || ' → '
       || coalesce(nullif(trim(_despues), ''), '(vacío)');
$$;

-- ------------------------------------------------------------
-- Quién hizo el cambio, en palabras
-- ------------------------------------------------------------
create or replace function public.nombre_de_quien_edita()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    p.email,
    'el equipo de Pintuco'
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- ------------------------------------------------------------
-- Actualizar una persona natural
-- ------------------------------------------------------------
create or replace function public.actualizar_cliente_persona(
  _user_id uuid,
  _datos jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes    public.profiles%rowtype;
  v_despues  public.profiles%rowtype;
  v_cambios  text[] := '{}';
  v_quien    text;
  v_cuando   timestamptz := now();
begin
  if not public.has_permission('users.manage') then
    raise exception 'FORBIDDEN: no tienes permiso para editar clientes'
      using errcode = '42501';
  end if;

  select * into v_antes from public.profiles where id = _user_id;
  if not found then
    raise exception 'NOT_FOUND: ese cliente no existe' using errcode = 'P0002';
  end if;

  -- No se toca a nadie del personal interno desde la pantalla de Clientes:
  -- los datos de un empleado se cambian en Usuarios, con sus propias reglas.
  if exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role in ('ASESOR','TECNICO','ADMINISTRADOR','BODEGA','DESPACHO',
                      'FACTURACION','TESORERIA','CONTABILIDAD','SERVICIO_CLIENTE',
                      'MARKETING','GERENCIA')
  ) then
    raise exception 'ES_PERSONAL: esa cuenta es del personal interno; edítala en Usuarios'
      using errcode = '42501';
  end if;

  -- Solo se escribe lo que venga en el objeto: una clave ausente significa
  -- "no lo cambies". Mandar null borraría el dato sin querer al guardar un
  -- formulario que no mostraba ese campo.
  update public.profiles set
    first_name      = coalesce(_datos ->> 'first_name', first_name),
    last_name       = coalesce(_datos ->> 'last_name', last_name),
    phone           = coalesce(_datos ->> 'phone', phone),
    address         = coalesce(_datos ->> 'address', address),
    document_type   = coalesce((_datos ->> 'document_type')::public.document_type, document_type),
    document_number = coalesce(_datos ->> 'document_number', document_number),
    client_type     = coalesce((_datos ->> 'client_type')::public.client_type, client_type),
    city            = coalesce(_datos ->> 'city', city),
    country_code       = coalesce(_datos ->> 'country_code', country_code),
    municipality_code  = coalesce(_datos ->> 'municipality_code', municipality_code),
    neighborhood_id    = coalesce((_datos ->> 'neighborhood_id')::uuid, neighborhood_id),
    updated_at      = v_cuando
  where id = _user_id;

  -- Se relee para contar lo que la base GUARDÓ, ya normalizado.
  select * into v_despues from public.profiles where id = _user_id;

  if coalesce(v_antes.first_name,'') is distinct from coalesce(v_despues.first_name,'')
     or coalesce(v_antes.last_name,'') is distinct from coalesce(v_despues.last_name,'') then
    v_cambios := v_cambios || public.describir_cambio(
      'Nombre',
      coalesce(v_antes.first_name,'') || ' ' || coalesce(v_antes.last_name,''),
      coalesce(v_despues.first_name,'') || ' ' || coalesce(v_despues.last_name,''));
  end if;
  if coalesce(v_antes.phone,'') is distinct from coalesce(v_despues.phone,'') then
    v_cambios := v_cambios || public.describir_cambio('Teléfono', v_antes.phone, v_despues.phone);
  end if;
  if coalesce(v_antes.address,'') is distinct from coalesce(v_despues.address,'') then
    v_cambios := v_cambios || public.describir_cambio('Dirección', v_antes.address, v_despues.address);
  end if;
  if coalesce(v_antes.document_number,'') is distinct from coalesce(v_despues.document_number,'')
     or v_antes.document_type is distinct from v_despues.document_type then
    v_cambios := v_cambios || public.describir_cambio(
      'Documento',
      coalesce(v_antes.document_type::text,'') || ' ' || coalesce(v_antes.document_number,''),
      coalesce(v_despues.document_type::text,'') || ' ' || coalesce(v_despues.document_number,''));
  end if;
  if coalesce(v_antes.city,'') is distinct from coalesce(v_despues.city,'') then
    v_cambios := v_cambios || public.describir_cambio('Ciudad', v_antes.city, v_despues.city);
  end if;
  if v_antes.client_type is distinct from v_despues.client_type then
    v_cambios := v_cambios || public.describir_cambio(
      'Tipo de cliente', v_antes.client_type::text, v_despues.client_type::text);
  end if;

  if array_length(v_cambios, 1) is null then
    return jsonb_build_object('cambios', 0, 'aviso', false);
  end if;

  v_quien := public.nombre_de_quien_edita();

  perform public.avisar_cambio_de_datos(
    array[_user_id], v_quien, v_cuando, v_cambios, 'tus datos');

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'CLIENT_UPDATE', 'profiles', _user_id,
          jsonb_build_object('cambios', to_jsonb(v_cambios)));

  return jsonb_build_object(
    'cambios', array_length(v_cambios, 1),
    'aviso', true,
    'detalle', to_jsonb(v_cambios));
end;
$$;

-- ------------------------------------------------------------
-- Actualizar una empresa
-- ------------------------------------------------------------
create or replace function public.actualizar_cliente_empresa(
  _company_id uuid,
  _datos jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes   public.companies%rowtype;
  v_despues public.companies%rowtype;
  v_cambios text[] := '{}';
  v_quien   text;
  v_cuando  timestamptz := now();
  v_gente   uuid[];
begin
  if not public.has_permission('users.manage') then
    raise exception 'FORBIDDEN: no tienes permiso para editar clientes'
      using errcode = '42501';
  end if;

  select * into v_antes from public.companies where id = _company_id;
  if not found then
    raise exception 'NOT_FOUND: esa empresa no existe' using errcode = 'P0002';
  end if;

  update public.companies set
    name        = coalesce(_datos ->> 'name', name),
    legal_name  = coalesce(_datos ->> 'legal_name', legal_name),
    nit         = coalesce(_datos ->> 'nit', nit),
    phone       = coalesce(_datos ->> 'phone', phone),
    email       = coalesce(_datos ->> 'email', email),
    address     = coalesce(_datos ->> 'address', address),
    city        = coalesce(_datos ->> 'city', city),
    logo_url    = coalesce(_datos ->> 'logo_url', logo_url),
    country_code      = coalesce(_datos ->> 'country_code', country_code),
    municipality_code = coalesce(_datos ->> 'municipality_code', municipality_code),
    neighborhood_id   = coalesce((_datos ->> 'neighborhood_id')::uuid, neighborhood_id),
    updated_at  = v_cuando
  where id = _company_id;

  select * into v_despues from public.companies where id = _company_id;

  if coalesce(v_antes.name,'') is distinct from coalesce(v_despues.name,'') then
    v_cambios := v_cambios || public.describir_cambio('Razón social', v_antes.name, v_despues.name);
  end if;
  if coalesce(v_antes.nit,'') is distinct from coalesce(v_despues.nit,'') then
    v_cambios := v_cambios || public.describir_cambio('NIT', v_antes.nit, v_despues.nit);
  end if;
  if coalesce(v_antes.phone,'') is distinct from coalesce(v_despues.phone,'') then
    v_cambios := v_cambios || public.describir_cambio('Teléfono', v_antes.phone, v_despues.phone);
  end if;
  if coalesce(v_antes.email,'') is distinct from coalesce(v_despues.email,'') then
    v_cambios := v_cambios || public.describir_cambio('Correo', v_antes.email, v_despues.email);
  end if;
  if coalesce(v_antes.address,'') is distinct from coalesce(v_despues.address,'') then
    v_cambios := v_cambios || public.describir_cambio('Dirección', v_antes.address, v_despues.address);
  end if;
  if coalesce(v_antes.city,'') is distinct from coalesce(v_despues.city,'') then
    v_cambios := v_cambios || public.describir_cambio('Ciudad', v_antes.city, v_despues.city);
  end if;

  if array_length(v_cambios, 1) is null then
    return jsonb_build_object('cambios', 0, 'aviso', false);
  end if;

  v_quien := public.nombre_de_quien_edita();

  -- Se avisa a TODOS los usuarios de la empresa: el que abrió la cuenta puede
  -- no ser quien hoy hace los pedidos, y un cambio de NIT o de razón social le
  -- importa a cualquiera que vaya a facturar.
  select array_agg(id) into v_gente from public.profiles where company_id = _company_id;

  if v_gente is not null then
    perform public.avisar_cambio_de_datos(
      v_gente, v_quien, v_cuando, v_cambios, 'los datos de tu empresa');
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'CLIENT_UPDATE', 'companies', _company_id,
          jsonb_build_object('cambios', to_jsonb(v_cambios)));

  return jsonb_build_object(
    'cambios', array_length(v_cambios, 1),
    'aviso', v_gente is not null,
    'avisados', coalesce(array_length(v_gente, 1), 0),
    'detalle', to_jsonb(v_cambios));
end;
$$;

-- ------------------------------------------------------------
-- El aviso
-- ------------------------------------------------------------
-- Aparte para que las dos funciones digan lo mismo y con el mismo formato.
create or replace function public.avisar_cambio_de_datos(
  _destinatarios uuid[],
  _quien text,
  _cuando timestamptz,
  _cambios text[],
  _que text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha  text := to_char(_cuando at time zone 'America/Bogota', 'DD/MM/YYYY');
  v_hora   text := to_char(_cuando at time zone 'America/Bogota', 'HH12:MI AM');
  v_texto  text;
  v_id     uuid;
begin
  -- Hora de Colombia, no UTC: un aviso que dice «10:15 PM» cuando el reloj de
  -- la persona marca las 5:15 PM parece de otra cuenta.
  v_texto := 'El ' || v_fecha || ' a las ' || v_hora || ', ' || _quien
          || ' actualizó ' || _que || ' desde Pintuco.' || chr(10) || chr(10)
          || array_to_string(_cambios, chr(10)) || chr(10) || chr(10)
          || 'Si no reconoces este cambio, escríbenos.';

  foreach v_id in array _destinatarios loop
    insert into public.notifications (user_id, type, title, message, action_required)
    values (v_id, 'info', 'Actualizamos tus datos', v_texto, false);
  end loop;
end;
$$;

revoke all on function public.actualizar_cliente_persona(uuid, jsonb) from public, anon;
revoke all on function public.actualizar_cliente_empresa(uuid, jsonb) from public, anon;
revoke all on function public.avisar_cambio_de_datos(uuid[], text, timestamptz, text[], text) from public, anon, authenticated;
grant execute on function public.actualizar_cliente_persona(uuid, jsonb) to authenticated;
grant execute on function public.actualizar_cliente_empresa(uuid, jsonb) to authenticated;

comment on function public.actualizar_cliente_persona(uuid, jsonb) is
  'Actualiza un cliente persona natural desde el portal interno y le avisa en '
  'la misma transacción: no hay forma de cambiarle los datos sin notificarle. '
  'Exige users.manage. Una clave ausente en _datos significa "no lo cambies".';
comment on function public.actualizar_cliente_empresa(uuid, jsonb) is
  'Actualiza una empresa cliente y avisa a TODOS sus usuarios en la misma '
  'transacción. Exige users.manage.';
