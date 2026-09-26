-- ============================================================================
-- Los permisos dicen lo mismo en la pantalla y en la base
-- ============================================================================
-- Revisando el portal para el documento de requisitos salieron nueve sitios en
-- los que la pantalla ofrecía una acción que la base negaba, o al revés:
--
--   * Cambiar el estado de un pedido era solo del administrador, aunque el
--     permiso `orders.status` existe y lo tiene Despacho.
--   * Facturar pedía `invoices.write`, que nunca existió: Facturación tenía
--     `invoices.issue` y no podía emitir.
--   * Entregar con código aceptaba `shipments.write` (no existe) en lugar de
--     `dispatch.manage`.
--   * El panel contaba visitas y chats con `visits.read` y `chat.read`, que
--     tampoco existen: solo el administrador veía esos contadores.
--   * Los envíos se podían editar siendo personal de la sede, sin
--     `dispatch.manage`.
--   * Un rol creado desde el portal no contaba como personal interno, porque
--     la lista de roles internos estaba escrita a mano en varias funciones.
--   * Las excepciones de permiso por persona existían en la base pero no había
--     cómo ponerlas.
--
-- Criterio: el permiso que se muestra en la matriz es el que decide. El
-- administrador sigue pudiendo todo. Aprobado por el dueño del producto el
-- 25 de septiembre de 2026.
-- ============================================================================

-- 1. Cambiar el estado del pedido: con `orders.status`, en sus sedes.
CREATE OR REPLACE FUNCTION public.change_order_status(_order_id uuid, _nuevo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actual public.order_status;
  v_nuevo  public.order_status;
  v_permitidos public.order_status[];
begin
  if not (public.is_admin() or public.has_permission('orders.status')) then
    raise exception 'FORBIDDEN: no tienes permiso para cambiar el estado de un pedido'
      using errcode = '42501';
  end if;

  -- La función salta RLS, así que aplica a mano la misma regla de lectura de
  -- `orders`: la sede tiene que ser de quien cambia el estado, y un asesor
  -- puro solo mueve los pedidos que tiene asignados. Un pedido que no se
  -- puede ver responde igual que uno que no existe.
  select o.status into v_actual
    from public.orders o
   where o.id = _order_id
     and public.puede_ver_sede(o.pickup_location_id)
     and (not public.solo_asesor() or o.advisor_id = (select auth.uid()));
  if v_actual is null then
    raise exception 'ORDER_NOT_FOUND: pedido no encontrado' using errcode = 'P0002';
  end if;

  v_nuevo := _nuevo::public.order_status;

  -- Máquina de estados. No se permite saltar pasos ni resucitar un pedido
  -- entregado o cancelado.
  v_permitidos := case v_actual
    when 'PENDIENTE'  then array['CONFIRMADO','CANCELADO']::public.order_status[]
    when 'CONFIRMADO' then array['PREPARANDO','CANCELADO']::public.order_status[]
    when 'PREPARANDO' then array['ENVIADO','LISTO_PARA_RETIRO','CANCELADO']::public.order_status[]
    when 'ENVIADO'    then array['ENTREGADO']::public.order_status[]
    when 'LISTO_PARA_RETIRO' then array['ENTREGADO']::public.order_status[]
    else array[]::public.order_status[]
  end;

  if not (v_nuevo = any(v_permitidos)) then
    raise exception 'INVALID_TRANSITION: no se puede pasar de % a %', v_actual, v_nuevo
      using errcode = '22023';
  end if;

  update public.orders set status = v_nuevo where id = _order_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'ORDER_STATUS_CHANGED', 'orders', _order_id,
          jsonb_build_object('from', v_actual, 'to', v_nuevo));
end;
$function$;

