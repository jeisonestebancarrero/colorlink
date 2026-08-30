-- ============================================================
-- Nunca enviar correo a direcciones que no existen
-- ============================================================
-- La suite de pruebas crea usuarios desechables con direcciones del tipo
-- `persona.<marca de tiempo>@correo.test`, y el disparador de bienvenida las
-- tomaba como direcciones reales: cada corrida de `npm test` mandaba una
-- docena de correos por la cuenta de Gmail configurada.
--
-- El daño es triple: se gasta la cuota de envío de la cuenta, cada mensaje
-- rebota —`.test` es un dominio reservado por la RFC 2606 y no existe— y esos
-- rebotes caen en la bandeja del dueño de la cuenta. Además, enviar a un
-- dominio ajeno que quedó en los datos de demostración es mandarle correo a un
-- desconocido desde una base de desarrollo.
--
-- Dos barreras, en este orden:
--   1. Los dominios reservados y de demostración NUNCA reciben correo, en
--      ningún ambiente. No es configurable porque no hay caso legítimo.
--   2. `email_allowlist`: si tiene direcciones, solo esas reciben. Es lo que
--      protege una base de desarrollo poblada con datos que parecen reales.
--
-- Lo omitido queda registrado en `email_log` como OMITIDO, con el destinatario
-- que habría tenido: si algo deja de llegar, se ve por qué.
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

  -- 1. Dominios que no existen ni pueden existir.
  if v_dominio ~ '\.(test|invalid|localhost|example|demo)$'
     or v_dominio in ('example.com', 'example.org', 'example.net') then
    v_motivo := 'dominio reservado o de demostración';
  -- 2. Lista blanca del ambiente.
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
