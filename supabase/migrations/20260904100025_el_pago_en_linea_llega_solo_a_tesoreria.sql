-- El pago en línea entra solo a tesorería.
--
-- El cliente pagaba desde el carrito, el pedido quedaba cobrado y el pago
-- registrado… y en tesorería no aparecía nada. Alguien tenía que entrar a
-- «asociar pago» a mano. Eso no es una tarea: es una forma de que el dinero
-- que sí entró no figure hasta que alguien se acuerde, y de que la caja del
-- día nunca cuadre con lo que de verdad se recaudó.
--
-- Va SOLO EN LA ACTUALIZACIÓN, y esa es la parte que importa:
--
--   · Un pago en línea NACE 'PENDIENTE' (lo crea `create_order_from_cart`) y
--     pasa a 'PAGADO' cuando el webhook lo confirma. Eso es un UPDATE.
--   · Un recaudo manual NACE ya 'PAGADO' desde `registrar_recaudo`, que crea
--     su propio movimiento acto seguido con la cuenta que eligió la persona.
--     Eso es un INSERT.
--
-- Disparando solo en el UPDATE, cada camino crea exactamente un movimiento y
-- ninguno pisa al otro. Aun así se comprueba que no exista ya uno para ese
-- pago: las pasarelas reenvían el mismo evento y un ingreso duplicado en la
-- caja es de los errores más caros de rastrear.
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

  -- Una venta a crédito no es plata que entró: la cartera se recauda después,
  -- y ahí sí nace su movimiento. Meterla aquí inflaría la caja del día.
  if coalesce(new.is_credit, false) then
    return new;
  end if;

  if exists (select 1 from public.treasury_movements where payment_id = new.id) then
    return new;
  end if;

  -- El efectivo entra por caja; lo demás llega por la pasarela y de ahí pasa
  -- al banco. Si la cuenta esperada no existe, se usa cualquiera activa antes
  -- que perder el registro: un movimiento en la cuenta equivocada se corrige;
  -- uno que nunca se creó, no se sabe que falta.
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

-- Los pagos en línea que ya estaban confirmados y se quedaron fuera de la caja.
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
