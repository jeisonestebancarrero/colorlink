-- ============================================================
-- MÓDULO 17 — Tesorería: recaudos y conciliación
-- ============================================================
-- Cierra el circuito del dinero: pedido -> factura -> RECAUDO -> movimiento
-- bancario -> conciliación.
--
-- Hasta ahora `payments` guardaba la intención de pago que crea el pedido,
-- pero nadie podía registrar que el dinero LLEGÓ, ni contra qué cuenta, ni
-- cuadrarlo con el extracto del banco.
--
-- SEPARACIÓN DELIBERADA ENTRE TESORERÍA Y CONTABILIDAD:
-- tesorería mueve dinero real (entra, sale, se concilia); contabilidad lo
-- clasifica. Mezclarlas es lo que hace que nadie sepa quién es responsable
-- de una diferencia.
-- ============================================================

create type public.account_kind as enum ('BANCARIA', 'CAJA', 'PASARELA');
create type public.treasury_direction as enum ('INGRESO', 'EGRESO');

create table public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          public.account_kind not null default 'BANCARIA',
  bank_name     text,
  account_number text,
  currency      text not null default 'COP',
  opening_balance numeric(16,2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),

  constraint bank_accounts_nombre_no_vacio check (length(trim(name)) > 0)
);

create table public.treasury_movements (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.bank_accounts (id) on delete restrict,
  direction  public.treasury_direction not null,
  amount_cop numeric(16,2) not null,
  occurred_on date not null default current_date,
  concept    text not null,
  reference  text,

  -- Trazabilidad hacia el origen. Un recaudo siempre debe poder responder
  -- "¿de qué factura viene?".
  payment_id uuid references public.payments (id)  on delete set null,
  order_id   uuid references public.orders (id)    on delete set null,
  invoice_id uuid references public.invoices (id)  on delete set null,

  -- Conciliación con el extracto bancario.
  reconciled     boolean not null default false,
  reconciled_at  timestamptz,
  reconciled_by  uuid references public.profiles (id) on delete set null,
  bank_statement_ref text,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint treasury_movements_importe_positivo check (amount_cop > 0),
  -- Un movimiento conciliado debe decir contra qué línea del extracto.
  constraint treasury_movements_conciliado_con_ref
    check (not reconciled or (reconciled_at is not null and bank_statement_ref is not null))
);

create index treasury_movements_account_idx on public.treasury_movements (account_id, occurred_on desc);
create index treasury_movements_invoice_idx on public.treasury_movements (invoice_id);
create index treasury_movements_pendientes_idx on public.treasury_movements (account_id) where not reconciled;

comment on table public.treasury_movements is
  'Dinero que entra y sale de verdad. La clasificación contable es otro módulo.';

-- ------------------------------------------------------------
-- Saldo por cuenta, derivado de los movimientos.
-- ------------------------------------------------------------
create or replace view public.v_saldos_cuenta
with (security_invoker = true) as
  select
    a.id, a.name, a.kind, a.bank_name, a.account_number, a.currency, a.is_active,
    a.opening_balance
      + coalesce(sum(case when m.direction = 'INGRESO' then m.amount_cop else -m.amount_cop end), 0)
      as balance,
    coalesce(sum(case when not m.reconciled then 1 else 0 end), 0)::int as sin_conciliar
  from public.bank_accounts a
  left join public.treasury_movements m on m.account_id = a.id
  group by a.id;

-- ------------------------------------------------------------
-- Cartera: lo facturado menos lo recaudado.
-- ------------------------------------------------------------
create or replace view public.v_cartera
with (security_invoker = true) as
  select
    i.id as invoice_id,
    i.invoice_number,
    i.customer_name,
    i.issued_at,
    i.total_cop,
    coalesce(sum(m.amount_cop) filter (where m.direction = 'INGRESO'), 0) as recaudado,
    i.total_cop - coalesce(sum(m.amount_cop) filter (where m.direction = 'INGRESO'), 0) as saldo,
    (current_date - i.issued_at::date) as dias
  from public.invoices i
  left join public.treasury_movements m on m.invoice_id = i.id
  where i.status = 'EMITIDA'
  group by i.id;

