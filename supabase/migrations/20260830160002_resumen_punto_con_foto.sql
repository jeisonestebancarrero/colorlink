-- ============================================================
-- El resumen por punto también necesita identificar la tienda
-- ============================================================
-- El tablero de inventario muestra tarjetas por punto de venta. Para poner la
-- imagen hacen falta dos datos que la vista no devolvía: la llave estable con
-- la que la aplicación busca la imagen local, y la URL de la foto real si
-- Pintuco ya la cargó.
--
-- Las columnas nuevas van al FINAL: `create or replace view` no admite
-- renombrar ni reordenar las existentes, y recrear la vista con drop
-- obligaría a recrear también sus permisos.
--
-- Se llaman `punto_ref` y `foto_url` y no `referencia`/`image_url` a
-- propósito: la vista ya tiene una columna `referencias` que es el CONTEO de
-- productos, y dos nombres casi idénticos con significados distintos son una
-- trampa para quien lea esta consulta dentro de seis meses.
create or replace view public.v_inventario_por_punto
with (security_invoker = true) as
select
  l.id            as location_id,
  l.name          as punto,
  l.city          as ciudad,
  count(i.*)                                              as referencias,
  coalesce(sum(i.qty_available), 0)                       as disponible,
  coalesce(sum(i.qty_reserved), 0)                        as reservado,
  coalesce(sum(i.qty_available - i.qty_reserved), 0)      as neto,
  count(*) filter (
    where i.qty_available - i.qty_reserved <= 0
  )                                                       as agotadas,
  count(*) filter (
    where i.min_qty > 0
      and i.qty_available - i.qty_reserved > 0
      and i.qty_available - i.qty_reserved <= i.min_qty
  )                                                       as bajo_reorden,
  l.external_ref  as punto_ref,
  l.image_url     as foto_url
from public.pickup_locations l
left join public.inventory i on i.location_id = l.id
where l.status = 'ACTIVO' and public.is_staff()
group by l.id, l.name, l.city, l.external_ref, l.image_url;

grant select on public.v_inventario_por_punto to authenticated;
