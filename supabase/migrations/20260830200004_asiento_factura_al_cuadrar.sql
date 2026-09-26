-- El asiento de la factura pasa del INSERT al UPDATE que fija los totales: al
-- insertar la factura vale cero. El WHEN evita que se dispare de nuevo.

drop trigger if exists factura_genera_asiento on public.invoices;

create or replace function public.asentar_factura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta_cobro text;
  v_costo numeric(16,2);
  v_lineas jsonb;
begin
    -- Segunda barrera contra el doble asiento.
  if exists (
    select 1 from public.journal_entries
     where invoice_id = new.id and status = 'REGISTRADO'
  ) then
    return new;
  end if;

  v_cuenta_cobro := case when new.payment_method ilike '%tienda%' then '1105' else '1305' end;

  select coalesce(sum(oi.quantity * oi.unit_cost_cop), 0)
    into v_costo
  from public.order_items oi
  where oi.order_id = new.order_id and oi.unit_cost_cop is not null;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_cobro, 'detalle', new.customer_name,
                       'debito', new.total_cop, 'credito', 0),
    jsonb_build_object('cuenta', '4135', 'detalle', 'Venta ' || new.invoice_number,
                       'debito', 0, 'credito', new.taxable_base_cop)
  );

    -- Sin IVA no hay línea: un cero no pasa la restricción débito-o-crédito.
  if new.tax_cop > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta', '2408', 'detalle', 'IVA generado',
                         'debito', 0, 'credito', new.tax_cop));
  end if;

  if new.discount_cop > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta', '4175', 'detalle', 'Descuento comercial',
                         'debito', new.discount_cop, 'credito', 0));
  end if;

  if new.shipping_cop > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta', '4135', 'detalle', 'Flete facturado',
                         'debito', 0, 'credito', new.shipping_cop));
  end if;

    -- Sin costo conocido no se asienta: un cero fingiría margen del 100 %.
  if v_costo > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta', '6135', 'detalle', 'Costo de ' || new.invoice_number,
                         'debito', v_costo, 'credito', 0),
      jsonb_build_object('cuenta', '1435', 'detalle', 'Salida de inventario',
                         'debito', 0, 'credito', v_costo));
  end if;

  perform public.post_journal_entry(
    'Factura ' || new.invoice_number || ' — ' || new.customer_name,
    v_lineas,
    new.issued_at::date,
    'FACTURA',
    new.id, null, null);

  return new;
end;
$$;

create trigger factura_genera_asiento
  after update on public.invoices
  for each row
  when (old.total_cop = 0 and new.total_cop > 0)
  execute function public.asentar_factura();
