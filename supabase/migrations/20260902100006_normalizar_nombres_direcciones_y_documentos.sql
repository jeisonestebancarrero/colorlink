-- Normaliza por trigger nombres y direcciones a mayúsculas y documentos sin
-- separadores (la DIAN los pide así), venga de donde venga el dato.
-- No se tocan correos, teléfonos de pickup_locations ni el diccionario DIVIPOLA.

/** Mayúsculas y espacios colapsados; conserva tildes, como el DANE. */
create or replace function public.normalizar_texto_mayusculas(_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(upper(coalesce(_texto, '')), '\s+', ' ', 'g')), '');
$$;

/** Deja solo dígitos y letras más el guion del DV del NIT: '900.123.456-7' -> '900123456-7'. */
create or replace function public.normalizar_documento(_numero text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(upper(coalesce(_numero, '')), '[^0-9A-ZÁÉÍÓÚÑ-]', '', 'g'), '-'),
    ''
  );
$$;


/**
 * Teléfono en E.164. Con '+' se respeta tal cual; si ya trae el indicativo se le
 * antepone '+'; si no, se agrega el del país (Colombia por defecto).
 */
create or replace function public.normalizar_telefono(
  _numero       text,
  _country_code text default 'CO'
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_crudo  text := coalesce(_numero, '');
  v_mas    boolean := left(btrim(v_crudo), 1) = '+';
  v_digitos text;
  v_dial    text;
begin
  v_digitos := regexp_replace(v_crudo, '[^0-9]', '', 'g');
  if v_digitos = '' then
    return null;
  end if;

    -- Con '+' es de otro país: se deja como está.
  if v_mas then
    return '+' || v_digitos;
  end if;

  select regexp_replace(coalesce(c.phone_code, '+57'), '[^0-9]', '', 'g')
    into v_dial
    from public.countries c
   where c.code = coalesce(_country_code, 'CO');
  v_dial := coalesce(nullif(v_dial, ''), '57');

  if v_digitos like v_dial || '%' and length(v_digitos) > 10 then
    return '+' || v_digitos;
  end if;

  return '+' || v_dial || regexp_replace(v_digitos, '^0+', '');
end;
$$;

create or replace function public.profiles_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_name      := coalesce(public.normalizar_texto_mayusculas(new.first_name), '');
  new.last_name       := coalesce(public.normalizar_texto_mayusculas(new.last_name), '');
  new.address         := public.normalizar_texto_mayusculas(new.address);
  new.document_number := public.normalizar_documento(new.document_number);
  new.phone           := public.normalizar_telefono(new.phone, new.country_code);
  return new;
end;
$$;

drop trigger if exists profiles_normalizar on public.profiles;
create trigger profiles_normalizar
  before insert or update on public.profiles
  for each row execute function public.profiles_normalizar();

create or replace function public.companies_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name       := coalesce(public.normalizar_texto_mayusculas(new.name), new.name);
  new.legal_name := public.normalizar_texto_mayusculas(new.legal_name);
  new.address    := public.normalizar_texto_mayusculas(new.address);
  new.nit        := public.normalizar_documento(new.nit);
  new.phone      := public.normalizar_telefono(new.phone, new.country_code);
  return new;
end;
$$;

drop trigger if exists companies_normalizar on public.companies;
create trigger companies_normalizar
  before insert or update on public.companies
  for each row execute function public.companies_normalizar();

create or replace function public.customer_addresses_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.label        := coalesce(public.normalizar_texto_mayusculas(new.label), new.label);
  new.address_line := coalesce(public.normalizar_texto_mayusculas(new.address_line), new.address_line);
  new.notes        := public.normalizar_texto_mayusculas(new.notes);
  return new;
end;
$$;

drop trigger if exists customer_addresses_normalizar on public.customer_addresses;
create trigger customer_addresses_normalizar
  before insert or update on public.customer_addresses
  for each row execute function public.customer_addresses_normalizar();

create or replace function public.company_branches_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name          := coalesce(public.normalizar_texto_mayusculas(new.name), new.name);
  new.address_line  := coalesce(public.normalizar_texto_mayusculas(new.address_line), new.address_line);
  new.contact_name  := public.normalizar_texto_mayusculas(new.contact_name);
  new.contact_phone := public.normalizar_telefono(new.contact_phone);
  new.notes         := public.normalizar_texto_mayusculas(new.notes);
  return new;
end;
$$;

drop trigger if exists company_branches_normalizar on public.company_branches;
create trigger company_branches_normalizar
  before insert or update on public.company_branches
  for each row execute function public.company_branches_normalizar();

create or replace function public.orders_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.shipping_address          := public.normalizar_texto_mayusculas(new.shipping_address);
  new.shipping_city             := public.normalizar_texto_mayusculas(new.shipping_city);
  new.recipient_name            := public.normalizar_texto_mayusculas(new.recipient_name);
  new.recipient_document_number := public.normalizar_documento(new.recipient_document_number);
  new.recipient_phone           := public.normalizar_telefono(new.recipient_phone);
  return new;
end;
$$;

drop trigger if exists orders_normalizar on public.orders;
create trigger orders_normalizar
  before insert or update on public.orders
  for each row execute function public.orders_normalizar();

create or replace function public.shipments_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.address := public.normalizar_texto_mayusculas(new.address);
  new.city    := public.normalizar_texto_mayusculas(new.city);
  return new;
end;
$$;

drop trigger if exists shipments_normalizar on public.shipments;
create trigger shipments_normalizar
  before insert or update on public.shipments
  for each row execute function public.shipments_normalizar();

-- Normaliza el histórico reescribiendo las filas para que corran los triggers.
-- Irreversible: se pierde la caja original.
update public.profiles          set updated_at = updated_at;
update public.companies         set updated_at = updated_at;
update public.customer_addresses set updated_at = updated_at;
update public.company_branches  set updated_at = updated_at;
update public.orders            set updated_at = updated_at;
update public.shipments         set id = id;

-- El guion bajo del DANE pasa a espacio; el original queda en name_source.
update public.neighborhoods
   set name = initcap(replace(name, '_', ' '))
 where name like '%\_%';

notify pgrst, 'reload schema';
