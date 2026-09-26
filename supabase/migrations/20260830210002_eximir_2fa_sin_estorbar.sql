-- Retira el candado SELF_EXEMPT: no protegía nada y dejaba al administrador sin
-- poder eximirse. Se mantiene ALREADY_ENROLLED.
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

  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = _user_id and f.status = 'verified'
  ) into v_tiene_factor;

    -- Eximir no desactiva un factor ya inscrito; se rechaza para no inducir a error.
  if not _requerido and v_tiene_factor then
    raise exception
      'ALREADY_ENROLLED: esta cuenta ya tiene su aplicación de códigos registrada; primero usa "Reiniciar verificación"'
      using errcode = '42501';
  end if;

  update public.profiles
     set mfa_exento = not _requerido
   where id = _user_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(),
          case when _requerido then 'MFA_REQUIRED_ON' else 'MFA_REQUIRED_OFF' end,
          'profiles', _user_id,
          jsonb_build_object('requerido', _requerido,
                             'sobre_si_mismo', _user_id = auth.uid()));
end;
$$;
