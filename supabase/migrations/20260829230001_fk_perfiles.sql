-- FK adicionales hacia profiles para que PostgREST pueda anidarlos. No chocan con
-- las de auth.users: profiles.id es el mismo id (1:1).

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
