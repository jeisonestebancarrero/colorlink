-- configurar_pasarela nunca guardaba: auditaba el id smallint de app_settings en
-- audit_logs.entity_id (uuid) y el error deshacía el update. Ahora entity_id va en
-- null, el id en metadata (como save_smtp_settings) y se registran las llaves tocadas.

create or replace function public.configurar_pasarela(_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activa  boolean := coalesce((_datos ->> 'payments_enabled')::boolean, false);
  v_prueba  boolean := coalesce((_datos ->> 'payments_test_mode')::boolean, true);
  v_publica text := nullif(trim(_datos ->> 'wompi_public_key'), '');
  v_integ   text := nullif(trim(_datos ->> 'wompi_integrity_secret'), '');
  v_eventos text := nullif(trim(_datos ->> 'wompi_events_secret'), '');
  v_id      smallint;
  v_antes   record;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo un administrador configura la pasarela'
      using errcode = '42501';
  end if;

  select id, payments_enabled, payments_test_mode,
         wompi_public_key, wompi_integrity_secret, wompi_events_secret
    into v_antes
    from public.app_settings
   limit 1;

  if v_antes.id is null then
    raise exception 'NOT_FOUND: no hay fila de configuración' using errcode = 'P0002';
  end if;
  v_id := v_antes.id;

  -- Cobrar en real sin llaves deja al cliente sin pasarela; un campo en blanco
  -- conserva la llave ya guardada.
  if v_activa and not v_prueba then
    if coalesce(v_publica, v_antes.wompi_public_key) is null
       or coalesce(v_integ, v_antes.wompi_integrity_secret) is null then
      raise exception 'FALTAN_LLAVES: para cobrar de verdad hacen falta la llave pública y el secreto de integridad'
        using errcode = '22023';
    end if;
  end if;

  update public.app_settings
     set payments_enabled = v_activa,
         payments_test_mode = v_prueba,
         -- Vacío significa «no cambiar»: la pantalla nunca recibe el secreto guardado.
         wompi_public_key = coalesce(v_publica, wompi_public_key),
         wompi_integrity_secret = coalesce(v_integ, wompi_integrity_secret),
         wompi_events_secret = coalesce(v_eventos, wompi_events_secret),
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = v_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PAYMENTS_CONFIG', 'app_settings', null,
          jsonb_build_object(
            'settings_id', v_id,
            'activa', v_activa,
            'prueba', v_prueba,
            -- Qué llaves cambiaron, nunca su valor.
            'cambio_llave_publica', v_publica is not null,
            'cambio_secreto_integridad', v_integ is not null,
            'cambio_secreto_eventos', v_eventos is not null,
            'activa_antes', v_antes.payments_enabled,
            'prueba_antes', v_antes.payments_test_mode
          ));

  return jsonb_build_object('activa', v_activa, 'prueba', v_prueba);
end;
$$;

comment on function public.configurar_pasarela(jsonb) is
  'Guarda la configuración de pagos. Un secreto en blanco conserva el guardado; '
  'los secretos nunca se devuelven. Registra en audit_logs QUÉ cambió, no los valores.';
