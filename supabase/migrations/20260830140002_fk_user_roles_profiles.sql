-- FK de user_roles hacia profiles para que PostgREST traiga rol y nombre juntos
-- (auth.users no está expuesto; el id es el mismo).
alter table public.user_roles
  add constraint user_roles_user_id_profile
  foreign key (user_id) references public.profiles (id) on delete cascade;
