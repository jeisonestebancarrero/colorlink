-- ============================================================
-- Si cambia la sede del pedido, se revisa el asesor
-- ============================================================
-- El asesor se elige por la sede del pedido. Cuando esa sede cambia —el
-- cliente mueve el retiro a otro punto, o alguien corrige el pedido desde el
-- portal— el asesor asignado puede dejar de cubrirla, y entonces pasa lo peor:
-- el pedido conserva un dueño que **su propia RLS le oculta**. Nadie lo ve y
-- figura como atendido.
--
-- Sale más caro que no tener asesor: un pedido sin asignar al menos aparece en
-- el reparto de huérfanos.
-- ============================================================

create or replace function public.orders_revisar_asesor_por_sede()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo si el asesor actual ya no puede con la sede nueva. Si sigue
  -- cubriéndola, no se toca: cambiar de asesor sin motivo le quita al cliente
  -- la persona con la que ya venía hablando.
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
