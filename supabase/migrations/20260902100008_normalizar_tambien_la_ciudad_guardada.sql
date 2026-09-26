-- Normaliza también profiles.city y companies.city, omitidas en 20260902100006.

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
