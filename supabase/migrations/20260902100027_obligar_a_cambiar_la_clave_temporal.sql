-- ============================================================
-- Obligar a cambiar la contraseña temporal
-- ============================================================
-- `admin-create-user` genera una contraseña provisional y su comentario dice
-- «se pide cambiarla»… pero nada la pedía. Quien entraba con ella se quedaba
-- con ella para siempre. Dos consecuencias reales:
--
--   · Si el administrador la pierde antes de entregarla —solo se muestra UNA
--     vez, no se envía por correo—, la persona no puede entrar y hay que
--     reiniciarle el acceso.
--   · Y si la entrega por WhatsApp o de viva voz, esa contraseña sigue siendo
--     válida meses después, en manos de quien haya visto el mensaje.
--
-- La marca la pone el servidor al crear la cuenta o al reiniciarla en modo
-- temporal, y la quita la propia persona cuando cambia la contraseña.
--
-- ALCANCE HONESTO: esto es un FLUJO, no una frontera de seguridad. Quien ya
-- tiene sesión podría quitarse la marca sin cambiar nada tocando la consola
-- del navegador —pero es su propia cuenta y podría cambiar la contraseña de
-- todos modos, así que no se gana nada—. Lo que impide de verdad que use el
-- portal sin segundo factor sigue siendo `is_staff()`, que no depende de esto.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'La cuenta tiene una contraseña provisional puesta por un administrador y '
  'debe cambiarla antes de usar el sistema. La pone el servidor; la quita la '
  'persona al cambiarla.';

-- ------------------------------------------------------------
-- Quitar la marca
-- ------------------------------------------------------------
-- Solo sobre la propia cuenta: `auth.uid()` no llega por parámetro, así que
-- nadie puede quitársela a otro.
create or replace function public.confirmar_cambio_de_clave()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set must_change_password = false,
         updated_at = now()
   where id = (select auth.uid());
$$;

revoke all on function public.confirmar_cambio_de_clave() from public, anon;
grant execute on function public.confirmar_cambio_de_clave() to authenticated;

comment on function public.confirmar_cambio_de_clave() is
  'La persona declara que ya cambió su contraseña provisional. Solo actúa '
  'sobre su propia fila.';

-- ------------------------------------------------------------
-- Ponerla
-- ------------------------------------------------------------
-- La usa el personal con `users.manage` cuando reinicia un acceso en modo
-- temporal, y las funciones de borde con la llave de servicio.
create or replace function public.exigir_cambio_de_clave(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('users.manage')
          or (select auth.uid()) is null) then
    raise exception 'FORBIDDEN: no tienes permiso para reiniciar accesos'
      using errcode = '42501';
  end if;

  update public.profiles
     set must_change_password = true,
         updated_at = now()
   where id = _user_id;
end;
$$;

revoke all on function public.exigir_cambio_de_clave(uuid) from public, anon;
grant execute on function public.exigir_cambio_de_clave(uuid) to authenticated;

comment on function public.exigir_cambio_de_clave(uuid) is
  'Marca una cuenta como "tiene contraseña provisional". Exige users.manage; '
  'la llave de servicio (sin auth.uid()) también puede, que es como la llaman '
  'las funciones de borde al crear un usuario.';
