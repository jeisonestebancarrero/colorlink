-- ============================================================
-- Normalización: nombres y direcciones en MAYÚSCULAS, documentos sin puntos
-- ============================================================
-- Dos cosas distintas, las dos por la misma razón: que el mismo dato se
-- escriba siempre igual.
--
-- 1. NOMBRES Y DIRECCIONES EN MAYÚSCULAS.
--    Hoy dependen de cómo escriba cada persona: "carlos mendoza",
--    "Carlos Mendoza" y "CARLOS MENDOZA" son el mismo cliente y en un listado
--    se ven como tres. En mayúsculas, además, la factura y la guía de
--    transporte salen uniformes.
--
-- 2. DOCUMENTOS SIN PUNTOS.
--    La DIAN pide el número sin separadores. Si se guarda "71.234.567" hay que
--    limpiarlo en cada exportación, y basta olvidarlo una vez para que el
--    archivo se rechace. Se guarda limpio desde el principio.
--    En el NIT se conserva el guion del dígito de verificación
--    (900123456-7): ese guion sí significa algo.
--
-- Va en DISPARADORES y no en el frontend a propósito: así se cumple venga el
-- dato del navegador, del portal interno, de una migración o de un script.
--
-- Los teléfonos de `pickup_locations` NO se tocan: son los números que se
-- muestran al público con su formato de marcación local ("(604) 384 8484"), no
-- datos de contacto de un cliente.
--
-- El correo NO se toca: la parte local de una dirección de correo distingue
-- mayúsculas y pasarlo a mayúsculas puede dejarlo sin entregar.
--
-- El diccionario DIVIPOLA tampoco se toca: `municipalities.name` está en
-- minúsculas legibles a propósito, porque es lo que se ve en un desplegable, y
-- el nombre oficial en mayúsculas ya está en `name_dane` para los documentos.

-- ------------------------------------------------------------
-- Funciones de normalización
-- ------------------------------------------------------------

/**
 * Nombres y direcciones: mayúsculas, sin espacios de sobra, sin espacios
 * repetidos. Los acentos se conservan: "MEDELLÍN" no es "MEDELLIN", y el DANE
 * los mantiene en su propia nomenclatura.
 */
create or replace function public.normalizar_texto_mayusculas(_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(upper(coalesce(_texto, '')), '\s+', ' ', 'g')), '');
$$;

/**
 * Número de documento: solo dígitos y letras, más el guion del dígito de
 * verificación del NIT. Fuera puntos, espacios, comas y demás separadores.
 *   '71.234.567'    -> '71234567'
 *   '900.123.456-7' -> '900123456-7'
 *   'ab 123 456'    -> 'AB123456'
 */
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
 * Teléfono: siempre con indicativo de país, en formato E.164 (+573001234567).
 *
 * Sin indicativo, un número no se puede marcar desde fuera ni entregar a una
 * pasarela de SMS, y "300 123 4567", "3001234567" y "+57 300 1234567" quedan
 * como tres números distintos para cualquier búsqueda.
 *
 * Reglas, en este orden:
 *   1. Si la persona escribió '+', se respeta: es un número de otro país y no
 *      se le puede imponer el +57.
 *   2. Si los dígitos ya empiezan por el indicativo y sobran cifras, se
 *      entiende que lo escribió sin el '+'.
 *   3. Si no, se le pone el indicativo del país del registro (+57 para
 *      Colombia), quitando ceros iniciales de marcación nacional.
 *
 * `_country_code` es el país del registro; si no se conoce, Colombia, que es
 * a donde se despacha.
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

  -- Un número escrito con '+' es de otro país: se deja como lo escribieron.
  if v_mas then
    return '+' || v_digitos;
  end if;

  select regexp_replace(coalesce(c.phone_code, '+57'), '[^0-9]', '', 'g')
    into v_dial
    from public.countries c
   where c.code = coalesce(_country_code, 'CO');
  v_dial := coalesce(nullif(v_dial, ''), '57');

  -- Ya venía con el indicativo, solo sin el '+'.
  if v_digitos like v_dial || '%' and length(v_digitos) > 10 then
    return '+' || v_digitos;
  end if;

  return '+' || v_dial || regexp_replace(v_digitos, '^0+', '');
end;
$$;

-- ------------------------------------------------------------
-- Disparadores
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Lo que ya está guardado
-- ------------------------------------------------------------
-- Se normaliza también el histórico, que es el punto de "que todo quede
-- igual". Los disparadores hacen el trabajo: basta reescribir la fila.
--
-- Es IRREVERSIBLE: la caja original de los nombres ya guardados no se puede
-- recuperar. Se acepta porque el destino de estos datos son documentos
-- fiscales, donde la forma correcta es mayúsculas.
update public.profiles          set updated_at = updated_at;
update public.companies         set updated_at = updated_at;
update public.customer_addresses set updated_at = updated_at;
update public.company_branches  set updated_at = updated_at;
update public.orders            set updated_at = updated_at;
update public.shipments         set id = id;

-- ------------------------------------------------------------
-- Detalle del diccionario
-- ------------------------------------------------------------
-- El DANE escribe un centro poblado con guion bajo (MITUSEÑO_URANIA). En un
-- desplegable eso se lee mal; el guion bajo pasa a espacio. El nombre oficial
-- sigue intacto en `name_source`.
update public.neighborhoods
   set name = initcap(replace(name, '_', ' '))
 where name like '%\_%';

notify pgrst, 'reload schema';
