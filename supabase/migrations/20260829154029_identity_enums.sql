-- ============================================================
-- FASE 2 · 01 — Tipos enumerados de identidad
-- ============================================================
-- Migración aditiva: solo CREATE TYPE. No modifica ni elimina nada existente.
--
-- COMPATIBILIDAD CON EL FRONTEND:
-- `client_type` replica EXACTAMENTE la unión TypeScript `ClientType` de
-- src/types/index.ts. Al coincidir valor por valor, RegisterPage.tsx y
-- ProfilePage.tsx no requieren ningún cambio.
-- ============================================================

-- Roles de la aplicación (MÓDULO 2).
-- Se declara como enum para que Postgres rechace cualquier rol inventado.
create type public.app_role as enum (
  'CLIENTE',
  'CLIENTE_B2B',
  'ASESOR',
  'TECNICO',
  'ADMINISTRADOR'
);

-- Estado de una cuenta de usuario.
create type public.user_status as enum (
  'ACTIVO',
  'INACTIVO',
  'SUSPENDIDO',
  'PENDIENTE_VERIFICACION'
);

-- Tipo de cliente. Debe permanecer sincronizado con `ClientType`
-- en src/types/index.ts. Si se añade un valor allí, añadirlo aquí
-- con una migración nueva (ALTER TYPE ... ADD VALUE), nunca recreando el tipo.
create type public.client_type as enum (
  'Particular',
  'Constructor',
  'Empresa',
  'Profesional',
  'Distribuidor'
);

-- Rol de un usuario DENTRO de su empresa (distinto del rol de aplicación).
create type public.company_role as enum (
  'OWNER',
  'ADMIN',
  'MEMBER'
);

create type public.company_status as enum (
  'ACTIVA',
  'INACTIVA',
  'SUSPENDIDA'
);

comment on type public.app_role is
  'Roles de aplicación. Se asignan en public.user_roles, nunca en una columna editable por el usuario.';
comment on type public.client_type is
  'Espejo de la unión TypeScript ClientType (src/types/index.ts). Mantener sincronizado.';
