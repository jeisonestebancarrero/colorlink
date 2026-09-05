-- Dos cosas que salieron al poner el correo en producción.
--
-- 1. `enviar_correo` estaba concedida a `anon`.
--
--    La llave anónima está, por diseño, dentro del JavaScript de la tienda
--    pública: cualquiera la lee. Y esta función no tiene ninguna guarda —recibe
--    destinatario y plantilla y manda—. Es decir, cualquier persona en internet
--    podía usar el sistema como retransmisor: correos con la marca Pintuco, a
--    la dirección que quisiera, saliendo por la cuenta de Gmail de la empresa.
--    El daño no es solo la molestia: es que Google suspenda esa cuenta por
--    abuso y se caiga TODO el correo del sistema.
--
--    Se retira de `anon` y de `authenticated`. Los disparadores no la pierden:
--    la llaman desde funciones SECURITY DEFINER, donde el permiso se comprueba
--    contra el dueño de la función y no contra quien navega.
--
-- 2. No había forma de probar el camino real desde el portal. El botón que
--    existía llama a la función de envío DESDE EL NAVEGADOR, así que comprueba
--    el SMTP pero se salta la parte que de verdad falla al desplegar: que la
--    base pueda llamar a la función con su llave. Podía llegar la prueba y no
--    llegar ni un correo automático. Se añade una prueba que sí pasa por ahí.
revoke execute on function public.enviar_correo(text, text, uuid, uuid) from anon, authenticated, public;

-- Diagnóstico de la llave SIN revelarla. La llave que necesita `send-email` es
-- la `service_role` clásica, un JWT: la función la compara carácter por
-- carácter contra la variable que Supabase le inyecta. Las llaves nuevas
-- (`sb_secret_…`) no son JWT y el gateway rechaza la llamada con 401 antes de
-- que la función corra — no queda ni rastro en la bitácora, que es lo que hace
-- el fallo tan difícil de encontrar.
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
    -- Solo la FORMA, nunca el contenido.
    'formato_llave',  v_formato,
    'emails_enabled', coalesce(v.emails_enabled, true),
    'allowlist',      coalesce(v.email_allowlist, array[]::text[]),
    'updated_at',     v.updated_at
  );
end;
$$;

-- Prueba por el camino de verdad: la BASE llama a la función, con su llave.
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

  -- El envío es asíncrono: pg_net encola y la función responde después. Se
  -- devuelve el instante para que la pantalla sepa qué filas de la bitácora
  -- son de ESTA prueba y no de una anterior.
  return jsonb_build_object('ok', true, 'desde', v_desde);
end;
$$;

revoke all on function public.probar_correo_por_la_base(text) from public, anon;
grant execute on function public.probar_correo_por_la_base(text) to authenticated;

notify pgrst, 'reload schema';
