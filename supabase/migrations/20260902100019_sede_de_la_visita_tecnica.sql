-- ============================================================
-- La visita técnica queda con su sede
-- ============================================================
-- Última pieza del multi-sede. `technical_visits.location_id` existía desde
-- 20260902100016 pero quedaba SIEMPRE en null, así que las visitas se salían
-- del dominio: la agenda de un asesor de Barranquilla mostraba visitas de
-- Medellín.
--
-- No se podía derivar antes porque una visita cuelga de un proyecto y los
-- proyectos no tienen sede. Ahora se resuelve al PROGRAMARLA, que es el
-- momento en que alguien decide quién va.
--
-- Se añade `_location_id` con valor por defecto, así que las llamadas
-- existentes siguen funcionando y caen en la deducción por ciudad.

drop function if exists public.schedule_technical_visit(uuid, date, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.schedule_technical_visit(_project_id uuid, _fecha date, _hora text DEFAULT NULL::text, _technician_id uuid DEFAULT NULL::uuid, _direccion text DEFAULT NULL::text, _assistance_id uuid DEFAULT NULL::uuid, _location_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_visita uuid;
  v_dueno  uuid;
  v_dir    text;
  v_ciudad text;
  v_sede   uuid;
begin
  if not (public.is_admin() or public.has_permission('projects.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para programar visitas'
      using errcode = '42501';
  end if;

  if _fecha is null then
    raise exception 'BAD_DATE: la visita necesita fecha' using errcode = '22023';
  end if;

  select p.user_id, coalesce(nullif(trim(_direccion), ''), p.address, p.city), p.city
    into v_dueno, v_dir, v_ciudad
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

  -- ── Qué sede atiende la visita ──────────────────────────────────────
  -- Hasta ahora `technical_visits.location_id` quedaba siempre en null, así
  -- que las visitas se salían del dominio de sede: aparecían en la agenda de
  -- todo el mundo.
  --
  -- Se resuelve en TRES pasos, del dato más fiable al más débil:
  --   1. La sede que indique quien programa. Es una decisión explícita y
  --      manda sobre cualquier deducción.
  --   2. Si no la indicó, la sede activa en la CIUDAD del proyecto. Una obra
  --      en Medellín la atiende la tienda de Medellín; deducirlo es razonable
  --      y verificable, no inventado.
  --   3. Si el proyecto está en una ciudad sin tienda, se queda en null. NO se
  --      asigna «la más cercana»: eso sí sería inventar el dato, y una visita
  --      sin sede la siguen viendo todos, que es el comportamiento correcto
  --      mientras nadie decida quién la atiende.
  if _location_id is not null then
    -- Solo si quien programa puede ver esa sede. Si no, se ignora en lugar de
    -- fallar: la visita se programa igual y queda sin sede.
    select pl.id into v_sede
      from public.pickup_locations pl
     where pl.id = _location_id
       and pl.status = 'ACTIVO'
       and public.puede_ver_sede(pl.id);
  end if;

  if v_sede is null and v_ciudad is not null then
    select pl.id into v_sede
      from public.pickup_locations pl
      join public.municipalities m on m.code = pl.municipality_code
     where pl.status = 'ACTIVO'
       and public.normalizar_texto_mayusculas(m.name)
           = public.normalizar_texto_mayusculas(v_ciudad)
     order by pl.name
     limit 1;
  end if;

  insert into public.technical_visits (
    project_id, assistance_id, technician_id, scheduled_date, scheduled_time, address,
    location_id, status
  ) values (
    _project_id, _assistance_id, _technician_id, _fecha, nullif(trim(_hora), ''), v_dir,
    v_sede, 'PROGRAMADA'
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
$function$;

notify pgrst, 'reload schema';