-- 2. Facturar: con `invoices.issue`, el permiso que sí existe, y solo en sus sedes.
CREATE OR REPLACE FUNCTION public.issue_pos_invoice(_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not (public.is_admin() or public.has_permission('invoices.issue')) then
    raise exception 'FORBIDDEN: no tienes permiso para facturar' using errcode = '42501';
  end if;

  select * into v_pedido from public.orders o
   where o.id = _order_id
     and public.puede_ver_sede(o.pickup_location_id);
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
$function$;

-- 3. Entregar con código: `dispatch.manage` en lugar de un permiso inexistente.
CREATE OR REPLACE FUNCTION public.entregar_por_codigo(_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_codigo text := upper(regexp_replace(coalesce(_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_pedido public.orders%rowtype;
begin
  if not (public.is_admin()
          or public.has_permission('orders.status')
          or public.has_permission('dispatch.manage')) then
    raise exception 'FORBIDDEN: no tienes permiso para entregar pedidos'
      using errcode = '42501';
  end if;

  if length(v_codigo) < 4 then
    raise exception 'CODIGO_CORTO: escribe el código completo que trae el cliente'
      using errcode = '22023';
  end if;

  select * into v_pedido
    from public.orders o
   where upper(regexp_replace(coalesce(o.pickup_code, ''), '[^A-Za-z0-9]', '', 'g')) = v_codigo
     and o.delivery_method = 'RETIRO_TIENDA'
     and public.puede_ver_sede(o.pickup_location_id)
   limit 1;

  if v_pedido.id is null then
    raise exception 'CODIGO_NO_VALIDO: ese código no corresponde a ningún pedido pendiente de retiro en esta sede'
      using errcode = 'P0002';
  end if;

  if v_pedido.status = 'ENTREGADO' then
    raise exception 'YA_ENTREGADO: ese pedido ya fue retirado' using errcode = '23505';
  end if;

  if v_pedido.status = 'CANCELADO' then
    raise exception 'CANCELADO: ese pedido está cancelado. No entregues la mercancía'
      using errcode = '22023';
  end if;

  -- El cobro se comprueba ANTES que el estado y con mensaje propio. Es el
  -- motivo por el que un pedido sin pagar nunca llegó a LISTO_PARA_RETIRO, y
  -- decir solo «no está listo» hace que en el mostrador se entregue igual.
  if not public.pedido_cobrado(v_pedido.id) then
    raise exception
      'SIN_PAGO: el pedido % NO está pagado. No entregues la mercancía. Cuando entre el pago, vuelve a pasar el mismo código.',
      v_pedido.order_number
      using errcode = '22023';
  end if;

  if v_pedido.status <> 'LISTO_PARA_RETIRO' then
    raise exception 'NO_ESTA_LISTO: el pedido % todavía no está listo para retiro (está en %)',
      v_pedido.order_number, v_pedido.status
      using errcode = '22023';
  end if;

  update public.orders
     set status = 'ENTREGADO', updated_at = now()
   where id = v_pedido.id;

  insert into public.conversation_messages (order_id, author_id, kind, body)
  values (v_pedido.id, (select auth.uid()), 'EVENTO',
          'Pedido entregado en tienda, verificado con el código de retiro.');

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'ORDER_PICKUP', 'orders', v_pedido.id,
          jsonb_build_object('order_number', v_pedido.order_number));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_pedido.id,
    'numero', v_pedido.order_number,
    'recibe', v_pedido.recipient_name,
    'documento', v_pedido.recipient_document_number,
    'total', v_pedido.total_cop
  );
end;
$function$;

-- 4. Panel: las visitas se cuentan con `projects.read` y los chats con
--    `chat.reply`, los mismos permisos que abren esas pantallas.
CREATE OR REPLACE FUNCTION public.resumen_panel(_sedes uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_resultado jsonb;
  v_pedidos    boolean := public.is_admin() or public.has_permission('orders.read');
  v_inventario boolean := public.is_admin() or public.has_permission('inventory.read');
  v_visitas    boolean := public.is_admin() or public.has_permission('projects.read');
  v_proyectos  boolean := public.is_admin() or public.has_permission('projects.read');
  v_ventas     boolean := public.is_admin() or public.has_permission('analytics.read');
  v_chat       boolean := public.is_admin() or public.has_permission('chat.reply');
  -- Lo pedido cruzado con lo permitido. El navegador solo puede reducir.
  v_sedes      uuid[] := public.sedes_efectivas(_sedes);
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN: el panel es del portal interno' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- ── Lo que espera una acción ───────────────────────────────────────
    'por_confirmar', case when v_pedidos then (
      select count(*) from public.orders
       where status = 'PENDIENTE'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'por_alistar', case when v_pedidos then (
      select count(*) from public.orders
       where status in ('CONFIRMADO', 'PREPARANDO')
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'listos_para_retiro', case when v_pedidos then (
      select count(*) from public.orders
       where status = 'LISTO_PARA_RETIRO'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'en_transito', case when v_pedidos then (
      select count(*) from public.orders
       where status = 'ENVIADO'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,

    -- ── Cómo va el día ─────────────────────────────────────────────────
    'ventas_hoy', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO' and created_at::date = current_date
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))), 0) end,
    'pedidos_hoy', case when v_ventas then (
      select count(*) from public.orders
       where status <> 'CANCELADO' and created_at::date = current_date
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'ventas_mes', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO'
         and created_at >= date_trunc('month', current_date)
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))), 0) end,
    -- El mismo tramo del mes pasado, no el mes pasado completo: comparar los
    -- primeros 5 días contra 30 diría siempre que vamos peor.
    'ventas_mes_anterior', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO'
         and created_at >= date_trunc('month', current_date - interval '1 month')
         and created_at <  date_trunc('month', current_date - interval '1 month')
                           + ((current_date - date_trunc('month', current_date)::date) + 1)
                             * interval '1 day'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))), 0) end,

    -- ── Alertas de inventario ──────────────────────────────────────────
    -- El inventario SIEMPRE está en una bodega, así que aquí no hay caso de
    -- fila sin sede: se filtra sin excepción.
    'bajo_minimo', case when v_inventario then (
      select count(*) from public.inventory
       where min_qty is not null and min_qty > 0 and qty_available <= min_qty
         and location_id = any(v_sedes)) end,
    'agotados', case when v_inventario then (
      select count(*) from public.inventory
       where qty_available <= 0 and location_id = any(v_sedes)) end,
    'criticos', case when v_inventario then coalesce((
      select jsonb_agg(x order by x.faltante desc)
      from (
        select p.name as producto, pv.label as presentacion,
               pl.name as punto, i.qty_available as existencia,
               i.min_qty as minimo, (i.min_qty - i.qty_available) as faltante
          from public.inventory i
          join public.product_variants pv on pv.id = i.variant_id
          join public.products p on p.id = pv.product_id
          join public.pickup_locations pl on pl.id = i.location_id
         where i.min_qty is not null and i.min_qty > 0 and i.qty_available <= i.min_qty
           and i.location_id = any(v_sedes)
         order by (i.min_qty - i.qty_available) desc
         limit 6) x), '[]'::jsonb) end,

    -- ── Agenda ─────────────────────────────────────────────────────────
    -- Las visitas cuelgan de un proyecto y hoy no tienen sede asignada
    -- (`technical_visits.location_id` está en null). Se filtran igual, para
    -- que empiece a funcionar el día que la programación fije la sede.
    'visitas_hoy', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date = current_date and status = 'PROGRAMADA'
         and (location_id is null or location_id = any(v_sedes))) end,
    'visitas_semana', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date between current_date and current_date + 7
         and status = 'PROGRAMADA'
         and (location_id is null or location_id = any(v_sedes))) end,
    'visitas_vencidas', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date < current_date and status = 'PROGRAMADA'
         and (location_id is null or location_id = any(v_sedes))) end,
    'agenda', case when v_visitas then coalesce((
      select jsonb_agg(x order by x.fecha)
      from (
        select tv.scheduled_date as fecha, tv.scheduled_time as hora,
               pr.name as proyecto, pr.city as ciudad,
               (pf.first_name || ' ' || pf.last_name) as tecnico
          from public.technical_visits tv
          join public.projects pr on pr.id = tv.project_id
          left join public.profiles pf on pf.id = tv.technician_id
         where tv.status = 'PROGRAMADA' and tv.scheduled_date >= current_date
           and (tv.location_id is null or tv.location_id = any(v_sedes))
         order by tv.scheduled_date limit 5) x), '[]'::jsonb) end,

    -- ── Trabajo sin dueño ──────────────────────────────────────────────
    -- Los proyectos NO tienen sede y no se les inventa una: son obras del
    -- cliente, no operación de una tienda. Van sin filtrar a propósito.
    'proyectos_sin_asesor', case when v_proyectos then (
      select count(*) from public.projects pr
       where not exists (
         select 1 from public.project_assignments pa where pa.project_id = pr.id)) end,
    'proyectos_activos', case when v_proyectos then (
      select count(*) from public.projects
       where status not in ('COMPLETADO', 'CANCELADO')) end,

    -- Un hilo queda "sin responder" cuando lo último que se escribió lo
    -- escribió el cliente. Se acota por la sede del pedido cuando el hilo
    -- cuelga de uno; los de proyecto no tienen sede.
    'sin_responder', case when v_chat then (
      select count(*) from (
        select distinct on (coalesce(cm.order_id, cm.project_id))
               cm.author_id, o.user_id as cliente_pedido, pr.user_id as cliente_proyecto,
               o.pickup_location_id as sede
          from public.conversation_messages cm
          left join public.orders o on o.id = cm.order_id
          left join public.projects pr on pr.id = cm.project_id
         where cm.kind = 'MENSAJE'
         order by coalesce(cm.order_id, cm.project_id), cm.created_at desc) u
       where u.author_id is not null
         and u.author_id = coalesce(u.cliente_pedido, u.cliente_proyecto)
         and (u.sede is null or u.sede = any(v_sedes))) end
  ) into v_resultado;

  return v_resultado;
