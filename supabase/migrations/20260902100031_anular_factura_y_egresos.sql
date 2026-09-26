-- Operaciones que faltaban: anular factura (invoices.void) y registrar egresos de tesorería.

-- Origen propio para distinguir los egresos de los asientos manuales en el libro.
alter type public.journal_source add value if not exists 'EGRESO';

create or replace function public.anular_factura(
  _invoice_id uuid,
  _motivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura   public.invoices%rowtype;
  v_recaudado numeric;
  v_asiento   uuid;
  v_revertido boolean := false;
begin
  if not (public.is_admin() or public.has_permission('invoices.void')) then
    raise exception 'FORBIDDEN: no tienes permiso para anular facturas'
      using errcode = '42501';
  end if;

  -- Motivo obligatorio: es lo primero que pide una auditoría.
  if coalesce(trim(_motivo), '') = '' then
    raise exception 'VALIDATION: escribe el motivo de la anulación'
      using errcode = '22023';
  end if;
  if length(trim(_motivo)) < 10 then
    raise exception 'VALIDATION: el motivo tiene que explicar qué pasó, no una palabra suelta'
      using errcode = '22023';
  end if;

  select * into v_factura from public.invoices where id = _invoice_id for update;
  if v_factura.id is null then
    raise exception 'NOT_FOUND: la factura no existe' using errcode = 'P0002';
  end if;
  if v_factura.status = 'ANULADA' then
    raise exception 'YA_ANULADA: esa factura ya estaba anulada' using errcode = '22023';
  end if;

  -- No se anula con recaudos: el dinero quedaría sin respaldo. Primero se devuelve
  -- o se emite nota crédito.
  select coalesce(sum(amount_cop), 0) into v_recaudado
  from public.treasury_movements
  where invoice_id = _invoice_id and direction = 'INGRESO';

  if v_recaudado > 0 then
    raise exception
      'TIENE_RECAUDOS: la factura tiene % recaudado. Registra primero la devolución del dinero.',
      v_recaudado
      using errcode = '22023';
  end if;

  update public.invoices
     set status = 'ANULADA',
         voided_at = now(),
         void_reason = trim(_motivo)
   where id = _invoice_id;

  -- void_journal_entry reversa el asiento en lugar de borrarlo.
  select id into v_asiento
  from public.journal_entries
  where invoice_id = _invoice_id and status = 'REGISTRADO'
  limit 1;

  if v_asiento is not null then
    perform public.void_journal_entry(v_asiento, 'Anulación de ' || v_factura.invoice_number);
    v_revertido := true;
  end if;

  -- El inventario no se toca: lo mueve el estado del pedido, no la factura.

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'INVOICE_VOID', 'invoices', _invoice_id,
          jsonb_build_object(
            'numero', v_factura.invoice_number,
            'total', v_factura.total_cop,
            'motivo', trim(_motivo),
            'asiento_revertido', v_revertido));

  return jsonb_build_object(
    'numero', v_factura.invoice_number,
    'anulada', true,
    'asiento_revertido', v_revertido);
end;
$$;

create or replace function public.registrar_egreso(
  _account_id uuid,
  _amount numeric,
  _concept text,
  _cuenta_contrapartida text,
  _occurred_on date default null,
  _reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta_banco text;
  v_tipo         text;
  v_saldo_antes  numeric;
  v_mov          uuid;
  v_nombre_cta   text;
begin
  if not (public.is_admin() or public.has_permission('treasury.manage')) then
    raise exception 'FORBIDDEN: no tienes permiso para registrar egresos'
      using errcode = '42501';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'VALIDATION: el valor del egreso debe ser mayor que cero'
      using errcode = '22023';
  end if;
  if coalesce(trim(_concept), '') = '' then
    raise exception 'VALIDATION: escribe de qué es el egreso' using errcode = '22023';
  end if;

  select kind::text into v_tipo from public.bank_accounts where id = _account_id;
  if v_tipo is null then
    raise exception 'NOT_FOUND: esa cuenta no existe' using errcode = 'P0002';
  end if;
  v_cuenta_banco := case when v_tipo = 'CAJA' then '1105' else '1110' end;

  -- La contrapartida es obligatoria: un egreso puede ser gasto, abono a proveedor o
  -- compra, y no se puede deducir.
  select name into v_nombre_cta
  from public.accounts
  where code = _cuenta_contrapartida and is_postable and is_active;

  if v_nombre_cta is null then
    raise exception 'CUENTA_INVALIDA: la cuenta % no existe o no admite movimientos',
      _cuenta_contrapartida using errcode = '22023';
  end if;
  if _cuenta_contrapartida in ('1105', '1110') then
    raise exception 'CUENTA_INVALIDA: la contrapartida no puede ser caja ni bancos; eso sería un traslado'
      using errcode = '22023';
  end if;

  -- El saldo no bloquea (descubiertos y faltantes son reales); se devuelve para advertir.
  select coalesce(sum(case when direction = 'INGRESO' then amount_cop else -amount_cop end), 0)
    into v_saldo_antes
  from public.treasury_movements
  where account_id = _account_id;

  insert into public.treasury_movements (
    account_id, direction, amount_cop, occurred_on, concept, reference, created_by
  ) values (
    _account_id, 'EGRESO', _amount, coalesce(_occurred_on, current_date),
    trim(_concept), _reference, (select auth.uid())
  )
  returning id into v_mov;

  -- Débito a la contrapartida, crédito a la cuenta de origen.
  perform public.post_journal_entry(
    'Egreso — ' || trim(_concept),
    jsonb_build_array(
      jsonb_build_object('cuenta', _cuenta_contrapartida, 'detalle', trim(_concept),
                         'debito', _amount, 'credito', 0),
      jsonb_build_object('cuenta', v_cuenta_banco, 'detalle', 'Salida de dinero',
                         'debito', 0, 'credito', _amount)
    ),
    coalesce(_occurred_on, current_date),
    'EGRESO',
    null, null, v_mov);

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'TREASURY_EXPENSE', 'treasury_movements', v_mov,
          jsonb_build_object('monto', _amount, 'concepto', trim(_concept),
                             'contrapartida', _cuenta_contrapartida));

  return jsonb_build_object(
    'movement_id', v_mov,
    'saldo_antes', v_saldo_antes,
    'saldo_despues', v_saldo_antes - _amount,
    'queda_en_negativo', (v_saldo_antes - _amount) < 0,
    'contrapartida', _cuenta_contrapartida || ' — ' || v_nombre_cta);
end;
$$;

revoke all on function public.anular_factura(uuid, text) from public, anon;
revoke all on function public.registrar_egreso(uuid, numeric, text, text, date, text) from public, anon;
grant execute on function public.anular_factura(uuid, text) to authenticated;
grant execute on function public.registrar_egreso(uuid, numeric, text, text, date, text) to authenticated;

comment on function public.anular_factura(uuid, text) is
  'Anula una factura emitida y reversa su asiento. Exige invoices.void y un '
  'motivo escrito. Se niega si la factura ya tiene recaudos: primero se '
  'devuelve el dinero. No toca el inventario, que lo manda el pedido.';
comment on function public.registrar_egreso(uuid, numeric, text, text, date, text) is
  'Registra una salida de dinero con su contrapartida contable, que es '
  'obligatoria porque un egreso no dice por sí solo qué se pagó. Exige '
  'treasury.manage. No bloquea por saldo, pero avisa si queda en negativo.';
