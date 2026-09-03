-- ============================================================
-- Los resúmenes se acotan por sede (Panel y Analítica)
-- ============================================================
-- HUECO DE SEGURIDAD, no solo de filtro.
--
-- `resumen_panel`, `resumen_ventas`, `analitica_ventas` y `analitica_filtros`
-- son SECURITY DEFINER, así que **RLS no aplica dentro de ellas**. Las tablas
-- ya estaban acotadas por sede (20260902100014), pero estas cuatro funciones
-- se salían del dominio: un asesor restringido a Barranquilla veía en el Panel
-- las ventas del día de las siete sedes, el inventario crítico de todas y, en
-- Analítica, el ranking completo. La restricción se aplicaba a las listas y no
-- a los números de arriba, que es justo donde se lee el negocio.
--
-- CÓMO SE ARREGLA: cada función calcula ELLA MISMA el conjunto de sedes que
-- puede ver y lo cruza con las que pide la pantalla. Nunca confía en el
-- parámetro: si el navegador manda una sede ajena, la intersección la
-- descarta.
--
-- FILAS SIN SEDE: se cuentan siempre. Un pedido de envío no sale de una tienda
-- y un proyecto no tiene sede; esconderlos de todo el mundo daría cifras que no
-- suman con ninguna vista.

/**
 * Sedes que se van a usar de verdad: lo pedido ∩ lo permitido.
 *
 * `null` en `_pedidas` significa «todas las que pueda ver».
 *
 * Es la pieza que hace que estas funciones sigan siendo seguras a pesar de ser
 * SECURITY DEFINER: el parámetro que llega del navegador solo puede REDUCIR el
 * conjunto, nunca ampliarlo.
 */
