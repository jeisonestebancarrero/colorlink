-- ============================================================
-- FASES 8-13 — Comercio, servicio y notificaciones
-- ============================================================
-- Carrito, pedidos, pagos, envíos, retiro en tienda, visitas técnicas,
-- garantías, notificaciones, favoritos y auditoría.
-- ============================================================

-- ---------- ENUMS ----------
create type public.order_status as enum (
  'PENDIENTE','CONFIRMADO','PREPARANDO','ENVIADO',
  'LISTO_PARA_RETIRO','ENTREGADO','CANCELADO'
);
create type public.payment_status as enum (
  'PENDIENTE','AUTORIZADO','PAGADO','RECHAZADO','REEMBOLSADO'
);
create type public.payment_method as enum (
  'PSE','TARJETA_CREDITO','TARJETA_DEBITO','EFECTIVO','TRANSFERENCIA','CREDITO_EMPRESARIAL'
);
create type public.delivery_method as enum ('ENVIO','RETIRO_TIENDA');
create type public.shipment_status as enum (
  'PENDIENTE','EN_PREPARACION','DESPACHADO','EN_TRANSITO','ENTREGADO','DEVUELTO'
);
create type public.visit_status as enum (
  'PROGRAMADA','CONFIRMADA','EN_CURSO','REALIZADA','CANCELADA','REPROGRAMADA'
);
create type public.warranty_status as enum ('VIGENTE','VENCIDA','ANULADA','EN_RECLAMACION');
create type public.notification_type as enum ('info','alert','success','update');
create type public.favorite_kind as enum ('PRODUCT','COLOR','SOLUTION');

-- ============================================================
-- MÓDULO 15 — CARRITO
-- ============================================================
create table public.carts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Un carrito puede asociarse a un proyecto (MÓDULO 15).
  project_id uuid references public.projects (id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Un único carrito activo por usuario.
create unique index carts_activo_unico on public.carts (user_id) where is_active;

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id)            on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  color_id   uuid references public.colors (id) on delete set null,
  quantity   int not null default 1,
  -- Procedencia: si el ítem entró como parte de un kit.
  kit_solution_id uuid references public.solutions (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint cart_items_cantidad_positiva check (quantity > 0 and quantity <= 999),
  constraint cart_items_unico unique (cart_id, variant_id, color_id)
);
create index cart_items_cart_id_idx on public.cart_items (cart_id);

comment on table public.cart_items is
  'El carrito NO guarda precios: se leen de product_variants al mostrar y al confirmar el pedido (MÓDULO 52).';

-- ============================================================
-- MÓDULO 16 — PEDIDOS
-- ============================================================
create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id      uuid not null references auth.users (id) on delete restrict,
  company_id   uuid references public.companies (id)    on delete set null,
  project_id   uuid references public.projects (id)     on delete set null,

  status public.order_status not null default 'PENDIENTE',
  delivery_method public.delivery_method not null default 'RETIRO_TIENDA',

  -- Dirección congelada en el momento de la compra.
  shipping_address text,
  shipping_city    text,
  pickup_location_id uuid references public.pickup_locations (id) on delete set null,
  pickup_code      text,
  pickup_scheduled_date date,

  subtotal_cop numeric(14,2) not null default 0,
  discount_cop numeric(14,2) not null default 0,
  shipping_cop numeric(14,2) not null default 0,
  total_cop    numeric(14,2) not null default 0,

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_importes_no_negativos
    check (subtotal_cop >= 0 and discount_cop >= 0 and shipping_cop >= 0 and total_cop >= 0),
  -- El total debe cuadrar: ningún importe puede haber sido inventado.
  constraint orders_total_cuadra
    check (total_cop = subtotal_cop - discount_cop + shipping_cop),
  constraint orders_descuento_no_supera_subtotal check (discount_cop <= subtotal_cop)
);
create index orders_user_id_idx    on public.orders (user_id);
create index orders_company_id_idx on public.orders (company_id);
create index orders_status_idx     on public.orders (status);
create index orders_created_at_idx on public.orders (created_at desc);

create sequence public.order_number_seq;

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,

  -- COPIA DEL DATO EN EL MOMENTO DE LA COMPRA (MÓDULO 16).
  -- Si mañana cambia el precio o el nombre del producto, el pedido histórico
  -- debe seguir mostrando lo que el cliente compró y pagó.
  product_name  text not null,
  product_code  text,
  presentation  text,
  color_name    text,
  unit_price_cop numeric(14,2) not null,
  quantity      int not null,
  subtotal_cop  numeric(14,2) not null,
  image_url     text,

  constraint order_items_cantidad_positiva check (quantity > 0),
  constraint order_items_precio_no_negativo check (unit_price_cop >= 0),
  constraint order_items_subtotal_cuadra
    check (subtotal_cop = unit_price_cop * quantity)
);
create index order_items_order_id_idx on public.order_items (order_id);

