-- ============================================================
-- FASE 5 · 01 — Tipos enumerados de proyecto
-- ============================================================
-- Los valores replican las uniones de src/types/index.ts, salvo el estado,
-- que sigue la nomenclatura del MÓDULO 9 y se traduce en la capa de
-- servicio (ver comentario en project_status).
-- ============================================================

-- Union ProjectType
create type public.project_type as enum (
  'Vivienda', 'Edificio residencial', 'Edificio comercial',
  'Industria', 'Infraestructura', 'Mantenimiento', 'Otro'
);

-- Union EnvironmentType
create type public.environment_type as enum (
  'Interior', 'Exterior', 'Industrial', 'Alta humedad', 'Otro'
);

-- Estados del MÓDULO 9.
--
-- Se usa la nomenclatura del módulo (mayúsculas, español) en la base y se
-- traduce a la unión ProjectStatus del frontend en la capa de servicio.
--
-- ⚠️ NOTA SOBRE 'CANCELADO': existe aquí porque el MÓDULO 9 lo exige, pero
-- la unión ProjectStatus del frontend NO tiene un valor equivalente y no
-- hay ninguna pantalla que permita cancelar. Mientras eso siga así, el
-- servicio excluye los proyectos cancelados del listado. Habilitarlo son
-- dos cambios pequeños: añadir 'cancelled' a ProjectStatus y un `case` en
-- Badge.tsx. No se hace ahora para no tocar componentes visuales.
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

-- MÓDULO 12: diagnóstico preliminar y diagnóstico técnico.
create type public.diagnosis_kind as enum ('PRELIMINAR', 'TECNICO');

-- TimelineStep.status
create type public.timeline_step_status as enum ('completed', 'current', 'upcoming');

-- MÓDULO 32
create type public.project_file_type as enum (
  'PROJECT_PHOTO', 'PATHOLOGY_PHOTO', 'TECHNICAL_DOCUMENT', 'WARRANTY_CERTIFICATE'
);

-- Rol de una persona asignada a un proyecto.
create type public.assignment_role as enum ('TECNICO', 'ASESOR');
