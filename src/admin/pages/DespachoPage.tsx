import React, { useEffect, useState } from 'react';
import { Radio, Save, Truck } from 'lucide-react';
import {
  formatearFecha,
  despachoService, ESTADOS_ENVIO, ETIQUETA_ENVIO, COLOR_ENVIO,
  type Despacho, type EstadoEnvio,
} from '../../services/backoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';

/**
 * Despacho y rastreo.
 *
 * El tablero se actualiza en vivo: si otra persona mueve un envío, esta
 * pantalla lo refleja sin recargar. Y cada cambio de estado queda escrito en
 * el hilo del pedido por un trigger, de modo que el cliente ve el avance sin
 * que nadie tenga que avisarle.
 */
export const DespachoPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [envios, setEnvios] = useState<Despacho[]>([]);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<EstadoEnvio | 'TODOS'>('TODOS');
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<{ transportadora: string; guia: string; estimada: string }>({
    transportadora: '', guia: '', estimada: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [envivo, setEnVivo] = useState(false);

  const cargar = async () => {
    try {
      setEnvios(await despachoService.listar(estado));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los despachos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, [estado]);

  // Suscripción en vivo, independiente del filtro para no re-suscribir a cada
  // cambio de pestaña.
  useEffect(() => {
    const cancelar = despachoService.suscribir(() => { void cargar(); });
    setEnVivo(true);
    return () => { cancelar(); setEnVivo(false); };
  }, []);

  const abrirEdicion = (d: Despacho) => {
    setEditando(d.id);
    setBorrador({
      transportadora: d.transportadora ?? '',
      guia: d.guia ?? '',
      estimada: d.estimada ?? '',
    });
  };

  const guardar = async (d: Despacho) => {
    setGuardando(true);
    setError('');
    try {
      await despachoService.actualizar(d.id, {
        transportadora: borrador.transportadora,
        guia: borrador.guia,
        estimada: borrador.estimada || null,
      });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (d: Despacho, nuevo: EstadoEnvio) => {
    setError('');
    try {
      await despachoService.actualizar(d.id, { estado: nuevo });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el estado.');
    }
  };

  // `estimated_at` es una columna `date`: sin anclar la hora, la entrega
  // estimada se mostraba un día antes en horario de Colombia.
  const fecha = (iso: string | null) =>
    formatearFecha(iso, { day: '2-digit', month: 'short' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Despacho</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Alistamiento, guías y seguimiento. El cliente ve cada avance en su pedido.
          </p>
        </div>
        {envivo && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <Radio className="w-3 h-3 animate-pulse" /> En vivo
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['TODOS', ...ESTADOS_ENVIO] as const).map((e) => (
          <button key={e} onClick={() => setEstado(e as EstadoEnvio | 'TODOS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              estado === e ? 'bg-[#004F9F] text-white border-[#004F9F]'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}>
            {e === 'TODOS' ? 'Todos' : ETIQUETA_ENVIO[e as EstadoEnvio]}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
      )}

      {cargando ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : envios.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-12 text-center">
          <Truck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">No hay envíos en este estado</p>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Los pedidos con entrega a domicilio generan su envío automáticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {envios.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="font-extrabold text-slate-900">{d.numeroPedido}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${COLOR_ENVIO[d.estado]}`}>
                      {ETIQUETA_ENVIO[d.estado]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 font-medium mt-0.5">{d.cliente}</p>
                  {d.direccion && (
                    <p className="text-xs text-slate-500 mt-1">{d.direccion}{d.ciudad ? ` · ${d.ciudad}` : ''}</p>
                  )}
                </div>

                {puede('dispatch.manage') && (
                  <div className="flex flex-wrap gap-1.5">
                    {ESTADOS_ENVIO.filter((e) => e !== d.estado).slice(0, 3).map((e) => (
                      <Button key={e} variant="outline" size="sm" onClick={() => cambiarEstado(d, e)}>
                        {ETIQUETA_ENVIO[e]}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                {editando === d.id ? (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Transportadora</label>
                      <input value={borrador.transportadora}
                        onChange={(e) => setBorrador({ ...borrador, transportadora: e.target.value })}
                        placeholder="Servientrega"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Número de guía</label>
                      <input value={borrador.guia}
                        onChange={(e) => setBorrador({ ...borrador, guia: e.target.value })}
                        placeholder="1234567890"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Entrega estimada</label>
                      <input type="date" value={borrador.estimada}
                        onChange={(e) => setBorrador({ ...borrador, estimada: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30" />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="pintuco" size="sm" isLoading={guardando} onClick={() => guardar(d)}
                        leftIcon={<Save className="w-3.5 h-3.5" />}>Guardar</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Transportadora</p>
                      <p className="text-slate-700 font-medium">{d.transportadora ?? 'Sin asignar'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Guía</p>
                      <p className="text-slate-700 font-mono font-medium">{d.guia ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Estimada</p>
                      <p className="text-slate-700 font-medium">{fecha(d.estimada)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Despachado</p>
                      <p className="text-slate-700 font-medium">{fecha(d.despachadoEn)}</p>
                    </div>
                    {puede('dispatch.manage') && (
                      <Button variant="outline" size="sm" className="ml-auto" onClick={() => abrirEdicion(d)}>
                        Asignar guía
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
