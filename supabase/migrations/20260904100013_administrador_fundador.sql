-- Siembra del ADMINISTRADOR fundador.
--
-- El portal interno tiene el problema del huevo y la gallina: `grant_role`
-- exige ser administrador para nombrar administradores, así que el primero de
-- todos no puede salir de la propia aplicación. Tiene que sembrarse aquí.
--
-- Es TOLERANTE a propósito: si esa cuenta todavía no existe —una base recién
-- levantada, por ejemplo— no hace nada en vez de reventar la migración. Un
-- arranque en limpio no puede depender de que alguien ya se haya registrado.
--
-- `granted_by` queda en nulo y es correcto: no lo concedió una persona desde
-- la aplicación, lo concedió el despliegue. La auditoría debe poder
-- distinguirlo.
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

  -- Queda registrado como cualquier otro cambio de permisos. Un rol de
  -- administrador que aparece sin rastro es justo lo que un auditor busca.
  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (v_user_id, 'ROLE_GRANT', 'user_roles', v_user_id,
          jsonb_build_object('role', 'ADMINISTRADOR', 'origen', 'migracion_fundador'));

  raise notice 'ADMINISTRADOR concedido a la cuenta fundadora.';
end $$;
