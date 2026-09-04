-- ============================================================
-- `create_project` calcula el diagnóstico en vez de creérselo
-- ============================================================
-- Complementa a 20260904100004. El motor ya vive en la base; aquí se corta la
-- vía por la que el navegador dictaba el resultado.
-- ============================================================

-- ------------------------------------------------------------
-- La ruta de solución con la que nace todo proyecto
-- ------------------------------------------------------------
-- Son siete pasos fijos, portados del motor del navegador tal cual estaban.
-- No dependen del diagnóstico ni del catálogo: describen el recorrido del
-- servicio, no la obra.
create or replace function public.cronologia_inicial()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_build_object('step_number', 1, 'title', 'Necesidad registrada',
      'description', 'Proyecto registrado en ColorLink con parámetros de área, sustrato y fotos.',
      'status', 'completed', 'responsible', 'Cliente (Portal Digital)'),
    jsonb_build_object('step_number', 2, 'title', 'Diagnóstico preliminar',
      'description', 'Clasificación de patologías y estimación técnica preliminar completada.',
      'status', 'completed', 'responsible', 'Motor de Diagnóstico ColorLink'),
    jsonb_build_object('step_number', 3, 'title', 'Análisis técnico en curso',
      'description', 'Revisión por especialista técnico de Pintuco para validar compatibilidad.',
      'status', 'current', 'responsible', 'Departamento Técnico Pintuco'),
    jsonb_build_object('step_number', 4, 'title', 'Solución y sistema recomendado',
      'description', 'Especificación de productos, esquema de manos y preparación de obra.',
      'status', 'upcoming', 'responsible', 'Especificación Técnica Pintuco'),
    jsonb_build_object('step_number', 5, 'title', 'Materiales & Disponibilidad',
      'description', 'Cálculo de volumen y verificación de stock con distribuidor autorizado.',
      'status', 'upcoming', 'responsible', 'Canal Comercial Pintuco'),
    jsonb_build_object('step_number', 6, 'title', 'Acompañamiento técnico en obra',
      'description', 'Visita de asesoría técnica y verificación de aplicación en terreno.',
      'status', 'upcoming', 'responsible', 'Servicio Técnico en Campo'),
    jsonb_build_object('step_number', 7, 'title', 'Garantía y finalización',
      'description', 'Certificado de garantía de recubrimiento Pintuco emitido.',
      'status', 'upcoming', 'responsible', 'Calidad & Satisfacción Pintuco')
  );
$$;

revoke all on function public.cronologia_inicial() from public, anon;
grant execute on function public.cronologia_inicial() to authenticated;

