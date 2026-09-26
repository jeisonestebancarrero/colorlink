-- Configuración global de la empresa y del correo saliente, editable desde la interfaz.
create table public.app_settings (
  id smallint primary key default 1,

  -- Datos impresos en la factura POS.
  company_name       text not null default 'Pintuco',
  company_legal_name text,
  company_nit        text,
  company_address    text,
  company_city       text,
  company_phone      text,
  company_email      text,
  company_website    text,
  logo_url           text,
  tax_regime         text default 'Responsable de IVA',
  default_tax_rate   numeric(5,2) not null default 19.00,
  invoice_prefix     text not null default 'POS',
  invoice_footer     text default 'Gracias por su compra.',

  -- Correo saliente. Gmail exige contraseña de aplicación, no la de la cuenta.
  smtp_host      text,
  smtp_port      int default 587,
  smtp_secure    boolean not null default true,
  smtp_user      text,
  -- Nunca llega al navegador: queda fuera del grant de SELECT y solo la lee el
  -- envío en el servidor con service_role.
  smtp_password  text,
  smtp_from_name  text,
  smtp_from_email text,
  smtp_configured_at timestamptz,

  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint app_settings_fila_unica check (id = 1),
  constraint app_settings_iva_valido check (default_tax_rate >= 0 and default_tax_rate <= 100),
  constraint app_settings_puerto_valido check (smtp_port is null or (smtp_port > 0 and smtp_port <= 65535))
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Bitácora de envíos, para diagnosticar correos que no llegan.
create table public.email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text not null,
  template   text,
  status     text not null default 'PENDIENTE',
  error      text,
  order_id   uuid references public.orders (id)   on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index email_log_created_at_idx on public.email_log (created_at desc);

alter table public.app_settings enable row level security;
alter table public.email_log    enable row level security;

revoke all on public.app_settings from anon, authenticated;
revoke all on public.email_log    from anon, authenticated;

-- Datos públicos de la tienda; smtp_password queda fuera a propósito.
grant select (
  id, company_name, company_legal_name, company_nit, company_address,
  company_city, company_phone, company_email, company_website, logo_url,
  tax_regime, default_tax_rate, invoice_prefix, invoice_footer,
  smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from_name,
  smtp_from_email, smtp_configured_at, updated_at
) on public.app_settings to anon, authenticated;

grant update (
  company_name, company_legal_name, company_nit, company_address,
  company_city, company_phone, company_email, company_website, logo_url,
  tax_regime, default_tax_rate, invoice_prefix, invoice_footer,
  smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password,
  smtp_from_name, smtp_from_email
) on public.app_settings to authenticated;

grant select on public.email_log to authenticated;

create policy "app_settings_lectura" on public.app_settings
  for select to anon, authenticated using (true);

create policy "app_settings_escritura_admin" on public.app_settings
  for update to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

create policy "email_log_admin" on public.email_log
  for select to authenticated using ( (select public.is_admin()) );

-- Vía función para auditar y para que una contraseña vacía signifique "no cambiar".
create or replace function public.save_smtp_settings(
  _host text, _port int, _secure boolean, _user text,
  _password text, _from_name text, _from_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración configura el correo saliente'
      using errcode = '42501';
  end if;

  update public.app_settings
     set smtp_host   = nullif(trim(_host), ''),
         smtp_port   = coalesce(_port, 587),
         smtp_secure = coalesce(_secure, true),
         smtp_user   = nullif(trim(_user), ''),
         -- Vacía conserva la guardada: la interfaz no puede leerla para reenviarla.
         smtp_password = case
           when coalesce(trim(_password), '') = '' then smtp_password
           else _password
         end,
         smtp_from_name  = nullif(trim(_from_name), ''),
         smtp_from_email = nullif(trim(_from_email), ''),
         smtp_configured_at = now(),
         updated_by = (select auth.uid())
   where id = 1;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'SMTP_CONFIGURED', 'app_settings', null,
          jsonb_build_object('host', _host, 'user', _user));
end;
$$;

-- Estado del correo sin exponer la contraseña.
create or replace function public.smtp_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'configured', (s.smtp_host is not null and s.smtp_user is not null and s.smtp_password is not null),
    'host', s.smtp_host,
    'port', s.smtp_port,
    'user', s.smtp_user,
    'from_email', s.smtp_from_email,
    'configured_at', s.smtp_configured_at
  )
  from public.app_settings s where s.id = 1;
$$;

revoke execute on function public.save_smtp_settings(text, int, boolean, text, text, text, text) from public, anon;
grant execute on function public.save_smtp_settings(text, int, boolean, text, text, text, text) to authenticated;
grant execute on function public.smtp_status() to authenticated;
