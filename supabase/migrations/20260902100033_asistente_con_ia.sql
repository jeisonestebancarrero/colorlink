-- ============================================================
-- El asistente puede usar un modelo de lenguaje
-- ============================================================
-- El asistente de la tienda responde con reglas: consulta pedidos, catálogo y
-- tiendas, y si no entiende lo dice. Funciona y no inventa, pero no entiende
-- una pregunta escrita de forma rara ni encadena dos ideas.
--
-- Esto deja preparado el camino para que un modelo redacte la respuesta. Tres
-- decisiones que valen más que el código:
--
-- 1. LA LLAVE NO VIVE EN EL NAVEGADOR. Se guarda aquí y solo la lee la función
--    de borde. Una llave de API en el paquete JavaScript se la lleva cualquiera
--    que abra las herramientas del navegador, y se factura al dueño hasta que
--    la cancele. Por eso `ai_api_key` se trata como los secretos de Wompi: se
--    escribe, nunca se devuelve.
--
-- 2. EL MODELO NO INVENTA DATOS. No se le pregunta «¿cuánto rinde el Koraza?»:
--    se le pasan los datos ya consultados del sistema y se le pide que
--    redacte con ESO. Un modelo suelto sobre un catálogo de pinturas afirma
--    rendimientos y precios con total seguridad, y aquí eso es un cliente
--    comprando cuatro galones de menos.
--
-- 3. SI FALLA, NO SE CAE. Sin llave, sin saldo o con el proveedor caído, el
--    asistente sigue respondiendo con reglas. La IA mejora la redacción; no es
--    de lo que depende que el asistente funcione.

alter table public.app_settings
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_provider text not null default 'openai',
  add column if not exists ai_model text not null default 'gpt-4o-mini',
  add column if not exists ai_api_key text,
  add column if not exists ai_configured_at timestamptz;

comment on column public.app_settings.ai_api_key is
  'Llave del proveedor de IA. NUNCA se devuelve al navegador: se revoca el '
  'SELECT sobre esta columna y solo la lee la función de borde con la llave de '
  'servicio. Mismo trato que la contraseña SMTP y los secretos de Wompi.';
comment on column public.app_settings.ai_model is
  'Modelo a usar. Se deja configurable porque cambian y se abaratan seguido; '
  'clavarlo en el código obligaría a desplegar para cambiarlo.';

-- ------------------------------------------------------------
-- Cerrar la columna de la llave
-- ------------------------------------------------------------
-- Un GRANT de tabla incluye todas las columnas, así que hay que revocar la
-- tabla y devolver la lista sin la llave. Es la misma lección que costó
-- descubrir con los costos: revocar una columna suelta encima de un permiso de
-- tabla no recorta nada.
revoke select on public.app_settings from anon, authenticated;

grant select (
  id, company_name, company_legal_name, company_nit, company_address,
  company_city, company_phone, company_email, company_website, logo_url,
  tax_regime, default_tax_rate, invoice_prefix, invoice_footer,
  smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from_name,
  smtp_from_email, smtp_configured_at, updated_by, updated_at,
  payments_enabled, payments_test_mode, wompi_public_key,
  ai_enabled, ai_provider, ai_model, ai_configured_at
) on public.app_settings to authenticated;

-- El catálogo público necesita la tarifa de IVA y los datos de la empresa.
grant select (
  id, company_name, company_city, logo_url, default_tax_rate,
  payments_enabled, payments_test_mode, wompi_public_key
) on public.app_settings to anon;

-- ------------------------------------------------------------
-- Estado, sin secretos
-- ------------------------------------------------------------
create or replace function public.estado_asistente()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_staff() then
    jsonb_build_object(
      'activa', s.ai_enabled,
      'proveedor', s.ai_provider,
      'modelo', s.ai_model,
      -- Si la llave está puesta, no cuál es.
      'tiene_llave', s.ai_api_key is not null,
      'configurada_en', s.ai_configured_at
    )
  else
    -- Al cliente solo le importa si el asistente redacta con IA, para poder
    -- decírselo. Nunca el proveedor ni el modelo.
    jsonb_build_object('activa', s.ai_enabled and s.ai_api_key is not null)
  end
  from public.app_settings s
  limit 1;
$$;

-- ------------------------------------------------------------
-- Configurar
-- ------------------------------------------------------------
create or replace function public.configurar_asistente(_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
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

revoke all on function public.estado_asistente() from public, anon;
revoke all on function public.configurar_asistente(jsonb) from public, anon;
grant execute on function public.estado_asistente() to authenticated;
grant execute on function public.configurar_asistente(jsonb) to authenticated;

comment on function public.configurar_asistente(jsonb) is
  'Guarda la configuración del asistente con IA. La llave nunca se devuelve; '
  'un campo vacío conserva la guardada. Se niega a encender la IA sin llave.';
