-- ============================================================
-- FASE 5 · 03 — Superficies, patologías, diagnóstico y cronología
-- ============================================================

-- ------------------------------------------------------------
-- MÓDULO 10 — Superficies del proyecto
-- Un proyecto puede tener varias zonas, cada una con su área y sustrato:
--   Fachada exterior — 85 m² — concreto
--   Piso            — 120 m² — concreto
--   Muro interior   —  60 m² — drywall
-- ------------------------------------------------------------
create table public.project_surfaces (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  surface_id  uuid references public.surfaces (id) on delete restrict,
  -- Nombre de la zona ("Fachada principal"). Independiente del sustrato.
  label       text,
  area_m2     numeric(12,2),
  environment public.environment_type,
  notes       text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),

  constraint project_surfaces_area_positiva check (area_m2 is null or area_m2 > 0)
);

create index project_surfaces_project_id_idx on public.project_surfaces (project_id);

-- ------------------------------------------------------------
-- MÓDULO 11 — Patologías detectadas en el proyecto
-- ------------------------------------------------------------
create table public.project_pathologies (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id)   on delete cascade,
  pathology_id  uuid not null references public.pathologies (id) on delete restrict,
  -- Severidad observada en ESTE proyecto, que puede diferir de la severidad
  -- por defecto de la patología en el catálogo.
  severity      public.pathology_severity,
  observations  text,
  detected_at   timestamptz not null default now(),

  constraint project_pathologies_unica unique (project_id, pathology_id)
);

create index project_pathologies_project_id_idx on public.project_pathologies (project_id);

-- ------------------------------------------------------------
-- MÓDULO 12 — Diagnóstico
-- ------------------------------------------------------------
create table public.project_diagnoses (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  kind        public.diagnosis_kind not null default 'PRELIMINAR',

  solution_category text,
  attention_level   public.attention_level,
  requires_technical_visit boolean not null default false,
  key_considerations   text[] not null default '{}',
  missing_information  text[] not null default '{}',
  ai_summary        text,
  technical_summary text,
  disclaimer        text,

  -- ⚠️ ALMACENAMIENTO TRANSITORIO (se normaliza en las FASES 6 y 7).
  -- Hoy el motor que produce estos dos bloques todavía vive en el frontend
  -- (src/services/storage.ts). Normalizarlos ahora obligaría a diseñar el
  -- esquema de recomendaciones y de cálculo ANTES de mover el motor al
  -- servidor, y ese orden invita a equivocarse.
  --   FASE 6 -> tabla `recommendations` (MÓDULO 13)
  --   FASE 7 -> tablas `calculations` / `calculation_items` (MÓDULO 14)
  -- Mientras tanto se conservan tal cual para no perder información ni
  -- cambiar lo que ve el usuario.
  recommended_products jsonb not null default '[]'::jsonb,
  budget_summary       jsonb,

  responsible_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_diagnoses_project_id_idx on public.project_diagnoses (project_id);

comment on column public.project_diagnoses.recommended_products is
  'TRANSITORIO: salida del motor del frontend. Se normaliza en la FASE 6.';
comment on column public.project_diagnoses.budget_summary is
  'TRANSITORIO: salida del motor del frontend. Se normaliza en la FASE 7.';

create trigger project_diagnoses_set_updated_at
  before update on public.project_diagnoses
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Cronología del proyecto (TimelineStep)
-- ------------------------------------------------------------
create table public.project_timeline_steps (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  step_number int not null,
  title       text not null,
  description text,
  status      public.timeline_step_status not null default 'upcoming',
  -- Texto ya formateado para mostrar, tal como lo genera hoy el frontend.
  step_date   text,
  responsible text,

  constraint project_timeline_paso_unico unique (project_id, step_number),
  constraint project_timeline_paso_positivo check (step_number > 0)
);

create index project_timeline_project_id_idx on public.project_timeline_steps (project_id);

-- ------------------------------------------------------------
-- MÓDULO 32 — Archivos del proyecto
-- En la base solo van la RUTA y los metadatos; el binario vive en
-- Supabase Storage (MÓDULO 31).
-- ------------------------------------------------------------
create table public.project_files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  file_type    public.project_file_type not null default 'PROJECT_PHOTO',
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  description  text,
  is_primary   boolean not null default false,
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint project_files_tamano_valido check (size_bytes is null or size_bytes > 0)
);

create index project_files_project_id_idx on public.project_files (project_id);

comment on table public.project_files is
  'Metadatos de archivos. El contenido vive en el bucket project-files de Storage; aquí nunca se guardan binarios.';
