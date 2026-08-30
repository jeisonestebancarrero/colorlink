-- ============================================================
-- Proyectos y visitas técnicas — back-office
-- ============================================================

-- ------------------------------------------------------------
-- 1. El permiso "Proyectos" tenía que servir para algo
-- ------------------------------------------------------------
-- `can_access_project` reconocía al dueño, a su empresa, al asesor, al
-- administrador y al técnico asignado — pero ignoraba por completo el permiso
-- `projects.read`. Resultado: el administrador podía conceder la aplicación
-- Proyectos a Gerencia desde la pantalla de permisos, el módulo le aparecía
-- en el tablero, y al entrar no veía ni un proyecto. El botón mentía.
create or replace function public.can_access_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = _project_id
      and (
        p.user_id = (select auth.uid())                              -- dueño
        or (p.company_id is not null
            and p.company_id in (select public.my_company_ids()))     -- su empresa
        or public.has_role('ASESOR')                                 -- asesoría
        or public.is_admin()                                         -- administración
        or public.is_assigned_to_project(p.id)                       -- técnico asignado
        or public.has_permission('projects.read')                    -- permiso concedido
      )
  );
$$;

-- ------------------------------------------------------------
-- 2. Rastro de quién asignó y quién diagnosticó
-- ------------------------------------------------------------
-- Sin clave foránea hacia `profiles`, PostgREST no puede traer el nombre de
-- la persona junto con la fila y la pantalla solo podría mostrar un UUID.
alter table public.project_assignments
  add constraint project_assignments_assigned_by_profile
  foreign key (assigned_by) references public.profiles (id) on delete set null;

alter table public.project_diagnoses
  add constraint project_diagnoses_responsable_profile
  foreign key (responsible_user_id) references public.profiles (id) on delete set null;

-- ------------------------------------------------------------
-- 3. Asignar un técnico o asesor a un proyecto
-- ------------------------------------------------------------
create or replace function public.assign_to_project(
  _project_id uuid,
  _user_id    uuid,
  _rol        text default 'TECNICO'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol public.assignment_role;
begin
  if not (public.is_admin() or public.has_permission('projects.assign')) then
    raise exception 'FORBIDDEN: no tienes permiso para asignar proyectos'
      using errcode = '42501';
  end if;

  if _rol not in ('TECNICO', 'ASESOR') then
    raise exception 'BAD_ROLE: el rol de asignación debe ser TECNICO o ASESOR'
      using errcode = '22023';
  end if;
  v_rol := _rol::public.assignment_role;

  -- Solo se asigna a personal interno: un cliente no atiende obras ajenas, y
  -- asignarlo le abriría el proyecto de otro.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role in ('ASESOR','TECNICO','ADMINISTRADOR','SERVICIO_CLIENTE','GERENCIA')
  ) then
    raise exception 'NOT_STAFF: solo se puede asignar personal interno al proyecto'
      using errcode = '42501';
  end if;

  insert into public.project_assignments (project_id, user_id, assignment_role, assigned_by)
  values (_project_id, _user_id, v_rol, (select auth.uid()))
  on conflict (project_id, user_id) do update
    set assignment_role = excluded.assignment_role,
        assigned_by     = excluded.assigned_by,
        assigned_at     = now();

  insert into public.notifications (user_id, project_id, title, message, type)
  values (
    _user_id, _project_id, 'Proyecto asignado',
    'Te asignaron un proyecto. Revísalo en el portal interno.',
    'info'::public.notification_type
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PROJECT_ASSIGNED', 'projects', _project_id,
          jsonb_build_object('asignado_a', _user_id, 'rol', _rol));
end;
$$;

create or replace function public.unassign_from_project(
  _project_id uuid,
  _user_id    uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_permission('projects.assign')) then
    raise exception 'FORBIDDEN: no tienes permiso para asignar proyectos'
      using errcode = '42501';
  end if;

  delete from public.project_assignments
   where project_id = _project_id and user_id = _user_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PROJECT_UNASSIGNED', 'projects', _project_id,
          jsonb_build_object('retirado', _user_id));
end;
$$;