-- ============================================================
-- MÓDULO 17 — PAGOS
-- ============================================================
create table public.payments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  method     public.payment_method not null,
  status     public.payment_status not null default 'PENDIENTE',
  amount_cop numeric(14,2) not null,
  -- Referencia de la pasarela. NUNCA se almacenan datos de tarjeta:
  -- ni número, ni CVV, ni fecha de expiración (MÓDULO 17).
  reference  text,
  gateway    text,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_importe_positivo check (amount_cop >= 0)
);
create index payments_order_id_idx on public.payments (order_id);

comment on table public.payments is
  'Estructura preparada para pasarela real. Prohibido almacenar datos sensibles de tarjeta.';

-- ============================================================
-- MÓDULO 18 — ENVÍOS
-- ============================================================
create table public.shipments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  carrier    text,
  tracking_number text,
  address    text,
  city       text,
  status     public.shipment_status not null default 'PENDIENTE',
  shipped_at   timestamptz,
  estimated_at date,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_id_idx on public.shipments (order_id);

-- ============================================================
-- MÓDULO 22 — VISITAS TÉCNICAS
-- ============================================================
create table public.technical_visits (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  assistance_id uuid references public.technical_assistance (id) on delete set null,
  technician_id uuid references auth.users (id) on delete set null,
  scheduled_date date,
  scheduled_time text,
  address       text,
  status        public.visit_status not null default 'PROGRAMADA',
  result        text,
  observations  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index technical_visits_project_id_idx on public.technical_visits (project_id);

-- ============================================================
-- MÓDULO 23 — GARANTÍAS
-- ============================================================
create table public.warranties (
  id         uuid primary key default gen_random_uuid(),
  warranty_number text not null unique,
  project_id uuid references public.projects (id) on delete set null,
  order_id   uuid references public.orders (id)   on delete set null,
  user_id    uuid not null references auth.users (id) on delete restrict,
  starts_on  date not null default current_date,
  ends_on    date not null,
  coverage   text,
  conditions text,
  certificate_path text,
  status     public.warranty_status not null default 'VIGENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranties_vigencia_valida check (ends_on > starts_on),
  -- Una garantía debe amparar algo: un proyecto, un pedido, o ambos.
  constraint warranties_con_origen check (project_id is not null or order_id is not null)
);
create index warranties_user_id_idx on public.warranties (user_id);
create sequence public.warranty_number_seq;

-- ============================================================
-- MÓDULO 24 — NOTIFICACIONES
-- ============================================================
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  order_id   uuid references public.orders (id)   on delete cascade,
  type       public.notification_type not null default 'info',
  title      text not null,
  message    text not null,
  read       boolean not null default false,
  action_required boolean not null default false,
  action_label    text,
  created_at timestamptz not null default now()
);
create index notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index notifications_no_leidas_idx on public.notifications (user_id) where not read;

-- ============================================================
-- MÓDULO 25 — FAVORITOS
-- ============================================================
create table public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        public.favorite_kind not null,
  product_id  uuid references public.products (id)  on delete cascade,
  color_id    uuid references public.colors (id)    on delete cascade,
  solution_id uuid references public.solutions (id) on delete cascade,
  created_at  timestamptz not null default now(),

  -- Exactamente una referencia según el tipo.
  constraint favorites_referencia_coherente check (
    (kind = 'PRODUCT'  and product_id is not null and color_id is null and solution_id is null) or
    (kind = 'COLOR'    and color_id   is not null and product_id is null and solution_id is null) or
    (kind = 'SOLUTION' and solution_id is not null and product_id is null and color_id is null)
  )
);
create unique index favorites_unico
  on public.favorites (user_id, kind, coalesce(product_id, color_id, solution_id));

-- ============================================================
-- MÓDULO 33 — AUDITORÍA
-- ============================================================
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- Disparadores de updated_at
create trigger carts_set_updated_at      before update on public.carts      for each row execute function public.set_updated_at();
create trigger orders_set_updated_at     before update on public.orders     for each row execute function public.set_updated_at();
create trigger payments_set_updated_at   before update on public.payments   for each row execute function public.set_updated_at();
create trigger shipments_set_updated_at  before update on public.shipments  for each row execute function public.set_updated_at();
create trigger visits_set_updated_at     before update on public.technical_visits for each row execute function public.set_updated_at();
create trigger warranties_set_updated_at before update on public.warranties for each row execute function public.set_updated_at();
