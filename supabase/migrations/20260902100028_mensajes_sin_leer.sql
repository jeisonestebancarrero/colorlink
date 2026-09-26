-- Mensajes sin leer con read_at: se marcan al abrir la conversación, no al ver la campana.
-- No cuentan los propios, los EVENTO ni, para clientes, las notas internas.

-- Criterio único para contar y marcar: si divergieran, se marcaría lo que no se ve.
create or replace function public.puedo_ver_conversacion(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.id = _order_id
      and (
        o.user_id = (select auth.uid())
        or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
        or public.is_staff()
      )
  );
$$;

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
    select o.id, o.order_number
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
      and m.author_id is distinct from (select auth.uid())
      and m.kind <> 'EVENTO'
      and (m.kind <> 'NOTA_INTERNA' or public.is_staff())
  )
  select
    mios.id,
    mios.order_number,
    count(nuevos.*) as sin_leer,
    -- Último texto incluido para no consultar por cada pedido desde la campana.
    (array_agg(nuevos.body order by nuevos.created_at desc))[1] as ultimo,
    max(nuevos.created_at) as ultima_fecha
  from mios
  join nuevos on nuevos.order_id = mios.id
  group by mios.id, mios.order_number
  having count(nuevos.*) > 0
  order by max(nuevos.created_at) desc;
$$;

-- Por función: conversation_messages no admite UPDATE de authenticated, y una política
-- permitiría reescribir el cuerpo de los mensajes.
create or replace function public.marcar_conversacion_leida(_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marcados integer;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  if not public.puedo_ver_conversacion(_order_id) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

  update public.conversation_messages m
     set read_at = now()
   where m.order_id = _order_id
     and m.read_at is null
     -- Lo propio no se marca: el remitente no lee por el destinatario.
     and m.author_id is distinct from (select auth.uid())
     and m.kind <> 'EVENTO'
     and (m.kind <> 'NOTA_INTERNA' or public.is_staff());

  get diagnostics v_marcados = row_count;
  return v_marcados;
end;
$$;

revoke all on function public.puedo_ver_conversacion(uuid) from public, anon;
revoke all on function public.mensajes_sin_leer() from public, anon;
revoke all on function public.marcar_conversacion_leida(uuid) from public, anon;
grant execute on function public.puedo_ver_conversacion(uuid) to authenticated;
grant execute on function public.mensajes_sin_leer() to authenticated;
grant execute on function public.marcar_conversacion_leida(uuid) to authenticated;

comment on function public.mensajes_sin_leer() is
  'Conversaciones con mensajes que quien consulta no ha leído. Excluye los '
  'propios, los eventos de trazabilidad y —para el cliente— las notas internas.';
comment on function public.marcar_conversacion_leida(uuid) is
  'Marca como leídos los mensajes ajenos de una conversación. Se llama al ABRIR '
  'el chat, no al recibir el mensaje ni al desplegar la campana.';

-- Índice parcial para la consulta de la campana.
create index if not exists conversation_messages_sin_leer_idx
  on public.conversation_messages (order_id, read_at)
  where read_at is null;
