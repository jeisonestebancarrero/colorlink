-- ============================================================
-- `configurar_pasarela` nunca pudo guardar nada
-- ============================================================
-- Salió al construirle la pantalla. La función terminaba con:
--
--   insert into public.audit_logs (..., entity_id, ...)
--   values (..., 'app_settings', v_id, ...);
--
-- y `v_id` es el id de `app_settings`, que es un `smallint`, mientras
-- `audit_logs.entity_id` es `uuid`:
--
--   ERROR: column "entity_id" is of type uuid but expression is of type smallint
--
-- El `insert` es la última sentencia, así que la función SIEMPRE fallaba, y al
-- fallar deshacía el `update` anterior dentro de la misma transacción. Es decir:
-- se podía llamar, no devolvía nada raro a primera vista, y no guardaba nunca.
-- No se había notado porque no existía pantalla que la llamara —tenía cero usos
-- en el código—, así que el error vivía en una función que nadie ejecutaba.
--
-- El arreglo es el que ya usa `save_smtp_settings` para esta misma tabla:
-- `entity_id` en null y el id de la fila dentro de `metadata`. `app_settings`
-- es una tabla de una sola fila con clave numérica; no tiene un uuid que poner
-- ahí, y forzar un cast inventaría un identificador que no existe.
--
-- Se aprovecha para dejar en la bitácora QUÉ LLAVES se tocaron —nunca su
-- valor—. Si un día los pagos dejan de funcionar, lo primero que se pregunta
-- es quién cambió qué y cuándo; «PAYMENTS_CONFIG» a secas no lo respondía.

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

  -- Cobrar de verdad sin llaves dejaría al cliente en una pantalla muerta.
  -- Un campo en blanco no borra: si ya había llave guardada, cuenta.
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
         -- Un campo vacío significa "no lo cambies", no "bórralo": la pantalla
         -- nunca puede mostrar el secreto guardado, así que llega en blanco.
         wompi_public_key = coalesce(v_publica, wompi_public_key),
         wompi_integrity_secret = coalesce(v_integ, wompi_integrity_secret),
         wompi_events_secret = coalesce(v_eventos, wompi_events_secret),
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = v_id;

  -- `entity_id` va en null: `app_settings` tiene clave numérica, no uuid. El id
  -- viaja en `metadata`, igual que en `save_smtp_settings`.
  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PAYMENTS_CONFIG', 'app_settings', null,
          jsonb_build_object(
            'settings_id', v_id,
            'activa', v_activa,
            'prueba', v_prueba,
            -- Qué se tocó, nunca el valor. Saber que alguien cambió el secreto
            -- de integridad es la mitad de cualquier diagnóstico.
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
