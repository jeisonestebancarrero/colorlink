-- ============================================================
-- Corrección: post_message no podía insertar ningún mensaje
-- ============================================================
-- El CASE que decide entre 'MENSAJE' y 'NOTA_INTERNA' devuelve `text`, y la
-- columna es del tipo enum `message_kind`. PostgreSQL no hace esa conversión
-- de forma implícita, así que TODA llamada fallaba con:
--   column "kind" is of type public.message_kind but expression is of type text
--
-- El resultado era que la trazabilidad automática (que inserta directo en la
-- tabla) sí funcionaba, pero nadie podía escribir un mensaje: el chatter
-- parecía funcionar y estaba roto.
-- ============================================================

create or replace function public.post_message(
  _order_id uuid, _project_id uuid, _body text, _internal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
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

  -- El cast explícito es lo que faltaba.
  v_kind := (case when _internal then 'NOTA_INTERNA' else 'MENSAJE' end)::public.message_kind;

  insert into public.conversation_messages (order_id, project_id, author_id, kind, body)
  values (_order_id, _project_id, v_user_id, v_kind, trim(_body))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.post_message(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.post_message(uuid, uuid, text, boolean) to authenticated;
