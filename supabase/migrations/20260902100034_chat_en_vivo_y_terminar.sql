-- ============================================================
-- El chat con el equipo, en vivo y con final
-- ============================================================
-- Faltaban dos cosas para que la conversación fuera una conversación:
--
--   1. Cuando el asistente pasaba la charla a una persona, la respuesta del
--      equipo llegaba SOLO al detalle del pedido. El cliente se quedaba en la
--      burbuja esperando, sin saber que ya le habían contestado en otra
--      pantalla. Ahora es el MISMO hilo visto desde dos sitios: lo que escribe
--      cualquiera de los dos aparece en los dos.
--
--   2. No había forma de dar por terminada la conversación. Un hilo que nunca
--      cierra hace que el equipo no sepa qué está pendiente, y que el cliente
--      no sepa si le van a responder o ya se acabó.
--
-- CERRAR NO BORRA NADA. El historial queda; lo que se cierra es la posibilidad
-- de escribir. Y lo puede cerrar cualquiera de los dos lados, porque los dos
-- pueden considerar resuelto el asunto.
--
-- REABRIR ES EXPLÍCITO. Si el cliente vuelve a pedir una persona, se abre otra
-- vez. Así «terminar» significa de verdad terminar, y no un botón que el
-- siguiente mensaje deshace sin que nadie se entere.

alter table public.orders
  add column if not exists chat_cerrado_en timestamptz,
  add column if not exists chat_cerrado_por uuid references public.profiles(id) on delete set null;

comment on column public.orders.chat_cerrado_en is
  'Cuándo se dio por terminada la conversación del pedido. Null = abierta. '
  'Cerrarla no borra los mensajes: solo impide escribir nuevos.';

