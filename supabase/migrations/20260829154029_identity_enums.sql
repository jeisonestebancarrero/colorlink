-- Enums de identidad. client_type replica la unión ClientType de src/types/index.ts.

-- Enum para que Postgres rechace roles inventados.
create type public.app_role as enum (
  'CLIENTE',
  'CLIENTE_B2B',
  'ASESOR',
  'TECNICO',
  'ADMINISTRADOR'
);

create type public.user_status as enum (
  'ACTIVO',
  'INACTIVO',
  'SUSPENDIDO',
  'PENDIENTE_VERIFICACION'
);

-- Sincronizado con ClientType; ampliar con ALTER TYPE ... ADD VALUE, nunca recreando el tipo.
create type public.client_type as enum (
  'Particular',
  'Constructor',
  'Empresa',
  'Profesional',
  'Distribuidor'
);

-- Rol dentro de la empresa; independiente del rol de aplicación.
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
