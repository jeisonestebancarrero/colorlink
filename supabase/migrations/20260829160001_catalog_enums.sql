-- ============================================================
-- FASE 3 · 01 — Tipos enumerados del catálogo
-- ============================================================
-- Todos los valores replican EXACTAMENTE las uniones TypeScript de
-- src/types/index.ts. Esa coincidencia literal es lo que permite que las
-- páginas existentes sigan compilando sin tocar una línea de JSX.
-- ============================================================

-- StoreProduct.environment
create type public.product_environment as enum (
  'Interior', 'Exterior', 'Ambos', 'Industrial'
);

-- StoreProduct.finish
create type public.product_finish as enum (
  'Mate', 'Satinado', 'Brillante', 'Semibrillante', 'Texturizado', 'N/A'
);

-- ColorSwatch.family
create type public.color_family as enum (
  'Blancos & Neutros',
  'Cálidos & Tierras',
  'Azules & Frescos',
  'Verdes & Naturales',
  'Vibrantes & Acentos',
  'Tendencias 2025'
);

-- SolutionKitStep.phaseName
create type public.solution_phase as enum (
  'Preparación', 'Sellado', 'Acabado', 'Aplicación', 'Herramienta'
);

-- Distingue las dos taxonomías que hoy conviven en el frontend:
-- StoreProduct.category (7 valores) y SolutionCategory (7 valores distintos).
create type public.category_kind as enum ('PRODUCT', 'SOLUTION');

-- Estado común de las entidades de catálogo (MÓDULO 3: "estado").
create type public.catalog_status as enum ('ACTIVO', 'INACTIVO', 'DESCONTINUADO');

-- Severidad de una patología (MÓDULO 7).
create type public.pathology_severity as enum ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');
