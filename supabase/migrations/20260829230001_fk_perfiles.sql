-- ============================================================
-- Relaciones hacia `profiles` para poder consultarlas anidadas
-- ============================================================
-- PROBLEMA: las columnas de usuario apuntan a `auth.users`, no a
-- `public.profiles`. PostgREST solo sabe anidar recursos cuando existe una
-- clave foránea entre las dos tablas, así que pedir
-- `orders(..., profiles(first_name))` fallaba con
-- "Could not find a relationship between 'orders' and 'user_id'".
--
-- SOLUCIÓN: añadir una segunda clave foránea hacia `profiles`. No es
-- redundante ni contradictoria: `profiles.id` ES `auth.users.id` (relación
-- 1:1 creada por el trigger de alta), de modo que ambas restricciones
-- expresan la misma verdad y no pueden entrar en conflicto.
--
-- Las columnas ya contienen datos válidos, así que las restricciones se
-- pueden añadir sin migrar nada.
-- ============================================================

alter table public.orders
  add constraint orders_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.invoices
  add constraint invoices_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.conversation_messages
  add constraint conversation_messages_author_id_profiles_fkey
  foreign key (author_id) references public.profiles (id) on delete set null;

alter table public.projects
  add constraint projects_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.technical_assistance
  add constraint technical_assistance_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete restrict;
