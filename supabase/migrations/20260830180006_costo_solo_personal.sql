-- ============================================================
-- El costo es para el personal, no para «cualquiera con cuenta»
-- ============================================================
-- La migración anterior concedía `cost_cop` al rol `authenticated`, dando por
-- hecho que ese rol significaba «personal interno». No: en Supabase
-- `authenticated` es CUALQUIERA que haya iniciado sesión, y en esta
-- plataforma la inmensa mayoría son clientes. Cualquier cliente registrado
-- podía leer el costo de todo el catálogo con una sola petición.
--
-- Un GRANT no distingue roles de negocio; RLS sí. Como no se puede conceder
-- una columna «solo si eres personal», el costo sale de la tabla y se expone
-- por una vista que sí puede preguntarlo.
--
-- Lo mismo con el costo congelado de las líneas de pedido: el cliente lee sus
-- propias líneas para ver qué compró, y ahí no puede ir el costo.

revoke select (cost_cop) on public.product_variants from authenticated;
revoke select (unit_cost_cop) on public.order_items from authenticated;

-- ------------------------------------------------------------
-- Los costos, para quien tiene por qué verlos
-- ------------------------------------------------------------
-- `security_invoker` es obligatorio: sin él la vista correría con los
-- permisos de quien la creó y devolvería los costos a cualquiera.
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
  -- Costo real por bodega: lo que de verdad se pagó, según las recepciones.
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

-- ------------------------------------------------------------
-- Fijar el costo estándar de una referencia
-- ------------------------------------------------------------
-- Es solo una referencia para lo que nunca se ha comprado; el costo real
-- sigue saliendo de las recepciones. Se deja explícito en el comentario
-- porque la tentación de teclear aquí «el costo» y darlo por bueno es alta.
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
