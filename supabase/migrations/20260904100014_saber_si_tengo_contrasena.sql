-- ¿Mi cuenta tiene contraseña?
--
-- Hace falta para saber si a alguien se le ofrece CREAR una contraseña o
-- CAMBIARLA, y sobre todo si hay que pedirle la actual antes de cambiarla.
--
-- El dato no se puede sacar del cliente. La tentación es mirar las identidades
-- que devuelve `getUser()`, pero engaña: cuando a una cuenta de Google se le
-- pone contraseña, Supabase NO le agrega una identidad de tipo `email`. La
-- pantalla seguiría ofreciendo «crea una contraseña» para siempre, y nunca
-- pediría la actual —que es justo lo que impide que una sesión olvidada en un
-- computador ajeno se quede con la cuenta—.
--
-- Devuelve un booleano y nada más. No expone el hash ni su longitud: saber si
-- una cuenta usa contraseña es algo que su propio dueño ya sabe, pero el hash
-- no tiene por qué salir de la base jamás.
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
