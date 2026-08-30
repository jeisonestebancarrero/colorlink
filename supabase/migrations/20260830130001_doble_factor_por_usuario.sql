-- ============================================================
-- Doble factor exigible por persona, no solo por rol
-- ============================================================
-- La regla base sigue siendo "todo el personal interno lo necesita", porque
-- es la correcta. Pero hay excepciones legítimas: el operario de bodega que
-- trabaja desde un equipo compartido sin teléfono corporativo, o el asesor
-- que todavía no ha recibido el suyo.
--
-- La excepción se guarda por persona y solo la mueve un administrador, de la
-- misma forma que los accesos a las aplicaciones: la línea base la da el rol
-- y la excepción se ve aparte, para que sea auditable quién está exento.
--
-- Lo que la excepción NO hace: si alguien YA registró su aplicación de
-- códigos, seguirá teniendo que usarla. Eximir a esa persona apagaría una
-- protección activa sin que ella se entere, y convertiría el interruptor en
-- una forma de degradar la seguridad de otro por la puerta de atrás. Para
-- quitarle el factor a alguien está "Reiniciar verificación", que es un acto
-- explícito y queda en la auditoría.
-- ============================================================

alter table public.profiles
  add column mfa_exento boolean not null default false;

comment on column public.profiles.mfa_exento is
  'El administrador eximió a esta persona de registrar el segundo factor. No desactiva el que ya tenga registrado.';

-- La columna la escribe solo un administrador, mediante la función de abajo.
revoke update (mfa_exento) on public.profiles from authenticated, anon;

-- ============================================================
-- Conmutar la exigencia
-- ============================================================
create or replace function public.set_mfa_requerido(
  _user_id   uuid,
  _requerido boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiene_factor boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración puede cambiar esta exigencia'
      using errcode = '42501';
  end if;

  -- Nadie se exime a sí mismo. Quien administra el sistema es justamente
  -- quien no puede quedar sin segundo factor, y permitirlo convertiría este
  -- interruptor en el primer clic de cualquiera que tomara esa cuenta.
  if _user_id = auth.uid() and not _requerido then
    raise exception 'SELF_EXEMPT: no puedes eximirte a ti mismo del segundo factor'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = _user_id and f.status = 'verified'
  ) into v_tiene_factor;

  -- Eximir a alguien que ya lo tiene activo no lo desactiva —y decirle que sí
  -- sería mentirle—, así que se rechaza y se le indica el camino correcto.
  if not _requerido and v_tiene_factor then
    raise exception
      'ALREADY_ENROLLED: esta persona ya tiene su aplicación de códigos registrada; usa "Reiniciar verificación" si necesitas retirarla'
      using errcode = '42501';
  end if;

  update public.profiles
     set mfa_exento = not _requerido
   where id = _user_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(),
          case when _requerido then 'MFA_REQUIRED_ON' else 'MFA_REQUIRED_OFF' end,
          'profiles', _user_id,
          jsonb_build_object('requerido', _requerido));
end;
$$;

revoke all on function public.set_mfa_requerido(uuid, boolean) from public, anon;
grant execute on function public.set_mfa_requerido(uuid, boolean) to authenticated;

-- ============================================================
-- El estado que lee la interfaz respeta la excepción
-- ============================================================
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
    'obligatorio', (
      not coalesce((select p.mfa_exento from public.profiles p where p.id = (select auth.uid())), false)
      and exists (
        select 1 from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role in (
            'ASESOR','TECNICO','ADMINISTRADOR','BODEGA','DESPACHO',
            'FACTURACION','TESORERIA','CONTABILIDAD','SERVICIO_CLIENTE',
            'MARKETING','GERENCIA'
          )
      )
    )
  );
$$;

-- ============================================================
-- Estado del segundo factor de OTRA persona, para el panel de administración
-- ============================================================
create or replace function public.estado_mfa_usuario(_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración puede consultar esto'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'configurado', exists (
      select 1 from auth.mfa_factors f
      where f.user_id = _user_id and f.status = 'verified'
    ),
    'requerido', not coalesce(
      (select p.mfa_exento from public.profiles p where p.id = _user_id), false),
    'es_interno', exists (
      select 1 from public.user_roles ur
      where ur.user_id = _user_id
        and ur.role in (
          'ASESOR','TECNICO','ADMINISTRADOR','BODEGA','DESPACHO',
          'FACTURACION','TESORERIA','CONTABILIDAD','SERVICIO_CLIENTE',
          'MARKETING','GERENCIA'
        )
    )
  );
end;
$$;

revoke all on function public.estado_mfa_usuario(uuid) from public, anon;
grant execute on function public.estado_mfa_usuario(uuid) to authenticated;