revoke all on function public.assign_to_project(uuid, uuid, text) from public, anon;
revoke all on function public.unassign_from_project(uuid, uuid) from public, anon;
grant execute on function public.assign_to_project(uuid, uuid, text) to authenticated;
grant execute on function public.unassign_from_project(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Cambiar el estado de un proyecto
-- ------------------------------------------------------------
create or replace function public.set_project_status(
  _project_id uuid,
  _estado     text,
  _nota       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.project_status;
  v_dueno  uuid;
begin
  if not (public.is_admin() or public.has_permission('projects.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar proyectos'
      using errcode = '42501';
  end if;

  if _estado not in ('PENDIENTE','EN_ANALISIS','EN_PROCESO','REQUIERE_INFORMACION','COMPLETADO','CANCELADO') then
    raise exception 'BAD_STATUS: estado de proyecto no válido' using errcode = '22023';
  end if;
  v_estado := _estado::public.project_status;

  update public.projects
     set status = v_estado,
         completed_at = case when v_estado = 'COMPLETADO' then now() else completed_at end,
         next_recommended_action = coalesce(nullif(trim(_nota), ''), next_recommended_action)
   where id = _project_id
   returning user_id into v_dueno;

  if v_dueno is null then
    raise exception 'NOT_FOUND: proyecto no encontrado' using errcode = 'P0002';
  end if;

  -- El cliente se entera del cambio sin tener que preguntar.
  insert into public.notifications (user_id, project_id, title, message, type)
  values (
    v_dueno, _project_id, 'Tu proyecto cambió de estado',
    'Estado actual: ' || replace(_estado, '_', ' ') ||
      coalesce('. ' || nullif(trim(_nota), ''), ''),
    case when v_estado = 'COMPLETADO' then 'success' else 'update' end::public.notification_type
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PROJECT_STATUS', 'projects', _project_id,
          jsonb_build_object('estado', _estado));
end;
$$;

revoke all on function public.set_project_status(uuid, text, text) from public, anon;
grant execute on function public.set_project_status(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Visitas técnicas: programar, reprogramar y cerrar
-- ------------------------------------------------------------
-- Se hace por función y no con UPDATE directo porque cada movimiento tiene
-- efectos que no pueden quedar al criterio de la pantalla: avisar al cliente,
-- mover el estado de la solicitud de acompañamiento y dejar auditoría. Si eso
-- viviera en el navegador, bastaría con no llamarlo para que el cliente nunca
-- se entere de que le programaron una visita a su obra.
create or replace function public.schedule_technical_visit(
  _project_id    uuid,
  _fecha         date,
  _hora          text default null,
  _technician_id uuid default null,
  _direccion     text default null,
  _assistance_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visita uuid;
  v_dueno  uuid;
  v_dir    text;
begin
  if not (public.is_admin() or public.has_permission('projects.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para programar visitas'
      using errcode = '42501';
  end if;

  if _fecha is null then
    raise exception 'BAD_DATE: la visita necesita fecha' using errcode = '22023';
  end if;

  select p.user_id, coalesce(nullif(trim(_direccion), ''), p.address, p.city)
    into v_dueno, v_dir
  from public.projects p where p.id = _project_id;

  if v_dueno is null then
    raise exception 'NOT_FOUND: proyecto no encontrado' using errcode = 'P0002';
  end if;

  if _technician_id is not null and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = _technician_id and ur.role in ('TECNICO','ASESOR','ADMINISTRADOR')
  ) then
    raise exception 'NOT_STAFF: el responsable de la visita debe ser personal técnico'
      using errcode = '42501';
  end if;

  insert into public.technical_visits (
    project_id, assistance_id, technician_id, scheduled_date, scheduled_time, address, status
  ) values (
    _project_id, _assistance_id, _technician_id, _fecha, nullif(trim(_hora), ''), v_dir,
    'PROGRAMADA'
  )
  returning id into v_visita;

  -- Quien va a la obra queda asignado al proyecto: si no, no podría abrirlo.
  if _technician_id is not null then
    insert into public.project_assignments (project_id, user_id, assignment_role, assigned_by)
    values (_project_id, _technician_id, 'TECNICO', (select auth.uid()))
    on conflict (project_id, user_id) do nothing;

    insert into public.notifications (user_id, project_id, title, message, type)
    values (_technician_id, _project_id, 'Visita técnica asignada',
            'Tienes una visita programada para el ' || to_char(_fecha, 'DD/MM/YYYY') ||
              coalesce(' a las ' || nullif(trim(_hora), ''), '') || '.',
            'info'::public.notification_type);
  end if;

  if _assistance_id is not null then
    update public.technical_assistance
       set status = 'PROGRAMADO', scheduled_date = _fecha
     where id = _assistance_id;
  end if;

  insert into public.notifications (user_id, project_id, title, message, type)
  values (v_dueno, _project_id, 'Visita técnica programada',
          'Un especialista Pintuco visitará tu obra el ' || to_char(_fecha, 'DD/MM/YYYY') ||
            coalesce(' a las ' || nullif(trim(_hora), ''), '') || '.',
          'update'::public.notification_type);

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'VISIT_SCHEDULED', 'technical_visits', v_visita,
          jsonb_build_object('project_id', _project_id, 'fecha', _fecha));

  return v_visita;
end;
$$;

create or replace function public.update_technical_visit(
  _visit_id      uuid,
  _estado        text,
  _resultado     text default null,
  _observaciones text default null,
  _fecha         date default null,
  _hora          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visita public.technical_visits%rowtype;
  v_dueno  uuid;
  v_estado public.visit_status;
begin
  if not (public.is_admin() or public.has_permission('projects.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar visitas'
      using errcode = '42501';
  end if;

  if _estado not in ('PROGRAMADA','CONFIRMADA','EN_CURSO','REALIZADA','CANCELADA','REPROGRAMADA') then
    raise exception 'BAD_STATUS: estado de visita no válido' using errcode = '22023';
  end if;
  v_estado := _estado::public.visit_status;

  select * into v_visita from public.technical_visits where id = _visit_id;
  if v_visita.id is null then
    raise exception 'NOT_FOUND: visita no encontrada' using errcode = 'P0002';
  end if;

  -- Una visita realizada sin informe no sirve de nada: es la única prueba de
  -- qué se encontró en la obra.
  if v_estado = 'REALIZADA' and coalesce(trim(_resultado), '') = '' then
    raise exception 'RESULT_REQUIRED: para cerrar la visita hay que registrar el resultado'
      using errcode = '22023';
  end if;

  update public.technical_visits
     set status         = v_estado,
         result         = coalesce(nullif(trim(_resultado), ''), result),
         observations   = coalesce(nullif(trim(_observaciones), ''), observations),
         scheduled_date = coalesce(_fecha, scheduled_date),
         scheduled_time = coalesce(nullif(trim(_hora), ''), scheduled_time),
         updated_at     = now()
   where id = _visit_id;

  select user_id into v_dueno from public.projects where id = v_visita.project_id;

  if v_visita.assistance_id is not null then
    update public.technical_assistance
       set status = case
             when v_estado = 'EN_CURSO'  then 'EN_VISITA'
             when v_estado = 'REALIZADA' then 'INFORME_EMITIDO'
             when v_estado = 'CANCELADA' then 'CANCELADO'
             else status
           end::public.assistance_status,
           observations = coalesce(nullif(trim(_resultado), ''), observations),
           closed_at = case when v_estado = 'REALIZADA' then now() else closed_at end
     where id = v_visita.assistance_id;
  end if;

  if v_dueno is not null and v_estado in ('REALIZADA', 'CANCELADA', 'REPROGRAMADA') then
    insert into public.notifications (user_id, project_id, title, message, type)
    values (
      v_dueno, v_visita.project_id,
      case v_estado
        when 'REALIZADA'    then 'Informe de visita técnica'
        when 'CANCELADA'    then 'Visita técnica cancelada'
        else 'Visita técnica reprogramada'
      end,
      coalesce(nullif(trim(_resultado), ''), 'Consulta el detalle en tu proyecto.'),
      case when v_estado = 'REALIZADA' then 'success' else 'update' end::public.notification_type
    );
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'VISIT_' || _estado, 'technical_visits', _visit_id,
          jsonb_build_object('project_id', v_visita.project_id));
end;
$$;

revoke all on function public.schedule_technical_visit(uuid, date, text, uuid, text, uuid) from public, anon;
revoke all on function public.update_technical_visit(uuid, text, text, text, date, text) from public, anon;
grant execute on function public.schedule_technical_visit(uuid, date, text, uuid, text, uuid) to authenticated;
grant execute on function public.update_technical_visit(uuid, text, text, text, date, text) to authenticated;
