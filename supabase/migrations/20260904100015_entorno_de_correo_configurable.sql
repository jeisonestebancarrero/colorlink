-- Pantalla para internal_config: sin functions_url y service_key, enviar_correo marca
-- todo OMITIDO. Como en SMTP, la llave se guarda y nunca se devuelve; vacía conserva la actual.
create or replace function public.estado_entorno_correo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: se requiere rol ADMINISTRADOR' using errcode = '42501';
  end if;

  select * into v from public.internal_config where id = 1;

  return jsonb_build_object(
    'functions_url',  v.functions_url,
    'site_url',       v.site_url,
    'tiene_llave',    (v.service_key is not null and v.service_key <> ''),
    'emails_enabled', coalesce(v.emails_enabled, true),
    'allowlist',      coalesce(v.email_allowlist, array[]::text[]),
    'updated_at',     v.updated_at
  );
end;
$$;

create or replace function public.configurar_entorno_correo(
  _functions_url  text default null,
  _service_key    text default null,
  _site_url       text default null,
  _emails_enabled boolean default null,
  _allowlist      text[] default null,
  -- Distingue «no tocar la lista» de «dejarla vacía», que abre el correo a todos.
  _cambiar_allowlist boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url  text;
  v_site text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: se requiere rol ADMINISTRADOR' using errcode = '42501';
  end if;

  v_url  := nullif(trim(coalesce(_functions_url, '')), '');
  v_site := nullif(trim(coalesce(_site_url, '')), '');

  -- enviar_correo concatena '/send-email'; una barra final daría '//send-email'.
  v_url  := regexp_replace(v_url,  '/+$', '');
  v_site := regexp_replace(v_site, '/+$', '');

  if v_url is not null and v_url !~ '^https?://' then
    raise exception 'URL_INVALIDA: la URL de las funciones debe empezar por http:// o https://'
      using errcode = '22023';
  end if;
  if v_site is not null and v_site !~ '^https?://' then
    raise exception 'URL_INVALIDA: la URL del sitio debe empezar por http:// o https://'
      using errcode = '22023';
  end if;

  -- Se limpian entradas vacías; sin ninguna queda null (sin restricción).
  if _allowlist is not null then
    select nullif(array_agg(x), '{}')
      into _allowlist
      from (
        select distinct lower(trim(e)) as x
          from unnest(_allowlist) e
         where trim(coalesce(e, '')) <> ''
      ) t;
  end if;

  update public.internal_config
     set functions_url   = coalesce(v_url,  functions_url),
         site_url        = coalesce(v_site, site_url),
         -- Vacío conserva la llave actual.
         service_key     = coalesce(nullif(trim(coalesce(_service_key, '')), ''), service_key),
         emails_enabled  = coalesce(_emails_enabled, emails_enabled),
         email_allowlist = case when _cambiar_allowlist then _allowlist else email_allowlist end,
         updated_at      = now()
   where id = 1;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'CONFIG_UPDATE', 'internal_config', null,
          jsonb_build_object(
            'functions_url', v_url,
            'site_url', v_site,
            'llave_cambiada', nullif(trim(coalesce(_service_key, '')), '') is not null,
            'emails_enabled', _emails_enabled,
            'allowlist', case when _cambiar_allowlist then to_jsonb(_allowlist) else null end
          ));

  return public.estado_entorno_correo();
end;
$$;

revoke all on function public.estado_entorno_correo() from public, anon;
revoke all on function public.configurar_entorno_correo(text, text, text, boolean, text[], boolean) from public, anon;
grant execute on function public.estado_entorno_correo() to authenticated;
grant execute on function public.configurar_entorno_correo(text, text, text, boolean, text[], boolean) to authenticated;

notify pgrst, 'reload schema';
