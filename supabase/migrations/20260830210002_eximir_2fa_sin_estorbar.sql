-- ============================================================
-- Quitar la exigencia de doble factor sin dejar a nadie encerrado
-- ============================================================
-- La regla anterior tenía dos candados y uno sobraba:
--
--   · SELF_EXEMPT      — nadie puede eximirse a sí mismo.
--   · ALREADY_ENROLLED — no se exime a quien ya tiene su factor activo.
--
-- El primero se puso pensando en que eximirse fuera «el primer clic de quien
-- toma una cuenta ajena». Pero ese atacante, para llegar hasta ahí, tuvo que
-- superar el segundo factor —tiene la app de códigos en la mano—, así que
-- cae en el segundo candado de todas formas. Y si la cuenta NO tiene factor,
-- quien la haya tomado ya tiene control total: eximirla no le agrega nada.
--
-- Es decir: el primer candado no protegía nada y sí dejaba al administrador
-- del sistema sin forma de desactivarse la exigencia salvo pidiéndoselo a
-- otro administrador. Se retira. El segundo se queda, que es el que de verdad
-- impide bajarle la protección a alguien sin que se entere.
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

  -- Eximir a alguien que ya lo tiene activo no lo desactiva —y decirle que sí
  -- sería mentirle—, así que se rechaza y se le indica el camino correcto.
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
