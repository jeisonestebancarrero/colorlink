-- ============================================================
-- CORRECCIÓN DE REGRESIÓN — Asesoría técnica (MÓDULO 21/22)
-- ============================================================
-- Se adelanta desde la FASE 11 porque el botón "Solicitar acompañamiento
-- técnico" ya existe y está en uso. Al migrar los proyectos a Supabase dejé
-- ese servicio como no-op: el modal se cerraba, salía el toast de éxito y no
-- se guardaba nada. Un botón que miente es peor que un botón deshabilitado.
-- ============================================================

create type public.assistance_status as enum (
  'SOLICITADO', 'PROGRAMADO', 'EN_VISITA', 'INFORME_EMITIDO', 'CANCELADO'
);

create type public.assistance_kind as enum (
  'ACOMPANAMIENTO_OBRA', 'DIAGNOSTICO_TECNICO', 'CAPACITACION', 'POSVENTA'
);

create table public.technical_assistance (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  user_id      uuid not null references auth.users (id)      on delete restrict,
  kind         public.assistance_kind not null default 'ACOMPANAMIENTO_OBRA',
  status       public.assistance_status not null default 'SOLICITADO',
  description  text,
  contact_phone text,
  preferred_date text,
  -- "Asesoría técnica en obra — $0 COP" (MÓDULO 21): el servicio va incluido.
  cost_cop     numeric(14,2) not null default 0,
  specialist_user_id uuid references auth.users (id) on delete set null,
  specialist_name  text,
  specialist_title text,
  observations text,
  requested_at timestamptz not null default now(),
  scheduled_date text,
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint technical_assistance_costo_no_negativo check (cost_cop >= 0)
);

create index technical_assistance_project_id_idx on public.technical_assistance (project_id);
create index technical_assistance_user_id_idx    on public.technical_assistance (user_id);
create index technical_assistance_status_idx     on public.technical_assistance (status);

create trigger technical_assistance_set_updated_at
  before update on public.technical_assistance
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS: hereda la visibilidad del proyecto, como el resto de tablas hijas.
-- ------------------------------------------------------------
alter table public.technical_assistance enable row level security;

revoke all on public.technical_assistance from anon, authenticated;
grant select, insert, update on public.technical_assistance to authenticated;

create policy "technical_assistance_select" on public.technical_assistance
  for select to authenticated
  using ( (select public.can_access_project(project_id)) );

-- Solicitar asesoría para un proyecto propio, y solo a nombre propio.
create policy "technical_assistance_insert" on public.technical_assistance
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.can_access_project(project_id))
  );

-- Programar, asignar especialista y emitir informe es trabajo del personal
-- interno: el cliente solicita, no se auto-programa una visita.
create policy "technical_assistance_update_staff" on public.technical_assistance
  for update to authenticated
  using      ( (select public.is_staff()) and (select public.can_access_project(project_id)) )
  with check ( (select public.is_staff()) and (select public.can_access_project(project_id)) );

-- ============================================================
-- RPC: solicitar acompañamiento técnico
-- ============================================================
-- Transaccional: crea la solicitud y avanza el paso 6 de la cronología en la
-- misma operación, para que no puedan quedar desincronizados.
create or replace function public.request_technical_assistance(
  _project_id uuid,
  _notes text default null,
  _contact_phone text default null,
  _preferred_date text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id      uuid;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  if not public.can_access_project(_project_id) then
    raise exception 'FORBIDDEN: no tienes acceso a este proyecto' using errcode = '42501';
  end if;

  -- Una solicitud abierta por proyecto: pulsar el botón dos veces no debe
  -- generar dos visitas.
  select ta.id into v_id
  from public.technical_assistance ta
  where ta.project_id = _project_id
    and ta.status in ('SOLICITADO', 'PROGRAMADO', 'EN_VISITA')
  limit 1;

  if v_id is not null then
    update public.technical_assistance
       set description    = coalesce(_notes, description),
           contact_phone  = coalesce(_contact_phone, contact_phone),
           preferred_date = coalesce(_preferred_date, preferred_date)
     where id = v_id;
    return v_id;
  end if;

  insert into public.technical_assistance (
    project_id, user_id, description, contact_phone, preferred_date, status
  ) values (
    _project_id,
    v_user_id,
    coalesce(_notes, 'Acompañamiento técnico y diagnóstico en obra solicitado por el cliente.'),
    _contact_phone,
    coalesce(_preferred_date, 'En coordinación con el especialista Pintuco'),
    'SOLICITADO'
  )
  returning id into v_id;

  -- Paso 6 de la cronología: "Acompañamiento técnico en obra".
  update public.project_timeline_steps
     set status = 'current',
         description = 'Acompañamiento técnico solicitado por el cliente. En proceso de asignación de especialista.'
   where project_id = _project_id
     and step_number = 6;

  return v_id;
end;
$$;

revoke execute on function public.request_technical_assistance(uuid, text, text, text) from public, anon;
grant execute on function public.request_technical_assistance(uuid, text, text, text) to authenticated;
