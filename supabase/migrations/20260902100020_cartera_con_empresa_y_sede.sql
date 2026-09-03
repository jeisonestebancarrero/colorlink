-- ============================================================
-- La cartera dice de qué empresa y de qué sede es
-- ============================================================
-- `v_cartera` devolvía el saldo por factura pero sin la empresa, así que no
-- había forma de saber cuánto debe una constructora. Eso hace falta justo donde
-- se aprueba su crédito: aprobar un cupo de un millón a quien ya debe tres le
-- bloquea los pedidos sin que nadie entienda por qué.
--
-- Se agregan `company_id` y `location_id`, que ya viven en la factura y en el
-- pedido. La sede permite además acotar la cartera con el selector, igual que
-- el resto del portal.

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
    -- Las columnas nuevas van AL FINAL: `create or replace view` no permite
    -- insertarlas en el medio ni renombrar las existentes.
    --
    -- La empresa sale del pedido: la factura guarda el nombre del cliente como
    -- texto histórico, no su id, para que reimprimir una factura vieja muestre
    -- los datos que tenía el día que se emitió.
    o.company_id,
    i.location_id
  from public.invoices i
  left join public.orders o on o.id = i.order_id
  left join public.treasury_movements m on m.invoice_id = i.id
  where i.status = 'EMITIDA'
  group by i.id, o.company_id, i.location_id;

comment on view public.v_cartera is
  'Saldo pendiente por factura, con su empresa y su sede. La vista hereda las políticas de `invoices`.';
