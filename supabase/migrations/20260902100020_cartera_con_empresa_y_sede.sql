-- v_cartera expone company_id y location_id para ver la deuda por empresa y acotar por sede.

create or replace view public.v_cartera as
  select
    i.id as invoice_id,
    i.invoice_number,
    i.customer_name,
    i.issued_at,
    i.total_cop,
    coalesce(sum(m.amount_cop) filter (where m.direction = 'INGRESO'), 0::numeric) as recaudado,
    i.total_cop - coalesce(sum(m.amount_cop) filter (where m.direction = 'INGRESO'), 0::numeric) as saldo,
    current_date - i.issued_at::date as dias,
      -- Al final: create or replace view no permite insertar columnas en medio.
      -- La empresa sale del pedido; la factura guarda el cliente como texto histórico.
    o.company_id,
    i.location_id
  from public.invoices i
  left join public.orders o on o.id = i.order_id
  left join public.treasury_movements m on m.invoice_id = i.id
  where i.status = 'EMITIDA'
  group by i.id, o.company_id, i.location_id;

comment on view public.v_cartera is
  'Saldo pendiente por factura, con su empresa y su sede. La vista hereda las políticas de `invoices`.';
