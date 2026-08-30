-- ============================================================
-- El asiento de la factura se hace cuando la factura ya tiene cifras
-- ============================================================
-- El disparador estaba en el INSERT de `invoices`, y ahí la factura todavía
-- vale cero: `issue_pos_invoice` crea la cabecera en ceros, recorre las
-- líneas del pedido y solo al final actualiza subtotal, base, IVA y total.
-- El asiento salía con todas las cifras en cero y lo detenía la restricción
-- que exige que una línea sea débito o crédito, nunca ninguno de los dos.
--
-- Se mueve al UPDATE que fija los totales, que es el momento en que la
-- factura existe de verdad. La condición del WHEN evita que un cambio
-- posterior vuelva a disparar el asiento.
-- ============================================================

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
  -- Segunda barrera contra el doble asiento: si por cualquier camino futuro
  -- esta función se llamara dos veces para la misma factura, la contabilidad
  -- quedaría inflada al doble y nadie lo notaría hasta el cierre.
  if exists (
    select 1 from public.journal_entries
     where invoice_id = new.id and status = 'REGISTRADO'
  ) then
    return new;
  end if;

  -- Pago en tienda entra a Caja; a crédito queda en Clientes.
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

  -- El IVA solo se acredita si lo hubo. Una línea en cero no pasa la
  -- restricción de débito-o-crédito, y con razón: no es un movimiento.
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

  -- El costo solo se asienta si se conoce. Meter un cero fingiría un margen
  -- del 100 % en los libros, que es peor que no registrarlo.
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
