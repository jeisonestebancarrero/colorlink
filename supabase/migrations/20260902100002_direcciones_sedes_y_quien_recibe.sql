-- ============================================================
-- Direcciones del cliente, sedes de la empresa y quién recibe el pedido
-- ============================================================
-- Lo que faltaba y por qué importa:
--
-- 1. El cliente no tenía dónde guardar una dirección. El carrito arrancaba con
--    una dirección de demostración escrita en el código, así que un pedido de
--    envío podía salir hacia una dirección que nadie escribió.
-- 2. La ciudad era texto libre. Ahora apunta al municipio del DANE
--    (ver 20260902100001), y una dirección sin municipio válido no se guarda.
-- 3. Una empresa puede tener varias sedes y el pedido tenía que poder ir a la
--    que corresponda. No existía nada: ni tabla, ni forma de registrarlas.
-- 4. Nadie sabía QUIÉN recibe. Sin nombre, documento y teléfono, el
--    transportador no tiene a quién entregarle ni cómo verificarlo, y el punto
--    de retiro tampoco.
--
-- Las direcciones son del cliente y las sedes son de la empresa: son dos cosas
-- distintas a propósito. Una constructora despacha a la obra (dirección suelta)
-- o a una de sus sedes, y ambas rutas quedan disponibles.

-- ------------------------------------------------------------
-- Direcciones del cliente
-- ------------------------------------------------------------
create table if not exists public.customer_addresses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  label              text not null,
  address_line       text not null,
  municipality_code  text not null references public.municipalities(code),
  notes              text,
  is_default         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint customer_addresses_label_no_vacio
    check (length(btrim(label)) between 1 and 60),
  constraint customer_addresses_linea_no_vacia
    check (length(btrim(address_line)) between 5 and 200)
);

create index if not exists customer_addresses_user_idx
  on public.customer_addresses (user_id);

-- Una sola dirección principal por persona. El índice lo garantiza en la base:
-- confiarlo a la interfaz deja el dato inconsistente en cuanto haya dos
-- pestañas abiertas.
create unique index if not exists customer_addresses_una_principal
  on public.customer_addresses (user_id) where is_default;

comment on table public.customer_addresses is
  'Direcciones guardadas del cliente. La ciudad es el municipio DIVIPOLA.';

-- ------------------------------------------------------------
-- Sedes de la empresa
-- ------------------------------------------------------------
create table if not exists public.company_branches (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  name               text not null,
  address_line       text not null,
  municipality_code  text not null references public.municipalities(code),
  -- Contacto de la sede. Sirve para precargar quién recibe, pero no lo
  -- reemplaza: quien recibe se confirma en cada pedido.
  contact_name       text,
  contact_phone      text,
  notes              text,
  is_default         boolean not null default false,
  status             public.user_status not null default 'ACTIVO',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint company_branches_nombre_no_vacio
    check (length(btrim(name)) between 1 and 80),
  constraint company_branches_linea_no_vacia
    check (length(btrim(address_line)) between 5 and 200)
);

create index if not exists company_branches_company_idx
  on public.company_branches (company_id);

create unique index if not exists company_branches_nombre_unico
  on public.company_branches (company_id, lower(btrim(name)));

create unique index if not exists company_branches_una_principal
  on public.company_branches (company_id) where is_default;

comment on table public.company_branches is
  'Sedes o sucursales de una empresa cliente. El pedido puede dirigirse a una.';

-- ------------------------------------------------------------
-- El pedido: a dónde va y quién recibe
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists shipping_municipality_code text
    references public.municipalities(code),
  add column if not exists company_branch_id uuid
    references public.company_branches(id),
  add column if not exists recipient_name            text,
  add column if not exists recipient_document_type   public.document_type,
  add column if not exists recipient_document_number text,
  add column if not exists recipient_phone           text;

comment on column public.orders.shipping_municipality_code is
  'Municipio DIVIPOLA de entrega. `shipping_city` se conserva como texto histórico.';
