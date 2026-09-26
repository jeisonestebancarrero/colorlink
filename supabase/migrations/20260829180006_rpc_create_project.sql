-- Crea el proyecto y sus tablas hijas en una sola transacción. Usuario, empresa y
-- código los fija el servidor; el diagnóstico aún llega calculado desde el frontend.

create or replace function public.create_project(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  -- La empresa sale del perfil, nunca del cliente.
  select p.company_id into v_company_id
  from public.profiles p
  where p.id = v_user_id;

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
  -- Siempre entra en análisis, no en un estado elegido por el cliente.
    'EN_ANALISIS',
    3,
    _payload -> 'next_recommended_action'
  )
  returning id into v_project_id;

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

  for v_condicion in
    select jsonb_array_elements_text(coalesce(_payload -> 'conditions', '[]'::jsonb))
  loop
    insert into public.project_pathologies (project_id, pathology_id, severity)
    select v_project_id, pa.id, pa.severity
    from public.pathologies pa
    where pa.name = v_condicion
    on conflict on constraint project_pathologies_unica do nothing;
  end loop;

  insert into public.project_diagnoses (
    project_id, kind, solution_category, attention_level,
    requires_technical_visit, key_considerations, missing_information,
    ai_summary, technical_summary, disclaimer,
    recommended_products, budget_summary, responsible_user_id
  ) values (
    v_project_id,
    'PRELIMINAR',
    _payload #>> '{diagnosis,solution_category}',
    nullif(_payload #>> '{diagnosis,attention_level}', '')::public.attention_level,
    coalesce((_payload #>> '{diagnosis,requires_technical_visit}')::boolean, false),
    coalesce(
      array(select jsonb_array_elements_text(_payload #> '{diagnosis,key_considerations}')),
      '{}'
    ),
    coalesce(
      array(select jsonb_array_elements_text(_payload #> '{diagnosis,missing_information}')),
      '{}'
    ),
    _payload #>> '{diagnosis,ai_summary}',
    _payload #>> '{diagnosis,technical_summary}',
    _payload #>> '{diagnosis,disclaimer}',
    coalesce(_payload #> '{diagnosis,recommended_products}', '[]'::jsonb),
    _payload #> '{diagnosis,budget_summary}',
    v_user_id
  );

  for v_paso in
    select jsonb_array_elements(coalesce(_payload -> 'timeline', '[]'::jsonb))
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

comment on function public.create_project(jsonb) is
  'Crea proyecto, superficie, patologías, diagnóstico y cronología en UNA transacción. Ignora user_id y company_id enviados por el cliente.';

revoke execute on function public.create_project(jsonb) from public, anon;
grant execute on function public.create_project(jsonb) to authenticated;
