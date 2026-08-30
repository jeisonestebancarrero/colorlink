-- ============================================================
-- Registrar asientos, y que se registren solos
-- ============================================================
-- Un asiento se crea SIEMPRE por esta función, nunca con un INSERT suelto:
-- así no puede quedar una cabecera sin líneas, ni un asiento descuadrado, ni
-- un cargo a una cuenta de agrupación.
--
-- La parte que de verdad importa es la de abajo: los hechos económicos que el
-- sistema ya conoce —una factura emitida, una recepción confirmada, un
-- recaudo— generan su asiento solos. Si dependieran de que alguien los
-- teclee, la contabilidad estaría desactualizada desde el primer día ocupado.
-- ============================================================

create or replace function public.post_journal_entry(
  _descripcion text,
  _lineas      jsonb,
  _fecha       date default null,
  _origen      text default 'MANUAL',
  _invoice_id  uuid default null,
  _receipt_id  uuid default null,
  _movement_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_numero  text;
  v_debito  numeric(16,2) := 0;
  v_credito numeric(16,2) := 0;
  r         record;
  v_cuenta  uuid;
  v_orden   integer := 0;
begin
  -- Los asientos automáticos los dispara el propio servidor desde dentro de
  -- otra operación ya autorizada (emitir factura, confirmar recepción), así
  -- que el permiso solo se exige a los manuales.
  if _origen = 'MANUAL' and not public.has_permission('accounting.write') then
    raise exception 'FORBIDDEN: no tienes permiso para registrar comprobantes'
      using errcode = '42501';
  end if;

  if coalesce(trim(_descripcion), '') = '' then
    raise exception 'SIN_DESCRIPCION: el comprobante necesita una descripción'
      using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(_lineas, '[]'::jsonb)) < 2 then
    raise exception 'MINIMO_DOS_LINEAS: un asiento en partida doble necesita al menos dos líneas'
      using errcode = '22023';
  end if;

  insert into public.journal_entries (
    entry_number, entry_date, source, invoice_id, receipt_id, movement_id,
    description, created_by
  ) values (
    'CB-' || to_char(coalesce(_fecha, current_date), 'YYYY') || '-' ||
      lpad(nextval('public.journal_number_seq')::text, 6, '0'),
    coalesce(_fecha, current_date),
    _origen::public.journal_source,
    _invoice_id, _receipt_id, _movement_id,
    trim(_descripcion),
    auth.uid()
  )
  returning id, entry_number into v_id, v_numero;

  for r in select * from jsonb_array_elements(_lineas) as l(dato)
  loop
    select id into v_cuenta
      from public.accounts
     where code = (r.dato ->> 'cuenta') and is_active;

    if v_cuenta is null then
      raise exception 'CUENTA_DESCONOCIDA: la cuenta % no existe o está inactiva', r.dato ->> 'cuenta'
        using errcode = '22023';
    end if;

    -- Cargar a una cuenta de agrupación descuadra cualquier informe que sume
    -- por niveles: la cifra aparecería dos veces.
    if not (select is_postable from public.accounts where id = v_cuenta) then
      raise exception 'CUENTA_NO_IMPUTABLE: % es una cuenta de agrupación y no recibe asientos', r.dato ->> 'cuenta'
        using errcode = '22023';
    end if;

    v_orden := v_orden + 1;

    insert into public.journal_lines (entry_id, account_id, description, debit_cop, credit_cop, sort_order)
    values (
      v_id, v_cuenta,
      nullif(trim(r.dato ->> 'detalle'), ''),
      round(coalesce((r.dato ->> 'debito')::numeric, 0), 2),
      round(coalesce((r.dato ->> 'credito')::numeric, 0), 2),
      v_orden
    );

    v_debito  := v_debito  + round(coalesce((r.dato ->> 'debito')::numeric, 0), 2);
    v_credito := v_credito + round(coalesce((r.dato ->> 'credito')::numeric, 0), 2);
  end loop;

  if v_debito <> v_credito then
    raise exception 'DESCUADRADO: el débito (%) y el crédito (%) no coinciden', v_debito, v_credito
      using errcode = '22023';
  end if;

  if v_debito = 0 then
    raise exception 'SIN_VALOR: el comprobante no puede ser por cero' using errcode = '22023';
  end if;

  update public.journal_entries
     set total_debit = v_debito, total_credit = v_credito
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.post_journal_entry(text, jsonb, date, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.post_journal_entry(text, jsonb, date, text, uuid, uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- Anular un comprobante
-- ------------------------------------------------------------
-- No se borra: se marca anulado y se registra el contrario. En contabilidad
-- borrar un asiento equivale a borrar la prueba de que existió, y eso rompe
-- la trazabilidad que hace auditable el libro.
create or replace function public.void_journal_entry(_entry_id uuid, _motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asiento public.journal_entries%rowtype;
  v_reverso uuid;
  v_lineas  jsonb;
begin
  if not public.has_permission('accounting.write') then
    raise exception 'FORBIDDEN: no tienes permiso para anular comprobantes'
      using errcode = '42501';
  end if;

  if coalesce(trim(_motivo), '') = '' then
    raise exception 'SIN_MOTIVO: hay que decir por qué se anula' using errcode = '22023';
  end if;

  select * into v_asiento from public.journal_entries where id = _entry_id for update;
  if v_asiento.id is null then
    raise exception 'NOT_FOUND: ese comprobante no existe' using errcode = 'P0002';
  end if;
  if v_asiento.status = 'ANULADO' then
    raise exception 'YA_ANULADO: ese comprobante ya está anulado' using errcode = '23505';
  end if;

  -- El reverso invierte débitos y créditos línea por línea.
  select jsonb_agg(jsonb_build_object(
           'cuenta',  a.code,
           'detalle', l.description,
           'debito',  l.credit_cop,
           'credito', l.debit_cop))
    into v_lineas
  from public.journal_lines l
  join public.accounts a on a.id = l.account_id
  where l.entry_id = _entry_id;

  v_reverso := public.post_journal_entry(
    'Anulación de ' || v_asiento.entry_number || ' — ' || trim(_motivo),
    v_lineas,
    current_date,
    v_asiento.source::text,
    v_asiento.invoice_id, v_asiento.receipt_id, v_asiento.movement_id
  );

  update public.journal_entries
     set status = 'ANULADO', voided_by = auth.uid(), voided_at = now(), void_reason = trim(_motivo)
   where id = _entry_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'JOURNAL_VOIDED', 'journal_entries', _entry_id,
          jsonb_build_object('motivo', _motivo, 'reverso', v_reverso));

  return v_reverso;
end;
$$;

revoke all on function public.void_journal_entry(uuid, text) from public, anon;
grant execute on function public.void_journal_entry(uuid, text) to authenticated;

-- ============================================================
-- Asientos automáticos
-- ============================================================

-- ------------------------------------------------------------
-- 1. Factura emitida
-- ------------------------------------------------------------
-- Débito a Clientes (o Caja si se pagó en tienda) por el total;
-- crédito a Ingresos por la base gravable y a IVA por pagar por el impuesto.
-- Y en el mismo comprobante, el costo: débito a Costo de mercancía vendida y
-- crédito a Inventarios, usando el costo CONGELADO en la venta.
create or replace function public.asentar_factura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta_cobro text;
  v_costo numeric(16,2);
  v_lineas jsonb;
begin
  -- Pago en tienda entra a Caja; a crédito queda en Clientes.
  v_cuenta_cobro := case when new.payment_method ilike '%tienda%' then '1105' else '1305' end;

  select coalesce(sum(oi.quantity * oi.unit_cost_cop), 0)
    into v_costo
  from public.order_items oi
  where oi.order_id = new.order_id and oi.unit_cost_cop is not null;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_cobro, 'detalle', new.customer_name,
                       'debito', new.total_cop, 'credito', 0),
    jsonb_build_object('cuenta', '4135', 'detalle', 'Venta ' || new.invoice_number,
                       'debito', 0, 'credito', new.taxable_base_cop),
    jsonb_build_object('cuenta', '2408', 'detalle', 'IVA generado',
                       'debito', 0, 'credito', new.tax_cop)
  );

  -- El descuento y el envío alteran el total sin tocar la base ni el IVA, así
  -- que se cuadra con la cuenta que corresponde en vez de forzar los números.
  if new.discount_cop > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta', '4175', 'detalle', 'Descuento comercial',
                         'debito', new.discount_cop, 'credito', 0));
  end if;
  if new.shipping_cop > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta', '4135', 'detalle', 'Flete facturado',
                         'debito', 0, 'credito', new.shipping_cop));
  end if;

  -- El costo solo se asienta si se conoce. Meter un cero fingiría un margen
  -- del 100 % en los libros, que es peor que no registrarlo.
  if v_costo > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta', '6135', 'detalle', 'Costo de ' || new.invoice_number,
                         'debito', v_costo, 'credito', 0),
      jsonb_build_object('cuenta', '1435', 'detalle', 'Salida de inventario',
                         'debito', 0, 'credito', v_costo));
  end if;

  perform public.post_journal_entry(
    'Factura ' || new.invoice_number || ' — ' || new.customer_name,
    v_lineas,
    new.issued_at::date,
    'FACTURA',
    new.id, null, null);

  return new;
