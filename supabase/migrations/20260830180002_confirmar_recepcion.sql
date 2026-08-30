-- ============================================================
-- Confirmar una recepción: donde el costo entra al sistema
-- ============================================================
-- Mientras la recepción está en BORRADOR no toca el inventario: se puede
-- corregir línea por línea contra el papel del proveedor. Al confirmarla
-- ocurren tres cosas de una vez, dentro de la misma transacción:
--   1. entran las unidades a la bodega,
--   2. se recalcula el costo promedio ponderado de cada referencia,
--   3. queda el rastro de quién la confirmó y con qué documento.
--
-- Separar el borrador de la confirmación no es burocracia: recibir mercancía
-- es teclear muchas líneas, y si cada una impactara el saldo al instante, un
-- error a mitad de camino dejaría el inventario a medio actualizar sin forma
-- de saber dónde se quedó.
-- ============================================================

create or replace function public.confirm_purchase_receipt(_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec      public.purchase_receipts%rowtype;
  r          record;
  v_saldo    integer;
  v_promedio numeric(14,2);
  v_total    numeric(14,2) := 0;
  v_lineas   integer := 0;
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para recibir mercancía'
      using errcode = '42501';
  end if;

  select * into v_rec from public.purchase_receipts where id = _receipt_id for update;
  if v_rec.id is null then
    raise exception 'NOT_FOUND: esa recepción no existe' using errcode = 'P0002';
  end if;
  if v_rec.status <> 'BORRADOR' then
    raise exception 'YA_PROCESADA: esta recepción ya fue % y no se puede volver a confirmar', lower(v_rec.status::text)
      using errcode = '23505';
  end if;

  if not exists (select 1 from public.purchase_receipt_items where receipt_id = _receipt_id) then
    raise exception 'SIN_LINEAS: agrega al menos un producto antes de confirmar'
      using errcode = '22023';
  end if;

  for r in
    select i.variant_id, i.quantity, i.unit_cost_cop
    from public.purchase_receipt_items i
    where i.receipt_id = _receipt_id
    order by i.created_at
  loop
    -- La fila de inventario debe existir antes de recibir: una referencia
    -- puede llegar por primera vez a esta bodega.
    insert into public.inventory (variant_id, location_id, qty_available, qty_reserved)
    values (r.variant_id, v_rec.location_id, 0, 0)
    on conflict (variant_id, location_id) do nothing;

    -- Se lee el saldo ANTES de la entrada y se bloquea la fila: el promedio
    -- ponderado se calcula sobre lo que había, y dos recepciones simultáneas
    -- de la misma referencia no pueden partir del mismo saldo.
    select qty_available, avg_cost_cop into v_saldo, v_promedio
      from public.inventory
     where variant_id = r.variant_id and location_id = v_rec.location_id
     for update;

    -- Promedio ponderado: (unidades viejas × costo viejo + unidades nuevas ×
    -- costo nuevo) / total de unidades. Es el método usual en Colombia y el
    -- único que no exige rastrear cada unidad individualmente.
    --
    -- Si lo que había estaba en costo cero —inventario cargado antes de
    -- existir este módulo— se toma el costo nuevo tal cual: promediar contra
    -- un cero que nadie midió ensuciaría el dato real que acaba de llegar.
    if v_saldo <= 0 or coalesce(v_promedio, 0) = 0 then
      v_promedio := r.unit_cost_cop;
    else
      v_promedio := round(
        ((v_saldo * v_promedio) + (r.quantity * r.unit_cost_cop))::numeric
        / (v_saldo + r.quantity),
        2);
    end if;

    perform public.register_inventory_movement(
      r.variant_id, v_rec.location_id, 'ENTRADA', r.quantity,
      v_rec.receipt_number, 'Recepción ' || coalesce(v_rec.document_ref, v_rec.receipt_number));

    update public.inventory
       set avg_cost_cop = v_promedio, updated_at = now()
     where variant_id = r.variant_id and location_id = v_rec.location_id;

    v_total  := v_total + (r.quantity * r.unit_cost_cop);
    v_lineas := v_lineas + 1;
  end loop;

  update public.purchase_receipts
     set status = 'CONFIRMADA',
         total_cop = v_total,
         confirmed_by = auth.uid(),
         confirmed_at = now(),
         updated_at = now()
   where id = _receipt_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'RECEIPT_CONFIRMED', 'purchase_receipts', _receipt_id,
          jsonb_build_object('lineas', v_lineas, 'total', v_total,
                             'documento', v_rec.document_ref));

  return jsonb_build_object('lineas', v_lineas, 'total', v_total);
end;
$$;

revoke all on function public.confirm_purchase_receipt(uuid) from public, anon;
grant execute on function public.confirm_purchase_receipt(uuid) to authenticated;

-- ------------------------------------------------------------
-- Crear la recepción con su numeración
-- ------------------------------------------------------------
create or replace function public.create_purchase_receipt(
  _location_id  uuid,
  _supplier_id  uuid default null,
  _document_ref text default null,
  _received_on  date default null,
  _notes        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para recibir mercancía'
      using errcode = '42501';
  end if;

  if _location_id is null then
    raise exception 'SIN_BODEGA: indica a qué punto de venta llega la mercancía'
      using errcode = '22023';
  end if;

  insert into public.purchase_receipts (
    receipt_number, supplier_id, location_id, document_ref, received_on, notes, created_by
  ) values (
    'REC-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.receipt_number_seq')::text, 5, '0'),
    _supplier_id, _location_id,
    nullif(trim(_document_ref), ''),
    coalesce(_received_on, current_date),
    nullif(trim(_notes), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_purchase_receipt(uuid, uuid, text, date, text) from public, anon;
grant execute on function public.create_purchase_receipt(uuid, uuid, text, date, text) to authenticated;

-- ------------------------------------------------------------
-- Anular una recepción en borrador
-- ------------------------------------------------------------
-- Solo se anula lo que aún no tocó el inventario. Una recepción confirmada
-- no se borra: si llegó mercancía de menos, eso se corrige con un ajuste por
-- conteo, que deja su propio rastro. Borrar el documento haría desaparecer
-- la única prueba de lo que entró.
create or replace function public.void_purchase_receipt(_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.receipt_status;
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para anular recepciones'
      using errcode = '42501';
  end if;

  select status into v_estado from public.purchase_receipts where id = _receipt_id;
  if v_estado is null then
    raise exception 'NOT_FOUND: esa recepción no existe' using errcode = 'P0002';
  end if;
  if v_estado = 'CONFIRMADA' then
    raise exception 'YA_CONFIRMADA: una recepción confirmada no se anula; corrige con un ajuste por conteo'
      using errcode = '42501';
  end if;

  update public.purchase_receipts
     set status = 'ANULADA', updated_at = now()
   where id = _receipt_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'RECEIPT_VOIDED', 'purchase_receipts', _receipt_id, '{}'::jsonb);
end;
$$;

revoke all on function public.void_purchase_receipt(uuid) from public, anon;
grant execute on function public.void_purchase_receipt(uuid) to authenticated;
