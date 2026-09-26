-- Chatter (mensajes, notas internas y eventos en un solo hilo), recomendaciones
-- asistidas por IA y evidencia de aceptación legal.
create type public.message_kind as enum (
  'MENSAJE',        -- visible para el cliente
  'NOTA_INTERNA',   -- solo personal Pintuco
  'EVENTO'          -- generado por el sistema (trazabilidad)
);

create table public.conversation_messages (
  id         uuid primary key default gen_random_uuid(),
  -- El hilo cuelga de un pedido o de un proyecto.
  order_id   uuid references public.orders (id)   on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,

  author_id  uuid references auth.users (id) on delete set null,
  kind       public.message_kind not null default 'MENSAJE',
  body       text not null,
  -- Rutas en el bucket project-files.
  attachments jsonb not null default '[]'::jsonb,
  event_data jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint conversation_messages_un_hilo check (
    (order_id is not null and project_id is null) or
    (order_id is null and project_id is not null)
  ),
  constraint conversation_messages_cuerpo_no_vacio check (length(trim(body)) > 0)
);
create index conversation_messages_order_idx   on public.conversation_messages (order_id, created_at);
create index conversation_messages_project_idx on public.conversation_messages (project_id, created_at);

comment on type public.message_kind is
  'NOTA_INTERNA nunca se entrega al cliente: la política RLS la excluye para quien no es personal.';

-- Cada cambio de estado deja un evento en el hilo.
create or replace function public.trazar_cambio_estado_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.conversation_messages (order_id, kind, body, event_data)
    values (
      new.id, 'EVENTO',
      'El pedido pasó de ' || old.status::text || ' a ' || new.status::text || '.',
      jsonb_build_object('from', old.status, 'to', new.status)
    );

    insert into public.notifications (user_id, order_id, type, title, message)
    values (
      new.user_id, new.id, 'update',
      'Actualización de tu pedido',
      'Tu pedido ' || new.order_number || ' ahora está en estado ' ||
      replace(new.status::text, '_', ' ') || '.'
    );
  end if;
  return new;
end;
$$;

create trigger orders_trazabilidad
  after update on public.orders
  for each row execute function public.trazar_cambio_estado_pedido();

create or replace function public.trazar_cambio_estado_envio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.conversation_messages (order_id, kind, body, event_data)
    values (
      new.order_id, 'EVENTO',
      'Envío: ' || replace(new.status::text, '_', ' ') ||
      coalesce(' · Guía ' || new.tracking_number, '') ||
      coalesce(' · ' || new.carrier, '') || '.',
      jsonb_build_object('status', new.status, 'tracking', new.tracking_number, 'carrier', new.carrier)
    );
  end if;
  return new;
end;
$$;

create trigger shipments_trazabilidad
  after update on public.shipments
  for each row execute function public.trazar_cambio_estado_envio();

create or replace function public.post_message(
  _order_id uuid, _project_id uuid, _body text, _internal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_puede boolean := false;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;
  if coalesce(trim(_body), '') = '' then
    raise exception 'VALIDATION: el mensaje no puede estar vacío' using errcode = '22023';
  end if;

  if _project_id is not null then
    v_puede := public.can_access_project(_project_id);
  elsif _order_id is not null then
    select (o.user_id = v_user_id
            or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
            or public.is_staff())
      into v_puede
    from public.orders o where o.id = _order_id;
  end if;

  if not coalesce(v_puede, false) then
    raise exception 'FORBIDDEN: no tienes acceso a esta conversación' using errcode = '42501';
  end if;

  -- Nota interna de un cliente se degrada a mensaje en vez de rechazarse, para no
  -- perder lo escrito.
  if _internal and not public.is_staff() then
    _internal := false;
  end if;

  insert into public.conversation_messages (order_id, project_id, author_id, kind, body)
  values (_order_id, _project_id, v_user_id,
          case when _internal then 'NOTA_INTERNA' else 'MENSAJE' end, trim(_body))
  returning id into v_id;

  return v_id;
end;
$$;

-- La IA clasifica y sugiere, nunca calcula cantidades ni precios: por eso esta
-- tabla no guarda cifras de producto.
create type public.recommendation_source as enum ('MOTOR_REGLAS','IA_ASISTIDA','ASESOR_TECNICO');
create type public.recommendation_status as enum ('SUGERIDA','ACEPTADA','DESCARTADA');

create table public.recommendations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  diagnosis_id uuid references public.project_diagnoses (id) on delete set null,
  solution_id  uuid references public.solutions (id) on delete set null,

  source       public.recommendation_source not null default 'MOTOR_REGLAS',
  status       public.recommendation_status not null default 'SUGERIDA',
  priority     int not null default 1,
  justification text,
  -- Decide si se muestra como sugerencia o se escala a un asesor.
  confidence   numeric(4,3),
  model        text,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint recommendations_prioridad_valida check (priority between 1 and 10),
  constraint recommendations_confianza_valida
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- Una recomendación de IA debe registrar el modelo para poder auditarla.
  constraint recommendations_ia_con_modelo
    check (source <> 'IA_ASISTIDA' or model is not null)
);
create index recommendations_project_idx on public.recommendations (project_id);

