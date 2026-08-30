-- ============================================================
-- Poder traer el nombre junto con el rol
-- ============================================================
-- `user_roles.user_id` solo apuntaba a `auth.users`, un esquema que PostgREST
-- no expone. Sin una clave foránea hacia `profiles`, cualquier consulta que
-- pidiera el rol y el nombre de la persona a la vez fallaba, y el desplegable
-- de "quién va a la obra" aparecía vacío sin explicar nada.
--
-- `profiles.id` es exactamente `auth.users.id`, así que la relación ya existía
-- de hecho; lo único que faltaba era declararla.
alter table public.user_roles
  add constraint user_roles_user_id_profile
  foreign key (user_id) references public.profiles (id) on delete cascade;
