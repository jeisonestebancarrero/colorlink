-- ============================================================
-- El motor de diagnóstico se muda a la base y deja de inventar catálogo
-- ============================================================
-- Hasta hoy el diagnóstico técnico de un proyecto lo calculaba el NAVEGADOR
-- (`generatePreliminaryAnalysis`, en `src/services/storage.ts`) y
-- `create_project` guardaba lo que le llegara. Tres problemas, una causa:
--
--   1. RECOMENDABA PRODUCTOS QUE NO EXISTEN. Sus 8 códigos y sus precios
--      estaban escritos a mano: `PNT-10520 «Esmalte Sintético Pintulux 3 en 1»`
--      a $89.900, cuando el producto real es `PNT-MET-006 «Pintulux 3 en 1
--      Anticorrosivo + Esmalte»` desde $39.900. Ninguno de los 8 está en
--      `products`. El cliente terminaba su diagnóstico con una lista de
--      materiales que no podía llevar al carrito.
--   2. ERA EL SEGUNDO MOTOR. La calculadora ya se había movido al servidor
--      (`calculate_paint`), que lee `spread_rate_m2_per_gal` de la base; éste
--      se quedó con divisiones fijas (`area / 28`, `area / 16 / 5`). La misma
--      fachada daba dos respuestas según por dónde entrara el cliente.
--   3. EL NAVEGADOR DECIDÍA Y EL SERVIDOR OBEDECÍA. Con la consola abierta
--      cualquiera se fijaba su nivel de atención, sus productos y su
--      presupuesto, y quedaba guardado como si lo hubiera dictado el sistema.
--
-- LA REGLA DE ESTE MOTOR: no emite una sola línea que no resuelva contra una
-- fila real de `product_variants`. Precio, presentación y rendimiento salen de
-- ahí. Si para un caso no hay producto real en el catálogo, NO recomienda nada
-- y pide visita técnica; antes se inventaba una referencia.
--
-- Lo que SÍ se porta tal cual del motor viejo es el criterio técnico —cuándo
-- la atención es alta, cuándo hace falta visita, qué advertir en obra—, porque
-- eso es know-how de Pintuco y no un dato del catálogo. Se portó completo
-- salvo una advertencia que el catálogo real contradice: decía «aplicar
-- anticorrosivo antes de 4 horas», y el producto real es un 3 en 1 que, según
-- su propia ficha, «se aplica directamente sobre óxido firme».
-- ============================================================

