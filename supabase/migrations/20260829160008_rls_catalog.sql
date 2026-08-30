-- ============================================================
-- FASE 3 · 08 — RLS del catálogo
-- ============================================================
-- CRITERIO DE LECTURA PÚBLICA:
-- El MÓDULO 30 prohíbe `USING (true)` sobre información SENSIBLE. Un
-- catálogo comercial no lo es: los productos, precios de lista y colores de
-- Pintuco son públicos por definición, y la LandingPage debe poder mostrarlos
-- antes de iniciar sesión. Por eso la lectura es abierta, pero acotada a las
-- filas con estado ACTIVO: nunca se filtra el catálogo descontinuado.
--
-- La ESCRITURA es exclusiva de ADMINISTRADOR en todas las tablas.
-- El inventario es la excepción de lectura: sus cantidades solo las ve el
-- personal interno; el público consume la vista derivada de disponibilidad.
-- ============================================================

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

-- ------------------------------------------------------------
-- Permisos base: lectura para todos, escritura para nadie.
-- (La escritura de administrador pasa por las políticas de más abajo.)
-- ------------------------------------------------------------
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

-- Inventario: ni lectura pública.
revoke all on public.inventory from anon, authenticated;
grant select, insert, update, delete on public.inventory to authenticated;

-- Vista de disponibilidad: legible por cualquiera.
grant select on public.v_variant_availability to anon, authenticated;

-- ------------------------------------------------------------
-- Políticas de LECTURA del catálogo activo
-- ------------------------------------------------------------
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

-- Tablas puente: se leen si su fila padre es visible.
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

-- ------------------------------------------------------------
-- Inventario: solo personal interno ve las cantidades reales
-- ------------------------------------------------------------
create policy "inventory_lectura_staff" on public.inventory
  for select to authenticated using ( (select public.is_staff()) );

-- ------------------------------------------------------------
-- ESCRITURA: exclusiva de ADMINISTRADOR en todo el catálogo
-- ------------------------------------------------------------
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
