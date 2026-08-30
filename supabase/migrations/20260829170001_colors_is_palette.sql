-- ============================================================
-- FASE 4 · 01 — Distinguir la paleta publicada de los colores de producto
-- ============================================================
-- La tabla `colors` reúne dos orígenes:
--   1. PINTUCO_COLOR_PALETTES: la carta de color publicada (20 colores,
--      con rgb y descripción). Es la que muestra ColorVisualizerPage.
--   2. Colores embebidos en `availableColors` de cada producto (8 más),
--      que existen solo como opción de ese producto y no forman parte de
--      la carta publicada.
--
-- Sin esta marca, el visualizador pasaría de 20 a 28 colores: un cambio
-- visual que el MÓDULO 34 prohíbe. Filtrar por "rgb is not null" habría
-- funcionado hoy, pero es una coincidencia frágil, no una regla de negocio.
-- ============================================================

alter table public.colors
  add column is_palette boolean not null default false;

comment on column public.colors.is_palette is
  'true = pertenece a la carta de color publicada. false = existe solo como opción de un producto.';

create index colors_is_palette_idx on public.colors (is_palette) where is_palette;
