-- Enlaza el movimiento de tesorería de un pago en línea con la factura del pedido: sin
-- el enlace, v_cartera la mostraba pendiente y anular_factura no veía el recaudo.
-- Solo movimientos con payment_id y sin factura; el recaudo manual ya trae la suya.

-- Pago posterior a la factura: el movimiento nace enlazado.
create or replace function public.movimiento_hereda_factura()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.invoice_id is null
     and new.payment_id is not null
     and new.order_id is not null
     and new.direction = 'INGRESO' then
    select i.id into new.invoice_id
      from public.invoices i
     where i.order_id = new.order_id
       and i.status = 'EMITIDA'
     order by i.issued_at desc nulls last
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists treasury_hereda_factura on public.treasury_movements;
create trigger treasury_hereda_factura
  before insert on public.treasury_movements
  for each row execute function public.movimiento_hereda_factura();

-- Factura posterior al pago: recoge los ingresos del pedido cuando sus totales pasan
-- de cero, igual que su asiento.
create or replace function public.factura_recoge_pagos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  with enlazados as (
    update public.treasury_movements m
       set invoice_id = new.id
     where m.order_id = new.order_id
       and m.invoice_id is null
       and m.payment_id is not null
       and m.direction = 'INGRESO'
    returning m.id
  )
  -- El comprobante del recaudo también apunta a la factura en el libro diario.
  update public.journal_entries j
     set invoice_id = new.id
   where j.movement_id in (select id from enlazados)
     and j.invoice_id is null;
  return new;
end;
$$;

drop trigger if exists factura_recoge_pagos on public.invoices;
create trigger factura_recoge_pagos
  after update on public.invoices
  for each row
  when (old.total_cop = 0 and new.total_cop > 0 and new.order_id is not null)
  execute function public.factura_recoge_pagos();

-- Backfill de movimientos ya registrados sin factura.
with sueltos as (
  update public.treasury_movements m
     set invoice_id = i.id
    from public.invoices i
   where i.order_id = m.order_id
     and i.status = 'EMITIDA'
     and m.invoice_id is null
     and m.payment_id is not null
     and m.direction = 'INGRESO'
  returning m.id, m.invoice_id
)
update public.journal_entries j
   set invoice_id = s.invoice_id
  from sueltos s
 where j.movement_id = s.id
   and j.invoice_id is null;

notify pgrst, 'reload schema';