create or replace function public.sedes_efectivas(_pedidas uuid[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(s.id),
    -- Sin ninguna sede permitida se devuelve un arreglo vacío y no `null`:
    -- `null` significaría «sin filtro» y abriría todo justo en el caso
    -- contrario al que se quiere.
    array[]::uuid[]
  )
  from public.sedes_permitidas() as s(id)
  where _pedidas is null or s.id = any(_pedidas);
$$;

revoke all on function public.sedes_efectivas(uuid[]) from public;
grant execute on function public.sedes_efectivas(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- Panel
-- ------------------------------------------------------------
create or replace function public.resumen_panel(_sedes uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_pedidos    boolean := public.is_admin() or public.has_permission('orders.read');
  v_inventario boolean := public.is_admin() or public.has_permission('inventory.read');
  v_visitas    boolean := public.is_admin() or public.has_permission('visits.read');
  v_proyectos  boolean := public.is_admin() or public.has_permission('projects.read');
  v_ventas     boolean := public.is_admin() or public.has_permission('analytics.read');
  v_chat       boolean := public.is_admin() or public.has_permission('chat.read');
  -- Lo pedido cruzado con lo permitido. El navegador solo puede reducir.
  v_sedes      uuid[] := public.sedes_efectivas(_sedes);
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN: el panel es del portal interno' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- ── Lo que espera una acción ───────────────────────────────────────
    'por_confirmar', case when v_pedidos then (
      select count(*) from public.orders
       where status = 'PENDIENTE'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'por_alistar', case when v_pedidos then (
      select count(*) from public.orders
       where status in ('CONFIRMADO', 'PREPARANDO')
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'listos_para_retiro', case when v_pedidos then (
      select count(*) from public.orders
       where status = 'LISTO_PARA_RETIRO'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'en_transito', case when v_pedidos then (
      select count(*) from public.orders
       where status = 'ENVIADO'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,

    -- ── Cómo va el día ─────────────────────────────────────────────────
    'ventas_hoy', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO' and created_at::date = current_date
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))), 0) end,
    'pedidos_hoy', case when v_ventas then (
      select count(*) from public.orders
       where status <> 'CANCELADO' and created_at::date = current_date
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))) end,
    'ventas_mes', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO'
         and created_at >= date_trunc('month', current_date)
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))), 0) end,
    -- El mismo tramo del mes pasado, no el mes pasado completo: comparar los
    -- primeros 5 días contra 30 diría siempre que vamos peor.
    'ventas_mes_anterior', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO'
         and created_at >= date_trunc('month', current_date - interval '1 month')
         and created_at <  date_trunc('month', current_date - interval '1 month')
                           + ((current_date - date_trunc('month', current_date)::date) + 1)
                             * interval '1 day'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))), 0) end,

    -- ── Alertas de inventario ──────────────────────────────────────────
    -- El inventario SIEMPRE está en una bodega, así que aquí no hay caso de
    -- fila sin sede: se filtra sin excepción.
    'bajo_minimo', case when v_inventario then (
      select count(*) from public.inventory
       where min_qty is not null and min_qty > 0 and qty_available <= min_qty
         and location_id = any(v_sedes)) end,
    'agotados', case when v_inventario then (
      select count(*) from public.inventory
       where qty_available <= 0 and location_id = any(v_sedes)) end,
    'criticos', case when v_inventario then coalesce((
      select jsonb_agg(x order by x.faltante desc)
      from (
        select p.name as producto, pv.label as presentacion,
               pl.name as punto, i.qty_available as existencia,
               i.min_qty as minimo, (i.min_qty - i.qty_available) as faltante
          from public.inventory i
          join public.product_variants pv on pv.id = i.variant_id
          join public.products p on p.id = pv.product_id
          join public.pickup_locations pl on pl.id = i.location_id
         where i.min_qty is not null and i.min_qty > 0 and i.qty_available <= i.min_qty
           and i.location_id = any(v_sedes)
         order by (i.min_qty - i.qty_available) desc
         limit 6) x), '[]'::jsonb) end,

    -- ── Agenda ─────────────────────────────────────────────────────────
    -- Las visitas cuelgan de un proyecto y hoy no tienen sede asignada
    -- (`technical_visits.location_id` está en null). Se filtran igual, para
    -- que empiece a funcionar el día que la programación fije la sede.
    'visitas_hoy', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date = current_date and status = 'PROGRAMADA'
         and (location_id is null or location_id = any(v_sedes))) end,
    'visitas_semana', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date between current_date and current_date + 7
         and status = 'PROGRAMADA'
         and (location_id is null or location_id = any(v_sedes))) end,
    'visitas_vencidas', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date < current_date and status = 'PROGRAMADA'
         and (location_id is null or location_id = any(v_sedes))) end,
    'agenda', case when v_visitas then coalesce((
      select jsonb_agg(x order by x.fecha)
      from (
        select tv.scheduled_date as fecha, tv.scheduled_time as hora,
               pr.name as proyecto, pr.city as ciudad,
               (pf.first_name || ' ' || pf.last_name) as tecnico
          from public.technical_visits tv
          join public.projects pr on pr.id = tv.project_id
          left join public.profiles pf on pf.id = tv.technician_id
         where tv.status = 'PROGRAMADA' and tv.scheduled_date >= current_date
           and (tv.location_id is null or tv.location_id = any(v_sedes))
         order by tv.scheduled_date limit 5) x), '[]'::jsonb) end,

    -- ── Trabajo sin dueño ──────────────────────────────────────────────
    -- Los proyectos NO tienen sede y no se les inventa una: son obras del
    -- cliente, no operación de una tienda. Van sin filtrar a propósito.
    'proyectos_sin_asesor', case when v_proyectos then (
      select count(*) from public.projects pr
       where not exists (
         select 1 from public.project_assignments pa where pa.project_id = pr.id)) end,
    'proyectos_activos', case when v_proyectos then (
      select count(*) from public.projects
       where status not in ('COMPLETADO', 'CANCELADO')) end,

    -- Un hilo queda "sin responder" cuando lo último que se escribió lo
    -- escribió el cliente. Se acota por la sede del pedido cuando el hilo
    -- cuelga de uno; los de proyecto no tienen sede.
    'sin_responder', case when v_chat then (
      select count(*) from (
        select distinct on (coalesce(cm.order_id, cm.project_id))
               cm.author_id, o.user_id as cliente_pedido, pr.user_id as cliente_proyecto,
               o.pickup_location_id as sede
          from public.conversation_messages cm
          left join public.orders o on o.id = cm.order_id
          left join public.projects pr on pr.id = cm.project_id
         where cm.kind = 'MENSAJE'
         order by coalesce(cm.order_id, cm.project_id), cm.created_at desc) u
       where u.author_id is not null
         and u.author_id = coalesce(u.cliente_pedido, u.cliente_proyecto)
         and (u.sede is null or u.sede = any(v_sedes))) end
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- ------------------------------------------------------------
-- Analítica: resumen general
-- ------------------------------------------------------------
create or replace function public.resumen_ventas(
  _desde date default null,
  _hasta date default null,
  _sedes uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_sedes uuid[] := public.sedes_efectivas(_sedes);
begin
  if not (public.is_admin() or public.has_permission('analytics.read')) then
    raise exception 'FORBIDDEN: no tienes permiso para ver la analítica' using errcode = '42501';
  end if;

  with rango as (
    select coalesce(_desde, (current_date - interval '365 days')::date) as d,
           coalesce(_hasta, current_date) as h
  ),
  base as (
    select o.id as order_id, o.total_cop, date_trunc('month', o.created_at) as mes,
           o.company_id, c.name as empresa,
           oi.quantity, oi.product_name, oi.subtotal_cop as linea_total,
           coalesce(oi.unit_cost_cop, pv.cost_cop) as cost_cop,
           (oi.unit_cost_cop is null and pv.cost_cop is not null) as costo_estimado,
           case when coalesce(oi.unit_cost_cop, pv.cost_cop) is null then null
                else oi.subtotal_cop - (coalesce(oi.unit_cost_cop, pv.cost_cop) * oi.quantity)
           end as margen_linea
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.companies c on c.id = o.company_id
    cross join rango r
    where o.status <> 'CANCELADO' and o.created_at::date between r.d and r.h
      and (o.pickup_location_id is null or o.pickup_location_id = any(v_sedes))
  ),
  pedidos as (select distinct order_id, total_cop, mes, empresa from base)
  select jsonb_build_object(
    'ingresos',     coalesce((select sum(total_cop) from pedidos), 0),
    'pedidos',      coalesce((select count(*) from pedidos), 0),
    'unidades',     coalesce((select sum(quantity) from base), 0),
    'ticket_medio', coalesce((select round(avg(total_cop), 0) from pedidos), 0),
    'margen',       (select sum(margen_linea) from base where margen_linea is not null),
    'lineas_sin_costo',  coalesce((select count(*) from base where cost_cop is null), 0),
    'lineas_estimadas',  coalesce((select count(*) from base where costo_estimado), 0),
    'por_mes', coalesce((
      select jsonb_agg(x order by x.mes)
      from (select to_char(mes,'YYYY-MM') as mes, sum(total_cop) as total, count(*) as pedidos
            from pedidos group by mes) x), '[]'::jsonb),
    'top_productos', coalesce((
      select jsonb_agg(x)
      from (select product_name, sum(quantity) as unidades, sum(linea_total) as total
            from base group by product_name order by sum(linea_total) desc limit 8) x), '[]'::jsonb),
    'top_empresas', coalesce((
      select jsonb_agg(x)
      from (select coalesce(empresa,'Cliente particular') as empresa,
                   count(*) as pedidos, sum(total_cop) as total
            from pedidos group by empresa order by sum(total_cop) desc limit 8) x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- ------------------------------------------------------------
-- Analítica: filtros
-- ------------------------------------------------------------
-- El desplegable de puntos solo ofrece los permitidos. Ofrecer una sede que
-- después no devuelve datos hace pensar que no hubo ventas, cuando lo que pasa
-- es que no se tiene acceso.
create or replace function public.analitica_filtros()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_sedes uuid[] := public.sedes_efectivas(null);
begin
  if not (public.is_admin() or public.has_permission('analytics.read')) then
    raise exception 'FORBIDDEN: no tienes permiso para ver la analítica' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'puntos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', name, 'ciudad', city)
                       order by name)
        from public.pickup_locations
       where id = any(v_sedes)), '[]'::jsonb),
    -- El catálogo es GLOBAL (ver 20260902100015): no se filtra por sede.
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', name) order by sort_order, name)
        from public.categories
       where kind = 'PRODUCT' and parent_id is not null), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', name, 'codigo', code)
                       order by name)
        from public.products), '[]'::jsonb),
    'anios', coalesce((
      select jsonb_agg(distinct date_part('year', created_at)::int)
        from public.orders
       where status <> 'CANCELADO'
         and (pickup_location_id is null or pickup_location_id = any(v_sedes))), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

notify pgrst, 'reload schema';
