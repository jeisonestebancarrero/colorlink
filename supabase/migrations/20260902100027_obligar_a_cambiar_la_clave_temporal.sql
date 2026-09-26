-- Marca para forzar el cambio de la contraseña temporal que genera admin-create-user.
-- Es un flujo, no una frontera de seguridad: el usuario puede quitarse la marca, pero
-- es su propia cuenta; el acceso al portal lo sigue decidiendo is_staff().

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'La cuenta tiene una contraseña provisional puesta por un administrador y '
  'debe cambiarla antes de usar el sistema. La pone el servidor; la quita la '
  'persona al cambiarla.';

-- Solo la propia cuenta: usa auth.uid(), no un parámetro.
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

-- Para users.manage al reiniciar un acceso temporal y para las funciones de borde.
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