-- ============================================================
-- Registrar un recaudo
-- ============================================================
create or replace function public.registrar_recaudo(
  _invoice_id uuid,
  _account_id uuid,
  _amount numeric,
  _method text,
  _reference text default null,
  _occurred_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura   public.invoices%rowtype;
  v_recaudado numeric;
  v_saldo     numeric;
  v_payment   uuid;
  v_mov       uuid;
begin
  if not (public.is_admin() or public.has_permission('treasury.manage')) then
    raise exception 'FORBIDDEN: no tienes permiso para registrar recaudos' using errcode = '42501';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'VALIDATION: el valor del recaudo debe ser mayor que cero' using errcode = '22023';
  end if;

  select * into v_factura from public.invoices where id = _invoice_id;
  if v_factura.id is null then
    raise exception 'NOT_FOUND: la factura no existe' using errcode = 'P0002';
  end if;
  if v_factura.status <> 'EMITIDA' then
    raise exception 'VALIDATION: no se puede recaudar sobre una factura anulada' using errcode = '22023';
  end if;

  select coalesce(sum(amount_cop), 0) into v_recaudado
  from public.treasury_movements
  where invoice_id = _invoice_id and direction = 'INGRESO';

  v_saldo := v_factura.total_cop - v_recaudado;

  -- No se admite cobrar de más: un sobrepago silencioso descuadra la cartera
  -- y aparece semanas después como una diferencia que nadie sabe explicar.
  if _amount > v_saldo then
    raise exception 'OVERPAYMENT: el recaudo (%) supera el saldo pendiente (%)', _amount, v_saldo
      using errcode = '22023';
  end if;

  insert into public.payments (order_id, method, status, amount_cop, reference, paid_at)
  values (v_factura.order_id, _method::public.payment_method, 'PAGADO', _amount, _reference, now())
  returning id into v_payment;

  insert into public.treasury_movements (
    account_id, direction, amount_cop, occurred_on, concept, reference,
    payment_id, order_id, invoice_id, created_by
  ) values (
    _account_id, 'INGRESO', _amount, coalesce(_occurred_on, current_date),
    'Recaudo factura ' || v_factura.invoice_number, _reference,
    v_payment, v_factura.order_id, _invoice_id, (select auth.uid())
  )
  returning id into v_mov;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PAYMENT_RECEIVED', 'treasury_movements', v_mov,
          jsonb_build_object('invoice', v_factura.invoice_number, 'amount', _amount));

  return jsonb_build_object(
    'movement_id', v_mov,
    'recaudado_total', v_recaudado + _amount,
    'saldo', v_saldo - _amount,
    'saldada', (v_saldo - _amount) <= 0
  );
end;
$$;

-- ============================================================
-- Conciliar contra el extracto
-- ============================================================
create or replace function public.conciliar_movimiento(
  _movement_id uuid, _bank_ref text, _conciliado boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_permission('treasury.manage')) then
    raise exception 'FORBIDDEN: no tienes permiso para conciliar' using errcode = '42501';
  end if;

  if _conciliado and coalesce(trim(_bank_ref), '') = '' then
    raise exception 'VALIDATION: indica la referencia del extracto bancario' using errcode = '22023';
  end if;

  update public.treasury_movements
     set reconciled = _conciliado,
         reconciled_at = case when _conciliado then now() end,
         reconciled_by = case when _conciliado then (select auth.uid()) end,
         bank_statement_ref = case when _conciliado then trim(_bank_ref) end
   where id = _movement_id;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.bank_accounts       enable row level security;
alter table public.treasury_movements  enable row level security;

revoke all on public.bank_accounts, public.treasury_movements from anon, authenticated;
grant select on public.bank_accounts, public.treasury_movements to authenticated;
grant select on public.v_saldos_cuenta, public.v_cartera to authenticated;

-- Solo tesorería, contabilidad y administración ven el dinero. Un asesor o
-- un cliente no tienen nada que hacer aquí.
create policy "cuentas_finanzas" on public.bank_accounts
  for select to authenticated
  using ( (select public.is_admin())
          or (select public.has_permission('treasury.manage'))
          or (select public.has_permission('accounting.read')) );

create policy "cuentas_admin" on public.bank_accounts
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

create policy "movimientos_finanzas" on public.treasury_movements
  for select to authenticated
  using ( (select public.is_admin())
          or (select public.has_permission('treasury.manage'))
          or (select public.has_permission('accounting.read')) );

revoke execute on function public.registrar_recaudo(uuid, uuid, numeric, text, text, date) from public, anon;
revoke execute on function public.conciliar_movimiento(uuid, text, boolean)                 from public, anon;
grant execute on function public.registrar_recaudo(uuid, uuid, numeric, text, text, date) to authenticated;
grant execute on function public.conciliar_movimiento(uuid, text, boolean)                 to authenticated;

-- Cuentas iniciales de demostración.
insert into public.bank_accounts (name, kind, bank_name, account_number, opening_balance) values
  ('Cuenta corriente principal', 'BANCARIA', 'Bancolombia', '***4821', 0),
  ('Caja punto de venta',        'CAJA',     null,          null,      0),
  ('Recaudo PSE',                'PASARELA', 'PSE',         null,      0)
on conflict do nothing;
