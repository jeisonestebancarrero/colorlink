-- ============================================================
-- El pedido guarda su fecha estimada de entrega
-- ============================================================
-- Hasta ahora el cliente leía "Entrega estimada: 24-48 horas" escrito en la
-- interfaz y el pedido no guardaba ninguna fecha. El correo no podía decirla,
-- la pantalla de despacho no tenía contra qué medirse y nadie podía saber si
-- un pedido iba tarde.
--
-- La calcula el SERVIDOR con `dias_de_entrega` sobre el municipio de destino:
-- una promesa de entrega no puede depender de la hora del computador del
-- cliente. Solo se llena en los envíos; el retiro en tienda ya tiene su
-- `pickup_scheduled_date`, que la elige el cliente.

create or replace function public.orders_fijar_fecha_estimada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.delivery_method = 'ENVIO'
     and new.estimated_delivery_date is null
     and new.shipping_municipality_code is not null then
    new.estimated_delivery_date := public.sumar_dias_habiles(
      current_date,
      public.dias_de_entrega(new.shipping_municipality_code)
    );
  end if;
  return new;
end;
$$;

-- Se nombra con 'z' al final para que corra DESPUÉS de la normalización y de
-- la validación de datos de entrega: Postgres dispara los BEFORE en orden
-- alfabético por nombre de disparador.
drop trigger if exists orders_zz_fecha_estimada on public.orders;
create trigger orders_zz_fecha_estimada
  before insert on public.orders
  for each row execute function public.orders_fijar_fecha_estimada();

-- El envío hereda la fecha del pedido, que es lo que consulta despacho.
create or replace function public.shipments_heredar_fecha_estimada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estimated_delivery_date is null then
    select o.estimated_delivery_date into new.estimated_delivery_date
      from public.orders o where o.id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_zz_fecha_estimada on public.shipments;
create trigger shipments_zz_fecha_estimada
  before insert on public.shipments
  for each row execute function public.shipments_heredar_fecha_estimada();

notify pgrst, 'reload schema';