-- ------------------------------------------------------------
-- Terminar la conversación
-- ------------------------------------------------------------
create or replace function public.cerrar_conversacion(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
  v_soy_equipo boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;
  if not public.puedo_ver_conversacion(_order_id) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

  -- Cerrar dos veces no es un error: el otro lado pudo cerrarla mientras esta
  -- pantalla tenía el botón todavía a la vista. Se devuelve el estado y ya.
  if exists (select 1 from public.orders o
             where o.id = _order_id and o.chat_cerrado_en is not null) then
    return jsonb_build_object('cerrada', true, 'ya_estaba', true);
  end if;

  update public.orders
     set chat_cerrado_en = now(),
         chat_cerrado_por = (select auth.uid())
   where id = _order_id;

  v_soy_equipo := public.is_staff()
    and not public.es_del_lado_del_cliente(_order_id, (select auth.uid()));
  v_quien := coalesce(public.nombre_de_quien_edita(), 'alguien');

  -- Queda un EVENTO en el hilo, no un mensaje: es trazabilidad, no algo que
  -- espere respuesta, y por eso tampoco enciende la campana de nadie.
  insert into public.conversation_messages (order_id, author_id, kind, body)
  values (_order_id, null, 'EVENTO',
          'Conversación terminada por ' ||
          case when v_soy_equipo then 'el equipo (' || v_quien || ')' else 'el cliente' end);

  return jsonb_build_object('cerrada', true, 'ya_estaba', false);
end;
$$;

-- ------------------------------------------------------------
-- Volver a abrirla
-- ------------------------------------------------------------
-- La usa el asistente cuando el cliente pide otra vez una persona, y el
-- personal cuando hay que retomar. Es explícita a propósito: si un mensaje
-- cualquiera reabriera el hilo, «terminar» no significaría nada.
create or replace function public.reabrir_conversacion(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;
  if not public.puedo_ver_conversacion(_order_id) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

  if not exists (select 1 from public.orders o
                 where o.id = _order_id and o.chat_cerrado_en is not null) then
    return jsonb_build_object('abierta', true, 'ya_estaba', true);
  end if;

  update public.orders
     set chat_cerrado_en = null, chat_cerrado_por = null
   where id = _order_id;

  insert into public.conversation_messages (order_id, author_id, kind, body)
  values (_order_id, null, 'EVENTO', 'Conversación retomada');

  return jsonb_build_object('abierta', true, 'ya_estaba', false);
end;
$$;

-- ------------------------------------------------------------
-- No se escribe en una conversación terminada
-- ------------------------------------------------------------
-- Se comprueba DENTRO de `post_message` y no en la pantalla: si viviera en el
-- navegador, bastaría con tener la pestaña vieja abierta para seguir
-- escribiendo en un hilo que el equipo ya dio por cerrado.
create or replace function public.post_message(
  _order_id uuid,
  _project_id uuid,
  _body text,
  _internal boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_puede boolean := false;
  v_kind public.message_kind;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;
  if coalesce(trim(_body), '') = '' then
    raise exception 'VALIDATION: el mensaje no puede estar vacío' using errcode = '22023';
  end if;

  if _project_id is not null then
    v_puede := public.can_access_project(_project_id);
  elsif _order_id is not null then
    select (o.user_id = v_user_id
            or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
            or public.is_staff())
      into v_puede
    from public.orders o where o.id = _order_id;

    -- La conversación terminada no admite mensajes nuevos, de ningún lado.
    if exists (select 1 from public.orders o
               where o.id = _order_id and o.chat_cerrado_en is not null) then
      raise exception 'CHAT_CERRADO: esta conversación está terminada'
        using errcode = '22023';
    end if;
  end if;

  if not coalesce(v_puede, false) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

  -- Una nota interna solo puede escribirla el personal: si un cliente lo
  -- intenta, se degrada a mensaje normal en lugar de rechazarse, para no
  -- perder lo que escribió.
  if _internal and not public.is_staff() then
    _internal := false;
  end if;

  v_kind := (case when _internal then 'NOTA_INTERNA' else 'MENSAJE' end)::public.message_kind;

  insert into public.conversation_messages (order_id, project_id, author_id, kind, body)
  values (_order_id, _project_id, v_user_id, v_kind, trim(_body))
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Escalar: reabre si hacía falta y escribe, en una sola operación
-- ------------------------------------------------------------
-- Si fueran dos llamadas desde el navegador, un fallo entre medias dejaría la
-- conversación reabierta sin el mensaje que explica por qué.
create or replace function public.escalar_conversacion(_order_id uuid, _texto text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reabrir_conversacion(_order_id);
  return public.post_message(_order_id, null, _texto, false);
end;
$$;

-- ------------------------------------------------------------
-- El estado, para pintar el botón correcto
-- ------------------------------------------------------------
create or replace function public.estado_conversacion(_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.puedo_ver_conversacion(_order_id) then
    jsonb_build_object(
      'abierta', o.chat_cerrado_en is null,
      'cerrada_en', o.chat_cerrado_en,
      'numero', o.order_number
    )
  else null end
  from public.orders o
  where o.id = _order_id;
$$;

revoke all on function public.cerrar_conversacion(uuid) from public, anon;
revoke all on function public.reabrir_conversacion(uuid) from public, anon;
revoke all on function public.escalar_conversacion(uuid, text) from public, anon;
revoke all on function public.estado_conversacion(uuid) from public, anon;
grant execute on function public.cerrar_conversacion(uuid) to authenticated;
grant execute on function public.reabrir_conversacion(uuid) to authenticated;
grant execute on function public.escalar_conversacion(uuid, text) to authenticated;
grant execute on function public.estado_conversacion(uuid) to authenticated;

comment on function public.cerrar_conversacion(uuid) is
  'Da por terminada la conversación de un pedido. La puede cerrar cualquiera de '
  'los dos lados. No borra mensajes: impide escribir nuevos.';
comment on function public.post_message(uuid, uuid, text, boolean) is
  'Publica un mensaje. Se niega si la conversación del pedido está terminada; '
  'la comprobación vive aquí y no en la pantalla para que una pestaña vieja no '
  'pueda seguir escribiendo.';
