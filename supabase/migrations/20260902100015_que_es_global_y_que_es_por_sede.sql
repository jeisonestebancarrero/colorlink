-- Criterio de alcance: es global lo que describe qué vende Pintuco o a quién
-- (catálogo, clientes, diccionario, configuración); va por sede lo físico u
-- operativo de un local (inventario, recepciones, pedidos).

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
