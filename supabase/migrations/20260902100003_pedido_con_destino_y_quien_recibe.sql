-- ============================================================
-- El pedido resuelve su destino en el servidor
-- ============================================================
-- `create_order_from_cart` recibía la dirección y la ciudad como texto libre
-- desde el navegador. Ahora, cuando el cliente elige una dirección guardada o
-- una sede de su empresa, **manda el id y el servidor lee la dirección**. Es el
-- mismo principio que ya se aplica a los precios: si el navegador pudiera
-- enviar la dirección junto con el id de la sede, podría enviar una que no es
-- la de esa sede, y el despacho saldría hacia donde dijera la pestaña.
--
-- La dirección escrita a mano sigue existiendo, y es necesaria: una obra no es
-- una sede registrada. Lo que se valida es que la sede sea de SU empresa y que
-- la dirección guardada sea SUYA.
--
-- `shipping_city` se sigue llenando con el nombre del municipio para no romper
-- las vistas del portal ni `shipments.city`, pero la verdad ahora está en
-- `shipping_municipality_code`.

drop function if exists public.create_order_from_cart(text, uuid, text, text, uuid, text);

create or replace function public.create_order_from_cart(
  _delivery_method            text,
  _pickup_location_id         uuid    default null,
  _shipping_address           text    default null,
  _shipping_municipality_code text    default null,
  _customer_address_id        uuid    default null,
  _company_branch_id          uuid    default null,
  _recipient_name             text    default null,
  _recipient_document_type    text    default null,
  _recipient_document_number  text    default null,
  _recipient_phone            text    default null,
  _project_id                 uuid    default null,
  _notes                      text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := (select auth.uid());
  v_cart_id    uuid;
  v_order_id   uuid;
  v_company_id uuid;
  v_subtotal   numeric := 0;
  v_descuento  numeric := 0;
  v_envio      numeric := 0;
  v_items      int := 0;
  v_metodo     public.delivery_method;
  -- Destino resuelto por el servidor.
  v_direccion  text;
  v_mun_code   text;
  v_ciudad     text;
  v_doc_tipo   public.document_type;
  r            record;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  v_metodo := case when _delivery_method = 'ENVIO' then 'ENVIO'::public.delivery_method
                   else 'RETIRO_TIENDA'::public.delivery_method end;

  if v_metodo = 'RETIRO_TIENDA' and _pickup_location_id is null then
    raise exception 'VALIDATION: debes elegir un punto de retiro' using errcode = '22023';
  end if;

  select p.company_id into v_company_id from public.profiles p where p.id = v_user_id;

  -- ----------------------------------------------------------
  -- Destino
  -- ----------------------------------------------------------
  if v_metodo = 'ENVIO' then
    if _company_branch_id is not null then
      -- La sede tiene que ser de la empresa de quien compra. Si no, es la sede
      -- de otro cliente y el pedido saldría hacia una dirección ajena.
      select b.address_line, b.municipality_code into v_direccion, v_mun_code
      from public.company_branches b
      where b.id = _company_branch_id
        and b.status = 'ACTIVO'
        and b.company_id = v_company_id;

      if v_direccion is null then
        raise exception 'VALIDATION: esa sede no existe o no es de tu empresa'
          using errcode = '22023';
      end if;

    elsif _customer_address_id is not null then
      select a.address_line, a.municipality_code into v_direccion, v_mun_code
      from public.customer_addresses a
      where a.id = _customer_address_id and a.user_id = v_user_id;

      if v_direccion is null then
        raise exception 'VALIDATION: esa dirección no existe o no es tuya'
          using errcode = '22023';
      end if;

    else
      -- Dirección escrita a mano: el caso de la obra.
      v_direccion := btrim(_shipping_address);
      v_mun_code  := _shipping_municipality_code;

      if coalesce(v_direccion, '') = '' then
        raise exception 'VALIDATION: la dirección de envío es obligatoria'
          using errcode = '22023';
      end if;
      if v_mun_code is null then
        raise exception 'VALIDATION: debes elegir la ciudad de envío'
          using errcode = '22023';
      end if;
    end if;

    select m.name into v_ciudad from public.municipalities m where m.code = v_mun_code;
    if v_ciudad is null then
      raise exception 'VALIDATION: esa ciudad no está en el listado oficial'
        using errcode = '22023';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Quién recibe. Obligatorio también al retirar en tienda: el punto de venta
  -- tiene que saber a quién le entrega y con qué documento verificarlo.
  -- ----------------------------------------------------------
  if coalesce(btrim(_recipient_name), '') = '' then
    raise exception 'VALIDATION: indica el nombre de quien recibe el pedido'
      using errcode = '22023';
  end if;
  if coalesce(btrim(_recipient_document_number), '') = '' then
    raise exception 'VALIDATION: indica el número de documento de quien recibe'
      using errcode = '22023';
  end if;
  if coalesce(btrim(_recipient_phone), '') = '' then
    raise exception 'VALIDATION: indica el teléfono de quien recibe'
      using errcode = '22023';
  end if;

  begin
    v_doc_tipo := coalesce(_recipient_document_type, 'CC')::public.document_type;
  exception when invalid_text_representation then
    raise exception 'VALIDATION: ese tipo de documento no es válido'
      using errcode = '22023';
  end;

  -- ----------------------------------------------------------
  -- Carrito
  -- ----------------------------------------------------------
  select c.id into v_cart_id
  from public.carts c
  where c.user_id = v_user_id and c.is_active
  limit 1;

  if v_cart_id is null then
    raise exception 'EMPTY_CART: no hay carrito activo' using errcode = '22023';
  end if;

  select count(*) into v_items from public.cart_items where cart_id = v_cart_id;
  if v_items = 0 then
    raise exception 'EMPTY_CART: el carrito está vacío' using errcode = '22023';
  end if;

  insert into public.orders (
    order_number, user_id, company_id, project_id, status, delivery_method,
    shipping_address, shipping_city, shipping_municipality_code,
    company_branch_id, pickup_location_id, pickup_code,
    recipient_name, recipient_document_type, recipient_document_number,
    recipient_phone, notes
  ) values (
    'ORD-PNT-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
    v_user_id, v_company_id, _project_id, 'PENDIENTE', v_metodo,
    v_direccion, v_ciudad, v_mun_code,
    case when v_metodo = 'ENVIO' then _company_branch_id end,
    _pickup_location_id,
    case when v_metodo = 'RETIRO_TIENDA'
         then upper(substr(md5(gen_random_uuid()::text), 1, 6)) end,
    btrim(_recipient_name), v_doc_tipo, btrim(_recipient_document_number),
    btrim(_recipient_phone), _notes
  )
  returning id into v_order_id;

  -- Líneas: el precio se toma de la variante EN ESTE INSTANTE y se congela.
  for r in
    select ci.quantity,
           v.id as variant_id, v.label, v.price_cop,
           p.name as product_name, p.code as product_code, p.image_url,
           col.name as color_name,
           v.status as variant_status, p.status as product_status
    from public.cart_items ci
    join public.product_variants v on v.id = ci.variant_id
    join public.products p on p.id = v.product_id
    left join public.colors col on col.id = ci.color_id
    where ci.cart_id = v_cart_id
  loop
    if r.variant_status <> 'ACTIVO' or r.product_status <> 'ACTIVO' then
      raise exception 'PRODUCT_UNAVAILABLE: "%" ya no está disponible', r.product_name
        using errcode = '22023';
    end if;

    insert into public.order_items (
      order_id, variant_id, product_name, product_code, presentation,
      color_name, unit_price_cop, quantity, subtotal_cop, image_url,
      unit_cost_cop
    ) values (
      v_order_id, r.variant_id, r.product_name, r.product_code, r.label,
      r.color_name, r.price_cop, r.quantity, r.price_cop * r.quantity, r.image_url,
      -- El costo se congela junto con el precio. Si se dejara para después,
      -- la utilidad de este pedido cambiaría cada vez que suba un proveedor.
      public.costo_vigente(r.variant_id, _pickup_location_id)
    );

    v_subtotal := v_subtotal + (r.price_cop * r.quantity);
  end loop;

  if exists (
    select 1 from public.cart_items ci
    where ci.cart_id = v_cart_id and ci.kit_solution_id is not null
  ) then
    v_descuento := round(v_subtotal * 0.08, 2);
  end if;

  if v_metodo = 'ENVIO' and (v_subtotal - v_descuento) < 500000 then
    v_envio := 25000;
  end if;

  update public.orders
     set subtotal_cop = v_subtotal,
         discount_cop = v_descuento,
         shipping_cop = v_envio,
         total_cop    = v_subtotal - v_descuento + v_envio
   where id = v_order_id;

  if v_metodo = 'ENVIO' then
    insert into public.shipments (order_id, address, city, status)
    values (v_order_id, v_direccion, v_ciudad, 'PENDIENTE');
  end if;

  insert into public.payments (order_id, method, status, amount_cop)
  values (v_order_id, 'PSE', 'PENDIENTE', v_subtotal - v_descuento + v_envio);

  update public.carts set is_active = false where id = v_cart_id;

  insert into public.notifications (user_id, order_id, type, title, message, action_required, action_label)
  select v_user_id, v_order_id, 'success', 'Pedido confirmado',
         'Tu pedido ' || o.order_number || ' fue creado por ' ||
         to_char(o.total_cop, 'FM999G999G999') || ' COP.',
         true, 'Ver pedido'
  from public.orders o where o.id = v_order_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (v_user_id, 'ORDER_CREATED', 'orders', v_order_id,
          jsonb_build_object('items', v_items, 'total', v_subtotal - v_descuento + v_envio));

  return v_order_id;
end;
$$;

revoke all on function public.create_order_from_cart(
  text, uuid, text, text, uuid, uuid, text, text, text, text, uuid, text
) from public;
grant execute on function public.create_order_from_cart(
  text, uuid, text, text, uuid, uuid, text, text, text, text, uuid, text
) to authenticated;

notify pgrst, 'reload schema';