end;
$function$;

-- 5. is_staff: es interno todo rol que no sea de cliente, también los
--    creados desde Permisos.
CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.mfa_satisfecho() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role not in ('CLIENTE','CLIENTE_B2B')
  );
$function$;

-- 5. mi_estado_mfa: es interno todo rol que no sea de cliente, también los
--    creados desde Permisos.
CREATE OR REPLACE FUNCTION public.mi_estado_mfa()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'configurado', exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    ),
    'nivel_sesion', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'obligatorio', (
      not coalesce((select p.mfa_exento from public.profiles p where p.id = (select auth.uid())), false)
      and exists (
        select 1 from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role not in ('CLIENTE','CLIENTE_B2B')
      )
    )
  );
$function$;

-- 5. estado_mfa_usuario: es interno todo rol que no sea de cliente, también los
--    creados desde Permisos.
CREATE OR REPLACE FUNCTION public.estado_mfa_usuario(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración puede consultar esto'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'configurado', exists (
      select 1 from auth.mfa_factors f
      where f.user_id = _user_id and f.status = 'verified'
    ),
    'requerido', not coalesce(
      (select p.mfa_exento from public.profiles p where p.id = _user_id), false),
    'es_interno', exists (
      select 1 from public.user_roles ur
      where ur.user_id = _user_id
        and ur.role not in ('CLIENTE','CLIENTE_B2B')
    )
  );
