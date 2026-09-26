-- Expone al admin las respuestas de pg_net (net._http_response): enviar_correo no espera
-- respuesta y un 401 o 404 pasa sin síntoma. SQL dinámico porque en local no está pg_net.
create or replace function public.diagnostico_cola_correo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filas jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: se requiere rol ADMINISTRADOR' using errcode = '42501';
  end if;

  if to_regclass('net._http_response') is null then
    return jsonb_build_object(
      'pg_net', false,
      'nota', 'La extensión pg_net no está instalada: la base no puede llamar a nada por HTTP.'
    );
  end if;

  execute $q$
    select coalesce(jsonb_agg(x order by x.created desc), '[]'::jsonb)
      from (
        select id, status_code, timed_out, error_msg,
               left(coalesce(content, ''), 400) as content, created
          from net._http_response
         order by created desc
         limit 5
      ) x
  $q$ into v_filas;

  return jsonb_build_object('pg_net', true, 'ultimas', v_filas);
end;
$$;

revoke all on function public.diagnostico_cola_correo() from public, anon;
grant execute on function public.diagnostico_cola_correo() to authenticated;

notify pgrst, 'reload schema';
