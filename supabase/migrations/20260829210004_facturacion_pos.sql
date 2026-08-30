-- ============================================================
-- BACK-OFFICE · 04 — Facturación POS
-- ============================================================
-- Documento impreso profesional con los datos de la tienda, los del cliente
-- y el desglose de impuestos. NO es facturación electrónica DIAN: no genera
-- CUFE, ni XML UBL, ni requiere proveedor tecnológico. Si más adelante se
-- quiere pasar a electrónica, esta tabla es la base sobre la que se añade.
-- ============================================================

create type public.invoice_status as enum ('EMITIDA','ANULADA');

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  order_id       uuid not null references public.orders (id) on delete restrict,
  user_id        uuid not null references auth.users (id)    on delete restrict,
  status         public.invoice_status not null default 'EMITIDA',

  -- ---- Copia de los datos del emisor en el momento de emitir ----
  -- Si mañana cambia la dirección o el NIT de la tienda, las facturas ya
  -- emitidas deben seguir mostrando lo que se imprimió aquel día.
  issuer_name    text not null,
  issuer_nit     text,
  issuer_address text,
  issuer_city    text,
  issuer_phone   text,
  issuer_regime  text,

  -- ---- Copia de los datos del cliente ----
  customer_name    text not null,
  customer_document text,
  customer_email   text,
  customer_phone   text,
  customer_address text,
  customer_city    text,

  -- ---- Importes ----
  subtotal_cop numeric(14,2) not null default 0,
  discount_cop numeric(14,2) not null default 0,
  taxable_base_cop numeric(14,2) not null default 0,
  tax_cop      numeric(14,2) not null default 0,
  shipping_cop numeric(14,2) not null default 0,
  total_cop    numeric(14,2) not null default 0,

  payment_method text,
  notes  text,
  footer text,
  issued_at  timestamptz not null default now(),
  voided_at  timestamptz,
  void_reason text,
  created_by uuid references auth.users (id) on delete set null,

  constraint invoices_importes_no_negativos check (
    subtotal_cop >= 0 and discount_cop >= 0 and tax_cop >= 0
    and shipping_cop >= 0 and total_cop >= 0
  ),
  constraint invoices_anulada_con_motivo
    check (status <> 'ANULADA' or (voided_at is not null and void_reason is not null))
);
create index invoices_order_id_idx on public.invoices (order_id);
create index invoices_user_id_idx  on public.invoices (user_id);
create sequence public.invoice_number_seq;

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  code        text,
  presentation text,
  quantity     numeric(12,2) not null,
  unit_price_cop numeric(14,2) not null,
  -- El IVA se guarda POR LÍNEA: distintos productos pueden tributar distinto
  -- y la factura debe poder desglosarlo por tarifa.
  tax_rate     numeric(5,2) not null default 19.00,
  tax_cop      numeric(14,2) not null default 0,
  subtotal_cop numeric(14,2) not null,
  total_cop    numeric(14,2) not null,
  sort_order   int not null default 0,

  constraint invoice_items_cantidad_positiva check (quantity > 0),
  constraint invoice_items_tarifa_valida check (tax_rate >= 0 and tax_rate <= 100)
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- Cada producto puede tener su propia tarifa de IVA.
alter table public.products
  add column tax_rate numeric(5,2) not null default 19.00;
alter table public.products
  add constraint products_tarifa_valida check (tax_rate >= 0 and tax_rate <= 100);

comment on column public.products.tax_rate is
  'Tarifa de IVA del producto. Por defecto 19%; algunos insumos pueden estar exentos o excluidos.';

-- ============================================================
-- Emitir factura POS a partir de un pedido
-- ============================================================
create or replace function public.issue_pos_invoice(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conf     public.app_settings%rowtype;
  v_pedido   public.orders%rowtype;
  v_perfil   record;
  v_invoice  uuid;
  v_base     numeric := 0;
  v_iva      numeric := 0;
  v_subtotal numeric := 0;
  r          record;
  v_tarifa   numeric;
  v_linea_base numeric;
  v_linea_iva  numeric;
begin
  if not (public.is_admin() or public.has_permission('invoices.issue')) then
    raise exception 'FORBIDDEN: no tienes permiso para emitir facturas' using errcode = '42501';
  end if;

  select * into v_pedido from public.orders where id = _order_id;
  if v_pedido.id is null then
    raise exception 'ORDER_NOT_FOUND: pedido no encontrado' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.invoices where order_id = _order_id and status = 'EMITIDA') then
    raise exception 'ALREADY_INVOICED: este pedido ya tiene factura vigente' using errcode = '23505';
  end if;

  select * into v_conf from public.app_settings where id = 1;

  select p.first_name || ' ' || p.last_name as nombre, p.email, p.phone, p.city,
         c.name as empresa, c.nit
    into v_perfil
  from public.profiles p
  left join public.companies c on c.id = p.company_id
  where p.id = v_pedido.user_id;

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
    coalesce(v_perfil.empresa, v_perfil.nombre), v_perfil.nit,
    v_perfil.email, v_perfil.phone,
    coalesce(v_pedido.shipping_address, ''), coalesce(v_pedido.shipping_city, v_perfil.city),
    v_pedido.discount_cop, v_pedido.shipping_cop,
    case when v_pedido.delivery_method = 'RETIRO_TIENDA' then 'Pago en tienda' else 'Pago en línea' end,
    v_conf.invoice_footer, (select auth.uid())
  )
  returning id into v_invoice;

  -- Líneas con IVA desglosado.
  -- Los precios de catálogo en Colombia se manejan con IVA incluido, así que
  -- se separa la base gravable del impuesto en lugar de sumarlo encima.
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
     set subtotal_cop     = v_subtotal,
         taxable_base_cop = v_base,
         tax_cop          = v_iva,
         total_cop        = v_subtotal - v_pedido.discount_cop + v_pedido.shipping_cop
   where id = v_invoice;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'INVOICE_ISSUED', 'invoices', v_invoice,
          jsonb_build_object('order_id', _order_id, 'total', v_subtotal));

  return v_invoice;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.invoices, public.invoice_items from anon, authenticated;
grant select on public.invoices, public.invoice_items to authenticated;

create policy "invoices_select" on public.invoices
  for select to authenticated
  using ( user_id = (select auth.uid()) or (select public.is_staff()) );

create policy "invoices_admin" on public.invoices
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

create policy "invoice_items_select" on public.invoice_items
  for select to authenticated
  using ( exists (select 1 from public.invoices i where i.id = invoice_id
                  and (i.user_id = (select auth.uid()) or (select public.is_staff()))) );

revoke execute on function public.issue_pos_invoice(uuid) from public, anon;
grant execute on function public.issue_pos_invoice(uuid) to authenticated;