end;
$function$;

-- 5. actualizar_cliente_persona: es interno todo rol que no sea de cliente, también los
--    creados desde Permisos.
CREATE OR REPLACE FUNCTION public.actualizar_cliente_persona(_user_id uuid, _datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes    public.profiles%rowtype;
  v_despues  public.profiles%rowtype;
  v_cambios  text[] := '{}';
  v_quien    text;
  v_cuando   timestamptz := now();
begin
  if not public.has_permission('users.manage') then
    raise exception 'FORBIDDEN: no tienes permiso para editar clientes'
      using errcode = '42501';
  end if;

  select * into v_antes from public.profiles where id = _user_id;
  if not found then
    raise exception 'NOT_FOUND: ese cliente no existe' using errcode = 'P0002';
  end if;

  -- No se toca a nadie del personal interno desde la pantalla de Clientes:
  -- los datos de un empleado se cambian en Usuarios, con sus propias reglas.
  if exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role not in ('CLIENTE','CLIENTE_B2B')
  ) then
    raise exception 'ES_PERSONAL: esa cuenta es del personal interno; edítala en Usuarios'
      using errcode = '42501';
  end if;

  -- Solo se escribe lo que venga en el objeto: una clave ausente significa
  -- "no lo cambies". Mandar null borraría el dato sin querer al guardar un
  -- formulario que no mostraba ese campo.
  update public.profiles set
    first_name      = coalesce(_datos ->> 'first_name', first_name),
    last_name       = coalesce(_datos ->> 'last_name', last_name),
    phone           = coalesce(_datos ->> 'phone', phone),
    address         = coalesce(_datos ->> 'address', address),
    document_type   = coalesce((_datos ->> 'document_type')::public.document_type, document_type),
    document_number = coalesce(_datos ->> 'document_number', document_number),
    client_type     = coalesce((_datos ->> 'client_type')::public.client_type, client_type),
    city            = coalesce(_datos ->> 'city', city),
    country_code       = coalesce(_datos ->> 'country_code', country_code),
    municipality_code  = coalesce(_datos ->> 'municipality_code', municipality_code),
    neighborhood_id    = coalesce((_datos ->> 'neighborhood_id')::uuid, neighborhood_id),
    updated_at      = v_cuando
  where id = _user_id;

  -- Se relee para contar lo que la base GUARDÓ, ya normalizado.
  select * into v_despues from public.profiles where id = _user_id;

  if coalesce(v_antes.first_name,'') is distinct from coalesce(v_despues.first_name,'')
     or coalesce(v_antes.last_name,'') is distinct from coalesce(v_despues.last_name,'') then
    v_cambios := v_cambios || public.describir_cambio(
      'Nombre',
      coalesce(v_antes.first_name,'') || ' ' || coalesce(v_antes.last_name,''),
      coalesce(v_despues.first_name,'') || ' ' || coalesce(v_despues.last_name,''));
  end if;
  if coalesce(v_antes.phone,'') is distinct from coalesce(v_despues.phone,'') then
    v_cambios := v_cambios || public.describir_cambio('Teléfono', v_antes.phone, v_despues.phone);
  end if;
  if coalesce(v_antes.address,'') is distinct from coalesce(v_despues.address,'') then
    v_cambios := v_cambios || public.describir_cambio('Dirección', v_antes.address, v_despues.address);
  end if;
  if coalesce(v_antes.document_number,'') is distinct from coalesce(v_despues.document_number,'')
     or v_antes.document_type is distinct from v_despues.document_type then
    v_cambios := v_cambios || public.describir_cambio(
      'Documento',
      coalesce(v_antes.document_type::text,'') || ' ' || coalesce(v_antes.document_number,''),
      coalesce(v_despues.document_type::text,'') || ' ' || coalesce(v_despues.document_number,''));
  end if;
  if coalesce(v_antes.city,'') is distinct from coalesce(v_despues.city,'') then
    v_cambios := v_cambios || public.describir_cambio('Ciudad', v_antes.city, v_despues.city);
  end if;
  if v_antes.client_type is distinct from v_despues.client_type then
    v_cambios := v_cambios || public.describir_cambio(
      'Tipo de cliente', v_antes.client_type::text, v_despues.client_type::text);
  end if;

  if array_length(v_cambios, 1) is null then
    return jsonb_build_object('cambios', 0, 'aviso', false);
  end if;

  v_quien := public.nombre_de_quien_edita();

  perform public.avisar_cambio_de_datos(
    array[_user_id], v_quien, v_cuando, v_cambios, 'tus datos');

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'CLIENT_UPDATE', 'profiles', _user_id,
          jsonb_build_object('cambios', to_jsonb(v_cambios)));

  return jsonb_build_object(
    'cambios', array_length(v_cambios, 1),
    'aviso', true,
    'detalle', to_jsonb(v_cambios));
