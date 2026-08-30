-- ============================================================
-- Doble factor para el personal interno
-- ============================================================
-- El segundo factor solo sirve si el SERVIDOR lo exige. Si únicamente lo
-- comprobara la aplicación de administración, bastaría con llamar a la API
-- con el token de sesión —que el navegador entrega en texto plano— para
-- saltárselo entero. Por eso la comprobación vive aquí, en las tres funciones
-- por las que pasa toda decisión de acceso: is_admin, is_staff y
-- has_permission.
--
-- LA REGLA: si la cuenta tiene un segundo factor verificado, la sesión debe
-- haberlo superado (aal2). Si no lo tiene, sigue funcionando con contraseña.
--
-- Esa segunda mitad es deliberada y no es un descuido: exigir aal2 a todo el
-- personal desde el primer minuto dejaría fuera a quien todavía no ha
-- registrado su aplicación de códigos —incluido el administrador, que es
-- quien tendría que arreglarlo—. Quien no lo tenga configurado entra, y el
-- portal interno le exige registrarlo antes de dejarlo trabajar. Una vez
-- registrado, ya no hay vuelta atrás: sin código no hay acceso.
-- ============================================================

create or replace function public.mfa_satisfecho()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      -- Sesión que ya superó el segundo factor.
      when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then true
      -- Sin factor verificado todavía: se permite, y la interfaz obliga a
      -- registrarlo.
      when not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid())
          and f.status = 'verified'
      ) then true
      -- Tiene factor y no lo usó en esta sesión.
      else false
    end;
$$;

comment on function public.mfa_satisfecho() is
  'La sesión cumple el segundo factor: o lo superó (aal2), o la cuenta aún no tiene ninguno configurado.';

revoke all on function public.mfa_satisfecho() from public, anon;
grant execute on function public.mfa_satisfecho() to authenticated;

-- ============================================================
-- Las tres puertas de acceso pasan a exigirlo
-- ============================================================
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
      -- 1. Si hay excepción personal, esa manda: concede o retira.
      (select up.granted
         from public.user_permissions up
        where up.user_id = (select auth.uid())
          and up.permission_code = _code),
      -- 2. Si no la hay, decide el rol.
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

-- ============================================================
-- Estado del segundo factor, para que la interfaz sepa qué pedir
-- ============================================================
-- Se expone por función y no leyendo `auth.mfa_factors` directamente porque
-- ese esquema no está —ni debe estar— al alcance del cliente.
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
    -- El personal interno está obligado; un cliente puede activarlo si quiere.
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
