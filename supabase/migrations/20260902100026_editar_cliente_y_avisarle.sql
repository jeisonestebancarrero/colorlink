-- Edición de clientes desde el portal con aviso obligatorio. Es función porque RLS
-- solo deja escribir al admin o al dueño, y así el cambio y el aviso van en la misma
-- transacción. El aviso lista campos antes/después ya normalizados; sin cambios, no avisa.

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

  -- El personal interno se edita en Usuarios, con sus propias reglas.
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

  -- Clave ausente = no cambiar; un null borraría el dato de campos no mostrados.
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

  -- Se relee para comparar lo guardado ya normalizado por los disparadores.
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

  -- Se avisa a todos los usuarios de la empresa: cualquiera puede facturar a su nombre.
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

-- Compartida para que ambas funciones avisen con el mismo formato.
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
  -- Hora de Colombia, no UTC.
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
