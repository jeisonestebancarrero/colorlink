-- ============================================================
-- Pasarela de pagos: el particular paga antes, la empresa puede ir a crédito
-- ============================================================
-- Hasta ahora el checkout creaba el pedido y un pago en estado PENDIENTE que
-- nadie cobraba nunca. En la práctica el cliente "confirmaba" sin pagar.
--
-- La regla del negocio no es la misma para todos, y por eso no se resuelve con
-- un solo camino:
--
--   · PERSONA NATURAL → paga antes. El pedido queda a la espera del pago y no
--     se alista hasta que la pasarela lo confirme. Es lo normal en cualquier
--     tienda en línea y evita alistar mercancía que nadie pagó.
--   · EMPRESA CON CRÉDITO APROBADO → puede pedir y pagar después, dentro del
--     plazo pactado. Es como se compra material de obra en Colombia; negarlo
--     sacaría del sistema justamente a los clientes que más compran.
--
-- La pasarela es Wompi (Bancolombia), que es la que usa la mayoría del comercio
-- colombiano. La confirmación NO la da el navegador: la da el webhook firmado,
-- porque cualquiera puede llamar una URL diciendo "ya pagué".

-- ------------------------------------------------------------
-- 1. Condiciones de pago de cada empresa
-- ------------------------------------------------------------
do $$ begin
  create type public.payment_terms as enum ('CONTADO', 'CREDITO');
exception when duplicate_object then null; end $$;

alter table public.companies
  add column if not exists payment_terms public.payment_terms not null default 'CONTADO',
  add column if not exists credit_days integer not null default 0,
  add column if not exists credit_limit_cop numeric(14,2) not null default 0;

comment on column public.companies.payment_terms is
  'CONTADO: paga al comprar, como cualquier particular. CREDITO: puede pedir y pagar dentro de credit_days.';

alter table public.companies
  drop constraint if exists companies_credito_coherente;
alter table public.companies
  add constraint companies_credito_coherente check (
    (payment_terms = 'CONTADO' and credit_days = 0)
    or (payment_terms = 'CREDITO' and credit_days between 1 and 180)
  );

-- ------------------------------------------------------------
-- 2. Configuración de la pasarela
-- ------------------------------------------------------------
alter table public.app_settings
  add column if not exists payments_enabled boolean not null default false,
  add column if not exists payments_test_mode boolean not null default true,
  add column if not exists wompi_public_key text,
  add column if not exists wompi_integrity_secret text,
  add column if not exists wompi_events_secret text;

-- Los secretos NO se leen desde el navegador. La llave pública sí: es la que
-- el widget necesita y por eso se llama pública. Se revoca la tabla entera y
-- se vuelve a conceder columna por columna, porque un GRANT a nivel de tabla
-- deja sin efecto cualquier REVOKE sobre una columna suelta.
revoke select on public.app_settings from authenticated;
grant select (
  id, company_name, company_legal_name, company_nit, company_address,
  company_city, company_phone, company_email, company_website, logo_url,
  tax_regime, default_tax_rate, invoice_prefix, invoice_footer,
  smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from_name,
  smtp_from_email, smtp_configured_at, updated_by, updated_at,
  payments_enabled, payments_test_mode, wompi_public_key
) on public.app_settings to authenticated;

-- ------------------------------------------------------------
-- 3. Datos del pago
-- ------------------------------------------------------------
alter table public.payments
  add column if not exists due_date date,
  add column if not exists is_credit boolean not null default false,
  add column if not exists gateway_status text,
  add column if not exists failure_reason text;

comment on column public.payments.is_credit is
  'El pedido salió a crédito de la empresa: no hay cobro en línea, hay cartera con vencimiento en due_date.';

create unique index if not exists payments_reference_unica
  on public.payments (reference) where reference is not null;

