-- Enums de proyecto: replican src/types/index.ts salvo el estado, que el servicio traduce.

-- Union ProjectType
create type public.project_type as enum (
  'Vivienda', 'Edificio residencial', 'Edificio comercial',
  'Industria', 'Infraestructura', 'Mantenimiento', 'Otro'
);

-- Union EnvironmentType
create type public.environment_type as enum (
  'Interior', 'Exterior', 'Industrial', 'Alta humedad', 'Otro'
);

-- El servicio lo traduce a ProjectStatus. CANCELADO no existe en el frontend, así que
-- el listado excluye esos proyectos.
create type public.project_status as enum (
  'PENDIENTE',
  'EN_ANALISIS',
  'EN_PROCESO',
  'REQUIERE_INFORMACION',
  'COMPLETADO',
  'CANCELADO'
);

-- PreliminaryAnalysis.attentionLevel
create type public.attention_level as enum ('Baja', 'Media', 'Alta', 'Especializada');

create type public.diagnosis_kind as enum ('PRELIMINAR', 'TECNICO');

-- TimelineStep.status
create type public.timeline_step_status as enum ('completed', 'current', 'upcoming');

create type public.project_file_type as enum (
  'PROJECT_PHOTO', 'PATHOLOGY_PHOTO', 'TECHNICAL_DOCUMENT', 'WARRANTY_CERTIFICATE'
);

create type public.assignment_role as enum ('TECNICO', 'ASESOR');
