-- ============================================================
-- Cada pedido tiene un asesor, y cada asesor ve solo lo suyo
-- ============================================================
-- Hasta hoy todo el personal interno veía TODOS los pedidos de sus sedes. Con
-- un equipo pequeño se aguanta; con varios asesores es la receta para que un
-- pedido se quede sin dueño porque «alguien lo estará viendo».
--
-- Reglas, y el porqué de cada una:
--
--   · SE ASIGNA SOLO AL CREARSE. Si el cliente tuviera que esperar a que
--     alguien reparta los pedidos a mano, el reparto se haría tarde o no se
--     haría. El disparador corre dentro de la misma transacción del pedido.
--   · RESPETA LA SEDE. Solo entran al sorteo los asesores que pueden ver la
--     sede del pedido. Asignar a alguien un pedido que su propia RLS le va a
--     ocultar es peor que no asignarlo: el pedido queda con dueño y sin nadie
--     que lo vea.
--   · SI NO HAY ASESOR, SE LE DICE AL CLIENTE. Un pedido sin asignar en
--     silencio es un cliente esperando sin saber a qué. Se le avisa que le
--     llegará una notificación cuando tenga asesor, y se le cumple: en cuanto
--     entra un asesor que cubra esa sede, los pedidos huérfanos se reparten y
--     el cliente recibe el aviso.
--   · EL ASESOR PURO SOLO VE LO SUYO. «Puro» importa: quien además es
--     administrador, de despacho o de facturación necesita ver el resto para
--     hacer su trabajo, así que el filtro se aplica únicamente a quien no
--     tiene otro rol operativo.
-- ============================================================

alter table public.orders
  add column if not exists advisor_id uuid references public.profiles(id) on delete set null,
  add column if not exists advisor_assigned_at timestamptz;

create index if not exists orders_advisor_idx on public.orders (advisor_id);

comment on column public.orders.advisor_id is
  'Asesor responsable. Lo pone `asignar_asesor()` al crear el pedido, o el '
  'reparto de huérfanos cuando entra un asesor nuevo. Null = sin asesor todavía.';