end;
$$;

create trigger factura_genera_asiento
  after insert on public.invoices
  for each row execute function public.asentar_factura();

-- ------------------------------------------------------------
-- 2. Recepción confirmada
-- ------------------------------------------------------------
-- Débito a Inventarios por el costo de la mercancía y crédito a Proveedores.
-- El IVA descontable no se registra porque la recepción captura el costo SIN
-- IVA: inventarlo aquí produciría un impuesto que nadie pagó.
create or replace function public.asentar_recepcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(16,2);
  v_prov  text;
begin
  if new.status <> 'CONFIRMADA' or old.status = 'CONFIRMADA' then
    return new;
  end if;

  select coalesce(sum(quantity * unit_cost_cop), 0)
    into v_total
  from public.purchase_receipt_items where receipt_id = new.id;

  if v_total <= 0 then
    return new;
  end if;

  select name into v_prov from public.suppliers where id = new.supplier_id;

  perform public.post_journal_entry(
    'Recepción ' || new.receipt_number ||
      coalesce(' — ' || v_prov, '') ||
      coalesce(' (' || new.document_ref || ')', ''),
    jsonb_build_array(
      jsonb_build_object('cuenta', '1435', 'detalle', 'Entrada de mercancía',
                         'debito', v_total, 'credito', 0),
      jsonb_build_object('cuenta', '2205', 'detalle', coalesce(v_prov, 'Proveedor'),
                         'debito', 0, 'credito', v_total)
    ),
    new.received_on,
    'RECEPCION',
    null, new.id, null);

  return new;
