-- Un color retirado de un producto deja de aparecer en Inventario: sus filas en cero se borran.
-- El historial de movimientos se conserva; solo se va la fila vacía.

create or replace function public.definir_colores_producto(_product_id uuid, _color_ids uuid[])
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_con_stock text;
begin
  if not (public.is_admin() or public.has_permission('catalog.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para editar el catálogo' using errcode = '42501';
  end if;

  -- Reservado cuenta como existencia: hay pedidos esperando ese color.
  select string_agg(distinct c.name, ', ') into v_con_stock
    from public.inventory i
    join public.product_variants v on v.id = i.variant_id
    join public.colors c on c.id = i.color_id
   where v.product_id = _product_id and (i.qty_available > 0 or i.qty_reserved > 0)
     and not (i.color_id = any(coalesce(_color_ids, '{}')));
  if v_con_stock is not null then
    raise exception 'COLOR_CON_EXISTENCIAS: no puedes quitar % porque tiene existencias en inventario', v_con_stock
      using errcode = '22023';
  end if;

  delete from public.product_colors
   where product_id = _product_id and not (color_id = any(coalesce(_color_ids, '{}')));

  delete from public.inventory i
   using public.product_variants v
   where v.id = i.variant_id and v.product_id = _product_id
     and i.color_id is not null and not (i.color_id = any(coalesce(_color_ids, '{}')))
     and i.qty_available = 0 and i.qty_reserved = 0;

  insert into public.product_colors (product_id, color_id, sort_order)
  select _product_id, x.color_id, x.orden - 1
    from unnest(coalesce(_color_ids, '{}')) with ordinality as x(color_id, orden)
  on conflict (product_id, color_id) do update set sort_order = excluded.sort_order;
end;
$function$;

-- Filas vacías de colores que el producto ya no ofrece.
delete from public.inventory i
 using public.product_variants v
 where v.id = i.variant_id and i.color_id is not null
   and i.qty_available = 0 and i.qty_reserved = 0
   and not exists (select 1 from public.product_colors pc
                    where pc.product_id = v.product_id and pc.color_id = i.color_id);

notify pgrst, 'reload schema';
