-- ============================================================
-- El acuse de lectura se marca por LADOS, no por persona
-- ============================================================
-- Al poner los «chulitos» del chat salió un fallo en cómo se marcaba leído.
--
-- `marcar_conversacion_leida` marcaba todo lo que no fuera del propio autor.
-- Con dos personas basta, pero de este lado del mostrador hay varias: si un
-- asesor abría la conversación, los mensajes escritos por OTRO compañero
-- quedaban marcados como leídos. El chulito doble diría «el cliente lo vio»
-- cuando lo que pasó es que lo vio un compañero. Un acuse que miente es peor
-- que no tener acuse: se toma una decisión —volver a llamar o no— con un dato
-- falso.
--
-- La conversación tiene DOS LADOS: el cliente (el dueño del pedido y la gente
-- de su empresa) y el equipo. `read_at` pasa a significar «lo leyó el otro
-- lado», que es lo único que el chulito puede afirmar con honestidad.
--
-- Nota sobre la precisión que SÍ se puede prometer: dos chulos significan que
-- alguien del otro lado abrió la conversación donde estaba el mensaje. No que
-- lo haya leído con atención. Es lo mismo que promete cualquier chat.

-- ------------------------------------------------------------
-- ¿Este mensaje lo escribió el lado del cliente?
-- ------------------------------------------------------------
create or replace function public.es_del_lado_del_cliente(
  _order_id uuid, _author_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    left join public.profiles p on p.id = _author_id
    where o.id = _order_id
      and _author_id is not null
      and (
        o.user_id = _author_id
        or (o.company_id is not null and p.company_id = o.company_id)
      )
  );
$$;

-- ------------------------------------------------------------
-- Marcar leído: solo lo del OTRO lado
-- ------------------------------------------------------------
create or replace function public.marcar_conversacion_leida(_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marcados integer;
  v_soy_equipo boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  if not public.puedo_ver_conversacion(_order_id) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

  -- De qué lado está quien abre. Alguien puede ser personal Y dueño del
  -- pedido; en ese caso manda ser el dueño, porque el hilo es suyo.
  v_soy_equipo := public.is_staff()
    and not public.es_del_lado_del_cliente(_order_id, (select auth.uid()));

  update public.conversation_messages m
     set read_at = now()
   where m.order_id = _order_id
     and m.read_at is null
     and m.author_id is not null
     and m.author_id is distinct from (select auth.uid())
     and m.kind <> 'EVENTO'
     and (m.kind <> 'NOTA_INTERNA' or public.is_staff())
     -- El cambio: solo lo que venga del OTRO lado.
     and public.es_del_lado_del_cliente(m.order_id, m.author_id) = v_soy_equipo;

  get diagnostics v_marcados = row_count;
  return v_marcados;
end;
$$;

-- ------------------------------------------------------------
-- La campana usa el mismo criterio
-- ------------------------------------------------------------
-- Si contara distinto de lo que marca, quedarían avisos imposibles de quitar:
-- el número diría que hay uno sin leer y abrir el chat no lo bajaría.
create or replace function public.mensajes_sin_leer()
returns table (
  order_id uuid,
  order_number text,
  sin_leer bigint,
  ultimo text,
  ultima_fecha timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mios as (
    select o.id, o.order_number,
           -- De qué lado estoy en ESTE pedido.
           (public.is_staff()
             and not public.es_del_lado_del_cliente(o.id, (select auth.uid()))) as soy_equipo
    from public.orders o
    where o.user_id = (select auth.uid())
       or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
       or public.is_staff()
  ),
  nuevos as (
    select m.order_id, m.body, m.created_at
    from public.conversation_messages m
    join mios on mios.id = m.order_id
    where m.read_at is null
      and m.author_id is not null
      and m.author_id is distinct from (select auth.uid())
      and m.kind <> 'EVENTO'
      and (m.kind <> 'NOTA_INTERNA' or public.is_staff())
      and public.es_del_lado_del_cliente(m.order_id, m.author_id) = mios.soy_equipo
  )
  select
    mios.id,
    mios.order_number,
    count(nuevos.*) as sin_leer,
    (array_agg(nuevos.body order by nuevos.created_at desc))[1] as ultimo,
    max(nuevos.created_at) as ultima_fecha
  from mios
  join nuevos on nuevos.order_id = mios.id
  group by mios.id, mios.order_number
  having count(nuevos.*) > 0
  order by max(nuevos.created_at) desc;
$$;

revoke all on function public.es_del_lado_del_cliente(uuid, uuid) from public, anon;
grant execute on function public.es_del_lado_del_cliente(uuid, uuid) to authenticated;

comment on function public.es_del_lado_del_cliente(uuid, uuid) is
  'Si el autor de un mensaje pertenece al lado del cliente en ese pedido: su '
  'dueño o alguien de su empresa. Todo lo demás con autor es el equipo.';
comment on function public.marcar_conversacion_leida(uuid) is
  'Marca leídos los mensajes del OTRO lado de la conversación. Por lados y no '
  'por autor: si no, un asesor abriendo el hilo marcaría como leídos los '
  'mensajes de sus compañeros y el acuse diría que los vio el cliente.';
