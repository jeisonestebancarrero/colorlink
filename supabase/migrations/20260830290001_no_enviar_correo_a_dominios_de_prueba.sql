-- Filtro de destinatarios: los dominios reservados nunca reciben correo y, si
-- email_allowlist tiene valores, solo esas direcciones. Lo omitido queda en email_log.
alter table public.internal_config
  add column if not exists email_allowlist text[];

comment on column public.internal_config.email_allowlist is
  'Si tiene direcciones, solo esas reciben correo. Vacío = envío normal. Sirve para que una base de desarrollo no le escriba a clientes reales.';

create or replace function public.enviar_correo(
  _destino    text,
  _plantilla  text,
  _order_id   uuid default null,
  _user_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       public.internal_config%rowtype;
  v_dominio text;
  v_motivo  text;
begin
  select * into v_c from public.internal_config where id = 1;

  if _destino is null or _destino = '' then
    return;
  end if;

  v_dominio := lower(split_part(_destino, '@', 2));

    -- Dominios reservados (RFC 2606) y de demostración.
  if v_dominio ~ '\.(test|invalid|localhost|example|demo)$'
     or v_dominio in ('example.com', 'example.org', 'example.net') then
    v_motivo := 'dominio reservado o de demostración';
    -- Lista blanca del ambiente.
  elsif v_c.email_allowlist is not null
        and array_length(v_c.email_allowlist, 1) > 0
        and not (lower(_destino) = any (select lower(x) from unnest(v_c.email_allowlist) x)) then
    v_motivo := 'no está en la lista de destinatarios permitidos';
  elsif not coalesce(v_c.emails_enabled, true) then
    v_motivo := 'el envío de correo está apagado';
  elsif v_c.functions_url is null or v_c.service_key is null then
    v_motivo := 'falta configurar la URL de las funciones';
  end if;

  if v_motivo is not null then
    insert into public.email_log (to_email, subject, template, order_id, status, error)
    values (_destino, 'Omitido', _plantilla, _order_id, 'OMITIDO', v_motivo);
    return;
  end if;

  perform net.http_post(
    url := v_c.functions_url || '/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_c.service_key
    ),
    body := jsonb_build_object(
      'to', _destino,
      'template', _plantilla,
      'orderId', _order_id,
      'userId', _user_id
    ),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'enviar_correo(% -> %): %', _plantilla, _destino, sqlerrm;
  insert into public.email_log (to_email, subject, template, order_id, status, error)
  values (_destino, 'No se pudo encolar', _plantilla, _order_id, 'FALLIDO', sqlerrm);
end;
$$;

revoke all on function public.enviar_correo(text, text, uuid, uuid) from public;
