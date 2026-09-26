-- Enums del catálogo: replican literalmente las uniones de src/types/index.ts.

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

-- Separa las dos taxonomías del frontend: StoreProduct.category y SolutionCategory.
create type public.category_kind as enum ('PRODUCT', 'SOLUTION');

create type public.catalog_status as enum ('ACTIVO', 'INACTIVO', 'DESCONTINUADO');

create type public.pathology_severity as enum ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');
