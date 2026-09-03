-- ============================================================
-- Qué es GLOBAL y qué va POR SEDE
-- ============================================================
-- Queda escrito en la base porque es la clase de decisión que alguien
-- "corrige" mal dentro de seis meses.
--
-- GLOBAL — no se filtra por sede, y no debe filtrarse:
--   * products, product_variants, colors, categories, brands, solutions
--     El catálogo es UNO. Lo que se crea se le muestra al cliente en toda la
--     tienda, sin importar de qué sede se despache. Si el catálogo se filtrara
--     por sede, un producto creado en Medellín desaparecería de la tienda para
--     un cliente de Cali.
--   * profiles, companies, customer_addresses, company_branches
--     Los clientes son de Pintuco, no de una sede. El mismo cliente compra en
--     Medellín y le despachan a Bogotá, y su historial tiene que estar
--     completo. Asignar un cliente a una sede partiría su historia en dos.
--   * departments, municipalities, neighborhoods, countries
--     Diccionario oficial, igual para todos.
--   * app_settings, permissions, roles
--     Configuración de la empresa.
--
-- POR SEDE — es existencia física o operación de un local:
--   * inventory, inventory_movements  — las existencias están EN una bodega
--   * purchase_receipts               — la mercancía entra POR una sede
--   * orders                          — el pedido lo alista y despacha una sede
--
-- La regla para decidir: si el dato describe una COSA QUE ESTÁ en un lugar o
-- una OPERACIÓN QUE HACE un local, va por sede. Si describe qué vende Pintuco
-- o a quién le vende, es global.

comment on table public.products is
  'GLOBAL: el catálogo es uno para toda la tienda. No se filtra por sede (ver 20260902100015).';
comment on table public.product_variants is
  'GLOBAL: presentaciones del catálogo. No se filtran por sede.';
comment on table public.profiles is
  'GLOBAL: los clientes son de Pintuco, no de una sede. Su historial no se parte.';
comment on table public.companies is
  'GLOBAL: las empresas cliente no se asignan a una sede.';
comment on table public.inventory is
  'POR SEDE: las existencias están en una bodega concreta. RLS filtra por sedes permitidas.';
comment on table public.inventory_movements is
  'POR SEDE: cada movimiento ocurre en una bodega. RLS filtra por sedes permitidas.';
comment on table public.purchase_receipts is
  'POR SEDE: la mercancía entra por una sede. RLS filtra por sedes permitidas.';
