-- Se retira `tengo_password()`: la señal en la que se apoyaba no sirve.
--
-- La idea era mirar `auth.users.encrypted_password`: si hay hash, hay
-- contraseña. En la instancia local se cumple —una cuenta de Google lo tiene
-- en nulo—, pero en Supabase Cloud NO: una cuenta creada únicamente con Google,
-- que jamás tuvo contraseña, aparece con hash. La función respondía «sí tiene»
-- y la pantalla le habría exigido una contraseña actual inexistente, dejando a
-- la persona sin forma de crearse una. Justo el caso para el que se hizo.
--
-- La comprobación pasa a la aplicación y usa las IDENTIDADES: que exista una
-- de tipo `email` significa que esa cuenta entra con correo y contraseña. Es
-- lo que el propio Supabase entiende por «tiene contraseña», y no depende de
-- cómo cada versión rellene esa columna.
--
-- Se BORRA en vez de dejarse sin uso. Una función que nadie llama y que además
-- miente es exactamente la clase de cosa que alguien vuelve a usar dentro de
-- seis meses creyendo que funciona.
drop function if exists public.tengo_password();

notify pgrst, 'reload schema';
