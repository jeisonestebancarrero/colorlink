-- Seguridad: enviar_correo no tiene guarda y la anon key es pública; concedida a anon,
-- permitía usar la cuenta de correo como retransmisor. Los disparadores la siguen
-- llamando vía SECURITY DEFINER. Se añade una prueba que sale desde la base.
revoke execute on function public.enviar_correo(text, text, uuid, uuid) from anon, authenticated, public;

-- Diagnóstico sin revelar la llave: send-email necesita la service_role JWT; las
-- sb_secret_ las rechaza el gateway con 401 sin dejar registro.
create or replace function public.estado_entorno_correo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
  v_formato text;
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

  return jsonb_build_object(
    'functions_url',  v.functions_url,
    'site_url',       v.site_url,
    'tiene_llave',    (v.service_key is not null and v.service_key <> ''),
    -- Solo el formato, nunca el contenido.
    'formato_llave',  v_formato,
    'emails_enabled', coalesce(v.emails_enabled, true),
    'allowlist',      coalesce(v.email_allowlist, array[]::text[]),
    'updated_at',     v.updated_at
  );
end;
$$;

-- Prueba el camino real: la base llama a la función con su llave.
create or replace function public.probar_correo_por_la_base(_destino text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: se requiere rol ADMINISTRADOR' using errcode = '42501';
  end if;
  if _destino is null or position('@' in _destino) = 0 then
    raise exception 'DESTINO_INVALIDO: escribe un correo válido' using errcode = '22023';
  end if;

  perform public.enviar_correo(_destino, 'BIENVENIDA', null, (select auth.uid()));

  -- pg_net es asíncrono: el instante permite filtrar las filas de esta prueba.
  return jsonb_build_object('ok', true, 'desde', v_desde);
end;
$$;

revoke all on function public.probar_correo_por_la_base(text) from public, anon;
grant execute on function public.probar_correo_por_la_base(text) to authenticated;

notify pgrst, 'reload schema';
