-- ============================================================
-- Costo estándar de partida para todas las presentaciones
-- ============================================================
-- Analítica calcula el margen con `coalesce(order_items.unit_cost_cop,
-- product_variants.cost_cop)`. Sin ninguno de los dos, cada línea salía con
-- margen nulo y la pantalla no se podía ni mirar.
--
-- Estos son costos ESTIMADOS, no los reales de Pintuco: se derivan del precio
-- de venta aplicando el margen bruto típico de cada categoría en el mercado
-- colombiano. Sirven para operar y para probar, y quedan reemplazados en
-- cuanto entre la primera recepción de mercancía, que es donde se conoce el
-- costo de verdad (`confirm_purchase_receipt` recalcula el promedio ponderado).
--
-- Solo se tocan las presentaciones que todavía no tienen costo: si alguien ya
-- cargó uno, mandarlo a un porcentaje inventado sería destruir un dato bueno.
update public.product_variants pv
   set cost_cop = round(
         pv.price_cop * case cat.name
           -- Pintura de fachada y vinilos: rotación alta, margen medio.
           when 'Fachadas & Exteriores'       then 0.62
           when 'Vinilos & Interiores'        then 0.60
           -- Impermeabilizantes y epóxicos: producto técnico, margen mayor.
           when 'Impermeabilizantes'          then 0.58
           when 'Industriales & Epóxicos'     then 0.55
           when 'Esmaltes & Metales'          then 0.61
           when 'Maderas & Barnices'          then 0.59
           -- Complementos: el margen más alto del punto de venta.
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
