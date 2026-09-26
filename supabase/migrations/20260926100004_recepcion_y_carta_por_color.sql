-- Una recepción puede traer la misma presentación en varios colores: una línea por color.
alter table public.purchase_receipt_items drop constraint purchase_receipt_items_una_linea_por_variante;
alter table public.purchase_receipt_items
  add constraint purchase_receipt_items_una_linea_por_variante_y_color
  unique nulls not distinct (receipt_id, variant_id, color_id);

-- El personal ve la carta de productos ocultos o descontinuados; sin esto, guardar la dejaba vacía.
create policy product_colors_lectura_personal on public.product_colors
  for select to authenticated using ((select public.is_staff()));

notify pgrst, 'reload schema';