-- Un número como lo escribiría una persona: sin ceros de relleno y sin el
-- punto colgando que deja `to_char` con máscara fija («85.» en vez de «85»).
create or replace function public.numero_legible(_n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select rtrim(rtrim(to_char(_n, 'FM999999990.00'), '0'), '.');
$$;

revoke all on function public.numero_legible(numeric) from public, anon;
grant execute on function public.numero_legible(numeric) to authenticated;

-- ------------------------------------------------------------
-- Una línea de material, resuelta contra el catálogo real
-- ------------------------------------------------------------
-- Devuelve null —y no una línea inventada— cuando el producto no existe, está
-- inactivo o no tiene rendimiento cargado. Un producto sin rendimiento es una
-- herramienta: calcular galones sobre ella sería dividir por nada, que es
-- justo el error que `calculate_paint` documenta en su propio cuerpo.
--
-- La presentación NO se elige por tamaño sino por COSTO: se prueban todas las
-- activas y gana la que cubra los galones necesarios más barato. Pedir tres
-- galones sueltos cuando el cuñete sale menos es un sobreprecio que el cliente
-- ve y no perdona.
create or replace function public.material_de_diagnostico(
  _code   text,
  _rol    text,
  _manos  numeric,
  _area   numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prod   record;
  v_var    record;
  v_litros numeric;
  v_gal    numeric;
begin
  select p.id, p.code, p.name, p.description, p.spread_rate_m2_per_gal, p.image_url,
         p.tech_sheet_url, c.name as categoria
    into v_prod
    from public.products p
    left join public.categories c on c.id = p.category_id
   where p.code = _code and p.status = 'ACTIVO';

  if v_prod.id is null or coalesce(v_prod.spread_rate_m2_per_gal, 0) <= 0 then
    return null;
  end if;

  -- Galones teóricos: área por manos entre el rendimiento REAL del producto.
  v_gal := (_area * _manos) / v_prod.spread_rate_m2_per_gal;
  v_litros := v_gal * 3.785;

  select v.id, v.label, v.price_cop, v.volume_liters,
         ceil(v_litros / v.volume_liters)::int as unidades,
         ceil(v_litros / v.volume_liters)::int * v.price_cop as total
    into v_var
    from public.product_variants v
   where v.product_id = v_prod.id
     and v.status = 'ACTIVO'
     and coalesce(v.volume_liters, 0) > 0
   order by (ceil(v_litros / v.volume_liters)::int * v.price_cop) asc,
            ceil(v_litros / v.volume_liters)::int asc
   limit 1;

  -- Producto de pintura sin ninguna presentación con volumen: no hay forma
  -- honesta de cotizarlo.
  if v_var.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_prod.id,
    'code', v_prod.code,
    'name', v_prod.name,
    'category', coalesce(v_prod.categoria, ''),
    'role', _rol,
    'description', coalesce(v_prod.description, ''),
    'variantId', v_var.id,
    'presentation', v_var.label,
    'theoreticalSpreadRate',
      public.numero_legible(v_prod.spread_rate_m2_per_gal) ||
      ' m²/galón a ' || public.numero_legible(_manos) || ' mano(s)',
    'estimatedQuantity', v_var.unidades || ' × ' || v_var.label,
    'calculatedTotalUnits', v_var.unidades,
    'unitPriceRef', v_var.price_cop,
    'lineTotalCop', v_var.total,
    'imageUrl', v_prod.image_url,
    'techSheetUrl', v_prod.tech_sheet_url,
    'disclaimer', 'Cantidad estimada sobre el rendimiento de ficha técnica. '
                  'Se confirma en obra.'
  );
end;
$$;

comment on function public.material_de_diagnostico(text, text, numeric, numeric) is
  'Una línea de materiales resuelta contra products/product_variants reales. '
  'Devuelve null si el producto no existe, está inactivo o no tiene rendimiento.';

-- ------------------------------------------------------------
-- El diagnóstico completo
-- ------------------------------------------------------------
create or replace function public.diagnosticar_proyecto(_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_area        numeric;
  v_superficie  text;
  v_ambiente    text;
  v_tipo        text;
  v_cond        text[];
  v_industrial  boolean;
  v_metal       boolean;
  v_madera      boolean;
  v_exterior    boolean;
  v_humedad     boolean;
  v_fisuras     boolean;
  v_oxidacion   boolean;
  v_hongos      boolean;
  v_desprend    boolean;
  v_filtracion  boolean;
  v_categoria   text;
  v_atencion    text := 'Media';
  v_visita      boolean := false;
  v_consider    text[] := '{}';
  v_falta       text[] := '{}';
  v_lineas      jsonb := '[]'::jsonb;
  v_linea       jsonb;
  v_total       numeric := 0;
  v_resumen     text;
begin
  v_area       := coalesce(nullif(_payload ->> 'area_m2', '')::numeric, 0);
  v_superficie := coalesce(_payload ->> 'surface', '');
  v_ambiente   := coalesce(_payload ->> 'environment', '');
  v_tipo       := coalesce(_payload ->> 'project_type', '');
  v_cond       := coalesce(
    array(select jsonb_array_elements_text(coalesce(_payload -> 'conditions', '[]'::jsonb))),
    '{}');

  -- Sin área no hay cálculo posible. El motor viejo caía a 85 m² en silencio
  -- («Number(data.areaM2) || 85»), así que un formulario incompleto salía con
  -- un presupuesto de una obra que nadie había medido.
  if v_area <= 0 then
    return jsonb_build_object(
      'solution_category', 'Pendiente de medición',
      'attention_level', 'Media',
      'requires_technical_visit', true,
      'key_considerations', to_jsonb(array[
        'Sin el área intervenida no se puede estimar material ni presupuesto.']),
      'missing_information', to_jsonb(array['Falta el área en m² de la superficie a intervenir.']),
      'ai_summary', 'No se estimaron materiales: el proyecto no registra área.',
      'disclaimer', 'Estimación preliminar. No sustituye una visita técnica.',
      'recommended_products', '[]'::jsonb,
      'budget_summary', jsonb_build_object('subtotalCop', 0, 'currency', 'COP')
    );
  end if;

  v_industrial := v_ambiente = 'Industrial' or v_tipo = 'Industria';
  v_metal      := v_superficie = 'Metal';
  v_madera     := v_superficie = 'Madera';
  v_exterior   := v_ambiente in ('Exterior', 'Alta humedad');
  v_humedad    := 'Humedad' = any(v_cond);
  v_filtracion := 'Filtraciones' = any(v_cond);
  v_fisuras    := 'Fisuras' = any(v_cond);
  v_oxidacion  := 'Oxidación' = any(v_cond);
  v_hongos     := 'Hongos / Moho' = any(v_cond);
  v_desprend   := 'Desprendimiento' = any(v_cond);

  -- ---------------------------------------------------------
  -- 1. Industrial
  -- ---------------------------------------------------------
  if v_industrial then
    v_categoria := 'Sistema Epóxico Industrial de Alto Rendimiento';
    v_atencion  := 'Especializada';
    v_visita    := true;
    v_consider := array_append(v_consider, 'Perfilado mecánico del sustrato para garantizar perfil de anclaje CSP 3.');
    v_consider := array_append(v_consider, 'Uso de esquema bicomponente de alta resistencia química y al desgaste.');
    v_falta := array_append(v_falta, 'Confirmar si hay derrames de químicos corrosivos o aceites en operación.');
    v_linea := public.material_de_diagnostico('PNT-IND-008', 'Recubrimiento Especializado', 2, v_area);
    if v_linea is not null then v_lineas := v_lineas || v_linea; end if;

  -- ---------------------------------------------------------
  -- 2. Metal u oxidación
  -- ---------------------------------------------------------
  elsif v_metal or v_oxidacion then
    v_categoria := 'Sistema Anticorrosivo y Esmalte Pintulux';
    v_atencion  := 'Alta';
    v_visita    := v_area > 50;
    v_consider := array_append(v_consider, 'Eliminación total de óxido suelto mediante cepillo de alambre o lija grano 80.');
    -- El motor viejo exigía además «aplicar anticorrosivo antes de 4 horas».
    -- El producto real de esta línea es un 3 en 1 que, según su ficha, se
    -- aplica directamente sobre óxido firme: mantener esa advertencia sería
    -- describir un sistema que Pintuco ya no vende así.
    v_linea := public.material_de_diagnostico('PNT-MET-006', 'Acabado Arquitectónico', 2, v_area);
    if v_linea is not null then v_lineas := v_lineas || v_linea; end if;

  -- ---------------------------------------------------------
  -- 3. Madera
  -- ---------------------------------------------------------
  -- El motor viejo NO tenía rama de madera: caía en el «else» y recomendaba
  -- vinilo de interior sobre madera exterior. El producto existe en el
  -- catálogo desde el principio.
  elsif v_madera then
    v_categoria := 'Sistema Madetec Barniz Poliuretano con Filtro UV';
    v_atencion  := 'Media';
    v_visita    := v_area > 80;
    v_consider := array_append(v_consider, 'Lijado progresivo y madera seca antes de aplicar: la humedad atrapada levanta el barniz.');
    v_linea := public.material_de_diagnostico('PNT-MAD-007', 'Acabado Arquitectónico', 2, v_area);
    if v_linea is not null then v_lineas := v_lineas || v_linea; end if;

  -- ---------------------------------------------------------
  -- 4. Cubierta o terraza con filtraciones
  -- ---------------------------------------------------------
  elsif v_filtracion and v_exterior then
    v_categoria := 'Sistema Aquablock Impermeabilización de Cubiertas';
    v_atencion  := 'Alta';
    v_visita    := true;
    v_consider := array_append(v_consider, 'Verificar pendientes y desagües: un impermeabilizante no corrige un estancamiento.');
    if v_fisuras then
      v_linea := public.material_de_diagnostico('PNT-PREP-005', 'Preparación de Superficie', 1, v_area);
      if v_linea is not null then v_lineas := v_lineas || v_linea; end if;
    end if;
    v_linea := public.material_de_diagnostico('PNT-IMP-003', 'Recubrimiento Especializado', 2, v_area);
    if v_linea is not null then v_lineas := v_lineas || v_linea; end if;

  -- ---------------------------------------------------------
  -- 5. Fachada / concreto exterior
  -- ---------------------------------------------------------
  elsif v_exterior or v_superficie in ('Fachada', 'Concreto') then
    v_categoria := 'Sistema Fachada Koraza Protección Extrema 5 Años';
    v_atencion  := case when v_humedad or v_fisuras then 'Alta' else 'Media' end;
    v_visita    := v_humedad or v_area > 80;
    v_consider := array_append(v_consider, 'Verificar secado superficial y ausencia de humedad retenida antes de pintar.');
    v_consider := array_append(v_consider, 'Aplicación indispensable de sellador antialcalino para evitar eflorescencias.');
    if v_fisuras then
      v_consider := array_append(v_consider, 'Calafateo elástico de fisuras antes del sellado.');
      v_linea := public.material_de_diagnostico('PNT-PREP-005', 'Preparación de Superficie', 1, v_area);
      if v_linea is not null then v_lineas := v_lineas || v_linea; end if;
    end if;
    v_linea := public.material_de_diagnostico('PNT-PREP-004', 'Sellador / Imprimación', 1, v_area);
    if v_linea is not null then v_lineas := v_lineas || v_linea; end if;
    v_linea := public.material_de_diagnostico('PNT-EXT-001', 'Acabado Arquitectónico', 2, v_area);
    if v_linea is not null then v_lineas := v_lineas || v_linea; end if;

  -- ---------------------------------------------------------
  -- 6. Interior
  -- ---------------------------------------------------------
  else
    v_categoria := 'Sistema Arquitectónico Interior Viniltex Avanzado';
    v_atencion  := 'Baja';
    v_consider := array_append(v_consider, 'Superficie en condición estándar apta para recubrimiento vinil-acrílico.');
    v_consider := array_append(v_consider, 'Asegurar limpieza de polvo y sellado homogéneo de juntas.');
    if v_humedad or v_hongos then
      v_linea := public.material_de_diagnostico('PNT-PREP-004', 'Sellador / Imprimación', 1, v_area);
      if v_linea is not null then v_lineas := v_lineas || v_linea; end if;
    end if;
    v_linea := public.material_de_diagnostico('PNT-INT-002', 'Acabado Arquitectónico', 2, v_area);
    if v_linea is not null then v_lineas := v_lineas || v_linea; end if;
  end if;

  -- ---------------------------------------------------------
  -- Advertencias que no dependen de la línea elegida
  -- ---------------------------------------------------------
  if v_hongos then
    v_consider := array_append(v_consider, 'Lavado fungicida previo con solución de hipoclorito de sodio al 10% y enjuague total.');
  end if;
  if v_desprend then
    v_consider := array_append(v_consider, 'Raspado minucioso de pintura suelta hasta encontrar sustrato firme y cohesionado.');
  end if;
  if v_humedad and not v_visita then
    v_visita := true;
  end if;

  -- Que el catálogo no tenga con qué resolver un caso es información, no un
  -- motivo para inventarse un producto.
  if jsonb_array_length(v_lineas) = 0 then
    v_visita := true;
    v_falta := array_append(v_falta,
      'El catálogo no tiene hoy un producto cargado para esta combinación de '
      'superficie y ambiente. Un asesor técnico debe especificarlo.');
  end if;

  select coalesce(sum((l ->> 'lineTotalCop')::numeric), 0)
    into v_total
    from jsonb_array_elements(v_lineas) l;

  v_resumen :=
    'Para ' || public.numero_legible(v_area) || ' m² de ' ||
    coalesce(nullif(lower(v_superficie), ''), 'la superficie indicada') ||
    case when v_ambiente <> '' then ' en ambiente ' || lower(v_ambiente) else '' end ||
    ', se especifica ' || v_categoria || '. ' ||
    case
      when jsonb_array_length(v_lineas) = 0
        then 'No se estimaron materiales: falta especificación técnica.'
      else 'Se estiman ' || jsonb_array_length(v_lineas) || ' referencia(s) del catálogo Pintuco.'
    end;

  return jsonb_build_object(
    'solution_category', v_categoria,
    'attention_level', v_atencion,
    'requires_technical_visit', v_visita,
    'key_considerations', to_jsonb(v_consider),
    'missing_information', to_jsonb(v_falta),
    'ai_summary', v_resumen,
    'technical_summary', null,
    'disclaimer', 'Estimación preliminar calculada sobre el rendimiento de ficha '
                  'técnica y los precios vigentes del catálogo. No sustituye una '
                  'visita técnica ni constituye una cotización en firme.',
    'recommended_products', v_lineas,
    'budget_summary', jsonb_build_object(
      'subtotalCop', v_total,
      'currency', 'COP',
      'note', 'Materiales estimados. No incluye mano de obra ni andamios.')
  );
end;
$$;

comment on function public.diagnosticar_proyecto(jsonb) is
  'Diagnóstico preliminar de un proyecto. Todo producto que devuelve existe en '
  'el catálogo activo; si no hay con qué resolver el caso, no recomienda nada y '
  'exige visita técnica.';

revoke all on function public.material_de_diagnostico(text, text, numeric, numeric) from public, anon;
revoke all on function public.diagnosticar_proyecto(jsonb) from public, anon;
grant execute on function public.material_de_diagnostico(text, text, numeric, numeric) to authenticated;
grant execute on function public.diagnosticar_proyecto(jsonb) to authenticated;

notify pgrst, 'reload schema';
