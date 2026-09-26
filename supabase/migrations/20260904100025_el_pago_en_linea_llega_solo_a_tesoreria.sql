-- Crea el movimiento de tesorería cuando un pago en línea pasa a PAGADO. Solo en UPDATE:
-- el recaudo manual nace PAGADO y crea su propio movimiento. Se evita el duplicado
-- porque las pasarelas reenvían eventos.
create or replace function public.pago_en_linea_a_tesoreria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta uuid;
  v_clase  text;
begin
  if new.status <> 'PAGADO' or old.status = 'PAGADO' then
    return new;
  end if;

  -- Una venta a crédito no es ingreso: su movimiento nace al recaudar la cartera.
  if coalesce(new.is_credit, false) then
    return new;
  end if;

  if exists (select 1 from public.treasury_movements where payment_id = new.id) then
    return new;
  end if;

  -- Efectivo a caja, lo demás a banco; sin esa cuenta se usa otra activa antes que
  -- perder el registro.
  v_clase := case new.method
    when 'EFECTIVO' then 'CAJA'
    when 'TRANSFERENCIA' then 'BANCARIA'
    else 'PASARELA'
  end;

  select id into v_cuenta
    from public.bank_accounts
   where is_active and kind::text = v_clase
   order by created_at
   limit 1;

  if v_cuenta is null then
    select id into v_cuenta from public.bank_accounts where is_active order by created_at limit 1;
  end if;
  if v_cuenta is null then
    raise warning 'pago_en_linea_a_tesoreria: no hay ninguna cuenta activa; el pago % queda sin movimiento', new.id;
    return new;
  end if;

  insert into public.treasury_movements (
    account_id, direction, amount_cop, occurred_on, concept, reference,
    payment_id, order_id, created_by
  )
  select v_cuenta, 'INGRESO', new.amount_cop, coalesce(new.paid_at::date, current_date),
         'Pago en línea del pedido ' || coalesce(o.order_number, ''),
         new.reference, new.id, new.order_id, null
    from public.orders o
   where o.id = new.order_id;

  return new;
end;
$$;

drop trigger if exists payments_zz_tesoreria on public.payments;
create trigger payments_zz_tesoreria
  after update of status on public.payments
  for each row
  execute function public.pago_en_linea_a_tesoreria();

-- Backfill de pagos en línea ya confirmados sin movimiento.
insert into public.treasury_movements (
  account_id, direction, amount_cop, occurred_on, concept, reference,
  payment_id, order_id
)
select coalesce(
         (select id from public.bank_accounts where is_active and kind::text = 'PASARELA' order by created_at limit 1),
         (select id from public.bank_accounts where is_active order by created_at limit 1)
       ),
       'INGRESO', pa.amount_cop, coalesce(pa.paid_at::date, current_date),
       'Pago en línea del pedido ' || coalesce(o.order_number, ''),
       pa.reference, pa.id, pa.order_id
  from public.payments pa
  join public.orders o on o.id = pa.order_id
 where pa.status = 'PAGADO'
   and not coalesce(pa.is_credit, false)
   and not exists (select 1 from public.treasury_movements t where t.payment_id = pa.id)
   and exists (select 1 from public.bank_accounts where is_active);
