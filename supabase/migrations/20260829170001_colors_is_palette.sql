-- Marca los colores de la carta publicada frente a los que solo existen como opción
-- de un producto. Filtrar por rgb no nulo funcionaría por coincidencia, no por regla.

alter table public.colors
  add column is_palette boolean not null default false;

comment on column public.colors.is_palette is
  'true = pertenece a la carta de color publicada. false = existe solo como opción de un producto.';

create index colors_is_palette_idx on public.colors (is_palette) where is_palette;
