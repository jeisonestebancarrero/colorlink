-- ============================================================
-- Qué pasa cuando la empresa YA está registrada
-- ============================================================
-- `companies.nit` es único, y con razón: dos empresas con el mismo NIT son la
-- misma empresa. Pero eso significaba que el segundo empleado que intentara
-- registrar su compañía hacía estallar el trigger de alta y perdía la cuenta
-- completa con un error 500 sin explicación.
--
-- El caso es totalmente legítimo y frecuente: el jefe de compras se registra
-- hoy, el residente de obra mañana. Ahora ese segundo registro:
--   · SÍ crea la cuenta personal (no se pierde nada),
--   · NO crea empresa duplicada,
--   · NO se vincula solo a la empresa existente —eso sería regalar acceso a
--     los proyectos y precios de un tercero a quien acierte el NIT—,
--   · deja una SOLICITUD que el dueño de esa cuenta empresarial aprueba.
-- ============================================================

create type public.join_request_status as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');

create table public.company_join_requests (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  requested_nit  text,
  status         public.join_request_status not null default 'PENDIENTE',
  resolved_by    uuid references public.profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Una sola solicitud viva por persona y empresa: reintentar el registro no
-- debe inundar al dueño de notificaciones idénticas.
create unique index solicitud_vinculacion_unica
  on public.company_join_requests (company_id, user_id)
  where status = 'PENDIENTE';

create index solicitud_vinculacion_empresa on public.company_join_requests (company_id, status);

alter table public.company_join_requests enable row level security;

-- Quien solicita ve su propia solicitud (para saber que quedó en trámite).
create policy solicitud_propia_select on public.company_join_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

-- El dueño o administrador de la empresa ve las solicitudes dirigidas a ella.
create policy solicitud_empresa_select on public.company_join_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = company_join_requests.company_id
        and m.user_id = (select auth.uid())
        and m.company_role in ('OWNER', 'ADMIN')
    )
    or (select public.is_admin())
  );

-- Nadie escribe directamente: se crean desde el trigger de alta y se
-- resuelven por la función de abajo, que es la que valida quién decide.
revoke insert, update, delete on public.company_join_requests from authenticated, anon;
grant select on public.company_join_requests to authenticated;

