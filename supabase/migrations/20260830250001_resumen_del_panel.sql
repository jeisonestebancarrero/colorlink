-- Resumen del panel orientado a lo pendiente del día; cada bloque respeta su permiso.
create or replace function public.resumen_panel()
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
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN: el panel es del portal interno' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'por_confirmar', case when v_pedidos then (
      select count(*) from public.orders where status = 'PENDIENTE') end,
    'por_alistar', case when v_pedidos then (
      select count(*) from public.orders where status in ('CONFIRMADO', 'PREPARANDO')) end,
    'listos_para_retiro', case when v_pedidos then (
      select count(*) from public.orders where status = 'LISTO_PARA_RETIRO') end,
    'en_transito', case when v_pedidos then (
      select count(*) from public.orders where status = 'ENVIADO') end,

    'ventas_hoy', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO' and created_at::date = current_date), 0) end,
    'pedidos_hoy', case when v_ventas then (
      select count(*) from public.orders
       where status <> 'CANCELADO' and created_at::date = current_date) end,
    'ventas_mes', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO'
         and created_at >= date_trunc('month', current_date)), 0) end,
      -- Mismo tramo del mes pasado, no el mes completo.
    'ventas_mes_anterior', case when v_ventas then coalesce((
      select sum(total_cop) from public.orders
       where status <> 'CANCELADO'
         and created_at >= date_trunc('month', current_date - interval '1 month')
           -- Intervalo porque timestamp + entero no está definido en PostgreSQL.
         and created_at <  date_trunc('month', current_date - interval '1 month')
                           + ((current_date - date_trunc('month', current_date)::date) + 1)
                             * interval '1 day'), 0) end,

    'bajo_minimo', case when v_inventario then (
      select count(*) from public.inventory
       where min_qty is not null and min_qty > 0 and qty_available <= min_qty) end,
    'agotados', case when v_inventario then (
      select count(*) from public.inventory where qty_available <= 0) end,
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
         order by (i.min_qty - i.qty_available) desc
         limit 6) x), '[]'::jsonb) end,

    'visitas_hoy', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date = current_date and status = 'PROGRAMADA') end,
    'visitas_semana', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date between current_date and current_date + 7
         and status = 'PROGRAMADA') end,
    'visitas_vencidas', case when v_visitas then (
      select count(*) from public.technical_visits
       where scheduled_date < current_date and status = 'PROGRAMADA') end,
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
         order by tv.scheduled_date limit 5) x), '[]'::jsonb) end,

    'proyectos_sin_asesor', case when v_proyectos then (
      select count(*) from public.projects pr
       where not exists (
         select 1 from public.project_assignments pa where pa.project_id = pr.id)) end,
    'proyectos_activos', case when v_proyectos then (
      select count(*) from public.projects
       where status not in ('COMPLETADO', 'CANCELADO')) end,

      -- Sin responder: el último mensaje del hilo es del cliente.
    'sin_responder', case when v_chat then (
      select count(*) from (
        select distinct on (coalesce(cm.order_id, cm.project_id))
               cm.author_id, o.user_id as cliente_pedido, pr.user_id as cliente_proyecto
          from public.conversation_messages cm
          left join public.orders o on o.id = cm.order_id
          left join public.projects pr on pr.id = cm.project_id
         where cm.kind = 'MENSAJE'
         order by coalesce(cm.order_id, cm.project_id), cm.created_at desc) u
       where u.author_id is not null
         and u.author_id = coalesce(u.cliente_pedido, u.cliente_proyecto)) end
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.resumen_panel() from public;
grant execute on function public.resumen_panel() to authenticated;

comment on function public.resumen_panel() is
  'Bandeja del día del portal interno: lo que espera acción, cómo va la venta, alertas de inventario y agenda. Cada bloque respeta su propio permiso y devuelve null si el rol no lo tiene.';