comment on column public.orders.company_branch_id is
  'Sede de la empresa a la que va el pedido, si el cliente eligió una.';

-- Un envío sin dirección, sin municipio o sin quién recibe no es un envío.
-- El disparador va sobre la tabla y no solo en la función que crea el pedido:
-- así ninguna otra ruta puede dejar un pedido de envío a medias.
create or replace function public.orders_exigir_datos_de_entrega()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.delivery_method = 'ENVIO' then
    if coalesce(btrim(new.shipping_address), '') = '' then
      raise exception 'VALIDATION: indica la dirección de entrega'
        using errcode = 'check_violation';
    end if;
    if new.shipping_municipality_code is null then
      raise exception 'VALIDATION: indica la ciudad de entrega'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Quién recibe se exige en los dos casos: en el retiro en tienda, el punto
  -- de venta también tiene que saber a quién le entrega la mercancía.
  if coalesce(btrim(new.recipient_name), '') = '' then
    raise exception 'VALIDATION: indica el nombre de quien recibe'
      using errcode = 'check_violation';
  end if;
  if new.recipient_document_type is null
     or coalesce(btrim(new.recipient_document_number), '') = '' then
    raise exception 'VALIDATION: indica el documento de quien recibe'
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(new.recipient_phone), '') = '' then
    raise exception 'VALIDATION: indica el teléfono de quien recibe'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Solo sobre pedidos NUEVOS. Los 190 que ya existen se crearon sin estos
-- datos y no se van a inventar: un pedido histórico sin "quien recibe" se
-- queda como está, y el disparador no lo bloquea al cambiarle el estado.
drop trigger if exists orders_exigir_datos_de_entrega on public.orders;
create trigger orders_exigir_datos_de_entrega
  before insert on public.orders
  for each row execute function public.orders_exigir_datos_de_entrega();

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
alter table public.customer_addresses enable row level security;
alter table public.company_branches   enable row level security;

-- Las direcciones son de su dueño y de nadie más. `authenticated` incluye a
-- los clientes, así que el filtro es por `user_id`, nunca por el rol.
drop policy if exists customer_addresses_propias on public.customer_addresses;
create policy customer_addresses_propias
  on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- El personal interno con permiso de pedidos necesita ver a dónde despachar.
drop policy if exists customer_addresses_lectura_interna on public.customer_addresses;
create policy customer_addresses_lectura_interna
  on public.customer_addresses for select to authenticated
  using ((select public.has_permission('orders.read')));

-- Las sedes las ve y las administra la propia empresa. Quien manda es la
-- pertenencia a la empresa, no el rol de Supabase.
drop policy if exists company_branches_de_mi_empresa on public.company_branches;
create policy company_branches_de_mi_empresa
  on public.company_branches for select to authenticated
  using (exists (
    select 1 from public.company_members cm
    where cm.company_id = company_branches.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVO'
  ));

-- Crear, cambiar y desactivar sedes: solo OWNER o ADMIN de esa empresa. Un
-- MEMBER cualquiera no le mueve las sedes a la constructora.
drop policy if exists company_branches_admin_de_mi_empresa on public.company_branches;
create policy company_branches_admin_de_mi_empresa
  on public.company_branches for all to authenticated
  using (exists (
    select 1 from public.company_members cm
    where cm.company_id = company_branches.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVO'
      and cm.company_role in ('OWNER', 'ADMIN')
  ))
  with check (exists (
    select 1 from public.company_members cm
    where cm.company_id = company_branches.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVO'
      and cm.company_role in ('OWNER', 'ADMIN')
  ));

drop policy if exists company_branches_interno on public.company_branches;
create policy company_branches_interno
  on public.company_branches for all to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));

grant select, insert, update, delete
  on public.customer_addresses, public.company_branches to authenticated;

notify pgrst, 'reload schema';
