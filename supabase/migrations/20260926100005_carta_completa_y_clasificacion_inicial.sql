-- Carta de colores para los recubrimientos que no tenían, y reparto inicial por color de las
-- existencias sin clasificar. Datos de demostración del proyecto académico.

insert into public.product_colors (product_id, color_id, sort_order)
select p.id, c.id, x.orden - 1
  from (values
    ('PNT-IND-008', array['PNT-1015','PNT-1009','PNT-1010','PNT-100','PNT-1013']),
    ('PNT-MAD-007', array['PNT-1032','PNT-1023','PNT-1024','PNT-1025','PNT-1092'])
  ) as carta(producto, colores)
  join public.products p on p.code = carta.producto
  cross join lateral unnest(carta.colores) with ordinality as x(codigo, orden)
  join public.colors c on c.code = x.codigo
on conflict (product_id, color_id) do nothing;

-- Lo libre de cada fila sin color se reparte en partes iguales entre los colores del producto;
-- lo reservado se queda sin clasificar hasta que salga su pedido.
do $$
declare
  f        record;
  v_colores uuid[];
  v_n      int;
  v_libre  int;
  v_parte  int;
  v_resto  int;
  v_cant   int;
  i        int;
begin
  for f in
    select i.id, i.variant_id, i.location_id, i.qty_available, i.qty_reserved, i.avg_cost_cop, v.product_id
      from public.inventory i
      join public.product_variants v on v.id = i.variant_id
     where i.color_id is null
       and exists (select 1 from public.product_colors pc where pc.product_id = v.product_id)
  loop
    select array_agg(color_id order by sort_order) into v_colores
      from public.product_colors where product_id = f.product_id;
    v_n := array_length(v_colores, 1);
    v_libre := f.qty_available - f.qty_reserved;
    continue when v_libre <= 0;
    v_parte := v_libre / v_n;
    v_resto := v_libre % v_n;

    for i in 1..v_n loop
      v_cant := v_parte + case when i <= v_resto then 1 else 0 end;
      continue when v_cant = 0;
      insert into public.inventory (variant_id, location_id, color_id, qty_available, qty_reserved, avg_cost_cop)
      values (f.variant_id, f.location_id, v_colores[i], v_cant, 0, f.avg_cost_cop)
      on conflict (variant_id, location_id, color_id)
      do update set qty_available = public.inventory.qty_available + excluded.qty_available;

      insert into public.inventory_movements (variant_id, location_id, color_id, kind, quantity, balance_after, reference, notes)
      select f.variant_id, f.location_id, v_colores[i], 'ENTRADA', v_cant, i2.qty_available,
             'CLASIFICACION-INICIAL', 'Reparto inicial por color'
        from public.inventory i2
       where i2.variant_id = f.variant_id and i2.location_id = f.location_id and i2.color_id = v_colores[i];
    end loop;

    update public.inventory set qty_available = qty_available - v_libre where id = f.id;
    insert into public.inventory_movements (variant_id, location_id, color_id, kind, quantity, balance_after, reference, notes)
    values (f.variant_id, f.location_id, null, 'SALIDA', v_libre, f.qty_available - v_libre,
            'CLASIFICACION-INICIAL', 'Reparto inicial por color');
  end loop;

  -- Filas sin color que quedaron en cero y sin reservas ya no aportan nada.
  delete from public.inventory i
   using public.product_variants v
   where v.id = i.variant_id and i.color_id is null and i.qty_available = 0 and i.qty_reserved = 0
     and exists (select 1 from public.product_colors pc where pc.product_id = v.product_id);
end;
$$;