end;
$function$;

-- 5. clientes_personas_naturales: excluye al personal con la misma regla.
CREATE OR REPLACE FUNCTION public.clientes_personas_naturales(_busqueda text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nombre text, correo text, telefono text, ciudad text, tipo_documento text, documento text, segmento text, foto_url text, estado text, pedidos bigint, creado timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with roles_del_personal as (
    -- Los mismos roles que `is_staff()` considera internos: todos menos los
    -- de cliente, también los que se creen desde Permisos.
    select r as rol
      from unnest(enum_range(null::public.app_role)) as r
     where r not in ('CLIENTE','CLIENTE_B2B')
  )
  select
    p.id,
    -- El nombre completo ya viene normalizado en mayúsculas por disparador.
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as nombre,
    p.email,
    p.phone,
    p.city,
    p.document_type::text,
    p.document_number,
    p.client_type::text,
    p.avatar_url,
    p.status::text,
    (select count(*) from public.orders o where o.user_id = p.id) as pedidos,
    p.created_at
  from public.profiles p
  where public.is_staff()
    and p.company_id is null
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = p.id and ur.role in ('CLIENTE', 'CLIENTE_B2B')
    )
    and not exists (
      select 1 from public.user_roles ur
      join roles_del_personal rp on rp.rol = ur.role
      where ur.user_id = p.id
    )
    and (
      _busqueda is null or trim(_busqueda) = ''
      or p.first_name ilike '%' || trim(_busqueda) || '%'
      or p.last_name ilike '%' || trim(_busqueda) || '%'
      or p.email ilike '%' || trim(_busqueda) || '%'
      -- El documento se guarda sin puntos, así que se limpia lo que escriban.
      or p.document_number ilike '%' || regexp_replace(coalesce(_busqueda, ''), '[^0-9A-Za-z-]', '', 'g') || '%'
    )
  order by nombre nulls last;
