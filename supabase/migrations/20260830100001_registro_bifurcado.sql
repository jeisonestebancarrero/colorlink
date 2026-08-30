-- ============================================================
-- Registro bifurcado: persona natural o empresa
-- ============================================================
-- POR QUÉ EL REGISTRO SE BIFURCA Y EL LOGIN NO:
-- Al iniciar sesión el sistema ya sabe quién eres en cuanto entra la
-- contraseña; preguntar "¿qué portal?" antes de identificarse solo genera el
-- clásico "usuario no existe" por haber elegido la puerta equivocada.
-- Al registrarse sí cambian los datos: una persona natural no tiene NIT, ni
-- razón social, ni representante legal.
--
-- Hasta ahora el formulario exigía empresa a TODO el mundo, así que un
-- particular tenía que inventarse una razón social para poder comprar.
-- ============================================================

create type public.document_type as enum ('CC', 'CE', 'NIT', 'PASAPORTE', 'PEP');

alter table public.profiles add column document_type   public.document_type;
alter table public.profiles add column document_number text;

comment on column public.profiles.document_number is
  'Documento de la persona natural. Para clientes empresa el identificador fiscal es companies.nit.';

-- Un mismo documento no puede pertenecer a dos personas.
create unique index profiles_documento_unico
  on public.profiles (document_type, document_number)
  where document_number is not null;

-- ============================================================
-- Alta de usuario adaptada a las dos formas de registro
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name text;
  v_company_nit  text;
  v_company_id   uuid;
  v_client_type  public.client_type;
  v_city         text;
  v_first_name   text;
  v_last_name    text;
  v_full_name    text;
  v_avatar       text;
  v_doc_type     public.document_type;
  v_doc_number   text;
begin
  v_client_type := case
    when new.raw_user_meta_data ->> 'client_type'
         in ('Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor')
    then (new.raw_user_meta_data ->> 'client_type')::public.client_type
    else 'Particular'::public.client_type
  end;

  v_city         := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');
  v_company_nit  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company_nit', '')), '');
  v_doc_number   := nullif(trim(coalesce(new.raw_user_meta_data ->> 'document_number', '')), '');

  v_doc_type := case
    when new.raw_user_meta_data ->> 'document_type' in ('CC','CE','NIT','PASAPORTE','PEP')
    then (new.raw_user_meta_data ->> 'document_type')::public.document_type
    else null
  end;

  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_last_name  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');

  -- Proveedor externo (Google): solo llega el nombre completo.
  if v_first_name is null then
    v_full_name := nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name', '')), '');
    if v_full_name is not null then
      v_first_name := split_part(v_full_name, ' ', 1);
      -- Todo lo que sigue al primer espacio son apellidos: en Colombia son
      -- habituales dos y partirlos sería peor.
      v_last_name := coalesce(
        nullif(trim(substr(v_full_name, length(split_part(v_full_name, ' ', 1)) + 1)), ''),
        v_last_name);
    end if;
  end if;

  v_avatar := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture', '')), '');

  insert into public.profiles (
    id, email, first_name, last_name, phone, city, client_type, avatar_url,
    document_type, document_number
  )
  values (
    new.id, new.email,
    coalesce(v_first_name, ''), coalesce(v_last_name, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_city, v_client_type, v_avatar, v_doc_type, v_doc_number
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'CLIENTE')
  on conflict on constraint user_roles_unicos do nothing;

  -- Solo la vía "empresa" crea empresa. Un particular ya no está obligado a
  -- inventarse una razón social para poder comprar.
  --
  -- Se crea SIEMPRE una empresa nueva, nunca se vincula a una existente:
  -- bastaría escribir el nombre de otra constructora para acceder a sus
  -- proyectos. Unirse a una empresa ya registrada exigirá invitación.
  if v_company_name is not null then
    insert into public.companies (name, nit, city, email, status)
    values (v_company_name, v_company_nit, v_city, new.email, 'ACTIVA')
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, company_role)
    values (v_company_id, new.id, 'OWNER');

    update public.profiles set company_id = v_company_id where id = new.id;

    insert into public.user_roles (user_id, role, company_id)
    values (new.id, 'CLIENTE_B2B', v_company_id)
    on conflict on constraint user_roles_unicos do nothing;
  end if;

  return new;
end;
$$;

-- ============================================================
-- La factura POS debe mostrar el documento de una persona natural
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
         c.name as empresa, c.nit as nit_empresa,
         p.document_type, p.document_number
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
    -- Empresa si la hay; si no, la persona natural.
    coalesce(v_perfil.empresa, v_perfil.nombre),
    -- Identificación: NIT de la empresa, o el documento de la persona.
    coalesce(
      v_perfil.nit_empresa,
      case when v_perfil.document_number is not null
           then coalesce(v_perfil.document_type::text, 'CC') || ' ' || v_perfil.document_number
      end
    ),
    v_perfil.email, v_perfil.phone,
    coalesce(v_pedido.shipping_address, ''), coalesce(v_pedido.shipping_city, v_perfil.city),
    v_pedido.discount_cop, v_pedido.shipping_cop,
    case when v_pedido.delivery_method = 'RETIRO_TIENDA' then 'Pago en tienda' else 'Pago en línea' end,
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
  values ((select auth.uid()), 'INVOICE_ISSUED', 'invoices', v_invoice,
          jsonb_build_object('order_id', _order_id, 'total', v_subtotal));

  return v_invoice;
end;
$$;
