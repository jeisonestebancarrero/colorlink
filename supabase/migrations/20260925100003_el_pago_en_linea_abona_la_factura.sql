-- ============================================================================
-- El pago en línea abona la factura del pedido
-- ============================================================================
-- Un pedido pagado por la pasarela crea solo su movimiento de tesorería
-- (`pago_en_linea_a_tesoreria`), pero ese movimiento se guardaba con el pedido
-- y SIN la factura. Como la cartera (`v_cartera`) suma los ingresos por
-- factura, el caso más común —el cliente paga en línea y después se factura—
-- dejaba la factura en cartera con todo el saldo pendiente:
--
--   * Tesorería veía una deuda que ya estaba pagada, y podía registrar el
--     mismo dinero otra vez como recaudo manual.
--   * `anular_factura` no encontraba recaudos y dejaba anular una factura ya
--     cobrada.
--
-- La contabilidad no estaba mal: la factura debita 1305 Clientes y el recaudo
-- del pago lo acredita. Faltaba solo el enlace. Salió al recorrer el portal
-- para el manual de usuario (25 de septiembre de 2026).
--
-- Se enlaza en los dos órdenes posibles:
--   1. El pago llega cuando la factura ya existe: el movimiento nace enlazado.
--   2. La factura se emite cuando el pago ya llegó: al fijarse sus totales se
--      enlazan los ingresos del pedido que venían de un pago.
-- Solo se tocan movimientos que vienen de un pago (`payment_id`) y que aún no
-- tienen factura: un recaudo manual ya trae la suya.
-- ============================================================================

-- 1. El movimiento nace con la factura vigente del pedido, si la hay.
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

-- 2. La factura recoge los pagos que ya habían entrado. Se dispara en el mismo
--    momento que su asiento: cuando los totales pasan de cero a su valor.
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
  -- El comprobante del recaudo apunta también a la factura, para que el
  -- libro diario muestre de qué documento viene.
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

-- 3. Lo que ya quedó suelto se enlaza una vez.
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
