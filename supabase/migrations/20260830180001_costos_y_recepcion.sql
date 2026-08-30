-- ============================================================
-- De dónde sale el costo: la recepción de mercancía
-- ============================================================
-- Hasta ahora el sistema no sabía cuánto costaba nada. Recibir mercancía era
-- registrar un movimiento de ENTRADA con una cantidad y nada más: sin
-- proveedor, sin factura, sin costo. Y `order_items` guardaba el precio de
-- venta pero no el costo, así que el margen era incalculable.
--
-- La tentación fácil era poner un costo en el catálogo, junto al precio.
-- Es incorrecto por tres razones:
--   1. Una referencia no tiene UN costo: cambia en cada compra.
--   2. El margen debe salir del costo de las unidades efectivamente
--      vendidas, no de un número escrito una sola vez.
--   3. Si el costo vive en el catálogo, corregirlo hoy reescribe en silencio
--      la rentabilidad de todo el histórico.
--
-- El costo se conoce con certeza en un solo momento: cuando llega la
-- mercancía con la factura del proveedor. De ahí sale todo lo demás.
-- ============================================================

-- ------------------------------------------------------------
-- 0. El costo deja de ser público
-- ------------------------------------------------------------
-- `product_variants.cost_cop` era legible por `anon`. Hoy está vacío, así
-- que no se ha filtrado nada; el día que se carguen costos reales, cualquier
-- visitante de la tienda podría leer el margen de Pintuco con una sola
-- petición. RLS filtra FILAS, no columnas: esto solo se cierra revocando el
-- permiso sobre la columna, igual que ya se hizo con la clave del correo.
revoke select (cost_cop) on public.product_variants from anon, authenticated;

comment on column public.product_variants.cost_cop is
  'Costo estándar de referencia, solo para lo que nunca se ha comprado. El costo real sale de las recepciones (inventory.avg_cost_cop). Columna confidencial: no legible por el cliente.';

-- ------------------------------------------------------------
-- 1. Proveedores
-- ------------------------------------------------------------
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  nit         text unique,
  name        text not null,
  contact     text,
  phone       text,
  email       text,
  city        text,
  notes       text,
  status      public.catalog_status not null default 'ACTIVO',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index suppliers_nombre_idx on public.suppliers (lower(name));

alter table public.suppliers enable row level security;

-- A quién le compra Pintuco y en qué condiciones es información comercial:
-- la ve el personal interno, nunca el cliente.
create policy suppliers_lectura_staff on public.suppliers
  for select to authenticated using ( (select public.is_staff()) );
create policy suppliers_escritura on public.suppliers
  for all to authenticated
  using ( (select public.is_admin()) or (select public.has_permission('inventory.write')) )
  with check ( (select public.is_admin()) or (select public.has_permission('inventory.write')) );

grant select, insert, update on public.suppliers to authenticated;

-- ------------------------------------------------------------
-- 2. Recepción de mercancía
-- ------------------------------------------------------------
create type public.receipt_status as enum ('BORRADOR', 'CONFIRMADA', 'ANULADA');

create sequence public.receipt_number_seq start 1;

create table public.purchase_receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  supplier_id    uuid references public.suppliers (id) on delete restrict,
  location_id    uuid not null references public.pickup_locations (id) on delete restrict,
  -- Número de la remisión o factura del proveedor. Es lo que permite
  -- reconciliar con el papel cuando algo no cuadra.
  document_ref   text,
  received_on    date not null default current_date,
  status         public.receipt_status not null default 'BORRADOR',
  notes          text,
  total_cop      numeric(14,2) not null default 0,
  created_by     uuid references public.profiles (id),
  confirmed_by   uuid references public.profiles (id),
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index purchase_receipts_location_idx on public.purchase_receipts (location_id, status);

create table public.purchase_receipt_items (
  id            uuid primary key default gen_random_uuid(),
  receipt_id    uuid not null references public.purchase_receipts (id) on delete cascade,
  variant_id    uuid not null references public.product_variants (id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  unit_cost_cop numeric(14,2) not null check (unit_cost_cop >= 0),
  subtotal_cop  numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  constraint purchase_receipt_items_una_linea_por_variante unique (receipt_id, variant_id)
);

create index purchase_receipt_items_receipt_idx on public.purchase_receipt_items (receipt_id);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

create policy receipts_lectura_staff on public.purchase_receipts
  for select to authenticated using ( (select public.is_staff()) );
create policy receipts_escritura on public.purchase_receipts
  for all to authenticated
  using ( (select public.is_admin()) or (select public.has_permission('inventory.write')) )
  with check ( (select public.is_admin()) or (select public.has_permission('inventory.write')) );

create policy receipt_items_lectura_staff on public.purchase_receipt_items
  for select to authenticated using ( (select public.is_staff()) );
create policy receipt_items_escritura on public.purchase_receipt_items
  for all to authenticated
  using ( (select public.is_admin()) or (select public.has_permission('inventory.write')) )
  with check ( (select public.is_admin()) or (select public.has_permission('inventory.write')) );

grant select, insert, update, delete on public.purchase_receipts to authenticated;
grant select, insert, update, delete on public.purchase_receipt_items to authenticated;

-- ------------------------------------------------------------
-- 3. Costo promedio ponderado por referencia y bodega
-- ------------------------------------------------------------
-- Se guarda por BODEGA, no por referencia global: la misma pintura puede
-- haber llegado a Medellín a un precio y a Barranquilla a otro, y el margen
-- de cada tienda tiene que reflejar lo que ESA tienda pagó.
alter table public.inventory
  add column avg_cost_cop numeric(14,2) not null default 0
  constraint inventory_avg_cost_no_negativo check (avg_cost_cop >= 0);

comment on column public.inventory.avg_cost_cop is
  'Costo promedio ponderado de las unidades en esta bodega. Se recalcula en cada recepción y en cada traslado de entrada.';

revoke select (avg_cost_cop) on public.inventory from anon;

-- ------------------------------------------------------------
-- 4. El costo se CONGELA en la venta
-- ------------------------------------------------------------
-- Sin esto, cambiar el costo de una referencia movería el margen de todos
-- los pedidos ya vendidos. La utilidad de un pedido de marzo no puede
-- depender de lo que pagamos en septiembre.
alter table public.order_items
  add column unit_cost_cop numeric(14,2);

comment on column public.order_items.unit_cost_cop is
  'Costo unitario en el momento de la venta. Congelado a propósito: el margen histórico no debe moverse cuando cambian los costos.';

revoke select (unit_cost_cop) on public.order_items from anon, authenticated;
