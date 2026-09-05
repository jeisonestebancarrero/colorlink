-- La llave del asistente se comprueba antes de guardarla.
--
-- Pasó de verdad: en el campo de la llave se pegó el SECRETO DE CLIENTE DE
-- GOOGLE (`GOCSPX-…`). La función lo guardó sin decir nada, y el único
-- síntoma fue que el asistente dejó de responder con un «no está disponible
-- en este momento» que no señalaba a ninguna parte. El motivo real solo
-- apareció leyendo lo que contestaba OpenAI.
--
-- Y lo caro no fue la confusión: fue que ese secreto se mandó a OpenAI como
-- credencial en cada intento. Un secreto de otro proveedor salió del sistema
-- por haberlo escrito en la casilla de al lado.
--
-- Una llave de OpenAI empieza por `sk-`. Comprobarlo es una línea y evita las
-- dos cosas.
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

  -- El mensaje nombra lo que se pegó por su prefijo, nunca la llave: quien se
  -- equivoca de casilla necesita saber CUÁL secreto puso para ir a buscar el
  -- correcto.
  if v_llave is not null and v_prov is not distinct from 'openai' and v_llave not like 'sk-%' then
    raise exception
      'LLAVE_NO_ES_DE_OPENAI: una llave de OpenAI empieza por «sk-» y esta empieza por «%». Revisa que no sea el secreto de otro servicio.',
      left(v_llave, 7)
      using errcode = '22023';
  end if;

  -- Encender la IA sin llave dejaría al cliente esperando una respuesta que
  -- nunca llega, en vez de recibir la del asistente de reglas.
  if v_activa and not coalesce(v_llave is not null or v_tiene, false) then
    raise exception 'FALTA_LLAVE: para encender la IA hace falta la llave del proveedor'
      using errcode = '22023';
  end if;

  update public.app_settings
     set ai_enabled = v_activa,
         ai_provider = coalesce(v_prov, ai_provider),
         ai_model = coalesce(v_modelo, ai_model),
         -- Vacío significa «no la cambies», no «bórrala»: la pantalla nunca
         -- puede mostrarla, así que llega en blanco al guardar cualquier otra
         -- cosa.
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
