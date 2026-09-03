import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, BookOpen, CalendarClock, CheckCircle2, FileText,
  Plus, Receipt, Scale, Search, Trash2, TrendingUp, X,
} from 'lucide-react';
import {
  contabilidadService, formatearCOP, formatearFecha,
  ETIQUETA_ORIGEN, ETIQUETA_CLASE,
  type Asiento, type Cuenta, type DocumentoOrigen, type LineaAsiento,
  type RenglonResultado, type SaldoCuenta,
} from '../../services/contabilidad';
import { ExportarBoton } from '../ExportarBoton';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { IconoModulo } from '../IconosDeModulo';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Una línea del asiento manual. Los importes se guardan como texto. */
interface Renglon {
  cuenta: string;
  detalle: string;
  debito: string;
  credito: string;
}

const RENGLON_VACIO: Renglon = { cuenta: '', detalle: '', debito: '', credito: '' };

/**
 * Contabilidad.
 *
 * La mayoría de los comprobantes no se teclean: los generan las facturas, las
 * recepciones y los recaudos. Esta pantalla sirve para consultarlos, para los
 * asientos que no tienen documento de origen —una nómina, un servicio— y para
 * comprobar que los libros cuadran.
 */
export const ContabilidadPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [pestana, setPestana] = useState<'comprobantes' | 'balance' | 'resultados'>('comprobantes');
  const [asientos, setAsientos] = useState<Asiento[]>([]);
  const [balance, setBalance] = useState<SaldoCuenta[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [resumen, setResumen] = useState<{ debitos: number; creditos: number; cuadra: boolean; comprobantes: number } | null>(null);
  const [abierto, setAbierto] = useState<
    { asiento: Asiento; lineas: LineaAsiento[]; documento: DocumentoOrigen } | null
  >(null);
  const [resultados, setResultados] = useState<RenglonResultado[]>([]);
  // Movimientos de una cuenta concreta: la consulta más frecuente de un
  // contador —«muéstrame todo lo que pasó por Clientes»—.
  const [auxiliar, setAuxiliar] = useState<{
    cuenta: string;
    nombre: string;
    movimientos: Awaited<ReturnType<typeof contabilidadService.auxiliar>>;
  } | null>(null);
  const [periodo, setPeriodo] = useState({ desde: '', hasta: '' });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ descripcion: '', fecha: hoy() });
  const [renglones, setRenglones] = useState<Renglon[]>([{ ...RENGLON_VACIO }, { ...RENGLON_VACIO }]);
  const [anulando, setAnulando] = useState<Asiento | null>(null);
  const [motivo, setMotivo] = useState('');

  const escribe = puede('accounting.write');

  const cargar = async () => {
    setCargando(true);
    try {
      const [a, b, c, r, er] = await Promise.all([
        contabilidadService.comprobantes(
          periodo.desde || periodo.hasta ? { desde: periodo.desde || undefined, hasta: periodo.hasta || undefined } : undefined,
        ),
        contabilidadService.balance(),
        contabilidadService.cuentas(),
        contabilidadService.cuadra(),
        contabilidadService.estadoResultados(),
      ]);
      setAsientos(a);
      setBalance(b);
      setCuentas(c);
      setResumen(r);
      setResultados(er);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar la contabilidad.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, [periodo.desde, periodo.hasta]);

  const imputables = useMemo(() => cuentas.filter((c) => c.imputable), [cuentas]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return asientos;
    return asientos.filter(
      (a) =>
        a.numero.toLowerCase().includes(q) ||
        a.descripcion.toLowerCase().includes(q) ||
        (ETIQUETA_ORIGEN[a.origen] ?? '').toLowerCase().includes(q),
    );
  }, [asientos, busqueda]);

  /* El balance se pinta sin las cuentas que no se movieron; el archivo tiene
     que traer exactamente eso y no el plan de cuentas completo. */
  const balanceVisible = useMemo(
    () => balance.filter((b) => b.debitos > 0 || b.creditos > 0),
    [balance],
  );

  /** Cómo describir el período en el encabezado del documento. */
  const periodoTexto = useMemo(() => {
    if (periodo.desde && periodo.hasta) return `${periodo.desde} a ${periodo.hasta}`;
    if (periodo.desde) return `Desde ${periodo.desde}`;
    if (periodo.hasta) return `Hasta ${periodo.hasta}`;
    return 'Todo el histórico';
  }, [periodo]);

  const totales = useMemo(() => {
    const suma = (l: Renglon[], campo: 'debito' | 'credito') =>
      l.reduce((a, r) => a + (Number(r[campo]) || 0), 0);
    const d = suma(renglones, 'debito');
    const c = suma(renglones, 'credito');
    return { debito: d, credito: c, diferencia: Math.round((d - c) * 100) / 100 };
  }, [renglones]);

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const lineas = renglones
      .filter((r) => r.cuenta && (Number(r.debito) > 0 || Number(r.credito) > 0))
      .map((r) => ({
        cuenta: r.cuenta,
        detalle: r.detalle || undefined,
        debito: Number(r.debito) || 0,
        credito: Number(r.credito) || 0,
      }));

    if (lineas.length < 2) {
      setError('Un asiento en partida doble necesita al menos dos líneas con valor.');
      return;
    }

    setOcupado(true);
    try {
      await contabilidadService.registrar({
        descripcion: nuevo.descripcion,
        fecha: nuevo.fecha,
        lineas,
      });
      setCreando(false);
      setNuevo({ descripcion: '', fecha: hoy() });
      setRenglones([{ ...RENGLON_VACIO }, { ...RENGLON_VACIO }]);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el comprobante.');
    } finally {
      setOcupado(false);
    }
  };

  const anular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anulando) return;
    setError('');
    setOcupado(true);
    try {
      await contabilidadService.anular(anulando.id, motivo);
      setAnulando(null);
      setMotivo('');
      setAbierto(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible anular.');
    } finally {
      setOcupado(false);
    }
  };

  // ── Detalle de un comprobante ─────────────────────────────────────────────
  if (abierto) {
    const { asiento, lineas, documento } = abierto;
    return (
      <div className="space-y-5 max-w-4xl">
        <button
          onClick={() => setAbierto(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a comprobantes
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{asiento.numero}</h1>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  asiento.estado === 'ANULADO'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {asiento.estado === 'ANULADO' ? 'Anulado' : 'Registrado'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {ETIQUETA_ORIGEN[asiento.origen] ?? asiento.origen}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {asiento.descripcion} · {formatearFecha(asiento.fecha)}
            </p>
          </div>

          {escribe && asiento.estado === 'REGISTRADO' && (
            <Button variant="outline" size="sm" onClick={() => setAnulando(asiento)}>
              Anular
            </Button>
          )}
        </div>

        {asiento.estado === 'ANULADO' && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            Anulado: {asiento.motivoAnulacion}. El comprobante se conserva junto con su reverso —
            borrarlo eliminaría la prueba de que existió.
          </div>
        )}

        {/* El documento que originó el asiento.
            Un comprobante NO lleva las líneas de producto: con cuarenta
            renglones deja de ser legible y duplica la factura. Pero desde el
            asiento hay que poder ver QUÉ se vendió o QUÉ llegó sin salir a
            buscarlo a otra pantalla, y eso es lo que muestra este bloque. */}
        {documento.tipo !== 'MANUAL' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
              {documento.tipo === 'FACTURA' ? (
                <Receipt className="w-4 h-4 text-slate-400" />
              ) : (
                <FileText className="w-4 h-4 text-slate-400" />
              )}
              <h3 className="text-sm font-extrabold text-slate-900">
                {documento.tipo === 'FACTURA'
                  ? 'Factura que originó el asiento'
                  : documento.tipo === 'RECEPCION'
                    ? 'Recepción que originó el asiento'
                    : 'Recaudo que originó el asiento'}
              </h3>
              <span className="text-xs text-slate-500">
                {documento.numero}
                {documento.contraparte ? ` · ${documento.contraparte}` : ''}
                {documento.documento ? ` · ${documento.documento}` : ''}
                {documento.bodega ? ` · ${documento.bodega}` : ''}
                {documento.cuenta ? ` · ${documento.cuenta}` : ''}
              </span>
            </div>

            {documento.lineas.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                      <th className="text-left px-5 py-2.5">Producto</th>
                      <th className="text-right px-3 py-2.5">Cantidad</th>
                      <th className="text-right px-3 py-2.5">
                        {documento.tipo === 'RECEPCION' ? 'Costo unitario' : 'Valor unitario'}
                      </th>
                      <th className="text-right px-5 py-2.5">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documento.lineas.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-900">{l.descripcion}</p>
                          <p className="text-xs text-slate-500">
                            {[l.presentacion, l.codigo].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.cantidad}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                          {l.valorUnitario === null ? '—' : formatearCOP(l.valorUnitario)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">
                          {l.subtotal === null ? '—' : formatearCOP(l.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">
                {documento.tipo === 'RECAUDO'
                  ? 'Un recaudo no tiene líneas de producto: es un movimiento de dinero.'
                  : 'Este documento no tiene líneas.'}
              </p>
            )}

            {documento.tipo === 'RECEPCION' && documento.costosVisibles === false && (
              <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100">
                Los costos no se muestran porque tu rol no tiene el permiso para verlos.
              </p>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-slate-900">Asiento contable</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="text-left px-5 py-2.5">Cuenta</th>
                  <th className="text-left px-3 py-2.5">Detalle</th>
                  <th className="text-right px-3 py-2.5">Débito</th>
                  <th className="text-right px-5 py-2.5">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs font-bold text-slate-700">{l.cuenta}</span>
                      <span className="text-slate-600 ml-2">{l.cuentaNombre}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{l.detalle ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {l.debito > 0 ? formatearCOP(l.debito) : ''}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {l.credito > 0 ? formatearCOP(l.credito) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="border-t border-slate-200 font-bold">
                  <td colSpan={2} className="px-5 py-2.5 text-right text-xs text-slate-500">
                    Sumas iguales
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatearCOP(asiento.totalDebito)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {formatearCOP(asiento.totalCredito)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {anulando && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
            <form onSubmit={anular} className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-extrabold text-slate-900">Anular {anulando.numero}</h3>
                <button type="button" onClick={() => setAnulando(null)} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                No se borra. Se registra un comprobante contrario que deja el saldo en cero y ambos
                quedan en el libro, que es como se audita una corrección.
              </p>
              <Input
                label="Motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Error de digitación en el valor"
                required
                autoFocus
              />
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setAnulando(null)}>Cancelar</Button>
                <Button type="submit" variant="pintuco" isLoading={ocupado} disabled={!motivo.trim()}>
                  Anular
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ── Listado ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="BookOpen" /> Contabilidad
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Comprobantes en partida doble. La mayoría se generan solos.
          </p>
        </div>
        {escribe && !creando && (
          <Button variant="pintuco" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreando(true)}>
            Comprobante manual
          </Button>
        )}
      </div>

      <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
        <strong>Qué es y qué no.</strong> Aquí queda registrado en partida doble lo que el sistema
        ya sabe: cada factura emitida, cada recepción de mercancía y cada recaudo generan su
        comprobante automáticamente. <strong>No</strong> emite medios magnéticos ni información
        exógena a la DIAN, no calcula retenciones y no reemplaza a un contador público: le entrega
        los movimientos cuadrados y trazables.
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Indicador rotulo="Débitos" valor={formatearCOP(resumen.debitos)} />
          <Indicador rotulo="Créditos" valor={formatearCOP(resumen.creditos)} />
          <div
            className={`bg-white rounded-xl border shadow-2xs p-4 ${
              resumen.cuadra ? 'border-emerald-200' : 'border-rose-300'
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Estado de los libros
            </p>
            <p
              className={`text-lg font-extrabold mt-1 inline-flex items-center gap-1.5 ${
                resumen.cuadra ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {resumen.cuadra ? (
                <><CheckCircle2 className="w-4 h-4" /> Cuadran</>
              ) : (
                <><AlertTriangle className="w-4 h-4" /> Descuadrados</>
              )}
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              {resumen.comprobantes} comprobante{resumen.comprobantes === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}

      {creando && (
        <form onSubmit={registrar} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">Comprobante manual</h3>
          <p className="text-[11px] text-slate-400 leading-relaxed -mt-2">
            Para lo que no tiene documento en el sistema: una nómina, un servicio, un ajuste. Las
            ventas y las compras ya generan el suyo.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Descripción"
                value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
                placeholder="Ej. Pago de servicios públicos de agosto"
                required
              />
            </div>
            <Input
              label="Fecha"
              type="date"
              value={nuevo.fecha}
              onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            {renglones.map((r, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                <div className="sm:col-span-4">
                  <Select
                    label={i === 0 ? 'Cuenta' : undefined}
                    options={[
                      { value: '', label: 'Elige una cuenta…' },
                      ...imputables.map((c) => ({ value: c.codigo, label: `${c.codigo} · ${c.nombre}` })),
                    ]}
                    value={r.cuenta}
                    onChange={(e) => {
                      const copia = [...renglones];
                      copia[i] = { ...r, cuenta: e.target.value };
                      setRenglones(copia);
                    }}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Input
                    label={i === 0 ? 'Detalle' : undefined}
                    value={r.detalle}
                    onChange={(e) => {
                      const copia = [...renglones];
                      copia[i] = { ...r, detalle: e.target.value };
                      setRenglones(copia);
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label={i === 0 ? 'Débito' : undefined}
                    inputMode="decimal"
                    value={r.debito}
                    onChange={(e) => {
                      const copia = [...renglones];
                      // Débito y crédito se excluyen: escribir en uno limpia
                      // el otro, que es la regla que valida el servidor.
                      copia[i] = { ...r, debito: e.target.value, credito: '' };
                      setRenglones(copia);
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label={i === 0 ? 'Crédito' : undefined}
                    inputMode="decimal"
                    value={r.credito}
                    onChange={(e) => {
                      const copia = [...renglones];
                      copia[i] = { ...r, credito: e.target.value, debito: '' };
                      setRenglones(copia);
                    }}
                  />
                </div>
                <div className={`sm:col-span-1 ${i === 0 ? 'sm:pt-7' : ''}`}>
                  {renglones.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}
                      aria-label="Quitar línea"
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRenglones([...renglones, { ...RENGLON_VACIO }])}
            className="text-xs font-semibold text-[#004F9F] hover:underline"
          >
            + Agregar línea
          </button>

          <div
            className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border text-xs font-bold ${
              totales.diferencia === 0 && totales.debito > 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <span>Débito {formatearCOP(totales.debito)} · Crédito {formatearCOP(totales.credito)}</span>
            <span>
              {totales.diferencia === 0
                ? totales.debito > 0 ? 'Cuadra' : 'Sin valores'
                : `Diferencia ${formatearCOP(Math.abs(totales.diferencia))}`}
            </span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            <Button
              type="submit"
              variant="pintuco"
              isLoading={ocupado}
              disabled={totales.diferencia !== 0 || totales.debito === 0}
            >
              Registrar comprobante
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          ['comprobantes', 'Comprobantes', BookOpen],
          ['balance', 'Balance de prueba', Scale],
          ['resultados', 'Estado de resultados', TrendingUp],
        ] as const).map(
          ([clave, texto, Icono]) => (
            <button
              key={clave}
              onClick={() => setPestana(clave)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                pestana === clave
                  ? 'bg-[#004F9F] text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icono className="w-3.5 h-3.5" /> {texto}
            </button>
          ),
        )}

        {/* Uno por pestaña, no uno que adivine: cada tabla tiene sus columnas,
            y estos tres archivos son justo los que pide el contador. Se
            renderiza solo el de la pestaña abierta para no exportar una tabla
            que no se está mirando. */}
        <div className="ml-auto">
          {pestana === 'comprobantes' && (
            <ExportarBoton<Asiento>
              filas={filtrados}
              nombre="libro-diario"
              titulo="Libro diario — comprobantes"
              filtros={[
                periodoTexto,
                busqueda.trim() ? `Búsqueda: ${busqueda.trim()}` : null,
              ].filter(Boolean).join(' · ')}
              columnas={[
                { titulo: 'Comprobante', valor: (a) => a.numero },
                { titulo: 'Fecha', valor: (a) => a.fecha },
                { titulo: 'Origen', valor: (a) => ETIQUETA_ORIGEN[a.origen] ?? a.origen },
                { titulo: 'Descripción', valor: (a) => a.descripcion },
                { titulo: 'Estado', valor: (a) => a.estado },
                { titulo: 'Débito', valor: (a) => a.totalDebito, numerica: true },
                { titulo: 'Crédito', valor: (a) => a.totalCredito, numerica: true },
                // Un comprobante anulado sin su motivo no se puede justificar
                // ante nadie.
                { titulo: 'Motivo de anulación', valor: (a) => a.motivoAnulacion },
              ]}
            />
          )}

          {pestana === 'balance' && (
            <ExportarBoton<SaldoCuenta>
              filas={balanceVisible}
              nombre="balance-de-prueba"
              titulo="Balance de prueba"
              filtros={periodoTexto}
              columnas={[
                { titulo: 'Cuenta', valor: (b) => b.cuenta },
                { titulo: 'Nombre', valor: (b) => b.nombre },
                { titulo: 'Clase', valor: (b) => b.clase },
                { titulo: 'Naturaleza', valor: (b) => b.naturaleza },
                { titulo: 'Débitos', valor: (b) => b.debitos, numerica: true },
                { titulo: 'Créditos', valor: (b) => b.creditos, numerica: true },
                { titulo: 'Saldo', valor: (b) => b.saldo, numerica: true },
              ]}
            />
          )}

          {pestana === 'resultados' && (
            <ExportarBoton<RenglonResultado>
              filas={resultados}
              nombre="estado-de-resultados"
              titulo="Estado de resultados"
              filtros={periodoTexto}
              columnas={[
                { titulo: 'Clase', valor: (r) => r.clase },
                { titulo: 'Cuenta', valor: (r) => r.cuenta },
                { titulo: 'Nombre', valor: (r) => r.nombre },
                { titulo: 'Valor', valor: (r) => r.valor, numerica: true },
              ]}
            />
          )}
        </div>
      </div>

      {pestana === 'comprobantes' ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por número, descripción u origen…"
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
              />
            </div>
            {/* Un contador trabaja por mes, no sobre el histórico completo. */}
            <div className="flex items-end gap-2">
              <div className="w-40">
                <Input
                  label="Desde"
                  type="date"
                  value={periodo.desde}
                  onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })}
                  leftIcon={<CalendarClock className="w-4 h-4" />}
                />
              </div>
              <div className="w-40">
                <Input
                  label="Hasta"
                  type="date"
                  value={periodo.hasta}
                  onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })}
                />
              </div>
              {(periodo.desde || periodo.hasta) && (
                <Button variant="ghost" size="sm" onClick={() => setPeriodo({ desde: '', hasta: '' })}>
                  Quitar
                </Button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {cargando ? (
              <p className="text-sm text-slate-400 text-center py-14">Cargando comprobantes…</p>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-14 px-6">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">Todavía no hay comprobantes</p>
                <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                  Se generan solos al emitir una factura, confirmar una recepción o registrar un
                  recaudo.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                      <th className="text-left px-5 py-3">Comprobante</th>
                      <th className="text-left px-3 py-3">Origen</th>
                      <th className="text-right px-3 py-3">Valor</th>
                      <th className="text-right px-5 py-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((a) => (
                      <tr
                        key={a.id}
                        onClick={async () => {
                          const [lineas, documento] = await Promise.all([
                            contabilidadService.lineas(a.id),
                            contabilidadService.documento(a.id),
                          ]);
                          setAbierto({ asiento: a, lineas, documento });
                        }}
                        className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${
                          a.estado === 'ANULADO' ? 'opacity-55' : ''
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-slate-900">
                            {a.numero}
                            {a.estado === 'ANULADO' && (
                              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                ANULADO
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">{a.descripcion}</p>
                        </td>
                        <td className="px-3 py-3.5 text-xs text-slate-600">
                          {ETIQUETA_ORIGEN[a.origen] ?? a.origen}
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums font-semibold">
                          {formatearCOP(a.totalDebito)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-slate-500">
                          {formatearFecha(a.fecha)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : pestana === 'resultados' ? (
        <EstadoResultados renglones={resultados} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="text-left px-5 py-3">Cuenta</th>
                  <th className="text-left px-3 py-3">Clase</th>
                  <th className="text-right px-3 py-3">Débitos</th>
                  <th className="text-right px-3 py-3">Créditos</th>
                  <th className="text-right px-5 py-3">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {balanceVisible
                  .map((b) => (
                    <tr
                      key={b.cuenta}
                      onClick={async () => {
                        setAuxiliar({
                          cuenta: b.cuenta,
                          nombre: b.nombre,
                          movimientos: await contabilidadService.auxiliar(b.cuenta, {
                            desde: periodo.desde || undefined,
                            hasta: periodo.hasta || undefined,
                          }),
                        });
                      }}
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold text-slate-700">{b.cuenta}</span>
                        <span className="text-slate-600 ml-2">{b.nombre}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        {ETIQUETA_CLASE[b.clase] ?? b.clase}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {b.debitos > 0 ? formatearCOP(b.debitos) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {b.creditos > 0 ? formatearCOP(b.creditos) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-bold">
                        {formatearCOP(b.saldo)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {balance.every((b) => b.debitos === 0 && b.creditos === 0) && (
            <p className="text-sm text-slate-400 text-center py-14">
              Ninguna cuenta tiene movimiento todavía.
            </p>
          )}
          <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100 leading-relaxed">
            El saldo se muestra según la naturaleza de cada cuenta: un pasivo con saldo positivo es
            una deuda, no un número negativo. Los comprobantes anulados no se incluyen.
            <strong className="text-slate-500"> Haz clic en una cuenta</strong> para ver su libro
            auxiliar.
          </p>
        </div>
      )}
      {/* Libro auxiliar de una cuenta.
          Es la consulta más frecuente de un contador y hasta ahora la vista
          existía en la base pero no había forma de verla. */}
      {auxiliar && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  <span className="font-mono text-sm">{auxiliar.cuenta}</span> · {auxiliar.nombre}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Libro auxiliar
                  {periodo.desde || periodo.hasta
                    ? ` · ${periodo.desde ? formatearFecha(periodo.desde) : 'inicio'} a ${
                        periodo.hasta ? formatearFecha(periodo.hasta) : 'hoy'
                      }`
                    : ' · todo el histórico'}
                </p>
              </div>
              <button
                onClick={() => setAuxiliar(null)}
                aria-label="Cerrar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {auxiliar.movimientos.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-14">
                Esta cuenta no tiene movimientos en el periodo.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="text-left px-5 py-2.5">Comprobante</th>
                    <th className="text-right px-3 py-2.5">Débito</th>
                    <th className="text-right px-3 py-2.5">Crédito</th>
                    <th className="text-right px-5 py-2.5">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // El saldo corre acumulándose línea por línea, que es como
                    // se lee un auxiliar: cada fila muestra en qué quedó la
                    // cuenta después de ese movimiento.
                    let corriente = 0;
                    const natural = balance.find((b) => b.cuenta === auxiliar.cuenta)?.naturaleza;
                    return auxiliar.movimientos.map((m) => {
                      corriente +=
                        natural === 'CREDITO' ? m.credito - m.debito : m.debito - m.credito;
                      return (
                        <tr key={m.entryId + m.numero + m.fecha} className="border-t border-slate-100">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-900">{m.numero}</p>
                            <p className="text-xs text-slate-500">{m.comprobante}</p>
                            <p className="text-[11px] text-slate-400">
                              {formatearFecha(m.fecha)} · {ETIQUETA_ORIGEN[m.origen] ?? m.origen}
                              {m.detalle ? ` · ${m.detalle}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {m.debito > 0 ? formatearCOP(m.debito) : ''}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {m.credito > 0 ? formatearCOP(m.credito) : ''}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums font-semibold">
                            {formatearCOP(corriente)}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Estado de resultados.
 *
 * El balance de prueba lista cuentas; no dice si el negocio ganó o perdió,
 * que es la primera pregunta de cualquiera que abra este módulo.
 */
const EstadoResultados: React.FC<{ renglones: RenglonResultado[] }> = ({ renglones }) => {
  const suma = (clase: string) =>
    renglones.filter((r) => r.clase === clase).reduce((a, r) => a + r.valor, 0);

  const ingresos = suma('INGRESO');
  const costos = suma('COSTO');
  const gastos = suma('GASTO');
  const utilidadBruta = ingresos - costos;
  const utilidad = utilidadBruta - gastos;

  const bloque = (titulo: string, clase: string) => {
    const filas = renglones.filter((r) => r.clase === clase && r.valor !== 0);
    if (filas.length === 0) return null;
    return (
      <>
        <tr className="bg-slate-50">
          <td colSpan={2} className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {titulo}
          </td>
        </tr>
        {filas.map((r) => (
          <tr key={r.cuenta} className="border-t border-slate-100">
            <td className="px-5 py-2.5">
              <span className="font-mono text-xs font-bold text-slate-700">{r.cuenta}</span>
              <span className="text-slate-600 ml-2">{r.nombre}</span>
            </td>
            <td className="px-5 py-2.5 text-right tabular-nums">{formatearCOP(r.valor)}</td>
          </tr>
        ))}
      </>
    );
  };

  const hayMovimiento = renglones.some((r) => r.valor !== 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden max-w-3xl">
      {!hayMovimiento ? (
        <p className="text-sm text-slate-400 text-center py-14">
          Todavía no hay ventas ni gastos registrados.
        </p>
      ) : (
        <>
          <table className="w-full text-sm">
            <tbody>
              {bloque('Ingresos', 'INGRESO')}
              {bloque('Costo de ventas', 'COSTO')}
              <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                <td className="px-5 py-3 font-bold text-slate-800">Utilidad bruta</td>
                <td className="px-5 py-3 text-right tabular-nums font-bold">
                  {formatearCOP(utilidadBruta)}
                </td>
              </tr>
              {bloque('Gastos', 'GASTO')}
              <tr className="border-t-2 border-slate-300">
                <td className="px-5 py-3.5 font-extrabold text-slate-900">
                  {utilidad >= 0 ? 'Utilidad del periodo' : 'Pérdida del periodo'}
                </td>
                <td
                  className={`px-5 py-3.5 text-right tabular-nums font-extrabold ${
                    utilidad >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {formatearCOP(utilidad)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100 leading-relaxed">
            Cifras acumuladas de todos los comprobantes registrados, sin los anulados. No es un
            estado financiero bajo NIIF ni sustituye el cierre que hace un contador.
          </p>
        </>
      )}
    </div>
  );
};

const Indicador: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{rotulo}</p>
    <p className="text-lg font-extrabold text-slate-900 tabular-nums mt-1">{valor}</p>
  </div>
);
