-- Distinguir la llave `service_role` de la `anon`.
--
-- Las dos son JWT y las dos empiezan por `eyJ`, así que mirar la forma no
-- alcanza. Y confundirlas produce el fallo más difícil de rastrear que tiene
-- este sistema: `send-email` compara la llave contra la suya, no coincide,
-- intenta buscar un usuario detrás, no lo encuentra y responde 401 ANTES de
-- anotar nada. Desde fuera no pasa absolutamente nada: ni correo, ni error,
-- ni registro.
--
-- Un JWT lleva su carga en claro —está firmado, no cifrado—, así que el rol se
-- puede leer sin la llave de firma y sin exponer el token. Se devuelve solo
-- ese rol: 'service_role' o 'anon'. Es un dato de configuración, no un
-- secreto; la llave anónima es pública por diseño.
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
      -- base64url -> base64, con el relleno que Postgres exige.
      v_carga := translate(split_part(v.service_key, '.', 2), '-_', '+/');
      v_carga := v_carga || repeat('=', (4 - length(v_carga) % 4) % 4);
      v_rol := (convert_from(decode(v_carga, 'base64'), 'utf8')::jsonb) ->> 'role';
    exception when others then
      -- Una carga ilegible es informativa por sí sola: no es un JWT de Supabase.
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
