-- Exención de MFA por persona, solo por un administrador y auditada. No apaga un
-- factor ya registrado; para retirarlo está "Reiniciar verificación".

alter table public.profiles
  add column mfa_exento boolean not null default false;

comment on column public.profiles.mfa_exento is
  'El administrador eximió a esta persona de registrar el segundo factor. No desactiva el que ya tenga registrado.';

-- Solo la escribe un administrador vía set_mfa_requerido.
revoke update (mfa_exento) on public.profiles from authenticated, anon;

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

  -- Nadie se exime a sí mismo: sería lo primero que haría quien robe una cuenta admin.
  if _user_id = auth.uid() and not _requerido then
    raise exception 'SELF_EXEMPT: no puedes eximirte a ti mismo del segundo factor'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = _user_id and f.status = 'verified'
  ) into v_tiene_factor;

  -- Eximir no desactiva un factor activo: se rechaza e indica la vía correcta.
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

-- El estado que lee la interfaz respeta la exención.
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

-- Estado MFA de otra persona, para el panel de administración.
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
