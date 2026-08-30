-- ============================================================
-- Configurar la pasarela y el crédito de cada empresa
-- ============================================================
-- Las llaves de Wompi se guardan por función, no con un UPDATE directo: los
-- secretos no se pueden leer de vuelta desde el navegador (el GRANT por
-- columna lo impide), así que la pantalla necesita poder escribirlos sin
-- leerlos. La función también evita que se encienda el cobro real sin tener
-- con qué cobrar.
create or replace function public.configurar_pasarela(_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activa  boolean := coalesce((_datos ->> 'payments_enabled')::boolean, false);
  v_prueba  boolean := coalesce((_datos ->> 'payments_test_mode')::boolean, true);
  v_publica text := nullif(trim(_datos ->> 'wompi_public_key'), '');
  v_integ   text := nullif(trim(_datos ->> 'wompi_integrity_secret'), '');
  v_eventos text := nullif(trim(_datos ->> 'wompi_events_secret'), '');
  v_id      smallint;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo un administrador configura la pasarela'
      using errcode = '42501';
  end if;

  select id into v_id from public.app_settings limit 1;

  -- Cobrar de verdad sin llaves dejaría al cliente en una pantalla muerta.
  if v_activa and not v_prueba then
    if coalesce(v_publica, (select wompi_public_key from public.app_settings where id = v_id)) is null
       or coalesce(v_integ, (select wompi_integrity_secret from public.app_settings where id = v_id)) is null then
      raise exception 'FALTAN_LLAVES: para cobrar de verdad hacen falta la llave pública y el secreto de integridad'
        using errcode = '22023';
    end if;
  end if;

  update public.app_settings
     set payments_enabled = v_activa,
         payments_test_mode = v_prueba,
         -- Un campo vacío significa "no lo cambies", no "bórralo": la pantalla
         -- nunca puede mostrar el secreto guardado, así que llega en blanco.
         wompi_public_key = coalesce(v_publica, wompi_public_key),
         wompi_integrity_secret = coalesce(v_integ, wompi_integrity_secret),
         wompi_events_secret = coalesce(v_eventos, wompi_events_secret),
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = v_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PAYMENTS_CONFIG', 'app_settings', v_id,
          jsonb_build_object('activa', v_activa, 'prueba', v_prueba));

  return jsonb_build_object('activa', v_activa, 'prueba', v_prueba);
end;
$$;

revoke all on function public.configurar_pasarela(jsonb) from public;
grant execute on function public.configurar_pasarela(jsonb) to authenticated;

-- ------------------------------------------------------------
-- Estado de la pasarela sin revelar los secretos
-- ------------------------------------------------------------
create or replace function public.estado_pasarela()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_c public.app_settings%rowtype;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_c from public.app_settings limit 1;
  return jsonb_build_object(
    'activa', coalesce(v_c.payments_enabled, false),
    'prueba', coalesce(v_c.payments_test_mode, true),
    'llave_publica', v_c.wompi_public_key,
    -- De los secretos solo se dice si están puestos. Devolverlos sería
    -- filtrarlos a cualquiera que abra la consola del navegador.
    'tiene_integridad', v_c.wompi_integrity_secret is not null,
    'tiene_eventos', v_c.wompi_events_secret is not null
  );
end;
$$;

revoke all on function public.estado_pasarela() from public;
grant execute on function public.estado_pasarela() to authenticated;

-- ------------------------------------------------------------
-- Crédito de una empresa
-- ------------------------------------------------------------
create or replace function public.fijar_credito_empresa(
  _company_id uuid,
  _a_credito  boolean,
  _dias       integer default 30,
  _cupo       numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_nombre text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo un administrador aprueba crédito' using errcode = '42501';
  end if;

  if _a_credito and (_dias is null or _dias < 1 or _dias > 180) then
    raise exception 'PLAZO_INVALIDO: el plazo debe estar entre 1 y 180 días' using errcode = '22023';
  end if;
  if _a_credito and coalesce(_cupo, 0) <= 0 then
    raise exception 'CUPO_INVALIDO: un crédito sin cupo no sirve de nada' using errcode = '22023';
  end if;

  update public.companies
     set payment_terms = case when _a_credito then 'CREDITO' else 'CONTADO' end::public.payment_terms,
         credit_days = case when _a_credito then _dias else 0 end,
         credit_limit_cop = case when _a_credito then _cupo else 0 end,
         updated_at = now()
   where id = _company_id
  returning name into v_nombre;

  if not found then
    raise exception 'NOT_FOUND: esa empresa no existe' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'COMPANY_CREDIT', 'companies', _company_id,
          jsonb_build_object('a_credito', _a_credito, 'dias', _dias, 'cupo', _cupo));

  return jsonb_build_object('empresa', v_nombre, 'a_credito', _a_credito);
end;
$$;

revoke all on function public.fijar_credito_empresa(uuid, boolean, integer, numeric) from public;
grant execute on function public.fijar_credito_empresa(uuid, boolean, integer, numeric) to authenticated;
