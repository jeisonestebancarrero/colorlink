-- ============================================================
-- Reabrir una vinculación rechazada
-- ============================================================
-- Al construir la pantalla de aprobación (20260904100001) quedó a la vista un
-- callejón sin salida: rechazar era DEFINITIVO. La solicitud solo la crea el
-- disparador de alta, así que quien fuera rechazado por error —o quien de
-- verdad entrara a trabajar en la empresa un mes después— no tenía forma de
-- volver a pedirlo: había que entrar a la base a vincularlo a mano.
--
-- Reabrir devuelve la solicitud a PENDIENTE en lugar de crear una nueva. Así
-- la fila conserva su fecha original y su historia: quedan en `audit_logs` el
-- rechazo, la reapertura y la decisión final, en ese orden. Crear una fila
-- nueva borraría de la vista que a esa persona ya la habían rechazado antes,
-- que es justo el contexto que necesita quien vuelve a decidir.
--
-- Quién puede: exactamente los mismos que pueden resolverla. Reabrir es un
-- paso del mismo trámite, no una potestad aparte.
-- ============================================================

create or replace function public.reabrir_join_request(_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sol public.company_join_requests%rowtype;
begin
  select * into v_sol from public.company_join_requests where id = _request_id;
  if v_sol.id is null then
    raise exception 'REQUEST_NOT_FOUND: solicitud no encontrada' using errcode = 'P0002';
  end if;

  -- Una APROBADA no se reabre: para sacar a alguien de la empresa está la
  -- baja del miembro, no deshacer su vinculación por la puerta de atrás.
  if v_sol.status <> 'RECHAZADA' then
    raise exception 'NOT_REJECTED: solo se puede reabrir una solicitud rechazada'
      using errcode = '22023';
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1 from public.company_members m
      where m.company_id = v_sol.company_id
        and m.user_id = auth.uid()
        and m.company_role in ('OWNER', 'ADMIN')
        and m.status = 'ACTIVO'
    )
  ) then
    raise exception 'FORBIDDEN: no puedes reabrir solicitudes de esta empresa'
      using errcode = '42501';
  end if;

  -- Ya es de la empresa: reabrir no aportaría nada y dejaría una solicitud
  -- pendiente imposible de entender en la pantalla de quien aprueba.
  if exists (
    select 1 from public.company_members m
    where m.company_id = v_sol.company_id
      and m.user_id = v_sol.user_id
      and m.status = 'ACTIVO'
  ) then
    raise exception 'ALREADY_MEMBER: esta persona ya hace parte de la empresa'
      using errcode = '23505';
  end if;

  -- `solicitud_vinculacion_unica` solo deja una PENDIENTE viva por persona y
  -- empresa. Sin esta comprobación el UPDATE reventaría con una violación de
  -- índice en crudo en lugar de una frase que se pueda leer.
  if exists (
    select 1 from public.company_join_requests o
    where o.company_id = v_sol.company_id
      and o.user_id = v_sol.user_id
      and o.status = 'PENDIENTE'
  ) then
    raise exception 'ALREADY_PENDING: esta persona ya tiene una solicitud pendiente'
      using errcode = '23505';
  end if;

  -- La fecha de creación NO se toca: la solicitud es la misma y se pidió
  -- cuando se pidió. `resolved_by` y `resolved_at` sí se limpian, o el
  -- historial mostraría un rechazo que ya no está vigente.
  update public.company_join_requests
     set status      = 'PENDIENTE'::public.join_request_status,
         resolved_by = null,
         resolved_at = null
   where id = _request_id;

  insert into public.notifications (user_id, title, message, type)
  values (
    v_sol.user_id,
    'Tu vinculación se está revisando de nuevo',
    'La cuenta empresarial volvió a abrir tu solicitud. Te avisamos cuando haya una decisión.',
    'info'::public.notification_type
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'JOIN_REQUEST_REOPENED',
          'company_join_requests', _request_id,
          jsonb_build_object('company_id', v_sol.company_id, 'user_id', v_sol.user_id));
end;
$$;

comment on function public.reabrir_join_request(uuid) is
  'Devuelve a PENDIENTE una solicitud de vinculación rechazada. Misma guarda '
  'que resolve_join_request(); conserva la fila y su fecha original.';

revoke all on function public.reabrir_join_request(uuid) from public, anon;
grant execute on function public.reabrir_join_request(uuid) to authenticated;

notify pgrst, 'reload schema';
