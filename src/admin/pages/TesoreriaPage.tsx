import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Banknote, CheckCircle2, Landmark, Link2, Wallet,
  ArrowDownCircle,
} from 'lucide-react';
import {
  formatearFecha,
  tesoreriaService, formatearCOP, METODOS_PAGO, ETIQUETA_METODO,
  type CarteraItem, type CuentaSaldo, type MetodoPago, type MovimientoTesoreria,
} from '../../services/backoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { useSedes } from '../SedeContext';
import {
  ContadorPorSede, sedeVisible, useAislamientoDeSede,
} from '../ContadorPorSede';
import { ExportarBoton } from '../ExportarBoton';
import { IconoModulo } from '../IconosDeModulo';
import { RegistrarEgreso } from '../RegistrarEgreso';

/**
 * Tesorería: recaudos, cartera y conciliación bancaria.
 *
 * Cierra el circuito del dinero. Tesorería mueve dinero real; contabilidad
 * lo clasifica. Mantenerlas separadas es lo que permite saber quién responde
 * por una diferencia.
 */
export const TesoreriaPage: React.FC = () => {
  const { filtroSedes } = useSedes();
  const { sedeAislada, aislar, filtroEfectivo } = useAislamientoDeSede();
  const { puede } = useAdminAuth();
  const [cuentas, setCuentas] = useState<CuentaSaldo[]>([]);
  const [cartera, setCartera] = useState<CarteraItem[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoTesoreria[]>([]);
  const [pestana, setPestana] = useState<'cartera' | 'movimientos'>('cartera');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [recaudo, setRecaudo] = useState<CarteraItem | null>(null);
  const [form, setForm] = useState({ monto: '', metodo: 'TRANSFERENCIA' as MetodoPago, cuenta: '', referencia: '' });
  const [guardando, setGuardando] = useState(false);

  const [egresando, setEgresando] = useState(false);

  const [conciliando, setConciliando] = useState<MovimientoTesoreria | null>(null);
  const [refExtracto, setRefExtracto] = useState('');

  const cargar = async () => {
    try {
      const [c, k, m] = await Promise.all([
        tesoreriaService.cuentas(),
        tesoreriaService.cartera(),
        tesoreriaService.movimientos(),
      ]);
      setCuentas(c);
      setCartera(k);
      setMovimientos(m);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar la tesorería.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const abrirRecaudo = (c: CarteraItem) => {
    setRecaudo(c);
    setForm({
      monto: String(c.saldo),
      metodo: 'TRANSFERENCIA',
      cuenta: cuentas[0]?.id ?? '',
      referencia: '',
    });
    setError('');
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recaudo) return;
    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) return setError('El valor debe ser mayor que cero.');
    if (!form.cuenta) return setError('Elige la cuenta donde entró el dinero.');

    setGuardando(true);
    setError('');
    try {
      await tesoreriaService.registrarRecaudo({
        invoiceId: recaudo.invoiceId, cuentaId: form.cuenta,
        monto, metodo: form.metodo, referencia: form.referencia || undefined,
      });
      setRecaudo(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el recaudo.');
    } finally {
      setGuardando(false);
    }
  };

  const conciliar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conciliando) return;
    setGuardando(true);
    try {
      await tesoreriaService.conciliar(conciliando.id, refExtracto);
      setConciliando(null);
      setRefExtracto('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible conciliar.');
    } finally {
      setGuardando(false);
    }
  };

  // `occurred_on` es una columna `date`: un recaudo del día 1 se mostraba
  // como del último día del mes anterior, y eso descuadra una conciliación.
  const fecha = (iso: string) =>
    formatearFecha(iso, { day: '2-digit', month: 'short', year: 'numeric' });

  // Semáforo de antigüedad: 30 días es el corte habitual de cartera en Colombia.
  const semaforoDias = (d: number) =>
    d > 60 ? 'bg-rose-50 text-rose-700 border-rose-200'
      : d > 30 ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-slate-50 text-slate-600 border-slate-200';

  const totalCartera = cartera.reduce((s, c) => s + c.saldo, 0);
  const vencida = cartera.filter((c) => c.dias > 30).reduce((s, c) => s + c.saldo, 0);
  // Acotado a las sedes ACTIVAS. Un egreso sin sede se conserva: no pertenece
  // a ninguna tienda y esconderlo al elegir una sede lo haría desaparecer.
  const movDeSedesActivas = movimientos.filter((m) => sedeVisible(m.locationId, filtroSedes));
  const movVisibles = movimientos.filter((m) => sedeVisible(m.locationId, filtroEfectivo));
  const sinConciliar = movVisibles.filter((m) => !m.conciliado).length;

  if (cargando) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-10 h-10 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="Landmark" /> Tesorería
          </h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Recaudos, egresos, cartera y conciliación bancaria.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        {/* Faltaba por completo: solo se podía cobrar, así que la caja del
            sistema decía más dinero del que había. */}
        {puede('treasury.manage') && cuentas.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEgresando(true)}
            className="text-xs font-bold"
            leftIcon={<ArrowDownCircle className="w-3.5 h-3.5" />}>
            Registrar egreso
          </Button>
        )}

        <ExportarBoton<MovimientoTesoreria>
          filas={movVisibles}
          nombre="movimientos-tesoreria"
          titulo="Movimientos de tesorería"
          filtros={sedeAislada ? 'Una sede' : 'Sedes activas'}
          columnas={[
            { titulo: 'Fecha', valor: (m) => m.fecha.slice(0, 10) },
            { titulo: 'Cuenta', valor: (m) => m.cuenta },
            { titulo: 'Tipo', valor: (m) => m.direccion },
            { titulo: 'Concepto', valor: (m) => m.concepto },
            { titulo: 'Referencia', valor: (m) => m.referencia ?? '' },
            { titulo: 'Conciliado', valor: (m) => (m.conciliado ? 'Sí' : 'No') },
            { titulo: 'Ref. extracto', valor: (m) => m.refExtracto ?? '' },
            { titulo: 'Monto', valor: (m) => m.monto, numerica: true },
          ]}
        />
      </div>

      {/* La cartera es del cliente, no de una sede: solo se desglosan los
          movimientos, que sí ocurren en una tienda. */}
      <ContadorPorSede
        sedeAislada={sedeAislada}
        onAislar={aislar}
        filas={movVisibles}
        sustantivo="Movimientos"
        etiquetaSinSede="Sin sede"
      />

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
      )}

      {/* Cuentas y saldos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cuentas.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4">
            <div className="flex items-center gap-2">
              {c.tipo === 'CAJA' ? <Wallet className="w-4 h-4 text-slate-400" />
                : c.tipo === 'PASARELA' ? <Link2 className="w-4 h-4 text-slate-400" />
                : <Landmark className="w-4 h-4 text-slate-400" />}
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">{c.nombre}</p>
            </div>
            <p className="text-xl font-extrabold text-slate-900 mt-1.5 tabular-nums">{formatearCOP(c.saldo)}</p>
            <p className="text-[11px] text-slate-400 font-medium">
              {c.banco ?? 'Efectivo'}{c.numero ? ` · ${c.numero}` : ''}
              {c.sinConciliar > 0 && ` · ${c.sinConciliar} sin conciliar`}
            </p>
          </div>
        ))}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${vencida > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cartera pendiente</p>
          </div>
          <p className="text-xl font-extrabold text-slate-900 mt-1.5 tabular-nums">{formatearCOP(totalCartera)}</p>
          <p className="text-[11px] text-slate-400 font-medium">
            {vencida > 0 ? `${formatearCOP(vencida)} con más de 30 días` : 'Nada vencido'}
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {([['cartera', `Cartera (${cartera.length})`],
           ['movimientos', `Movimientos${sinConciliar > 0 ? ` · ${sinConciliar} sin conciliar` : ''}`]] as const).map(([v, t]) => (
          <button key={v} onClick={() => setPestana(v)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              pestana === v ? 'bg-[#004F9F] text-white border-[#004F9F]'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}>{t}</button>
        ))}
      </div>

      {pestana === 'cartera' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="text-left px-5 py-3">Factura</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Emitida</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Recaudado</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {cartera.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-emerald-300" />
                  No hay cartera pendiente. Todo está recaudado.
                </td></tr>
              )}
              {cartera.map((c) => (
                <tr key={c.invoiceId} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-bold text-slate-900">{c.numero}</td>
                  <td className="px-4 py-3 text-slate-700">{c.cliente}</td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600">{fecha(c.emitida)}</span>
                    <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${semaforoDias(c.dias)}`}>
                      {c.dias} d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatearCOP(c.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatearCOP(c.recaudado)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">{formatearCOP(c.saldo)}</td>
                  <td className="px-5 py-3 text-right">
                    {puede('treasury.manage') && (
                      <Button variant="pintuco" size="sm" onClick={() => abrirRecaudo(c)}
                        leftIcon={<Banknote className="w-3.5 h-3.5" />}>
                        Registrar pago
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="text-left px-5 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Concepto</th>
                <th className="text-left px-4 py-3">Cuenta</th>
                <th className="text-right px-4 py-3">Valor</th>
                <th className="text-left px-4 py-3">Conciliación</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {movVisibles.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                  Todavía no hay movimientos de tesorería.
                </td></tr>
              )}
              {movVisibles.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fecha(m.fecha)}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800 font-medium">{m.concepto}</p>
                    {m.referencia && <p className="text-xs text-slate-400">Ref. {m.referencia}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.cuenta}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-bold ${
                    m.direccion === 'INGRESO' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {m.direccion === 'INGRESO' ? '+' : '−'}{formatearCOP(m.monto)}
                  </td>
                  <td className="px-4 py-3">
                    {m.conciliado ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> {m.refExtracto}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-700">Sin conciliar</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!m.conciliado && puede('treasury.manage') && (
                      <Button variant="outline" size="sm"
                        onClick={() => { setConciliando(m); setRefExtracto(''); }}>
                        Conciliar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Registrar recaudo */}
      <Modal isOpen={recaudo !== null} onClose={() => setRecaudo(null)}
        title="Registrar recaudo"
        subtitle={recaudo ? `${recaudo.numero} · ${recaudo.cliente}` : undefined}>
        <form onSubmit={registrar} className="space-y-4 text-left">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
          )}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Total factura</span>
              <span className="font-semibold tabular-nums">{formatearCOP(recaudo?.total ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Ya recaudado</span>
              <span className="font-semibold tabular-nums text-emerald-700">{formatearCOP(recaudo?.recaudado ?? 0)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-700 font-bold">Saldo</span>
              <span className="font-extrabold tabular-nums">{formatearCOP(recaudo?.saldo ?? 0)}</span></div>
          </div>

          <Input label="Valor recibido" type="number" min="1" value={form.monto}
            onChange={(e) => setForm({ ...form, monto: e.target.value })} required />
          <p className="text-[11px] text-slate-500 -mt-2">
            Admite abonos parciales. No se puede registrar más del saldo pendiente.
          </p>

          <Select label="Cuenta de destino"
            options={cuentas.map((c) => c.nombre)}
            value={cuentas.find((c) => c.id === form.cuenta)?.nombre ?? ''}
            onChange={(e) => {
              const c = cuentas.find((x) => x.nombre === e.target.value);
              if (c) setForm({ ...form, cuenta: c.id });
            }} />

          <Select label="Medio de pago"
            options={METODOS_PAGO.map((m) => ETIQUETA_METODO[m])}
            value={ETIQUETA_METODO[form.metodo]}
            onChange={(e) => {
              const m = METODOS_PAGO.find((x) => ETIQUETA_METODO[x] === e.target.value);
              if (m) setForm({ ...form, metodo: m });
            }} />

          <Input label="Referencia" value={form.referencia}
            onChange={(e) => setForm({ ...form, referencia: e.target.value })}
            placeholder="Número de transacción o consignación" />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setRecaudo(null)}>Cancelar</Button>
            <Button type="submit" variant="pintuco" isLoading={guardando}>Registrar</Button>
          </div>
        </form>
      </Modal>

      {/* Conciliar */}
      <Modal isOpen={conciliando !== null} onClose={() => setConciliando(null)}
        title="Conciliar con el extracto"
        subtitle={conciliando ? `${conciliando.concepto} · ${formatearCOP(conciliando.monto)}` : undefined}>
        <form onSubmit={conciliar} className="space-y-4 text-left">
          <p className="text-xs text-slate-600 font-medium">
            Indica con qué línea del extracto bancario cuadra este movimiento.
            La referencia es obligatoria: una conciliación sin origen no se
            puede auditar después.
          </p>
          <Input label="Referencia del extracto" value={refExtracto}
            onChange={(e) => setRefExtracto(e.target.value)}
            placeholder="Ej. Extracto 08-2026 · línea 42" required />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setConciliando(null)}>Cancelar</Button>
            <Button type="submit" variant="pintuco" isLoading={guardando}>Conciliar</Button>
          </div>
        </form>
      </Modal>

      {egresando && (
        <RegistrarEgreso
          cuentas={cuentas}
          onCerrar={() => setEgresando(false)}
          onRegistrado={() => { setEgresando(false); void cargar(); }}
        />
      )}
    </div>
  );
};
