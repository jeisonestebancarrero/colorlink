-- ============================================================
-- La ciudad guardada también va en mayúsculas
-- ============================================================
-- Omisión de 20260902100006: se normalizó `orders.shipping_city` y
-- `shipments.city`, pero no `profiles.city` ni `companies.city`. Quedaba
-- 'MEDELLÍN' en el pedido y 'Medellín' en el perfil del mismo cliente, que es
-- exactamente la inconsistencia que se venía a cerrar.
--
-- El diccionario NO se toca: `municipalities.name` sigue en minúsculas
-- legibles porque es lo que se lee en un desplegable, y el nombre oficial en
-- mayúsculas ya está en `municipalities.name_dane` para los documentos.

create or replace function public.profiles_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_name      := coalesce(public.normalizar_texto_mayusculas(new.first_name), '');
  new.last_name       := coalesce(public.normalizar_texto_mayusculas(new.last_name), '');
  new.city            := public.normalizar_texto_mayusculas(new.city);
  new.address         := public.normalizar_texto_mayusculas(new.address);
  new.document_number := public.normalizar_documento(new.document_number);
  new.phone           := public.normalizar_telefono(new.phone, new.country_code);
  return new;
end;
$$;

create or replace function public.companies_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name       := coalesce(public.normalizar_texto_mayusculas(new.name), new.name);
  new.legal_name := public.normalizar_texto_mayusculas(new.legal_name);
  new.city       := public.normalizar_texto_mayusculas(new.city);
  new.address    := public.normalizar_texto_mayusculas(new.address);
  new.nit        := public.normalizar_documento(new.nit);
  new.phone      := public.normalizar_telefono(new.phone, new.country_code);
  return new;
end;
$$;

update public.profiles  set updated_at = updated_at;
update public.companies set updated_at = updated_at;

notify pgrst, 'reload schema';
