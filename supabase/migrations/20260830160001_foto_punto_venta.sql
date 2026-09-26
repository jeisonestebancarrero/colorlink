-- Foto del punto de venta. Si falta, la app usa la imagen local y luego el fondo de marca.
alter table public.pickup_locations
  add column image_url text;

comment on column public.pickup_locations.image_url is
  'Foto del local. Si está vacía, la aplicación usa la imagen local de la ciudad y, en último caso, el fondo de marca.';
