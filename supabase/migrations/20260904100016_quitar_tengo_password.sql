-- Se elimina tengo_password(): en Supabase Cloud, cuentas solo de Google tienen
-- encrypted_password, así que respondía mal. La app ahora mira si existe identidad email.
drop function if exists public.tengo_password();

notify pgrst, 'reload schema';
