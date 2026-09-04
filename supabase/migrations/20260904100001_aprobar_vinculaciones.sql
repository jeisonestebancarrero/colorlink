-- ============================================================
-- Aprobar la vinculación de un empleado a su empresa
-- ============================================================
-- `resolve_join_request` existe desde el 30 de agosto (20260830100002) y hasta
-- hoy tenía CERO usos: la solicitud se creaba sola en el alta y no había una
-- sola pantalla para resolverla. El segundo comprador de una constructora se
-- registraba, leía «tu vinculación quedó pendiente de aprobación» y ahí se
-- quedaba para siempre, porque del otro lado no existía dónde aprobarla.
--
-- Antes de poder dibujar esa pantalla falta un dato: QUIÉN está pidiendo
-- entrar. `profiles` solo se deja leer por su propio dueño, por compañeros de
-- la MISMA empresa y por el personal interno (20260829154035); quien solicita
-- todavía no es compañero de nadie —su `company_id` es null hasta que lo
-- aprueben—. El dueño de la cuenta empresarial veía la fila de la solicitud
-- con un `user_id` y nada más. Aprobar a ciegas un uuid no es aprobar.
--
-- Por eso el listado se sirve desde una función SECURITY DEFINER con su propia
-- guarda y NO desde una vista con `security_invoker`: la vista invocante le
-- devolvería el nombre en blanco justo a quien tiene que decidir. La guarda es
-- literalmente la misma que ya aplica `resolve_join_request`, así que la
-- pantalla no puede mostrar ni una solicitud que su usuario no pueda resolver.
-- ============================================================

create or replace function public.solicitudes_de_vinculacion()
returns table (
  id           uuid,
  company_id   uuid,
  empresa      text,
  empresa_nit  text,
  solicitante  uuid,
  nombre       text,
  email        text,
  telefono     text,
  ciudad       text,
  nit_escrito  text,
  estado       public.join_request_status,
  creada       timestamptz,
  resuelta     timestamptz,
  resuelta_por text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    s.id,
    s.company_id,
    c.name,
    c.nit,
    s.user_id,
    -- Un perfil recién creado puede tener el apellido vacío; concatenar sin
    -- limpiar dejaba nombres terminados en espacio y tarjetas con la inicial
    -- equivocada.
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    p.email,
    p.phone,
    p.city,
    s.requested_nit,
    s.status,
    s.created_at,
    s.resolved_at,
    nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '')
  from public.company_join_requests s
  join public.companies c on c.id = s.company_id
  join public.profiles  p on p.id = s.user_id
  left join public.profiles r on r.id = s.resolved_by
  where
    -- El administrador de la plataforma, para destrabar soporte: una empresa
    -- cuyo OWNER nunca volvió a entrar acumula solicitudes que nadie más
    -- podría resolver.
    public.is_admin()
    or exists (
      select 1
        from public.company_members m
       where m.company_id = s.company_id
         and m.user_id = auth.uid()
         and m.company_role in ('OWNER', 'ADMIN')
         and m.status = 'ACTIVO'
    )
  -- Lo pendiente primero: es lo único sobre lo que hay que actuar.
  order by (s.status = 'PENDIENTE') desc, s.created_at desc;
$$;

comment on function public.solicitudes_de_vinculacion() is
  'Solicitudes de vinculación que quien pregunta puede resolver, con el nombre y '
  'el correo de quien las pide. Misma guarda que resolve_join_request().';

revoke all on function public.solicitudes_de_vinculacion() from public, anon;
grant execute on function public.solicitudes_de_vinculacion() to authenticated;

-- ============================================================
-- Dos correcciones en `resolve_join_request`
-- ============================================================
-- 1. Exigía `company_role in ('OWNER','ADMIN')` pero NO miraba el `status` del
--    vínculo. A quien fue dado de baja de la empresa le quedaba la fila en
--    `company_members` con status INACTIVO, y con ella la potestad de seguir
--    metiendo gente en una empresa de la que ya no hace parte.
-- 2. `on conflict do nothing` al insertar el miembro: si esa persona ya había
--    pertenecido a la empresa y la desactivaron, aprobar no hacía nada y la
--    dejaba INACTIVA. La solicitud quedaba APROBADA y la persona seguía sin
--    entrar — el peor de los dos mundos, porque ya nadie vuelve a mirarla.
--
-- El resto del cuerpo es idéntico al original.
-- ============================================================

create or replace function public.resolve_join_request(
  _request_id uuid,
  _aprobar    boolean
)
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
  if v_sol.status <> 'PENDIENTE' then
    raise exception 'ALREADY_RESOLVED: esta solicitud ya fue resuelta' using errcode = '23505';
  end if;

  -- Solo el dueño/administrador ACTIVO de ESA empresa decide. Un administrador
  -- de la plataforma también, para poder destrabar casos de soporte.
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
    raise exception 'FORBIDDEN: no puedes resolver solicitudes de esta empresa'
      using errcode = '42501';
  end if;

  update public.company_join_requests
     set status = case when _aprobar then 'APROBADA' else 'RECHAZADA' end::public.join_request_status,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = _request_id;

  if _aprobar then
    -- `do update set status` y NO el rol: si esa persona ya era OWNER de la
    -- empresa, reaprobarla no puede degradarla a MEMBER.
    insert into public.company_members (company_id, user_id, company_role)
    values (v_sol.company_id, v_sol.user_id, 'MEMBER')
    on conflict (company_id, user_id) do update
      set status = 'ACTIVO'::public.user_status;

    update public.profiles set company_id = v_sol.company_id where id = v_sol.user_id;

    insert into public.user_roles (user_id, role, company_id)
    values (v_sol.user_id, 'CLIENTE_B2B', v_sol.company_id)
    on conflict on constraint user_roles_unicos do nothing;
  end if;

  insert into public.notifications (user_id, title, message, type)
  values (
    v_sol.user_id,
    case when _aprobar then 'Vinculación aprobada' else 'Vinculación rechazada' end,
    case when _aprobar
         then 'Ya haces parte de la cuenta empresarial. Puedes ver sus proyectos y precios.'
         else 'El administrador de la cuenta empresarial no aprobó tu vinculación. Escríbenos si crees que es un error.'
    end,
    case when _aprobar then 'success' else 'alert' end::public.notification_type
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(),
          case when _aprobar then 'JOIN_REQUEST_APPROVED' else 'JOIN_REQUEST_REJECTED' end,
          'company_join_requests', _request_id,
          jsonb_build_object('company_id', v_sol.company_id, 'user_id', v_sol.user_id));
end;
$$;

revoke all on function public.resolve_join_request(uuid, boolean) from public, anon;
grant execute on function public.resolve_join_request(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