create or replace function public.create_project(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diag       jsonb;
  v_user_id    uuid := (select auth.uid());
  v_company_id uuid;
  v_project_id uuid;
  v_surface_id uuid;
  v_condicion  text;
  v_paso       jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada'
      using errcode = '28000';
  end if;

  if coalesce(trim(_payload ->> 'name'), '') = '' then
    raise exception 'VALIDATION: el nombre del proyecto es obligatorio'
      using errcode = '22023';
  end if;

  if (_payload ->> 'area_m2') is not null
     and (_payload ->> 'area_m2')::numeric <= 0 then
    raise exception 'VALIDATION: el área debe ser mayor que cero'
      using errcode = '22023';
  end if;

  -- La empresa NO se acepta del cliente: se toma del perfil del usuario.
  select p.company_id into v_company_id
  from public.profiles p
  where p.id = v_user_id;

  -- ---------- 1. Proyecto ----------
  insert into public.projects (
    user_id, company_id, name, description, city, address, project_type,
    area_m2, required_date, surface, environment, current_color,
    selected_color, custom_condition, status, current_step_progress,
    next_recommended_action
  )
  values (
    v_user_id,
    v_company_id,
    trim(_payload ->> 'name'),
    _payload ->> 'description',
    _payload ->> 'city',
    _payload ->> 'address',
    coalesce((_payload ->> 'project_type')::public.project_type, 'Otro'),
    nullif(_payload ->> 'area_m2', '')::numeric,
    _payload ->> 'required_date',
    _payload ->> 'surface',
    nullif(_payload ->> 'environment', '')::public.environment_type,
    _payload ->> 'current_color',
    _payload -> 'selected_color',
    _payload ->> 'custom_condition',
    -- Un proyecto recién creado entra en análisis, nunca en un estado
    -- avanzado elegido por el cliente.
    'EN_ANALISIS',
    3,
    _payload -> 'next_recommended_action'
  )
  returning id into v_project_id;

  -- ---------- 2. Superficie principal ----------
  if coalesce(_payload ->> 'surface', '') <> '' then
    select s.id into v_surface_id
    from public.surfaces s
    where s.name = (_payload ->> 'surface')
    limit 1;

    insert into public.project_surfaces (
      project_id, surface_id, label, area_m2, environment
    ) values (
      v_project_id,
      v_surface_id,
      _payload ->> 'surface',
      nullif(_payload ->> 'area_m2', '')::numeric,
      nullif(_payload ->> 'environment', '')::public.environment_type
    );
  end if;

  -- ---------- 3. Patologías ----------
  for v_condicion in
    select jsonb_array_elements_text(coalesce(_payload -> 'conditions', '[]'::jsonb))
  loop
    insert into public.project_pathologies (project_id, pathology_id, severity)
    select v_project_id, pa.id, pa.severity
    from public.pathologies pa
    where pa.name = v_condicion
    on conflict on constraint project_pathologies_unica do nothing;
  end loop;

  -- ---------- 4. Diagnóstico preliminar ----------
  -- SE CALCULA AQUÍ. Antes se guardaba `_payload -> 'diagnosis'` tal como
  -- llegara del navegador: cualquiera con la consola abierta podía fijarse su
  -- nivel de atención, sus productos y su presupuesto, y quedaba registrado
  -- como si lo hubiera dictado el sistema. Lo que mande el cliente en esa
  -- clave se ignora por completo.
  v_diag := public.diagnosticar_proyecto(_payload);

  insert into public.project_diagnoses (
    project_id, kind, solution_category, attention_level,
    requires_technical_visit, key_considerations, missing_information,
    ai_summary, technical_summary, disclaimer,
    recommended_products, budget_summary, responsible_user_id
  ) values (
    v_project_id,
    'PRELIMINAR',
    v_diag ->> 'solution_category',
    nullif(v_diag ->> 'attention_level', '')::public.attention_level,
    coalesce((v_diag ->> 'requires_technical_visit')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(v_diag -> 'key_considerations')), '{}'),
    coalesce(array(select jsonb_array_elements_text(v_diag -> 'missing_information')), '{}'),
    v_diag ->> 'ai_summary',
    v_diag ->> 'technical_summary',
    v_diag ->> 'disclaimer',
    coalesce(v_diag -> 'recommended_products', '[]'::jsonb),
    v_diag -> 'budget_summary',
    v_user_id
  );

  -- ---------- 5. Cronología ----------
  -- La ruta de solución es la misma para todo proyecto y no dependía de nada
  -- que calculara el navegador; se arma aquí para que crear un proyecto deje
  -- de necesitar que el cliente mande nada más que sus datos.
  for v_paso in
    select jsonb_array_elements(public.cronologia_inicial())
  loop
    insert into public.project_timeline_steps (
      project_id, step_number, title, description, status, step_date, responsible
    ) values (
      v_project_id,
      (v_paso ->> 'step_number')::int,
      coalesce(v_paso ->> 'title', ''),
      v_paso ->> 'description',
      coalesce(nullif(v_paso ->> 'status', '')::public.timeline_step_status, 'upcoming'),
      v_paso ->> 'step_date',
      v_paso ->> 'responsible'
    )
    on conflict on constraint project_timeline_paso_unico do nothing;
  end loop;

  return v_project_id;
end;
$$;

notify pgrst, 'reload schema';
