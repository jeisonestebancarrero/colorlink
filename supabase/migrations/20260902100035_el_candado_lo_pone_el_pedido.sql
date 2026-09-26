-- Corrige la 20260902100034: cerrar el chat no puede silenciar a un cliente con pedido
-- en curso. Mientras el pedido esté vivo, «terminar» solo marca atendida; al entregarse
-- o cancelarse, la conversación se cierra sola.

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

    -- Solo un pedido terminado impide escribir; chat_cerrado_en ya no bloquea.
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

-- «Terminar» marca la atención como resuelta sin bloquear: sirve para saber qué
-- queda pendiente y devolver la burbuja al asistente.
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
    'se_puede_seguir', v_en_curso);
end;
$$;

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
      'se_puede_escribir', o.status not in ('ENTREGADO', 'CANCELADO'),
      -- «Atendida» no bloquea; solo indica qué queda pendiente.
      'atendida', o.chat_cerrado_en is not null,
      'atendida_en', o.chat_cerrado_en
    )
  else null end
  from public.orders o
  where o.id = _order_id;
$$;

-- Un mensaje nuevo reabre la atención: si alguien escribe, no estaba resuelto.
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
