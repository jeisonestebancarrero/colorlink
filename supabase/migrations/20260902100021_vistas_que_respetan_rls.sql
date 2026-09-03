-- ============================================================
-- Las vistas de reportes tienen que respetar RLS
-- ============================================================
-- Encontrado revisando la cartera para la pantalla del cupo de crédito.
--
-- En PostgreSQL una vista se ejecuta con los permisos de SU DUEÑO, no de quien
-- la consulta, a menos que se marque `security_invoker = true`. El dueño aquí
-- es `postgres`, que es superusuario, así que RLS SE APAGA dentro de la vista.
-- Es el mismo agujero que ya se tapó en las funciones `SECURITY DEFINER`
-- (`resumen_panel`, `analitica_ventas`), solo que por otra puerta.
--
-- Comprobado, no supuesto. Asumiendo el rol `anon` —el que lleva la llave
-- pública que va dentro del paquete JavaScript, es decir SIN INICIAR SESIÓN—:
--
--   set role anon;
--   select count(*), sum(saldo) from v_cartera;  -->  4 | 991300.00
--   select count(*) from invoices;               -->  ERROR: permission denied
--
-- La tabla estaba bien protegida y la vista la publicaba de todos modos: quién
-- debe, cuánto y desde cuántos días, con el nombre del cliente.
--
-- Las otras cinco vistas tienen el mismo defecto y hoy devuelven cero solo
-- porque todavía no hay asientos contables cargados. El día que los haya,
-- quedan a la vista el estado de resultados, el libro auxiliar, el balance de
-- prueba, las ventas y —lo más delicado para negociar con Pintuco— el COSTO y
-- por tanto el margen de cada producto.
--
-- El arreglo es una línea por vista. No cambia lo que ve el personal interno:
-- las políticas de las tablas base (`invoices_select`, `journal_lectura`,
-- `accounts_lectura`, `inventory_lectura_staff`) vuelven a ser las que mandan,
-- que es lo que se pretendía desde el principio.

alter view public.v_cartera            set (security_invoker = true);
alter view public.v_balance_prueba     set (security_invoker = true);
alter view public.v_estado_resultados  set (security_invoker = true);
alter view public.v_libro_auxiliar     set (security_invoker = true);
alter view public.v_costos_catalogo    set (security_invoker = true);
alter view public.v_ventas             set (security_invoker = true);

-- `v_costos_catalogo` lee `product_variants`, y `authenticated` no tenía el
-- GRANT: sin esto, activar `security_invoker` apagaría la pantalla de costos
-- del catálogo en lugar de asegurarla. La tabla ya tiene RLS con la política
-- `product_variants_lectura_publica`, así que el permiso no destapa nada
-- nuevo: es la misma información que el catálogo de la tienda ya publica.
grant select on public.product_variants to authenticated;

-- `v_ventas` lee `order_items`, que sí es privada por RLS. La vista no se usa
-- en la aplicación; se deja asegurada para que no vuelva a ser una puerta.
grant select on public.order_items to authenticated;

-- Permisos de escritura sobre las vistas. Ninguna es actualizable
-- automáticamente, así que hoy no se puede escribir por ahí, pero el GRANT
-- sobraba: si algún día se le pone un `INSTEAD OF`, empezaría a servir.
revoke insert, update, delete, truncate, references, trigger
  on public.v_cartera, public.v_balance_prueba, public.v_estado_resultados,
     public.v_libro_auxiliar, public.v_costos_catalogo, public.v_ventas,
     public.v_saldos_cuenta, public.v_inventario_por_punto
  from anon, authenticated;

-- `v_variant_availability` es la EXCEPCIÓN a propósito: publica el catálogo y
-- su disponibilidad a quien no ha iniciado sesión, que es precisamente lo que
-- tiene que hacer la tienda. Queda documentado para que no se "arregle" por
-- parecido con las demás.
comment on view public.v_variant_availability is
  'Catálogo público: `security_invoker = false` es intencional, la tienda la '
  'consulta sin sesión. No devuelve costos ni márgenes.';

comment on view public.v_cartera is
  'Saldo pendiente por factura, con su empresa y su sede. Respeta las '
  'políticas de `invoices` (security_invoker).';
