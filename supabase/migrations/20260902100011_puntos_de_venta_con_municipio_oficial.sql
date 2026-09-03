-- ============================================================
-- Los puntos de venta apuntan al municipio oficial
-- ============================================================
-- DEFECTO ENCONTRADO AL PROBAR `dias_de_entrega` (20260902100010).
--
-- La función emparejaba el municipio de destino con la ciudad del punto de
-- venta comparando TEXTO. Falló exactamente donde tenía que fallar: los puntos
-- dicen 'Bogotá D.C.' y 'Cali', y el DANE dice 'Bogotá, D.C.' y 'Santiago de
-- Cali'. Resultado: un pedido a Bogotá, que tiene DOS tiendas Pintuco, se
-- prometía a 5 días como si fuera un municipio sin cobertura.
--
-- Es el mismo problema de raíz que el diccionario vino a cerrar, y arreglarlo
-- con más comparaciones de texto solo lo aplaza. `pickup_locations` pasa a
-- tener su código DIVIPOLA y la función deja de adivinar.
--
-- `city` se conserva: la interfaz la muestra tal cual, y hay pedidos
-- históricos que la referencian.

alter table public.pickup_locations
  add column if not exists municipality_code text references public.municipalities(code);

-- Mapeo de los siete puntos actuales. Cada código verificado contra DIVIPOLA:
--   05001 Medellín · 11001 Bogotá, D.C. · 76001 Santiago de Cali
--   08001 Barranquilla · 68001 Bucaramanga
update public.pickup_locations set municipality_code = '05001'
 where municipality_code is null and public.normalizar_texto_mayusculas(city) = 'MEDELLÍN';
update public.pickup_locations set municipality_code = '11001'
 where municipality_code is null and public.normalizar_texto_mayusculas(city) like 'BOGOT%';
update public.pickup_locations set municipality_code = '76001'
 where municipality_code is null and public.normalizar_texto_mayusculas(city) = 'CALI';
update public.pickup_locations set municipality_code = '08001'
 where municipality_code is null and public.normalizar_texto_mayusculas(city) = 'BARRANQUILLA';
update public.pickup_locations set municipality_code = '68001'
 where municipality_code is null and public.normalizar_texto_mayusculas(city) = 'BUCARAMANGA';

do $$
declare v_sin int;
begin
  select count(*) into v_sin
    from public.pickup_locations
   where status = 'ACTIVO' and municipality_code is null;
  if v_sin > 0 then
    -- Se avisa en voz alta en lugar de dejar puntos sin municipio: uno sin
    -- código vuelve a caer en el tramo de 5 días sin que nadie se dé cuenta.
    raise warning 'Quedan % puntos de venta ACTIVOS sin municipio DIVIPOLA. Asígnaselos o los envíos a su ciudad se prometerán como si no hubiera cobertura.', v_sin;
  end if;
end;
$$;

comment on column public.pickup_locations.municipality_code is
  'Municipio DIVIPOLA del punto de venta. `city` queda como texto para mostrar.';

/**
 * Días hábiles de entrega, ahora por CÓDIGO de municipio.
 *
 *   * misma ciudad que un punto de venta activo — 2 días
 *   * mismo departamento que un punto activo    — 3 días
 *   * cualquier otro municipio del país         — 5 días
 */
create or replace function public.dias_de_entrega(_municipality_code text)
returns int
language plpgsql
stable
set search_path = ''
as $$
begin
  if _municipality_code is null then
    return 5;
  end if;

  if exists (
    select 1 from public.pickup_locations pl
     where pl.status = 'ACTIVO' and pl.municipality_code = _municipality_code
  ) then
    return 2;
  end if;

  if exists (
    select 1
      from public.pickup_locations pl
      join public.municipalities origen  on origen.code  = pl.municipality_code
      join public.municipalities destino on destino.code = _municipality_code
     where pl.status = 'ACTIVO'
       and origen.department_code = destino.department_code
  ) then
    return 3;
  end if;

  return 5;
end;
$$;

notify pgrst, 'reload schema';
