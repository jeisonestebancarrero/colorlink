-- ============================================================
-- `invoices.subtotal_cop` se llamaba como lo que NO era
-- ============================================================
-- La columna guardaba la suma de las líneas **con el IVA ya incluido**, que es
-- como se vende en Colombia: el precio de góndola lo lleva dentro y la base se
-- despeja hacia atrás. La base gravable estaba —y sigue— en
-- `taxable_base_cop`.
--
-- Llamarla «subtotal» invita a exportarla a la DIAN como base imponible. Con
-- la única factura que hay hoy son $419.700 declarados como base cuando la
-- base son $352.689,08: se estaría declarando de más y pagando IVA sobre el
-- IVA. Un comentario en la columna ya lo advertía desde el 30 de agosto, y un
-- comentario no detiene a quien lee el nombre y da por hecho lo que significa.
--
-- Y la trampa era doble: en `invoice_items` la columna `subtotal_cop` guarda
-- justo lo contrario —la base SIN IVA, con el valor con IVA en `total_cop`—.
-- El mismo nombre con significado opuesto en la cabecera y en las líneas del
-- mismo documento.
--
-- La cabecera pasa a `items_total_cop`: el total de las líneas, antes de
-- descuento y envío. Lo que efectivamente guarda.
--
-- Renombrar no toca los datos: PostgreSQL actualiza solo las restricciones que
-- la nombran (`invoices_importes_no_negativos`). Lo único que había que seguir
-- a mano es `issue_pos_invoice`, la única función que la escribe, y un
-- `select` de `ReciboPOS.tsx` que la pedía sin llegar a usarla nunca.
-- ============================================================

alter table public.invoices rename column subtotal_cop to items_total_cop;

comment on column public.invoices.items_total_cop is
  'Suma de las líneas CON IVA incluido, antes de descuento y envío. La base '
  'gravable es taxable_base_cop y el IVA es tax_cop. NO es un subtotal sin '
  'impuesto: no se declara como base a la DIAN.';

comment on column public.invoice_items.subtotal_cop is
  'Base de la línea SIN IVA. Convención CONTRARIA a la de la cabecera: el '
  'valor con IVA de la línea está en total_cop.';

-- ============================================================
-- La única función que la escribe
-- ============================================================
-- Se recrea entera con dos cambios: la columna nueva y la variable local
-- `v_subtotal`, que arrastraba el mismo nombre engañoso, ahora
-- `v_lineas_con_iva`. Todo lo demás es idéntico a lo que había.
-- ============================================================

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
  v_lineas_con_iva numeric := 0;
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

  -- El medio de pago real: el que el cliente eligió al pagar. Solo cuando no
  -- hay registro de pago (venta de mostrador digitada por el vendedor) se cae
  -- al texto genérico.
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
    -- En Colombia el precio de góndola ya incluye IVA: la base se despeja
    -- hacia atrás, no se suma por encima.
    v_linea_base := round(r.subtotal_cop / (1 + v_tarifa / 100.0), 2);
    v_linea_iva  := r.subtotal_cop - v_linea_base;

    -- OJO con `invoice_items.subtotal_cop`: en la LÍNEA sí es la base SIN
    -- IVA (`v_linea_base`), y el valor con IVA va en `total_cop`. Es la
    -- convención contraria a la que tenía la cabecera, y tenerlas las dos con
    -- el mismo nombre en el mismo documento era la trampa entera.
    insert into public.invoice_items (
      invoice_id, description, code, presentation, quantity,
      unit_price_cop, tax_rate, tax_cop, subtotal_cop, total_cop
    ) values (
      v_invoice, r.product_name, r.product_code, r.presentation, r.quantity,
      r.unit_price_cop, v_tarifa, v_linea_iva, v_linea_base, r.subtotal_cop
    );

    v_base     := v_base + v_linea_base;
    v_iva      := v_iva + v_linea_iva;
    v_lineas_con_iva := v_lineas_con_iva + r.subtotal_cop;
  end loop;

  update public.invoices
     set items_total_cop = v_lineas_con_iva, taxable_base_cop = v_base, tax_cop = v_iva,
         total_cop = v_lineas_con_iva - v_pedido.discount_cop + v_pedido.shipping_cop
   where id = v_invoice;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'INVOICE_ISSUE', 'invoices', v_invoice,
          jsonb_build_object('order_id', _order_id, 'total', v_lineas_con_iva, 'medio', v_medio));

  return v_invoice;
end;
$$;

notify pgrst, 'reload schema';
