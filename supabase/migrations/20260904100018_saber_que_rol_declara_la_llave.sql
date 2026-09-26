-- Lee el rol declarado en el JWT de la llave para distinguir service_role de anon:
-- ambas empiezan por eyJ y con anon send-email responde 401 sin dejar rastro.
-- La carga del JWT no está cifrada; solo se devuelve el rol.
create or replace function public.estado_entorno_correo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v         record;
  v_formato text;
  v_rol     text;
  v_carga   text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: se requiere rol ADMINISTRADOR' using errcode = '42501';
  end if;

  select * into v from public.internal_config where id = 1;

  v_formato := case
    when v.service_key is null or v.service_key = '' then null
    when v.service_key ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then 'JWT'
    when v.service_key like 'sb_secret_%'      then 'SB_SECRET'
    when v.service_key like 'sb_publishable_%' then 'SB_PUBLISHABLE'
    else 'DESCONOCIDO'
  end;

  if v_formato = 'JWT' then
    begin
      -- base64url a base64, con el relleno que exige Postgres.
      v_carga := translate(split_part(v.service_key, '.', 2), '-_', '+/');
      v_carga := v_carga || repeat('=', (4 - length(v_carga) % 4) % 4);
      v_rol := (convert_from(decode(v_carga, 'base64'), 'utf8')::jsonb) ->> 'role';
    exception when others then
      -- Carga ilegible: no es un JWT de Supabase.
      v_rol := null;
    end;
  end if;

  return jsonb_build_object(
    'functions_url',  v.functions_url,
    'site_url',       v.site_url,
    'tiene_llave',    (v.service_key is not null and v.service_key <> ''),
    'formato_llave',  v_formato,
    'rol_llave',      v_rol,
    'emails_enabled', coalesce(v.emails_enabled, true),
    'allowlist',      coalesce(v.email_allowlist, array[]::text[]),
    'updated_at',     v.updated_at
  );
end;
$$;

notify pgrst, 'reload schema';
