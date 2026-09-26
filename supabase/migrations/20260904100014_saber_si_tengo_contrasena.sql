-- Indica si la cuenta tiene contraseña, para pedir la actual antes de cambiarla.
-- No sirve mirar identidades en el cliente: agregar contraseña a una cuenta de Google
-- no crea identidad email. Solo devuelve un booleano, nunca el hash.
create or replace function public.tengo_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select length(coalesce(u.encrypted_password, '')) > 0
       from auth.users u
      where u.id = (select auth.uid())),
    false
  );
$$;

revoke all on function public.tengo_password() from public, anon;
grant execute on function public.tengo_password() to authenticated;

notify pgrst, 'reload schema';
