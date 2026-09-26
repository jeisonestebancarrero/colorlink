-- Siembra el primer ADMIN, que grant_role no puede crear. No falla si la cuenta aún
-- no existe. granted_by queda null: lo concede el despliegue, no una persona.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
    from auth.users
   where lower(email) = 'jeisonestebancarrero@gmail.com'
   limit 1;

  if v_user_id is null then
    raise notice 'La cuenta fundadora todavía no existe: no se concede nada.';
    return;
  end if;

  insert into public.user_roles (user_id, role, company_id, granted_by)
  values (v_user_id, 'ADMINISTRADOR', null, null)
  on conflict on constraint user_roles_unicos do nothing;

  -- Se audita como cualquier cambio de permisos.
  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (v_user_id, 'ROLE_GRANT', 'user_roles', v_user_id,
          jsonb_build_object('role', 'ADMINISTRADOR', 'origen', 'migracion_fundador'));

  raise notice 'ADMINISTRADOR concedido a la cuenta fundadora.';
end $$;
