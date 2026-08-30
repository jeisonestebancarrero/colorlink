-- ============================================================
-- Un pedido no se alista si no está pagado ni salió a crédito
-- ============================================================
-- Es la contraparte operativa de la pasarela: de nada sirve cobrar antes si el
-- portal interno igual puede mover el pedido a PREPARANDO. Quien alista saca
-- mercancía de la bodega; hacerlo sin cobro es regalar producto.
--
-- Se deja pasar la CANCELACIÓN siempre: un pedido sin pagar es justamente el
-- que hay que poder cancelar.
create or replace function public.exigir_cobro_para_alistar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status in ('CONFIRMADO', 'PREPARANDO', 'ENVIADO', 'LISTO_PARA_RETIRO', 'ENTREGADO')
     and not public.pedido_cobrado(new.id) then
    raise exception
      'SIN_COBRO: el pedido % no está pagado ni salió a crédito aprobado', new.order_number
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_exigir_cobro on public.orders;
create trigger orders_exigir_cobro
  before update on public.orders
  for each row execute function public.exigir_cobro_para_alistar();
