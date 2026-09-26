-- Las vistas de reportes pasan a security_invoker: corrían como postgres, sin RLS,
-- y anon podía leer v_cartera. Las políticas de las tablas base vuelven a mandar.

alter view public.v_cartera            set (security_invoker = true);
alter view public.v_balance_prueba     set (security_invoker = true);
alter view public.v_estado_resultados  set (security_invoker = true);
alter view public.v_libro_auxiliar     set (security_invoker = true);
alter view public.v_costos_catalogo    set (security_invoker = true);
alter view public.v_ventas             set (security_invoker = true);

-- Necesario para que v_costos_catalogo funcione con security_invoker; RLS de la tabla sigue aplicando.
grant select on public.product_variants to authenticated;

grant select on public.order_items to authenticated;

-- Ninguna vista es actualizable; se revoca por si algún día se añade un INSTEAD OF.
revoke insert, update, delete, truncate, references, trigger
  on public.v_cartera, public.v_balance_prueba, public.v_estado_resultados,
     public.v_libro_auxiliar, public.v_costos_catalogo, public.v_ventas,
     public.v_saldos_cuenta, public.v_inventario_por_punto
  from anon, authenticated;

-- v_variant_availability sigue sin security_invoker a propósito: la tienda la lee sin sesión.
comment on view public.v_variant_availability is
  'Catálogo público: `security_invoker = false` es intencional, la tienda la '
  'consulta sin sesión. No devuelve costos ni márgenes.';

comment on view public.v_cartera is
  'Saldo pendiente por factura, con su empresa y su sede. Respeta las '
  'políticas de `invoices` (security_invoker).';
