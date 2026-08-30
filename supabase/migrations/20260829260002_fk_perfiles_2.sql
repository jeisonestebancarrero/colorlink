-- ============================================================
-- Relaciones hacia `profiles` en las tablas nuevas
-- ============================================================
-- Mismo motivo que la migración 20260829230001: PostgREST solo sabe anidar
-- `profiles(...)` cuando existe una clave foránea hacia esa tabla, no hacia
-- `auth.users`. Al crear las tablas de movimientos y visitas se repitió el
-- descuido, y las consultas con el autor fallaban en tiempo de ejecución.
--
-- Se añaden aquí de una vez todas las columnas de usuario que la interfaz
-- muestra con nombre y apellido, para no ir arrastrando el problema.
-- ============================================================

alter table public.inventory_movements
  add constraint inventory_movements_created_by_profiles_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.technical_visits
  add constraint technical_visits_technician_profiles_fkey
  foreign key (technician_id) references public.profiles (id) on delete set null;

alter table public.technical_assistance
  add constraint technical_assistance_specialist_profiles_fkey
  foreign key (specialist_user_id) references public.profiles (id) on delete set null;

alter table public.project_assignments
  add constraint project_assignments_user_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.project_files
  add constraint project_files_uploaded_by_profiles_fkey
  foreign key (uploaded_by) references public.profiles (id) on delete set null;
