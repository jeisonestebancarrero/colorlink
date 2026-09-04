-- ============================================================
-- Los kits dejan de cotizar presentaciones que no existen
-- ============================================================
-- Cinco de los once pasos de los kits no apuntaban a ninguna fila de
-- `product_variants`: llevaban una etiqueta y un precio escritos a mano. El
-- mapeador de la tienda ya prefiere el precio de la variante real y solo cae
-- al precio publicado del kit cuando el paso no resuelve —lo llama «deuda de
-- datos conocida»—, así que esos cinco pasos eran justo los que mostraban
-- cifras que no son las del catálogo:
--
--   · Sellador Antialcalino a $54.900 cuando la presentación real vale $89.900.
--   · «2 Cuñetes de 5 Galones» cotizado a $599.900, que es el precio de UNO.
--   · «Pack Completo Obra» ($64.700) y «Kit Acondicionamiento Metal» ($29.900):
--     no existen como producto. El primero es exactamente la suma de rodillo,
--     brocha y cinta; el segundo, una brocha con otro nombre.
--
-- Se apuntan a la presentación REAL que les corresponde y se sincroniza el
-- precio publicado con el del catálogo, para que las dos cifras no puedan
-- volver a separarse.
--
-- LO QUE NO SE INVENTA: los dos «kits» de herramientas no existen en el
-- catálogo, así que el paso pasa a la herramienta real que sí se vende. Si
-- Pintuco quiere venderlos empaquetados, hay que crear el producto.
-- ============================================================

-- 1. Kit Cero Humedad, paso 1. Apuntaba al MISMO sellador que el paso 2, con
--    un precio distinto y menor. Un kit que lista dos veces el mismo galón y
--    lo suma dos veces está cobrando de más por un error de siembra. La fase
--    «Preparación» pedía un limpiador que el catálogo no tiene: se retira el
--    paso en vez de duplicar el sellador.
delete from public.solution_products sp
using public.solutions s, public.products p
where sp.solution_id = s.id
  and sp.product_id = p.id
  and s.name = 'Kit Cero Humedad & Manchas Interiores'
  and sp.step_number = 1
  and p.code = 'PNT-PREP-004';

-- 2..5. Los demás sí tienen presentación real: se enlazan.
with objetivo as (
  select sp.id as paso_id, v.id as variant_id, v.label, v.price_cop
  from public.solution_products sp
  join public.solutions s on s.id = sp.solution_id
  join public.products  p on p.id = sp.product_id
  join public.product_variants v
    on v.product_id = p.id
   and v.status = 'ACTIVO'
   and v.label = case
     -- La masilla: la etiqueta escrita ya coincidía en precio, solo faltaba el enlace.
     when s.name = 'Kit Fachada 5 Años Antifisuras & Humedad' and sp.step_number = 1
       then 'Galón 4.5 Kg'
     -- El rodillo completo, en vez de un «pack» que no se vende.
     when s.name = 'Kit Fachada 5 Años Antifisuras & Humedad' and sp.step_number = 4
       then 'Unidad Completa 9" (Felpa + Maneral)'
     -- La brocha de 3 pulgadas, en vez de un «kit» que no existe.
     when s.name = 'Kit Renovación Metal & Rejas Anticorrosivo' and sp.step_number = 1
       then 'Unidad 3 Pulgadas'
     -- El cuñete, UNO. La cantidad ya dice 2, así que el total sale bien sin
     -- meter el «2» dentro de la etiqueta y del precio.
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

-- Y se sincroniza el resto, para que ningún paso conserve una copia vieja del
-- precio: la autoridad es `product_variants`, no esta tabla.
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

-- ------------------------------------------------------------
-- Renumerar los pasos del kit al que se le quitó el primero
-- ------------------------------------------------------------
-- Borrar el paso 1 dejó el kit empezando en «2», y en pantalla eso se lee como
-- un error del sistema, no como un kit de dos pasos. Se renumera de 1 en
-- adelante conservando el orden.
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
