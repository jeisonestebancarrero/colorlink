-- La factura toma el medio de pago de payments, no de delivery_method: retirar en
-- tienda no implica pago en efectivo y asentaba la venta en 1105 Caja.
create or replace function public.issue_pos_invoice(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   public.orders%rowtype;
  v_perfil   record;
  v_conf     record;
  v_invoice  uuid;
  v_iva      numeric := 0;
  v_base     numeric := 0;
  v_subtotal numeric := 0;
  v_tarifa   numeric;
  v_linea_base numeric;
  v_linea_iva  numeric;
  v_medio    text;
  r          record;
begin
  if not (public.is_admin() or public.has_permission('invoices.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para facturar' using errcode = '42501';
  end if;

  select * into v_pedido from public.orders where id = _order_id;
  if not found then
    raise exception 'NOT_FOUND: ese pedido no existe' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.invoices where order_id = _order_id and status = 'EMITIDA') then
    raise exception 'YA_FACTURADO: ese pedido ya tiene factura' using errcode = '23505';
  end if;

  select * into v_conf from public.app_settings limit 1;

  select p.first_name || ' ' || p.last_name as nombre, p.email, p.phone, p.city,
         p.document_number, p.document_type,
         c.name as empresa, c.nit as nit_empresa
    into v_perfil
    from public.profiles p
    left join public.companies c on c.id = p.company_id
   where p.id = v_pedido.user_id;

    -- Medio elegido al pagar; sin registro de pago (mostrador) cae al genérico.
  select case pa.method
           when 'EFECTIVO'            then 'Efectivo'
           when 'PSE'                 then 'PSE'
           when 'TARJETA_CREDITO'     then 'Tarjeta de crédito'
           when 'TARJETA_DEBITO'      then 'Tarjeta débito'
           when 'TRANSFERENCIA'       then 'Transferencia'
           when 'CREDITO_EMPRESARIAL' then 'Crédito empresarial'
           else pa.method::text
         end
    into v_medio
    from public.payments pa
   where pa.order_id = _order_id
   order by pa.created_at desc
   limit 1;

  v_medio := coalesce(v_medio, 'Pago en tienda');

  insert into public.invoices (
    invoice_number, order_id, user_id,
    issuer_name, issuer_nit, issuer_address, issuer_city, issuer_phone, issuer_regime,
    customer_name, customer_document, customer_email, customer_phone,
    customer_address, customer_city,
    discount_cop, shipping_cop, payment_method, footer, created_by
  ) values (
    coalesce(v_conf.invoice_prefix, 'POS') || '-' ||
      lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
    _order_id, v_pedido.user_id,
    v_conf.company_name, v_conf.company_nit, v_conf.company_address,
    v_conf.company_city, v_conf.company_phone, v_conf.tax_regime,
    coalesce(v_perfil.empresa, v_perfil.nombre),
    coalesce(
      v_perfil.nit_empresa,
      case when v_perfil.document_number is not null
           then coalesce(v_perfil.document_type::text, 'CC') || ' ' || v_perfil.document_number
      end
    ),
    v_perfil.email, v_perfil.phone,
    coalesce(v_pedido.shipping_address, ''), coalesce(v_pedido.shipping_city, v_perfil.city),
    v_pedido.discount_cop, v_pedido.shipping_cop,
    v_medio,
    v_conf.invoice_footer, (select auth.uid())
  )
  returning id into v_invoice;

  for r in
    select oi.product_name, oi.product_code, oi.presentation, oi.quantity,
           oi.unit_price_cop, oi.subtotal_cop,
           coalesce(p.tax_rate, v_conf.default_tax_rate) as tax_rate
      from public.order_items oi
      left join public.product_variants pv on pv.id = oi.variant_id
      left join public.products p on p.id = pv.product_id
     where oi.order_id = _order_id
  loop
    v_tarifa := coalesce(r.tax_rate, 19);
      -- El precio incluye IVA: la base se despeja hacia atrás.
    v_linea_base := round(r.subtotal_cop / (1 + v_tarifa / 100.0), 2);
    v_linea_iva  := r.subtotal_cop - v_linea_base;

    insert into public.invoice_items (
      invoice_id, description, code, presentation, quantity,
      unit_price_cop, tax_rate, tax_cop, subtotal_cop, total_cop
    ) values (
      v_invoice, r.product_name, r.product_code, r.presentation, r.quantity,
      r.unit_price_cop, v_tarifa, v_linea_iva, v_linea_base, r.subtotal_cop
    );

    v_base     := v_base + v_linea_base;
    v_iva      := v_iva + v_linea_iva;
    v_subtotal := v_subtotal + r.subtotal_cop;
  end loop;

  update public.invoices
     set subtotal_cop = v_subtotal, taxable_base_cop = v_base, tax_cop = v_iva,
         total_cop = v_subtotal - v_pedido.discount_cop + v_pedido.shipping_cop
   where id = v_invoice;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'INVOICE_ISSUE', 'invoices', v_invoice,
          jsonb_build_object('order_id', _order_id, 'total', v_subtotal, 'medio', v_medio));

  return v_invoice;
end;
$$;

revoke all on function public.issue_pos_invoice(uuid) from public;
grant execute on function public.issue_pos_invoice(uuid) to authenticated;

-- subtotal_cop es el total con IVA; la base está en taxable_base_cop.
comment on column public.invoices.subtotal_cop is
  'Suma de las líneas CON IVA incluido (los precios de góndola ya lo incluyen). La base gravable está en taxable_base_cop.';

-- Solo el efectivo en mostrador entra a Caja; los demás medios quedan en 1305
-- Clientes hasta que Tesorería registre el recaudo.
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

  v_cuenta_cobro := case
    when new.payment_method in ('Efectivo', 'Pago en tienda') then '1105'
    else '1305'
  end;

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
