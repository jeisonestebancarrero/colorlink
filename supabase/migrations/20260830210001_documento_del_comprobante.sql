-- ============================================================
-- Del comprobante al documento que lo originó
-- ============================================================
-- Un asiento contable NO lleva las líneas de producto: un comprobante con
-- cuarenta renglones deja de ser legible y duplica la factura. El detalle
-- vive en el documento y el asiento lo referencia.
--
-- Pero referenciarlo con un texto —«Factura POS-000001»— no sirve de nada si
-- desde ahí no se puede llegar al documento. Quien revisa un asiento necesita
-- ver QUÉ se vendió o QUÉ llegó sin salir a buscarlo a otra pantalla.
--
-- Esta función devuelve ese detalle, y lo hace por función y no exponiendo
-- las tablas porque una de ellas guarda el costo, que es confidencial y solo
-- lo puede ver quien tenga `costs.read`.
create or replace function public.detalle_documento_comprobante(_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asiento public.journal_entries%rowtype;
  v_lineas  jsonb;
  v_cabecera jsonb;
  v_ve_costos boolean;
begin
  if not public.has_permission('accounting.read') then
    raise exception 'FORBIDDEN: no tienes permiso para consultar la contabilidad'
      using errcode = '42501';
  end if;

  select * into v_asiento from public.journal_entries where id = _entry_id;
  if v_asiento.id is null then
    raise exception 'NOT_FOUND: ese comprobante no existe' using errcode = 'P0002';
  end if;

  v_ve_costos := public.has_permission('costs.read');

  -- ---------- Factura ----------
  if v_asiento.invoice_id is not null then
    select jsonb_build_object(
             'tipo', 'FACTURA',
             'numero', i.invoice_number,
             'fecha', i.issued_at,
             'contraparte', i.customer_name,
             'documento', i.customer_document,
             'total', i.total_cop,
             'base', i.taxable_base_cop,
             'impuesto', i.tax_cop,
             'descuento', i.discount_cop,
             'envio', i.shipping_cop,
             'forma_pago', i.payment_method)
      into v_cabecera
    from public.invoices i where i.id = v_asiento.invoice_id;

    select jsonb_agg(jsonb_build_object(
             'descripcion', ii.description,
             'codigo', ii.code,
             'presentacion', ii.presentation,
             'cantidad', ii.quantity,
             'valor_unitario', ii.unit_price_cop,
             'subtotal', ii.total_cop)
             order by ii.created_at)
      into v_lineas
    from public.invoice_items ii where ii.invoice_id = v_asiento.invoice_id;

  -- ---------- Recepción ----------
  elsif v_asiento.receipt_id is not null then
    select jsonb_build_object(
             'tipo', 'RECEPCION',
             'numero', r.receipt_number,
             'fecha', r.received_on,
             'contraparte', coalesce(s.name, 'Sin proveedor'),
             'documento', r.document_ref,
             'total', r.total_cop,
             'bodega', l.name)
      into v_cabecera
    from public.purchase_receipts r
    left join public.suppliers s on s.id = r.supplier_id
    left join public.pickup_locations l on l.id = r.location_id
    where r.id = v_asiento.receipt_id;

    -- El costo unitario solo se incluye si la persona puede ver costos: en
    -- una recepción, el «valor unitario» ES el costo de compra.
    select jsonb_agg(jsonb_build_object(
             'descripcion', p.name,
             'codigo', p.code,
             'presentacion', v.label,
             'cantidad', ri.quantity,
             'valor_unitario', case when v_ve_costos then ri.unit_cost_cop end,
             'subtotal', case when v_ve_costos then ri.subtotal_cop end)
             order by ri.created_at)
      into v_lineas
    from public.purchase_receipt_items ri
    join public.product_variants v on v.id = ri.variant_id
    join public.products p on p.id = v.product_id
    where ri.receipt_id = v_asiento.receipt_id;

  -- ---------- Recaudo ----------
  elsif v_asiento.movement_id is not null then
    select jsonb_build_object(
             'tipo', 'RECAUDO',
             'numero', coalesce(m.reference, 'Sin referencia'),
             'fecha', m.occurred_on,
             'contraparte', m.concept,
             'documento', m.bank_statement_ref,
             'total', m.amount_cop,
             'cuenta', b.name)
      into v_cabecera
    from public.treasury_movements m
    left join public.bank_accounts b on b.id = m.account_id
    where m.id = v_asiento.movement_id;
  end if;

  if v_cabecera is null then
    -- Un comprobante manual no tiene documento, y decirlo es más útil que
    -- devolver una estructura vacía que la pantalla tenga que adivinar.
    return jsonb_build_object('tipo', 'MANUAL');
  end if;

  return v_cabecera || jsonb_build_object(
    'lineas', coalesce(v_lineas, '[]'::jsonb),
    'costos_visibles', v_ve_costos
  );
end;
$$;

revoke all on function public.detalle_documento_comprobante(uuid) from public, anon;
grant execute on function public.detalle_documento_comprobante(uuid) to authenticated;

-- ============================================================
-- Estado de resultados
-- ============================================================
-- El balance de prueba lista cuentas; no dice si el negocio ganó o perdió.
-- Es la pregunta que hace cualquiera que abra este módulo, y sale de las
-- mismas cifras que ya están registradas.
create view public.v_estado_resultados as
select
  a.class                        as clase,
  a.code                         as cuenta,
  a.name                         as cuenta_nombre,
  case a.class
    when 'INGRESO' then coalesce(sum(l.credit_cop), 0) - coalesce(sum(l.debit_cop), 0)
    else                coalesce(sum(l.debit_cop), 0)  - coalesce(sum(l.credit_cop), 0)
  end                            as valor
from public.accounts a
left join public.journal_lines l on l.account_id = a.id
left join public.journal_entries e
       on e.id = l.entry_id and e.status = 'REGISTRADO'
where a.class in ('INGRESO', 'COSTO', 'GASTO')
  and a.is_postable
  and public.has_permission('accounting.read')
group by a.class, a.code, a.name;

grant select on public.v_estado_resultados to authenticated;

comment on view public.v_estado_resultados is
  'Ingresos, costos y gastos con su valor en positivo. La utilidad es ingresos menos costos y gastos.';
