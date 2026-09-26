-- Al cambiar la sede del pedido se reasigna el asesor si ya no la cubre: RLS le
-- ocultaría un pedido que figura como atendido.

create or replace function public.orders_revisar_asesor_por_sede()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Si el asesor sigue cubriendo la sede no se cambia: el cliente conserva su interlocutor.
  if new.advisor_id is not null
     and not exists (
       select 1 from public.asesores_para_sede(new.pickup_location_id) a
        where a = new.advisor_id
     )
  then
    update public.orders
       set advisor_id = null, advisor_assigned_at = null
     where id = new.id;

    perform public.asignar_asesor(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_zz_revisar_asesor on public.orders;
create trigger orders_zz_revisar_asesor
  after update of pickup_location_id on public.orders
  for each row
  when (old.pickup_location_id is distinct from new.pickup_location_id)
  execute function public.orders_revisar_asesor_por_sede();

notify pgrst, 'reload schema';
