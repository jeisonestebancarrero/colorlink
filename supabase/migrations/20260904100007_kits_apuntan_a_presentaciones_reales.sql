-- Enlaza los pasos de kits a variantes reales y sincroniza su precio con el catálogo.
-- Los «kits» de herramientas no existen como producto; se apunta a la herramienta real.

-- Kit Cero Humedad, paso 1: duplicaba el sellador del paso 2 y el limpiador no está
-- en catálogo; se elimina.
delete from public.solution_products sp
using public.solutions s, public.products p
where sp.solution_id = s.id
  and sp.product_id = p.id
  and s.name = 'Kit Cero Humedad & Manchas Interiores'
  and sp.step_number = 1
  and p.code = 'PNT-PREP-004';

with objetivo as (
  select sp.id as paso_id, v.id as variant_id, v.label, v.price_cop
  from public.solution_products sp
  join public.solutions s on s.id = sp.solution_id
  join public.products  p on p.id = sp.product_id
  join public.product_variants v
    on v.product_id = p.id
   and v.status = 'ACTIVO'
   and v.label = case
     when s.name = 'Kit Fachada 5 Años Antifisuras & Humedad' and sp.step_number = 1
       then 'Galón 4.5 Kg'
     when s.name = 'Kit Fachada 5 Años Antifisuras & Humedad' and sp.step_number = 4
       then 'Unidad Completa 9" (Felpa + Maneral)'
     when s.name = 'Kit Renovación Metal & Rejas Anticorrosivo' and sp.step_number = 1
       then 'Unidad 3 Pulgadas'
     -- Un cuñete: la cantidad ya es 2.
     when s.name = 'Kit Techo & Terraza Impermeable 8 Años' and sp.step_number = 2
       then 'Cuñete 5 Galones (18.9 L)'
   end
  where sp.variant_id is null
)
update public.solution_products sp
   set variant_id         = o.variant_id,
       presentation_label = o.label,
       unit_price_cop     = o.price_cop
  from objetivo o
 where sp.id = o.paso_id;

-- La autoridad del precio es product_variants, no esta tabla.
update public.solution_products sp
   set unit_price_cop = v.price_cop,
       presentation_label = v.label
  from public.product_variants v
 where v.id = sp.variant_id
   and sp.unit_price_cop is distinct from v.price_cop;

comment on column public.solution_products.unit_price_cop is
  'COPIA del precio de la presentación. La autoridad es product_variants.price_cop; '
  'la tienda usa ese y solo cae aquí si el paso no resuelve una variante. '
  'Mantener sincronizado: cinco pasos llegaron a mostrar precios que no eran.';

-- Renumera desde 1 el kit al que se le quitó el primer paso.
with ordenados as (
  select sp.id, row_number() over (partition by sp.solution_id order by sp.step_number) as nuevo
  from public.solution_products sp
  join public.solutions s on s.id = sp.solution_id
  where s.name = 'Kit Cero Humedad & Manchas Interiores'
)
update public.solution_products sp
   set step_number = o.nuevo
  from ordenados o
 where sp.id = o.id
   and sp.step_number is distinct from o.nuevo;
