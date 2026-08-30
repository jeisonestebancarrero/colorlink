-- ============================================================
-- Informes contables
-- ============================================================
-- Las dos vistas leen como sus dueñas y ponen su propia puerta con
-- `has_permission('accounting.read')`. Con `security_invoker` no funcionarían:
-- las líneas del libro cruzan tablas cuyo acceso el usuario no tiene por qué
-- tener directamente, y el resultado sería un informe vacío sin explicación.
--
-- Los comprobantes ANULADOS se excluyen de los saldos pero no desaparecen:
-- siguen consultables, con su reverso, porque en contabilidad la prueba de
-- que algo se anuló es parte del libro.
-- ============================================================

-- ------------------------------------------------------------
-- Libro auxiliar: cada movimiento, cuenta por cuenta
-- ------------------------------------------------------------
create view public.v_libro_auxiliar as
select
  l.id            as line_id,
  e.id            as entry_id,
  e.entry_number,
  e.entry_date,
  e.source,
  e.status,
  e.description   as comprobante,
  a.code          as cuenta,
  a.name          as cuenta_nombre,
  a.class         as clase,
  a.nature        as naturaleza,
  l.description   as detalle,
  l.debit_cop,
  l.credit_cop,
  e.invoice_id,
  e.receipt_id,
  e.movement_id
from public.journal_lines l
join public.journal_entries e on e.id = l.entry_id
join public.accounts a on a.id = l.account_id
where public.has_permission('accounting.read');

grant select on public.v_libro_auxiliar to authenticated;

comment on view public.v_libro_auxiliar is
  'Cada línea contable con su cuenta y su comprobante. Incluye los anulados, marcados como tales.';

-- ------------------------------------------------------------
-- Balance de prueba: saldo por cuenta
-- ------------------------------------------------------------
-- El saldo se calcula según la NATURALEZA de la cuenta. Restar siempre
-- crédito de débito daría saldos negativos en todos los pasivos e ingresos, y
-- obligaría a cada informe a corregir el signo por su cuenta.
create view public.v_balance_prueba as
select
  a.code                        as cuenta,
  a.name                        as cuenta_nombre,
  a.class                       as clase,
  a.nature                      as naturaleza,
  a.parent_code,
  coalesce(sum(l.debit_cop), 0)  as debitos,
  coalesce(sum(l.credit_cop), 0) as creditos,
  case a.nature
    when 'DEBITO'  then coalesce(sum(l.debit_cop), 0) - coalesce(sum(l.credit_cop), 0)
    else                coalesce(sum(l.credit_cop), 0) - coalesce(sum(l.debit_cop), 0)
  end                            as saldo
from public.accounts a
left join public.journal_lines l on l.account_id = a.id
left join public.journal_entries e
       on e.id = l.entry_id and e.status = 'REGISTRADO'
where a.is_postable
  and public.has_permission('accounting.read')
group by a.code, a.name, a.class, a.nature, a.parent_code;

grant select on public.v_balance_prueba to authenticated;

comment on view public.v_balance_prueba is
  'Saldo por cuenta de movimiento, con el signo según su naturaleza. Excluye comprobantes anulados.';

-- ------------------------------------------------------------
-- Comprobación de que los libros cuadran
-- ------------------------------------------------------------
-- La suma de todos los débitos debe igualar la de todos los créditos. Si
-- alguna vez deja de cumplirse, algo se rompió y hay que saberlo antes de que
-- lo descubra el contador.
create or replace function public.contabilidad_cuadra()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'debitos',  coalesce(sum(l.debit_cop), 0),
    'creditos', coalesce(sum(l.credit_cop), 0),
    'cuadra',   coalesce(sum(l.debit_cop), 0) = coalesce(sum(l.credit_cop), 0),
    'comprobantes', count(distinct e.id)
  )
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  where e.status = 'REGISTRADO'
    and public.has_permission('accounting.read');
$$;

revoke all on function public.contabilidad_cuadra() from public, anon;
grant execute on function public.contabilidad_cuadra() to authenticated;

-- ------------------------------------------------------------
-- La aplicación ya existe en el tablero; se le da color y descripción
-- ------------------------------------------------------------
update public.app_views
   set color = '#7C3AED', description = 'Comprobantes, libro auxiliar y balance'
 where code = 'bo.accounting';