$function$;

-- 5. solo_asesor: la misma regla para los roles creados.
CREATE OR REPLACE FUNCTION public.solo_asesor(_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with quien as (select coalesce(_user_id, (select auth.uid())) as id)
  select exists (
      select 1 from public.user_roles ur, quien q
       where ur.user_id = q.id and ur.role = 'ASESOR'
    )
    and not exists (
      select 1 from public.user_roles ur, quien q
       where ur.user_id = q.id
         -- Cualquier otro rol interno, también uno creado desde Permisos,
         -- le quita la condición de asesor puro. Técnico no, como antes.
         and ur.role not in ('ASESOR', 'TECNICO', 'CLIENTE', 'CLIENTE_B2B')
    );
$function$;

-- 7. Envíos: el personal los sigue leyendo en su sede (política
--    `shipments_select`), pero escribirlos exige `dispatch.manage`. Los envíos
--    que crea el pedido y la entrega por código pasan por funciones con
--    dueño y no dependen de esta política.
drop policy if exists shipments_staff on public.shipments;

create policy shipments_staff_insert on public.shipments
  for insert to authenticated
  with check ((select public.has_permission('dispatch.manage'))
              and (select public.puede_ver_sede(location_id)));

create policy shipments_staff_update on public.shipments
  for update to authenticated
  using ((select public.has_permission('dispatch.manage'))
         and (select public.puede_ver_sede(location_id)))
  with check ((select public.has_permission('dispatch.manage'))
              and (select public.puede_ver_sede(location_id)));

create policy shipments_staff_delete on public.shipments
  for delete to authenticated
  using ((select public.has_permission('dispatch.manage'))
         and (select public.puede_ver_sede(location_id)));

-- 6. Excepciones de permiso por persona. La tabla y su lectura existían;
--    faltaba cómo escribirlas. Mismo patrón que `set_user_view`.
create or replace function public.set_user_permission(
  _user_id uuid, _permission_code text, _granted boolean, _reason text default null
) returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración concede permisos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.permissions where code = _permission_code) then
    raise exception 'PERMISO_DESCONOCIDO: no existe el permiso %', _permission_code
      using errcode = '22023';
  end if;
  if coalesce(trim(_reason), '') = '' then
    raise exception 'SIN_MOTIVO: explica por qué esta persona tiene una excepción'
      using errcode = '22023';
  end if;

  insert into public.user_permissions (user_id, permission_code, granted, reason, granted_by)
  values (_user_id, _permission_code, _granted, trim(_reason), (select auth.uid()))
  on conflict (user_id, permission_code)
  do update set granted = excluded.granted, reason = excluded.reason,
                granted_by = excluded.granted_by, updated_at = now();

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'USER_PERMISSION_CHANGED', 'user_permissions', _user_id,
          jsonb_build_object('permission', _permission_code, 'granted', _granted,
                             'reason', trim(_reason)));
end;
$$;

create or replace function public.clear_user_permission(_user_id uuid, _permission_code text)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración concede permisos' using errcode = '42501';
  end if;

  delete from public.user_permissions
   where user_id = _user_id and permission_code = _permission_code;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'USER_PERMISSION_CLEARED', 'user_permissions', _user_id,
          jsonb_build_object('permission', _permission_code));
end;
$$;

revoke all on function public.set_user_permission(uuid, text, boolean, text) from public, anon;
revoke all on function public.clear_user_permission(uuid, text) from public, anon;
grant execute on function public.set_user_permission(uuid, text, boolean, text) to authenticated, service_role;
grant execute on function public.clear_user_permission(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
