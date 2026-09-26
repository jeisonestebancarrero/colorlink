-- Contabilidad operativa en partida doble con códigos del PUC (Decreto 2650).
-- No cubre DIAN, retenciones, NIIF ni cierres fiscales.

-- account_class porque account_kind ya es el tipo de cuenta bancaria de tesorería.
create type public.account_class as enum ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'COSTO');

-- Naturaleza del saldo normal; guardarla evita errores de signo en los informes.
create type public.account_nature as enum ('DEBITO', 'CREDITO');

create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  class       public.account_class not null,
  nature      public.account_nature not null,
  parent_code text,
    -- Solo las cuentas de movimiento reciben asientos; las de agrupación suman a sus hijas.
  is_postable boolean not null default true,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index accounts_code_idx on public.accounts (code);

alter table public.accounts enable row level security;

create policy accounts_lectura on public.accounts
  for select to authenticated
  using ( (select public.has_permission('accounting.read')) );
create policy accounts_escritura on public.accounts
  for all to authenticated
  using ( (select public.has_permission('accounting.write')) )
  with check ( (select public.has_permission('accounting.write')) );

grant select, insert, update on public.accounts to authenticated;

-- Escribir asientos es un permiso aparte y crítico.
insert into public.permissions (code, module, action, label, description, is_critical, sort_order)
values (
  'accounting.write', 'Contabilidad', 'write',
  'Registrar y anular comprobantes',
  'Crear asientos manuales y anular comprobantes contables. Altera los libros del negocio.',
  true, 91
)
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code, granted)
values
  ('ADMINISTRADOR', 'accounting.write', true),
  ('CONTABILIDAD',  'accounting.write', true)
on conflict (role, permission_code) do update set granted = excluded.granted;

-- PUC: solo las cuentas que este sistema mueve.
insert into public.accounts (code, name, class, nature, parent_code, is_postable) values
  -- ACTIVO
  ('1',      'Activo',                             'ACTIVO',     'DEBITO',  null,   false),
  ('11',     'Disponible',                         'ACTIVO',     'DEBITO',  '1',    false),
  ('1105',   'Caja',                               'ACTIVO',     'DEBITO',  '11',   true),
  ('1110',   'Bancos',                             'ACTIVO',     'DEBITO',  '11',   true),
  ('13',     'Deudores',                           'ACTIVO',     'DEBITO',  '1',    false),
  ('1305',   'Clientes',                           'ACTIVO',     'DEBITO',  '13',   true),
  ('14',     'Inventarios',                        'ACTIVO',     'DEBITO',  '1',    false),
  ('1435',   'Mercancías no fabricadas por la empresa', 'ACTIVO', 'DEBITO', '14',   true),
  ('1355',   'Anticipo de impuestos — IVA descontable', 'ACTIVO', 'DEBITO', '13',   true),
  -- PASIVO
  ('2',      'Pasivo',                             'PASIVO',     'CREDITO', null,   false),
  ('22',     'Proveedores',                        'PASIVO',     'CREDITO', '2',    false),
  ('2205',   'Proveedores nacionales',             'PASIVO',     'CREDITO', '22',   true),
  ('24',     'Impuestos, gravámenes y tasas',      'PASIVO',     'CREDITO', '2',    false),
  ('2408',   'Impuesto sobre las ventas por pagar','PASIVO',     'CREDITO', '24',   true),
  -- PATRIMONIO
  ('3',      'Patrimonio',                         'PATRIMONIO', 'CREDITO', null,   false),
  ('3105',   'Capital suscrito y pagado',          'PATRIMONIO', 'CREDITO', '3',    true),
  -- INGRESOS
  ('4',      'Ingresos',                           'INGRESO',    'CREDITO', null,   false),
  ('41',     'Operacionales',                      'INGRESO',    'CREDITO', '4',    false),
  ('4135',   'Comercio al por mayor y al por menor','INGRESO',   'CREDITO', '41',   true),
  ('4175',   'Devoluciones, rebajas y descuentos en ventas', 'INGRESO', 'DEBITO', '41', true),
  -- COSTOS
  ('6',      'Costos de ventas',                   'COSTO',      'DEBITO',  null,   false),
  ('6135',   'Costo de mercancía vendida',         'COSTO',      'DEBITO',  '6',    true),
  -- GASTOS
  ('5',      'Gastos',                             'GASTO',      'DEBITO',  null,   false),
  ('5135',   'Servicios',                          'GASTO',      'DEBITO',  '5',    true),
  ('5195',   'Diversos',                           'GASTO',      'DEBITO',  '5',    true)
on conflict (code) do nothing;

create type public.journal_source as enum (
  'MANUAL', 'FACTURA', 'RECEPCION', 'RECAUDO', 'AJUSTE_INVENTARIO'
);

create type public.journal_status as enum ('REGISTRADO', 'ANULADO');

create sequence public.journal_number_seq start 1;

create table public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  entry_number  text not null unique,
  entry_date    date not null default current_date,
  source        public.journal_source not null default 'MANUAL',
    -- Documento de origen, para trazar el asiento al hecho económico.
  invoice_id    uuid references public.invoices (id) on delete set null,
  receipt_id    uuid references public.purchase_receipts (id) on delete set null,
  movement_id   uuid references public.treasury_movements (id) on delete set null,
  description   text not null,
  status        public.journal_status not null default 'REGISTRADO',
  total_debit   numeric(16,2) not null default 0,
  total_credit  numeric(16,2) not null default 0,
  created_by    uuid references public.profiles (id),
  voided_by     uuid references public.profiles (id),
  voided_at     timestamptz,
  void_reason   text,
  created_at    timestamptz not null default now(),
    -- La partida doble se exige en la base para que ningún camino la salte.
  constraint journal_entries_cuadrado check (total_debit = total_credit)
);

create index journal_entries_fecha_idx on public.journal_entries (entry_date desc);
create index journal_entries_origen_idx on public.journal_entries (source, status);

create table public.journal_lines (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.journal_entries (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete restrict,
  description text,
  debit_cop   numeric(16,2) not null default 0 check (debit_cop >= 0),
  credit_cop  numeric(16,2) not null default 0 check (credit_cop >= 0),
  sort_order  integer not null default 0,
    -- Una línea es débito o crédito, exactamente uno.
  constraint journal_lines_debito_o_credito
    check ((debit_cop > 0 and credit_cop = 0) or (credit_cop > 0 and debit_cop = 0))
);

create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account_id);

alter table public.journal_entries enable row level security;
alter table public.journal_lines   enable row level security;

create policy journal_lectura on public.journal_entries
  for select to authenticated
  using ( (select public.has_permission('accounting.read')) );
create policy journal_lineas_lectura on public.journal_lines
  for select to authenticated
  using ( (select public.has_permission('accounting.read')) );

-- Sin escritura directa: los asientos se crean por función para no quedar descuadrados.
grant select on public.journal_entries to authenticated;
grant select on public.journal_lines   to authenticated;
