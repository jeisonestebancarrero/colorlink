-- RLS del catálogo: lectura pública solo de filas ACTIVO (es información comercial
-- pública) y escritura solo de administradores. inventory solo lo lee el personal.

alter table public.brands            enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.product_variants  enable row level security;
alter table public.colors            enable row level security;
alter table public.product_colors    enable row level security;
alter table public.surfaces          enable row level security;
alter table public.product_surfaces  enable row level security;
alter table public.pathologies       enable row level security;
alter table public.solutions         enable row level security;
alter table public.solution_products enable row level security;
alter table public.pickup_locations  enable row level security;
alter table public.inventory         enable row level security;

-- Grants amplios; las políticas de abajo limitan la escritura a administradores.
do $$
declare t text;
begin
  foreach t in array array[
    'brands','categories','products','product_variants','colors','product_colors',
    'surfaces','product_surfaces','pathologies','solutions','solution_products',
    'pickup_locations'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on public.inventory from anon, authenticated;
grant select, insert, update, delete on public.inventory to authenticated;

grant select on public.v_variant_availability to anon, authenticated;

create policy "brands_lectura_publica" on public.brands
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "categories_lectura_publica" on public.categories
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "products_lectura_publica" on public.products
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "product_variants_lectura_publica" on public.product_variants
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "colors_lectura_publica" on public.colors
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "surfaces_lectura_publica" on public.surfaces
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "pathologies_lectura_publica" on public.pathologies
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "solutions_lectura_publica" on public.solutions
  for select to anon, authenticated using ( status = 'ACTIVO' );

create policy "pickup_locations_lectura_publica" on public.pickup_locations
  for select to anon, authenticated using ( status = 'ACTIVO' );

-- Tablas puente: visibles si su fila padre lo es.
create policy "product_colors_lectura_publica" on public.product_colors
  for select to anon, authenticated
  using ( exists (select 1 from public.products p
                  where p.id = product_id and p.status = 'ACTIVO') );

create policy "product_surfaces_lectura_publica" on public.product_surfaces
  for select to anon, authenticated
  using ( exists (select 1 from public.products p
                  where p.id = product_id and p.status = 'ACTIVO') );

create policy "solution_products_lectura_publica" on public.solution_products
  for select to anon, authenticated
  using ( exists (select 1 from public.solutions s
                  where s.id = solution_id and s.status = 'ACTIVO') );

create policy "inventory_lectura_staff" on public.inventory
  for select to authenticated using ( (select public.is_staff()) );

do $$
declare t text;
begin
  foreach t in array array[
    'brands','categories','products','product_variants','colors','product_colors',
    'surfaces','product_surfaces','pathologies','solutions','solution_products',
    'pickup_locations','inventory'
  ] loop
    execute format(
      'create policy "%s_escritura_admin" on public.%I for all to authenticated '
      'using ((select public.is_admin())) with check ((select public.is_admin()))',
      t, t
    );
  end loop;
end $$;
