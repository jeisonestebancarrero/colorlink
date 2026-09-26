-- Añade punto_ref y foto_url al resumen por punto. Van al final porque create or
-- replace view no permite reordenar; los nombres evitan confusión con referencias (conteo).
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