end;
$$;

create trigger recepcion_genera_asiento
  after update on public.purchase_receipts
  for each row execute function public.asentar_recepcion();

-- ------------------------------------------------------------
-- 3. Recaudo de tesorería
-- ------------------------------------------------------------
-- Entra plata: débito a Bancos o Caja y crédito a Clientes, que es lo que
-- deja de deberse.
create or replace function public.asentar_recaudo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta text;
  v_tipo   text;
begin
  -- Solo los ingresos generan este asiento. Un egreso tiene otra contrapartida
  -- —depende de qué se pagó— y forzarlo aquí inventaría el hecho económico.
  if new.direction <> 'INGRESO' then
    return new;
  end if;

  select kind::text into v_tipo from public.bank_accounts where id = new.account_id;
  v_cuenta := case when v_tipo = 'CAJA' then '1105' else '1110' end;

  perform public.post_journal_entry(
    'Recaudo — ' || new.concept,
    jsonb_build_array(
      jsonb_build_object('cuenta', v_cuenta, 'detalle', new.concept,
                         'debito', new.amount_cop, 'credito', 0),
      jsonb_build_object('cuenta', '1305', 'detalle', 'Abono de cliente',
                         'debito', 0, 'credito', new.amount_cop)
    ),
    new.occurred_on,
    'RECAUDO',
    new.invoice_id, null, new.id);

  return new;
end;
$$;

create trigger recaudo_genera_asiento
  after insert on public.treasury_movements
  for each row execute function public.asentar_recaudo();
