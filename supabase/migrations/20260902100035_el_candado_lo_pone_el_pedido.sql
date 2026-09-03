-- ============================================================
-- Quien cierra la conversación es el PEDIDO, no el chat
-- ============================================================
-- Corrige la migración anterior (20260902100034), donde entendí al revés la
-- regla del negocio.
--
-- LO QUE HICE MAL: «terminar chat» bloqueaba la conversación para siempre. Eso
-- significa que un asesor —o el propio cliente por error— podía dejar sin voz
-- a alguien que tiene un pedido EN CURSO. Un cliente con mercancía por llegar
-- siempre tiene que poder escribir; cortarle el canal es lo peor que puede
-- hacer un sistema de pedidos.
--
-- LO CORRECTO:
--
--   · Mientras el pedido está VIVO (pendiente, confirmado, preparando, enviado,
--     listo para retiro), la conversación NO se puede cerrar. Terminar solo da
--     por atendida la charla del momento: la burbuja vuelve al asistente y el
--     hilo sigue disponible desde el pedido.
--
--   · Cuando el pedido TERMINA —entregado o cancelado— la conversación se
--     cierra sola. Ahí sí deja de tener sentido escribir: el asunto se acabó,
--     y lo que venga después es un caso nuevo.
--
-- Así el candado lo pone un hecho del negocio y no el humor de quien esté
-- atendiendo.

-- ------------------------------------------------------------
-- ¿Está vivo el pedido?
-- ------------------------------------------------------------
create or replace function public.pedido_en_curso(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.id = _order_id
      and o.status not in ('ENTREGADO', 'CANCELADO')
  );
$$;

comment on function public.pedido_en_curso(uuid) is
  'El pedido sigue vivo. Mientras lo esté, su conversación no se puede cerrar: '
  'un cliente con mercancía por llegar siempre tiene que poder escribir.';

-- ------------------------------------------------------------
-- Escribir: manda el estado del PEDIDO
-- ------------------------------------------------------------
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
  v_estado public.order_status;
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
    select o.status,
           (o.user_id = v_user_id
            or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
            or public.is_staff())
      into v_estado, v_puede
    from public.orders o where o.id = _order_id;

    -- El único motivo para no dejar escribir es que el PEDIDO haya terminado.
    -- Antes se miraba `chat_cerrado_en`, y eso permitía dejar mudo a un cliente
    -- con un pedido en curso.
    if v_estado in ('ENTREGADO', 'CANCELADO') then
      raise exception 'PEDIDO_CERRADO: el pedido % ya terminó; esta conversación quedó cerrada',
        (select order_number from public.orders where id = _order_id)
        using errcode = '22023';
    end if;
  end if;

  if not coalesce(v_puede, false) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

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
-- «Terminar» pasa a significar «dar por atendida»
-- ------------------------------------------------------------
-- Ya no bloquea nada mientras el pedido siga vivo: cierra la atención del
-- momento. Sirve para que el equipo sepa qué hilos siguen pendientes y para
-- que la burbuja vuelva al asistente, sin quitarle la voz a nadie.
create or replace function public.cerrar_conversacion(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
  v_soy_equipo boolean;
  v_en_curso boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;
  if not public.puedo_ver_conversacion(_order_id) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

  v_en_curso := public.pedido_en_curso(_order_id);

  if exists (select 1 from public.orders o
             where o.id = _order_id and o.chat_cerrado_en is not null) then
    return jsonb_build_object('cerrada', true, 'ya_estaba', true, 'se_puede_seguir', v_en_curso);
  end if;

  update public.orders
     set chat_cerrado_en = now(),
         chat_cerrado_por = (select auth.uid())
   where id = _order_id;

  v_soy_equipo := public.is_staff()
    and not public.es_del_lado_del_cliente(_order_id, (select auth.uid()));
  v_quien := coalesce(public.nombre_de_quien_edita(), 'alguien');

  insert into public.conversation_messages (order_id, author_id, kind, body)
  values (_order_id, null, 'EVENTO',
          'Conversación dada por atendida por ' ||
          case when v_soy_equipo then 'el equipo (' || v_quien || ')' else 'el cliente' end ||
          case when v_en_curso then '. El pedido sigue en curso: se puede seguir escribiendo desde el pedido.'
               else '.' end);

  return jsonb_build_object(
    'cerrada', true,
    'ya_estaba', false,
    -- Lo que la pantalla necesita saber para no mentirle a nadie.
    'se_puede_seguir', v_en_curso);
end;
$$;

-- ------------------------------------------------------------
-- El estado que pinta las pantallas
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
      'numero', o.order_number,
      'estado_pedido', o.status::text,
      -- Se puede escribir mientras el PEDIDO esté vivo. Es lo único que manda.
      'se_puede_escribir', o.status not in ('ENTREGADO', 'CANCELADO'),
      -- «Atendida» es otra cosa: alguien la dio por resuelta. No impide nada,
      -- solo sirve para saber qué queda pendiente y para cerrar la burbuja.
      'atendida', o.chat_cerrado_en is not null,
      'atendida_en', o.chat_cerrado_en
    )
  else null end
  from public.orders o
  where o.id = _order_id;
$$;

-- Escribir vuelve a abrir la atención: si alguien escribe, es que no estaba
-- resuelto. Aquí sí es automático, al revés que antes, porque «atendida» no
-- bloquea a nadie y dejarla marcada escondería un hilo que sigue vivo.
create or replace function public.marcar_conversacion_atendida_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_id is not null and new.kind = 'MENSAJE' then
    update public.orders
       set chat_cerrado_en = null, chat_cerrado_por = null
     where id = new.order_id and chat_cerrado_en is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_messages_reabrir on public.conversation_messages;
create trigger conversation_messages_reabrir
  after insert on public.conversation_messages
  for each row execute function public.marcar_conversacion_atendida_off();

comment on function public.cerrar_conversacion(uuid) is
  'Da por ATENDIDA la conversación. No bloquea la escritura: mientras el pedido '
  'siga en curso se puede seguir escribiendo desde el pedido. Lo que cierra de '
  'verdad la conversación es que el pedido llegue a ENTREGADO o CANCELADO.';
