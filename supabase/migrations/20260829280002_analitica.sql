-- ============================================================
-- Analítica de ventas (MÓDULO 45/58)
-- ============================================================
-- SOBRE EL MARGEN: hasta ahora el catálogo solo guarda el PRECIO DE VENTA.
-- Sin costo no hay margen, y calcularlo con un porcentaje inventado daría
-- una cifra que parece un dato y no lo es. Se añade `cost_cop` como columna
-- anulable: donde Pintuco cargue el costo, la analítica muestra margen real;
-- donde no, muestra ingresos y dice explícitamente que falta el costo.
-- ============================================================

alter table public.product_variants add column cost_cop numeric(14,2);
alter table public.product_variants
  add constraint product_variants_costo_no_negativo
  check (cost_cop is null or cost_cop >= 0);

comment on column public.product_variants.cost_cop is
  'Costo unitario. Sin este dato no se puede calcular margen; la analítica lo informa en vez de estimarlo.';

-- Los pedidos cancelados no son ventas: quedan fuera de toda cifra.
create or replace view public.v_ventas as
  select
    o.id            as order_id,
    o.order_number,
    o.created_at,
    date_trunc('month', o.created_at) as mes,
    o.status,
    o.user_id,
    o.company_id,
    c.name          as empresa,
    o.total_cop,
    o.subtotal_cop,
    o.discount_cop,
    oi.variant_id,
    oi.product_name,
    oi.quantity,
    oi.subtotal_cop as linea_total,
    pv.cost_cop,
    case when pv.cost_cop is null then null
         else oi.subtotal_cop - (pv.cost_cop * oi.quantity)
    end             as margen_linea
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.product_variants pv on pv.id = oi.variant_id
  left join public.companies c on c.id = o.company_id
  where o.status <> 'CANCELADO';

comment on view public.v_ventas is
  'Base de la analítica. Excluye pedidos cancelados: no son ventas.';

/**
 * Resumen de ventas del periodo. Devuelve un único objeto para que el
 * tablero no tenga que hacer seis consultas.
 */
create or replace function public.resumen_ventas(_desde date default null, _hasta date default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rango as (
    select coalesce(_desde, (current_date - interval '365 days')::date) as d,
           coalesce(_hasta, current_date) as h
  ),
  base as (
    select * from public.v_ventas v, rango r
    where v.created_at::date between r.d and r.h
  ),
  pedidos as (
    select distinct order_id, total_cop, mes, company_id, empresa from base
  )
  select jsonb_build_object(
    'ingresos',     coalesce((select sum(total_cop) from pedidos), 0),
    'pedidos',      coalesce((select count(*) from pedidos), 0),
    'unidades',     coalesce((select sum(quantity) from base), 0),
    'ticket_medio', coalesce((select round(avg(total_cop), 0) from pedidos), 0),
    'margen',       (select sum(margen_linea) from base where margen_linea is not null),
    'lineas_sin_costo', coalesce((select count(*) from base where cost_cop is null), 0),
    'por_mes', coalesce((
      select jsonb_agg(x order by x.mes)
      from (select to_char(mes,'YYYY-MM') as mes, sum(total_cop) as total, count(*) as pedidos
            from pedidos group by mes) x
    ), '[]'::jsonb),
    'top_productos', coalesce((
      select jsonb_agg(x)
      from (select product_name, sum(quantity) as unidades, sum(linea_total) as total
            from base group by product_name order by sum(linea_total) desc limit 8) x
    ), '[]'::jsonb),
    'top_empresas', coalesce((
      select jsonb_agg(x)
      from (select coalesce(empresa,'Cliente particular') as empresa,
                   count(*) as pedidos, sum(total_cop) as total
            from pedidos group by empresa order by sum(total_cop) desc limit 8) x
    ), '[]'::jsonb)
  );
$$;

/**
 * Ranking comercial.
 *
 * Un pedido se atribuye al ASESOR ASIGNADO al proyecto que lo originó. Los
 * pedidos sin proyecto no tienen asesor y se reportan aparte en vez de
 * repartirse: inventar una atribución falsearía el ranking y las comisiones.
 */
create or replace function public.ranking_comercial(_desde date default null, _hasta date default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rango as (
    select coalesce(_desde, (current_date - interval '365 days')::date) as d,
           coalesce(_hasta, current_date) as h
  ),
  pedidos as (
    select distinct o.id, o.total_cop, o.project_id
    from public.orders o, rango r
    where o.status <> 'CANCELADO' and o.created_at::date between r.d and r.h
  ),
  atribuidos as (
    select p.id, p.total_cop, pa.user_id as asesor
    from pedidos p
    left join public.project_assignments pa
      on pa.project_id = p.project_id and pa.assignment_role = 'ASESOR'
  )
  select jsonb_build_object(
    'asesores', coalesce((
      select jsonb_agg(x order by x.total desc)
      from (
        select pr.first_name || ' ' || pr.last_name as nombre,
               count(*) as pedidos, sum(a.total_cop) as total
        from atribuidos a
        join public.profiles pr on pr.id = a.asesor
        where a.asesor is not null
        group by pr.first_name, pr.last_name
      ) x
    ), '[]'::jsonb),
    'sin_asesor', jsonb_build_object(
      'pedidos', coalesce((select count(*) from atribuidos where asesor is null), 0),
      'total',   coalesce((select sum(total_cop) from atribuidos where asesor is null), 0)
    )
  );
$$;

grant select on public.v_ventas to authenticated;
revoke execute on function public.resumen_ventas(date, date)     from public, anon;
revoke execute on function public.ranking_comercial(date, date)  from public, anon;
grant execute on function public.resumen_ventas(date, date)     to authenticated;
grant execute on function public.ranking_comercial(date, date)  to authenticated;
