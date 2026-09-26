-- Los envíos guardan su fecha estimada, calculada en el servidor con dias_de_entrega;
-- el retiro en tienda ya usa pickup_scheduled_date.

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

-- El «zz» del nombre hace que corra después de normalización y validación: los BEFORE
-- se disparan en orden alfabético.
drop trigger if exists orders_zz_fecha_estimada on public.orders;
create trigger orders_zz_fecha_estimada
  before insert on public.orders
  for each row execute function public.orders_fijar_fecha_estimada();

-- El envío hereda la fecha del pedido, que es la que consulta despacho.
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
