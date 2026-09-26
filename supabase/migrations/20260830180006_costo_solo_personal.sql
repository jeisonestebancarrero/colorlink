-- authenticated incluye a los clientes: el costo sale de las tablas y se expone
-- por vistas que comprueban si quien consulta es personal interno.

revoke select (cost_cop) on public.product_variants from authenticated;
revoke select (unit_cost_cop) on public.order_items from authenticated;

-- security_invoker obligatorio: sin él la vista expone los costos a cualquiera.
create or replace view public.v_costos_catalogo
with (security_invoker = true) as
select
  v.id            as variant_id,
  v.product_id,
  p.name          as producto,
  p.code          as codigo,
  v.label         as presentacion,
  v.sku,
  v.price_cop,
  v.cost_cop      as costo_estandar,
    -- Costo real por bodega, según las recepciones.
  (select round(avg(i.avg_cost_cop), 2)
     from public.inventory i
    where i.variant_id = v.id and i.avg_cost_cop > 0) as costo_promedio,
  case
    when v.price_cop > 0 and coalesce(
      (select round(avg(i.avg_cost_cop), 2) from public.inventory i
        where i.variant_id = v.id and i.avg_cost_cop > 0),
      v.cost_cop) > 0
    then round(
      (v.price_cop - coalesce(
        (select round(avg(i.avg_cost_cop), 2) from public.inventory i
          where i.variant_id = v.id and i.avg_cost_cop > 0),
        v.cost_cop)) * 100.0 / v.price_cop, 1)
  end             as margen_pct
from public.product_variants v
join public.products p on p.id = v.product_id
where public.is_staff();

grant select on public.v_costos_catalogo to authenticated;

-- Costo estándar: solo referencia para lo que nunca se ha comprado; el real sale
-- de las recepciones.
create or replace function public.set_standard_cost(_variant_id uuid, _costo numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_permission('catalog.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar el catálogo'
      using errcode = '42501';
  end if;

  if _costo is null or _costo < 0 then
    raise exception 'BAD_COST: el costo no puede ser negativo' using errcode = '22023';
  end if;

  update public.product_variants
     set cost_cop = _costo, updated_at = now()
   where id = _variant_id;

  if not found then
    raise exception 'NOT_FOUND: esa presentación no existe' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'STANDARD_COST_SET', 'product_variants', _variant_id,
          jsonb_build_object('costo', _costo));
end;
$$;

revoke all on function public.set_standard_cost(uuid, numeric) from public, anon;
grant execute on function public.set_standard_cost(uuid, numeric) to authenticated;
