-- Costo estándar estimado a partir del precio y el margen típico por categoría,
-- solo donde no hay costo. Se reemplaza con la primera recepción real.
update public.product_variants pv
   set cost_cop = round(
         pv.price_cop * case cat.name
           when 'Fachadas & Exteriores'       then 0.62
           when 'Vinilos & Interiores'        then 0.60
           when 'Impermeabilizantes'          then 0.58
           when 'Industriales & Epóxicos'     then 0.55
           when 'Esmaltes & Metales'          then 0.61
           when 'Maderas & Barnices'          then 0.59
           when 'Herramientas & Complementos' then 0.48
           else 0.60
         end,
         2
       ),
       updated_at = now()
  from public.products p
  left join public.categories cat on cat.id = p.category_id
 where pv.product_id = p.id
   and pv.cost_cop is null
   and pv.price_cop > 0;

comment on column public.product_variants.cost_cop is
  'Costo estándar de referencia, confidencial (permiso costs.read). Es el respaldo cuando una línea de pedido no tiene costo congelado; el costo real lo fija la recepción de mercancía.';