comment on table public.recommendations is
  'La IA sugiere soluciones y justifica; las cantidades y precios provienen siempre del motor de cálculo y del catálogo.';

-- Ley 1581 de 2012 y Ley 1480 de 2011: hay que probar qué versión aceptó cada usuario y cuándo.
create type public.legal_doc_kind as enum (
  'TERMINOS','PRIVACIDAD','HABEAS_DATA','GARANTIA','DEVOLUCIONES','COOKIES'
);

create table public.legal_documents (
  id         uuid primary key default gen_random_uuid(),
  kind       public.legal_doc_kind not null,
  version    text not null,
  title      text not null,
  body       text not null,
  is_current boolean not null default false,
  published_at timestamptz not null default now(),
  constraint legal_documents_version_unica unique (kind, version)
);
create unique index legal_documents_vigente_unico
  on public.legal_documents (kind) where is_current;

create table public.user_consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.legal_documents (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  -- Evidencia exigible ante la SIC.
  ip_address  inet,
  user_agent  text,
  constraint user_consents_unico unique (user_id, document_id)
);
create index user_consents_user_idx on public.user_consents (user_id);

comment on table public.user_consents is
  'Evidencia de aceptación de términos y tratamiento de datos (Ley 1581 de 2012).';

alter table public.conversation_messages enable row level security;
alter table public.recommendations       enable row level security;
alter table public.legal_documents       enable row level security;
alter table public.user_consents         enable row level security;

revoke all on public.conversation_messages, public.recommendations,
              public.legal_documents, public.user_consents
  from anon, authenticated;
grant select on public.conversation_messages, public.recommendations to authenticated;
grant select on public.legal_documents to anon, authenticated;
grant select, insert on public.user_consents to authenticated;

-- El cliente ve su hilo sin las notas internas.
create policy "mensajes_cliente" on public.conversation_messages
  for select to authenticated
  using (
    kind <> 'NOTA_INTERNA'
    and (
      (project_id is not null and (select public.can_access_project(project_id)))
      or (order_id is not null and exists (
            select 1 from public.orders o where o.id = order_id and (
              o.user_id = (select auth.uid())
              or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
            )))
    )
  );

create policy "mensajes_staff" on public.conversation_messages
  for select to authenticated
  using ( (select public.is_staff()) );

create policy "recomendaciones_select" on public.recommendations
  for select to authenticated
  using ( (select public.can_access_project(project_id)) );

create policy "recomendaciones_staff" on public.recommendations
  for all to authenticated
  using ( (select public.is_staff()) and (select public.can_access_project(project_id)) )
  with check ( (select public.is_staff()) and (select public.can_access_project(project_id)) );

-- Públicos: deben leerse antes de registrarse, cuando se aceptan.
create policy "legales_vigentes_publicos" on public.legal_documents
  for select to anon, authenticated using ( is_current );

create policy "legales_admin" on public.legal_documents
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

create policy "consentimientos_propios" on public.user_consents
  for select to authenticated using ( user_id = (select auth.uid()) );

create policy "consentimientos_registrar" on public.user_consents
  for insert to authenticated with check ( user_id = (select auth.uid()) );

create policy "consentimientos_admin" on public.user_consents
  for select to authenticated using ( (select public.is_admin()) );

revoke execute on function public.post_message(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.post_message(uuid, uuid, text, boolean) to authenticated;
