-- detalle_documento_comprobante ordenaba por invoice_items.created_at, que no existe,
-- y fallaba en comprobantes de factura. Se ordena por sort_order.

CREATE OR REPLACE FUNCTION public.detalle_documento_comprobante(_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
             order by ii.sort_order, ii.id)
      into v_lineas
    from public.invoice_items ii where ii.invoice_id = v_asiento.invoice_id;

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

    -- En una recepción el valor unitario es el costo: solo con permiso de costos.
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
    return jsonb_build_object('tipo', 'MANUAL');
  end if;

  return v_cabecera || jsonb_build_object(
    'lineas', coalesce(v_lineas, '[]'::jsonb),
    'costos_visibles', v_ve_costos
  );
end;
$function$;

notify pgrst, 'reload schema';
