-- Valida que la llave de OpenAI empiece por sk- antes de guardarla, para no guardar
-- ni enviar a OpenAI un secreto de otro proveedor pegado por error.
create or replace function public.configurar_asistente(_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     smallint;
  v_activa boolean := coalesce((_datos ->> 'ai_enabled')::boolean, false);
  v_llave  text := nullif(trim(_datos ->> 'ai_api_key'), '');
  v_modelo text := nullif(trim(_datos ->> 'ai_model'), '');
  v_prov   text := nullif(trim(_datos ->> 'ai_provider'), '');
  v_tiene  boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo un administrador configura el asistente'
      using errcode = '42501';
  end if;

  select id, ai_api_key is not null into v_id, v_tiene from public.app_settings limit 1;
  if v_id is null then
    raise exception 'NOT_FOUND: no hay fila de configuración' using errcode = 'P0002';
  end if;

  -- El error nombra el prefijo recibido, nunca la llave.
  if v_llave is not null and v_prov is not distinct from 'openai' and v_llave not like 'sk-%' then
    raise exception
      'LLAVE_NO_ES_DE_OPENAI: una llave de OpenAI empieza por «sk-» y esta empieza por «%». Revisa que no sea el secreto de otro servicio.',
      left(v_llave, 7)
      using errcode = '22023';
  end if;

  -- Encender la IA sin llave dejaría al cliente sin respuesta.
  if v_activa and not coalesce(v_llave is not null or v_tiene, false) then
    raise exception 'FALTA_LLAVE: para encender la IA hace falta la llave del proveedor'
      using errcode = '22023';
  end if;

  update public.app_settings
     set ai_enabled = v_activa,
         ai_provider = coalesce(v_prov, ai_provider),
         ai_model = coalesce(v_modelo, ai_model),
         -- Vacío significa «no cambiar»: la pantalla nunca recibe la llave guardada.
         ai_api_key = coalesce(v_llave, ai_api_key),
         ai_configured_at = case when v_llave is not null then now() else ai_configured_at end,
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = v_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'AI_CONFIG', 'app_settings', null,
          jsonb_build_object('settings_id', v_id, 'activa', v_activa,
                             'cambio_llave', v_llave is not null,
                             'modelo', coalesce(v_modelo, 'sin cambio')));

  return public.estado_asistente();
end;
$$;

notify pgrst, 'reload schema';
