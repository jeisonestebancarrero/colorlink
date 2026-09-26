-- Direcciones del cliente, sedes de la empresa y datos de quien recibe el pedido.
-- La ciudad apunta al municipio del DANE.

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

-- Una sola dirección principal por persona, garantizada en la base.
create unique index if not exists customer_addresses_una_principal
  on public.customer_addresses (user_id) where is_default;

comment on table public.customer_addresses is
  'Direcciones guardadas del cliente. La ciudad es el municipio DIVIPOLA.';

create table if not exists public.company_branches (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  name               text not null,
  address_line       text not null,
  municipality_code  text not null references public.municipalities(code),
    -- Precarga quién recibe; se confirma en cada pedido.
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

-- Trigger en la tabla para que ninguna ruta cree un envío sin dirección, municipio o destinatario.
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

    -- Quién recibe se exige también al retirar en tienda.
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

-- Solo en INSERT: los pedidos históricos no tienen estos datos.
drop trigger if exists orders_exigir_datos_de_entrega on public.orders;
create trigger orders_exigir_datos_de_entrega
  before insert on public.orders
  for each row execute function public.orders_exigir_datos_de_entrega();

alter table public.customer_addresses enable row level security;
alter table public.company_branches   enable row level security;

-- Filtro por user_id: authenticated incluye a los clientes.
drop policy if exists customer_addresses_propias on public.customer_addresses;
create policy customer_addresses_propias
  on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists customer_addresses_lectura_interna on public.customer_addresses;
create policy customer_addresses_lectura_interna
  on public.customer_addresses for select to authenticated
  using ((select public.has_permission('orders.read')));

-- Acceso por pertenencia a la empresa, no por rol de Supabase.
drop policy if exists company_branches_de_mi_empresa on public.company_branches;
create policy company_branches_de_mi_empresa
  on public.company_branches for select to authenticated
  using (exists (
    select 1 from public.company_members cm
    where cm.company_id = company_branches.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVO'
  ));

-- Escritura solo para OWNER o ADMIN de la empresa.
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
