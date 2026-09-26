-- MFA exigido en el servidor (is_admin, is_staff, has_permission): comprobarlo solo
-- en la app se saltaría llamando a la API con el token. Con factor verificado la
-- sesión debe ser aal2; sin él se permite para no bloquear a quien aún no lo registra.

create or replace function public.mfa_satisfecho()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then true
      -- Sin factor verificado: se permite y la interfaz obliga a registrarlo.
      when not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid())
          and f.status = 'verified'
      ) then true
      else false
    end;
$$;

comment on function public.mfa_satisfecho() is
  'La sesión cumple el segundo factor: o lo superó (aal2), o la cuenta aún no tiene ninguno configurado.';

revoke all on function public.mfa_satisfecho() from public, anon;
grant execute on function public.mfa_satisfecho() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_satisfecho() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'ADMINISTRADOR'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_satisfecho() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in (
        'ASESOR','TECNICO','ADMINISTRADOR','BODEGA','DESPACHO',
        'FACTURACION','TESORERIA','CONTABILIDAD','SERVICIO_CLIENTE',
        'MARKETING','GERENCIA'
      )
  );
$$;

create or replace function public.has_permission(_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_satisfecho() and (
    coalesce(
      -- La excepción personal manda, concede o retira.
      (select up.granted
         from public.user_permissions up
        where up.user_id = (select auth.uid())
          and up.permission_code = _code),
      -- Sin excepción decide el rol.
      (select exists (
         select 1
         from public.user_roles ur
         join public.role_permissions rp on rp.role = ur.role
        where ur.user_id = (select auth.uid())
          and rp.permission_code = _code
          and rp.granted)),
      false
    ) or public.is_admin()
  );
$$;

-- Vía función porque el esquema auth no es accesible desde el cliente.
create or replace function public.mi_estado_mfa()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'configurado', exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    ),
    'nivel_sesion', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    -- Obligatorio para el personal; opcional para clientes.
    'obligatorio', exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in (
          'ASESOR','TECNICO','ADMINISTRADOR','BODEGA','DESPACHO',
          'FACTURACION','TESORERIA','CONTABILIDAD','SERVICIO_CLIENTE',
          'MARKETING','GERENCIA'
        )
    )
  );
$$;

revoke all on function public.mi_estado_mfa() from public, anon;
grant execute on function public.mi_estado_mfa() to authenticated;
