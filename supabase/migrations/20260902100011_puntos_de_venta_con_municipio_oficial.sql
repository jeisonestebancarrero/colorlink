-- pickup_locations pasa a tener código DIVIPOLA: comparar por texto fallaba
-- ('Bogotá D.C.' vs 'Bogotá, D.C.') y prometía 5 días a ciudades con tienda.

alter table public.pickup_locations
  add column if not exists municipality_code text references public.municipalities(code);

-- 05001 Medellín, 11001 Bogotá, 76001 Cali, 08001 Barranquilla, 68001 Bucaramanga.
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
      -- Un punto sin código cae en el tramo de 5 días; se avisa.
    raise warning 'Quedan % puntos de venta ACTIVOS sin municipio DIVIPOLA. Asígnaselos o los envíos a su ciudad se prometerán como si no hubiera cobertura.', v_sin;
  end if;
end;
$$;

comment on column public.pickup_locations.municipality_code is
  'Municipio DIVIPOLA del punto de venta. `city` queda como texto para mostrar.';

/** Días hábiles de entrega por código de municipio: 2 / 3 / 5. */
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
