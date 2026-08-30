-- ============================================================
-- Foto del punto de venta
-- ============================================================
-- La columna permite reemplazar la imagen de una tienda sin desplegar código:
-- cuando Pintuco tenga la foto real de cada local, se pega aquí la URL y lista.
--
-- Mientras tanto, la aplicación resuelve en este orden —el mismo que ya usa
-- el logotipo—: esta columna, si está; si no, la imagen local que corresponda
-- a la tienda; y si tampoco, el fondo de marca. Así nunca queda una tarjeta
-- rota ni un hueco gris.
alter table public.pickup_locations
  add column image_url text;

comment on column public.pickup_locations.image_url is
  'Foto del local. Si está vacía, la aplicación usa la imagen local de la ciudad y, en último caso, el fondo de marca.';