-- ------------------------------------------------------------
-- 4. ¿Este cliente puede comprar a crédito?
-- ------------------------------------------------------------
create or replace function public.condiciones_de_pago(_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id      uuid := coalesce(_user_id, (select auth.uid()));
  v_empresa record;
  v_deuda   numeric := 0;
begin
  if v_id is null then
    raise exception 'FORBIDDEN: no hay sesión' using errcode = '42501';
  end if;

  -- Solo el propio cliente o el personal interno pueden consultarlo.
  if v_id <> (select auth.uid()) and not public.is_staff() then
    raise exception 'FORBIDDEN: no puedes ver las condiciones de otro cliente'
      using errcode = '42501';
  end if;

  select c.* into v_empresa
    from public.profiles p
    join public.companies c on c.id = p.company_id
   where p.id = v_id;

  if v_empresa.id is null or v_empresa.payment_terms <> 'CREDITO' then
    return jsonb_build_object(
      'a_credito', false,
      'motivo', case when v_empresa.id is null
                     then 'Cuenta personal: el pago se hace al comprar.'
                     else 'La empresa está registrada de contado.' end
    );
  end if;

  -- Cartera pendiente: lo facturado a crédito que todavía no se ha recaudado.
  select coalesce(sum(i.total_cop), 0) into v_deuda
    from public.invoices i
    join public.orders o on o.id = i.order_id
    join public.profiles p on p.id = o.user_id
   where p.company_id = v_empresa.id
     and i.status = 'EMITIDA'
     and not exists (
       select 1 from public.payments pa
        where pa.order_id = o.id and pa.status = 'PAGADO');

  return jsonb_build_object(
    'a_credito', true,
    'empresa', v_empresa.name,
    'dias', v_empresa.credit_days,
    'cupo', v_empresa.credit_limit_cop,
    'usado', v_deuda,
    'disponible', greatest(0, v_empresa.credit_limit_cop - v_deuda)
  );
end;
$$;

revoke all on function public.condiciones_de_pago(uuid) from public;
grant execute on function public.condiciones_de_pago(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Iniciar el pago de un pedido
-- ------------------------------------------------------------
-- Devuelve lo que el widget de Wompi necesita. La firma de integridad se
-- calcula aquí y no en el navegador: si el monto se firmara en el cliente,
-- cualquiera podría pagar 1.000 pesos por un pedido de un millón.
create or replace function public.iniciar_pago(_order_id uuid, _metodo text default 'PSE')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido    public.orders%rowtype;
  v_conf      public.app_settings%rowtype;
  v_cond      jsonb;
  v_ref       text;
  v_centavos  bigint;
  v_pago      public.payments%rowtype;
begin
  select * into v_pedido from public.orders where id = _order_id;
  if not found then
    raise exception 'NOT_FOUND: ese pedido no existe' using errcode = 'P0002';
  end if;

  if v_pedido.user_id <> (select auth.uid()) and not public.is_staff() then
    raise exception 'FORBIDDEN: ese pedido no es tuyo' using errcode = '42501';
  end if;

  if v_pedido.total_cop <= 0 then
    raise exception 'PEDIDO_VACIO: el pedido no tiene valor a pagar' using errcode = '22023';
  end if;

  select * into v_pago from public.payments
   where order_id = _order_id order by created_at desc limit 1;

  if v_pago.status = 'PAGADO' then
    raise exception 'YA_PAGADO: ese pedido ya está pagado' using errcode = '23505';
  end if;

  select * into v_conf from public.app_settings limit 1;
  v_cond := public.condiciones_de_pago(v_pedido.user_id);

  -- ── Compra a crédito: no hay cobro en línea ────────────────────────────
  if _metodo = 'CREDITO' then
    if not (v_cond ->> 'a_credito')::boolean then
      raise exception 'SIN_CREDITO: esta cuenta no tiene crédito aprobado'
        using errcode = '42501';
    end if;
    if (v_cond ->> 'disponible')::numeric < v_pedido.total_cop then
      raise exception 'CUPO_INSUFICIENTE: el pedido supera el cupo disponible'
        using errcode = '22023';
    end if;

    update public.payments
       set method = 'CREDITO_EMPRESARIAL',
           status = 'AUTORIZADO',
           is_credit = true,
           due_date = current_date + ((v_cond ->> 'dias')::int),
           gateway = 'CREDITO',
           updated_at = now()
     where id = v_pago.id;

    return jsonb_build_object(
      'modo', 'CREDITO',
      'vence', current_date + ((v_cond ->> 'dias')::int),
      'dias', (v_cond ->> 'dias')::int
    );
  end if;

  -- ── Cobro en línea ─────────────────────────────────────────────────────
  if not coalesce(v_conf.payments_enabled, false) then
    raise exception 'PASARELA_APAGADA: el cobro en línea no está configurado'
      using errcode = '22023';
  end if;

  -- La referencia identifica el pago ante la pasarela y ante nosotros. Lleva
  -- el número del pedido para poder rastrearla a ojo en el panel de Wompi.
  v_ref := v_pedido.order_number || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_centavos := (round(v_pedido.total_cop) * 100)::bigint;

  update public.payments
     set method = _metodo::public.payment_method,
         status = 'PENDIENTE',
         is_credit = false,
         reference = v_ref,
         gateway = case when v_conf.payments_test_mode then 'WOMPI_PRUEBA' else 'WOMPI' end,
         updated_at = now()
   where id = v_pago.id;

  return jsonb_build_object(
    'modo', case when v_conf.payments_test_mode then 'PRUEBA' else 'WOMPI' end,
    'referencia', v_ref,
    'centavos', v_centavos,
    'moneda', 'COP',
    'llave_publica', v_conf.wompi_public_key,
    -- Wompi exige sha256(referencia + centavos + moneda + secreto).
    'firma', case
      when v_conf.wompi_integrity_secret is null then null
      else encode(
        extensions.digest(
          v_ref || v_centavos::text || 'COP' || v_conf.wompi_integrity_secret,
          'sha256'),
        'hex')
    end
  );
end;
$$;

revoke all on function public.iniciar_pago(uuid, text) from public;
grant execute on function public.iniciar_pago(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. Confirmar el pago (lo llama el webhook, nunca el navegador)
-- ------------------------------------------------------------
create or replace function public.confirmar_pago(
  _referencia   text,
  _estado       text,
  _transaccion  text default null,
  _motivo       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago   public.payments%rowtype;
  v_nuevo  public.payment_status;
begin
  -- Solo el servicio puede confirmar pagos. Si esto lo pudiera llamar un
  -- usuario, cualquiera marcaría sus pedidos como pagados.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN: solo el webhook puede confirmar pagos' using errcode = '42501';
  end if;

  select * into v_pago from public.payments where reference = _referencia;
  if not found then
    raise exception 'NOT_FOUND: no hay pago con esa referencia' using errcode = 'P0002';
  end if;

  -- Un pago ya confirmado no se vuelve a tocar: las pasarelas reenvían el
  -- mismo evento varias veces y no se puede duplicar el efecto.
  if v_pago.status = 'PAGADO' then
    return jsonb_build_object('resultado', 'YA_APLICADO', 'pago', v_pago.id);
  end if;

  v_nuevo := case upper(_estado)
    when 'APPROVED' then 'PAGADO'
    when 'DECLINED' then 'RECHAZADO'
    when 'ERROR'    then 'RECHAZADO'
    when 'VOIDED'   then 'REEMBOLSADO'
    else 'PENDIENTE'
  end;

  update public.payments
     set status = v_nuevo,
         gateway_status = upper(_estado),
         failure_reason = _motivo,
         paid_at = case when v_nuevo = 'PAGADO' then now() else paid_at end,
         updated_at = now()
   where id = v_pago.id;

  -- El pago aprobado es lo que confirma el pedido. Antes de eso no se alista
  -- nada: es la diferencia entre una venta y una intención de compra.
  if v_nuevo = 'PAGADO' then
    update public.orders
       set status = 'CONFIRMADO', updated_at = now()
     where id = v_pago.order_id and status = 'PENDIENTE';

    insert into public.conversation_messages (order_id, kind, body)
    values (v_pago.order_id, 'EVENTO',
            'Pago recibido por ' || to_char(v_pago.amount_cop, 'FM$999,999,999') || '.');
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (null, 'PAYMENT_' || v_nuevo::text, 'payments', v_pago.id,
          jsonb_build_object('referencia', _referencia, 'transaccion', _transaccion));

  return jsonb_build_object('resultado', v_nuevo, 'pedido', v_pago.order_id);
end;
$$;

revoke all on function public.confirmar_pago(text, text, text, text) from public;
grant execute on function public.confirmar_pago(text, text, text, text) to service_role;

-- ------------------------------------------------------------
-- 7. El pedido no avanza si no está pagado ni es a crédito
-- ------------------------------------------------------------
create or replace function public.pedido_cobrado(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payments
     where order_id = _order_id
       and (status = 'PAGADO' or is_credit)
  );
$$;

comment on function public.pedido_cobrado(uuid) is
  'Verdadero si el pedido está pagado o salió a crédito aprobado. Es la condición para alistarlo.';

revoke all on function public.pedido_cobrado(uuid) from public;
grant execute on function public.pedido_cobrado(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. Pago simulado — SOLO en modo prueba
-- ------------------------------------------------------------
-- Permite recorrer el flujo completo (pedido → pago → confirmación → factura →
-- contabilidad) antes de tener credenciales de Wompi.
--
-- CUIDADO: mientras `payments_test_mode` esté en verdadero, un cliente puede
-- dar por pagado su propio pedido. Es aceptable en pruebas y NO lo es en
-- producción: al conectar las llaves reales hay que apagar el modo prueba
-- desde Configuración. La pantalla lo advierte en rojo mientras esté activo.
create or replace function public.simular_pago(_order_id uuid, _aprobar boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conf   public.app_settings%rowtype;
  v_pedido public.orders%rowtype;
  v_pago   public.payments%rowtype;
begin
  select * into v_conf from public.app_settings limit 1;
  if not coalesce(v_conf.payments_test_mode, false) then
    raise exception 'MODO_PRUEBA_APAGADO: el pago simulado no está disponible'
      using errcode = '42501';
  end if;

  select * into v_pedido from public.orders where id = _order_id;
  if not found then
    raise exception 'NOT_FOUND: ese pedido no existe' using errcode = 'P0002';
  end if;
  if v_pedido.user_id <> (select auth.uid()) and not public.is_staff() then
    raise exception 'FORBIDDEN: ese pedido no es tuyo' using errcode = '42501';
  end if;

  select * into v_pago from public.payments
   where order_id = _order_id order by created_at desc limit 1;
  if v_pago.reference is null then
    raise exception 'SIN_REFERENCIA: primero hay que iniciar el pago' using errcode = '22023';
  end if;

  update public.payments
     set status = case when _aprobar then 'PAGADO' else 'RECHAZADO' end::public.payment_status,
         gateway_status = case when _aprobar then 'APPROVED' else 'DECLINED' end,
         paid_at = case when _aprobar then now() else null end,
         updated_at = now()
   where id = v_pago.id;

  if _aprobar then
    update public.orders
       set status = 'CONFIRMADO', updated_at = now()
     where id = _order_id and status = 'PENDIENTE';

    insert into public.conversation_messages (order_id, kind, body)
    values (_order_id, 'EVENTO',
            'Pago recibido por ' || to_char(v_pago.amount_cop, 'FM$999,999,999') || ' (modo prueba).');
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PAYMENT_SIMULADO', 'payments', v_pago.id,
          jsonb_build_object('aprobado', _aprobar, 'referencia', v_pago.reference));

  return jsonb_build_object('resultado', case when _aprobar then 'PAGADO' else 'RECHAZADO' end);
end;
$$;

revoke all on function public.simular_pago(uuid, boolean) from public;
grant execute on function public.simular_pago(uuid, boolean) to authenticated;