-- ============================================================
-- Aprobar o rechazar la vinculación
-- ============================================================
create or replace function public.resolve_join_request(
  _request_id uuid,
  _aprobar    boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sol public.company_join_requests%rowtype;
begin
  select * into v_sol from public.company_join_requests where id = _request_id;
  if v_sol.id is null then
    raise exception 'REQUEST_NOT_FOUND: solicitud no encontrada' using errcode = 'P0002';
  end if;
  if v_sol.status <> 'PENDIENTE' then
    raise exception 'ALREADY_RESOLVED: esta solicitud ya fue resuelta' using errcode = '23505';
  end if;

  -- Solo el dueño/administrador de ESA empresa decide. Un administrador de la
  -- plataforma también, para poder destrabar casos de soporte.
  if not (
    public.is_admin()
    or exists (
      select 1 from public.company_members m
      where m.company_id = v_sol.company_id
        and m.user_id = auth.uid()
        and m.company_role in ('OWNER', 'ADMIN')
    )
  ) then
    raise exception 'FORBIDDEN: no puedes resolver solicitudes de esta empresa'
      using errcode = '42501';
  end if;

  update public.company_join_requests
     set status = case when _aprobar then 'APROBADA' else 'RECHAZADA' end::public.join_request_status,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = _request_id;

  if _aprobar then
    insert into public.company_members (company_id, user_id, company_role)
    values (v_sol.company_id, v_sol.user_id, 'MEMBER')
    on conflict do nothing;

    update public.profiles set company_id = v_sol.company_id where id = v_sol.user_id;

    insert into public.user_roles (user_id, role, company_id)
    values (v_sol.user_id, 'CLIENTE_B2B', v_sol.company_id)
    on conflict on constraint user_roles_unicos do nothing;
  end if;

  insert into public.notifications (user_id, title, message, type)
  values (
    v_sol.user_id,
    case when _aprobar then 'Vinculación aprobada' else 'Vinculación rechazada' end,
    case when _aprobar
         then 'Ya haces parte de la cuenta empresarial. Puedes ver sus proyectos y precios.'
         else 'El administrador de la cuenta empresarial no aprobó tu vinculación. Escríbenos si crees que es un error.'
    end,
    case when _aprobar then 'success' else 'alert' end::public.notification_type
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(),
          case when _aprobar then 'JOIN_REQUEST_APPROVED' else 'JOIN_REQUEST_REJECTED' end,
          'company_join_requests', _request_id,
          jsonb_build_object('company_id', v_sol.company_id, 'user_id', v_sol.user_id));
end;
$$;

revoke all on function public.resolve_join_request(uuid, boolean) from public, anon;
grant execute on function public.resolve_join_request(uuid, boolean) to authenticated;

-- ============================================================
-- El alta deja de romperse por un NIT repetido
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name text;
  v_company_nit  text;
  v_company_id   uuid;
  v_existente    uuid;
  v_client_type  public.client_type;
  v_city         text;
  v_first_name   text;
  v_last_name    text;
  v_full_name    text;
  v_avatar       text;
  v_doc_type     public.document_type;
  v_doc_number   text;
begin
  v_client_type := case
    when new.raw_user_meta_data ->> 'client_type'
         in ('Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor')
    then (new.raw_user_meta_data ->> 'client_type')::public.client_type
    else 'Particular'::public.client_type
  end;

  v_city         := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');
  v_company_nit  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company_nit', '')), '');
  v_doc_number   := nullif(trim(coalesce(new.raw_user_meta_data ->> 'document_number', '')), '');

  v_doc_type := case
    when new.raw_user_meta_data ->> 'document_type' in ('CC','CE','NIT','PASAPORTE','PEP')
    then (new.raw_user_meta_data ->> 'document_type')::public.document_type
    else null
  end;

  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_last_name  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');

  -- Proveedor externo (Google): solo llega el nombre completo.
  if v_first_name is null then
    v_full_name := nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name', '')), '');
    if v_full_name is not null then
      v_first_name := split_part(v_full_name, ' ', 1);
      v_last_name := coalesce(
        nullif(trim(substr(v_full_name, length(split_part(v_full_name, ' ', 1)) + 1)), ''),
        v_last_name);
    end if;
  end if;

  v_avatar := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture', '')), '');

  insert into public.profiles (
    id, email, first_name, last_name, phone, city, client_type, avatar_url,
    document_type, document_number
  )
  values (
    new.id, new.email,
    coalesce(v_first_name, ''), coalesce(v_last_name, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_city, v_client_type, v_avatar, v_doc_type, v_doc_number
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'CLIENTE')
  on conflict on constraint user_roles_unicos do nothing;

  if v_company_name is not null then
    -- ¿Ese NIT ya está registrado? Entonces no se crea nada: se pide permiso.
    select id into v_existente
      from public.companies
     where v_company_nit is not null and nit = v_company_nit;

    if v_existente is not null then
      insert into public.company_join_requests (company_id, user_id, requested_nit)
      values (v_existente, new.id, v_company_nit)
      on conflict do nothing;

      -- Avisar a quienes pueden decidir.
      insert into public.notifications (user_id, title, message, type)
      select m.user_id,
             'Solicitud de vinculación',
             coalesce(v_first_name, new.email) || ' pidió unirse a tu cuenta empresarial.',
             'info'::public.notification_type
        from public.company_members m
       where m.company_id = v_existente
         and m.company_role in ('OWNER', 'ADMIN');

      -- La cuenta personal queda creada y utilizable; simplemente sin empresa
      -- hasta que la aprueben.
      return new;
    end if;

    -- Se crea SIEMPRE una empresa nueva, nunca se vincula por nombre: bastaría
    -- escribir el nombre de otra constructora para acceder a sus proyectos.
    insert into public.companies (name, nit, city, email, status)
    values (v_company_name, v_company_nit, v_city, new.email, 'ACTIVA')
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, company_role)
    values (v_company_id, new.id, 'OWNER');

    update public.profiles set company_id = v_company_id where id = new.id;

    insert into public.user_roles (user_id, role, company_id)
    values (new.id, 'CLIENTE_B2B', v_company_id)
    on conflict on constraint user_roles_unicos do nothing;
  end if;

  return new;
end;
$$;