-- ------------------------------------------------------------
-- ¿Este usuario es asesor y NADA MÁS?
-- ------------------------------------------------------------
-- De esto depende que el filtro no le tape los pedidos a quien los necesita
-- para trabajar. Un ASESOR que además es de DESPACHO tiene que seguir viendo
-- lo que despacha, aunque no sea suyo.
create or replace function public.solo_asesor(_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with quien as (select coalesce(_user_id, (select auth.uid())) as id)
  select exists (
      select 1 from public.user_roles ur, quien q
       where ur.user_id = q.id and ur.role = 'ASESOR'
    )
    and not exists (
      select 1 from public.user_roles ur, quien q
       where ur.user_id = q.id
         and ur.role in ('ADMINISTRADOR', 'GERENCIA', 'DESPACHO', 'BODEGA',
                         'FACTURACION', 'TESORERIA', 'CONTABILIDAD',
                         'SERVICIO_CLIENTE', 'MARKETING')
    );
$$;

-- ------------------------------------------------------------
-- Quién puede atender un pedido de esta sede
-- ------------------------------------------------------------
-- Un asesor SIN sedes asignadas no está restringido: cubre todas. Es la misma
-- convención que ya usa `puede_ver_sede`, y cambiarla aquí crearía dos reglas
-- de sede distintas en el mismo sistema.
create or replace function public.asesores_para_sede(_location_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ur.user_id
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
   where ur.role = 'ASESOR'
     and p.status = 'ACTIVO'
     and (
       _location_id is null
       or not exists (select 1 from public.user_pickup_locations u where u.user_id = ur.user_id)
       or exists (
         select 1 from public.user_pickup_locations u
          where u.user_id = ur.user_id and u.location_id = _location_id
       )
     );
$$;

-- ------------------------------------------------------------
-- Asignar (o intentar asignar) el asesor de un pedido
-- ------------------------------------------------------------
create or replace function public.asignar_asesor(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.orders%rowtype;
  v_asesor uuid;
  v_nombre text;
begin
  select * into v_pedido from public.orders where id = _order_id;
  if v_pedido.id is null or v_pedido.advisor_id is not null then
    return v_pedido.advisor_id;
  end if;

  -- Al azar, como se pidió. Si más adelante se quiere repartir por carga, el
  -- cambio es el `order by`: `(select count(*) from orders o where
  -- o.advisor_id = a)` antes del random.
  select a into v_asesor
    from public.asesores_para_sede(v_pedido.pickup_location_id) a
   order by random()
   limit 1;

  if v_asesor is null then
    -- Nadie puede atenderlo todavía. Se le dice al cliente en lugar de
    -- dejarlo esperando sin explicación.
    insert into public.notifications (user_id, order_id, title, message, type)
    values (
      v_pedido.user_id, v_pedido.id,
      'Tu pedido está en cola de asignación',
      'Recibimos tu pedido ' || v_pedido.order_number || '. En este momento no hay '
      || 'un asesor disponible para tu punto de retiro; te avisamos apenas te '
      || 'asignemos uno.',
      'info'::public.notification_type
    );
    return null;
  end if;

  update public.orders
     set advisor_id = v_asesor, advisor_assigned_at = now()
   where id = _order_id;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_nombre from public.profiles where id = v_asesor;

  -- Al cliente: quién lo atiende.
  insert into public.notifications (user_id, order_id, title, message, type)
  values (
    v_pedido.user_id, v_pedido.id,
    'Ya tienes asesor asignado',
    'Tu pedido ' || v_pedido.order_number || ' quedó a cargo de '
    || coalesce(v_nombre, 'un asesor de Pintuco') || '. Puedes escribirle desde el pedido.',
    'success'::public.notification_type
  );

  -- Al asesor: que sepa que le entró trabajo. Sin esto tendría que estar
  -- refrescando la pantalla para enterarse.
  insert into public.notifications (user_id, order_id, title, message, type)
  values (
    v_asesor, v_pedido.id,
    'Nuevo pedido asignado',
    'Te asignaron el pedido ' || v_pedido.order_number || '.',
    'info'::public.notification_type
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (null, 'ORDER_ADVISOR_ASSIGNED', 'orders', _order_id,
          jsonb_build_object('advisor_id', v_asesor));

  return v_asesor;
end;
$$;

-- ------------------------------------------------------------
-- Al crear el pedido
-- ------------------------------------------------------------
create or replace function public.orders_asignar_asesor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.asignar_asesor(new.id);
  return new;
end;
$$;

drop trigger if exists orders_zz_asignar_asesor on public.orders;
-- `zz` para que corra DESPUÉS de los disparadores que normalizan y completan
-- el pedido: la sede tiene que estar puesta antes de buscar quién la cubre.
create trigger orders_zz_asignar_asesor
  after insert on public.orders
  for each row execute function public.orders_asignar_asesor();

-- ------------------------------------------------------------
-- Repartir los huérfanos cuando entra un asesor
-- ------------------------------------------------------------
-- Cumple la promesa que se le hizo al cliente: «te avisamos apenas te
-- asignemos uno». Se dispara al darle el rol a alguien y al cambiarle las
-- sedes, que son los dos momentos en que la respuesta puede cambiar.
create or replace function public.repartir_pedidos_sin_asesor()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in
    select id from public.orders
     where advisor_id is null
       and status not in ('CANCELADO', 'ENTREGADO')
     order by created_at
  loop
    if public.asignar_asesor(v_id) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create or replace function public.tr_repartir_pedidos_sin_asesor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.repartir_pedidos_sin_asesor();
  return null;
end;
$$;

drop trigger if exists user_roles_zz_repartir on public.user_roles;
create trigger user_roles_zz_repartir
  after insert on public.user_roles
  for each row when (new.role = 'ASESOR')
  execute function public.tr_repartir_pedidos_sin_asesor();

drop trigger if exists user_pickup_locations_zz_repartir on public.user_pickup_locations;
create trigger user_pickup_locations_zz_repartir
  after insert on public.user_pickup_locations
  for each row execute function public.tr_repartir_pedidos_sin_asesor();

revoke all on function public.asignar_asesor(uuid) from public, anon;
revoke all on function public.repartir_pedidos_sin_asesor() from public, anon;
grant execute on function public.asesores_para_sede(uuid) to authenticated;
grant execute on function public.solo_asesor(uuid) to authenticated;
grant execute on function public.repartir_pedidos_sin_asesor() to authenticated;

notify pgrst, 'reload schema';
