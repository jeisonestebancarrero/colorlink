-- ============================================================
-- Los correos salen solos desde la base
-- ============================================================
-- Antes cualquier aviso dependía de que el navegador lo disparara: si el
-- cliente cerraba la pestaña o el asesor cambiaba el estado desde el celular,
-- el correo no salía. La notificación tiene que nacer donde nace el hecho.
--
-- `pg_net` publica la petición HTTP de forma asíncrona: el disparador NO
-- espera al servidor de correo. Es deliberado —si Gmail está lento, no puede
-- quedarse trabada la confirmación de un pedido.
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- Dónde llamar, y con qué llave
-- ------------------------------------------------------------
-- La llave de servicio no puede estar en una tabla que alguien pueda leer:
-- quien la tenga puede hacer cualquier cosa en el sistema. Vive en una tabla
-- sin ninguna política de RLS, así que solo la ven las funciones SECURITY
-- DEFINER y el propio `service_role`.
create table if not exists public.internal_config (
  id           smallint primary key default 1 check (id = 1),
  functions_url text,
  service_key   text,
  site_url      text default 'http://127.0.0.1:8090',
  emails_enabled boolean not null default true,
  updated_at   timestamptz not null default now()
);

alter table public.internal_config enable row level security;
revoke all on public.internal_config from anon, authenticated;

comment on table public.internal_config is
  'Credenciales internas para que la base llame a las Edge Functions. Sin políticas de RLS a propósito: nadie más que las funciones SECURITY DEFINER debe leerla.';

insert into public.internal_config (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Encolar un correo
-- ------------------------------------------------------------
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
declare v_c public.internal_config%rowtype;
begin
  select * into v_c from public.internal_config where id = 1;

  -- Sin configuración no se falla: se omite. Un pedido no puede quedar sin
  -- crear porque el correo no esté configurado todavía.
  if v_c.functions_url is null or v_c.service_key is null
     or not coalesce(v_c.emails_enabled, true) or _destino is null then
    return;
  end if;

  -- pg_net expone sus funciones en el esquema `net`, no en `extensions`.
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
  -- Que falle el aviso no puede tumbar la operación que lo originó, pero sí
  -- tiene que quedar registrado: durante un buen rato este bloque se tragó en
  -- silencio una llamada a un esquema equivocado y ningún correo salía.
  raise warning 'enviar_correo(% -> %): %', _plantilla, _destino, sqlerrm;
  insert into public.email_log (to_email, subject, template, order_id, status, error)
  values (_destino, 'No se pudo encolar', _plantilla, _order_id, 'FALLIDO', sqlerrm);
end;
$$;

revoke all on function public.enviar_correo(text, text, uuid, uuid) from public;

-- ------------------------------------------------------------
-- 1. Bienvenida al registrarse
-- ------------------------------------------------------------
create or replace function public.correo_bienvenida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enviar_correo(new.email, 'BIENVENIDA', null, new.id);
  return new;
end;
$$;

drop trigger if exists profiles_correo_bienvenida on public.profiles;
create trigger profiles_correo_bienvenida
  after insert on public.profiles
  for each row execute function public.correo_bienvenida();

-- ------------------------------------------------------------
-- 2. Pedido creado
-- ------------------------------------------------------------
-- Va en el UPDATE que fija el total, no en el INSERT: al insertarse el pedido
-- todavía vale cero y el correo saldría con un total de $0.
create or replace function public.correo_pedido_creado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  if old.total_cop = 0 and new.total_cop > 0 then
    select email into v_email from public.profiles where id = new.user_id;
    perform public.enviar_correo(v_email, 'PEDIDO_CREADO', new.id, new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_correo_creado on public.orders;
create trigger orders_correo_creado
  after update on public.orders
  for each row
  when (old.total_cop = 0 and new.total_cop > 0)
  execute function public.correo_pedido_creado();

-- ------------------------------------------------------------
-- 3. Pago recibido
-- ------------------------------------------------------------
create or replace function public.correo_pago_recibido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_user  uuid;
begin
  if new.status = 'PAGADO' and old.status is distinct from 'PAGADO' then
    select o.user_id, p.email into v_user, v_email
      from public.orders o
      join public.profiles p on p.id = o.user_id
     where o.id = new.order_id;
    perform public.enviar_correo(v_email, 'PAGO_RECIBIDO', new.order_id, v_user);
  end if;
  return new;
end;
$$;

drop trigger if exists payments_correo_pago on public.payments;
create trigger payments_correo_pago
  after update on public.payments
  for each row execute function public.correo_pago_recibido();

-- ------------------------------------------------------------
-- 4. Trazabilidad: cada cambio de estado
-- ------------------------------------------------------------
-- Se omite CONFIRMADO porque ese momento ya lo cubre el correo del pago: dos
-- avisos seguidos diciendo lo mismo se leen como spam.
create or replace function public.correo_estado_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  if new.status is distinct from old.status
     and new.status in ('PREPARANDO', 'LISTO_PARA_RETIRO', 'ENVIADO', 'ENTREGADO', 'CANCELADO') then
    select email into v_email from public.profiles where id = new.user_id;
    perform public.enviar_correo(v_email, 'PEDIDO_ESTADO', new.id, new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_correo_estado on public.orders;
create trigger orders_correo_estado
  after update on public.orders
  for each row execute function public.correo_estado_pedido();
