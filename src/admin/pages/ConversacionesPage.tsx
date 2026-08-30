import React, { useEffect, useMemo, useState } from 'react';
import { FolderKanban, MessagesSquare, Radio, Search, ShoppingBag, Zap } from 'lucide-react';
import { conversacionService, type HiloConversacion } from '../../services/backoffice';
import { Chatter } from '../Chatter';

/**
 * Bandeja de conversaciones.
 *
 * Reúne en un solo sitio los hilos de pedidos y de proyectos, porque quien
 * atiende al cliente no piensa en "pedidos" y "proyectos" por separado:
 * piensa en personas esperando respuesta.
 *
 * Se distingue lo que solo tiene EVENTOS automáticos de lo que tiene
 * mensajes de una persona: lo segundo es lo que exige respuesta.
 */
export const ConversacionesPage: React.FC = () => {
  const [hilos, setHilos] = useState<HiloConversacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<HiloConversacion | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloConMensajes, setSoloConMensajes] = useState(false);
  const [enVivo, setEnVivo] = useState(false);

  const cargar = async () => {
    try {
      setHilos(await conversacionService.bandeja());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar las conversaciones.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  useEffect(() => {
    const cancelar = conversacionService.suscribir(() => { void cargar(); });
    setEnVivo(true);
    return () => { cancelar(); setEnVivo(false); };
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return hilos.filter((h) => {
      if (soloConMensajes && h.soloEventos) return false;
      if (!q) return true;
      return h.titulo.toLowerCase().includes(q) || h.contraparte.toLowerCase().includes(q);
    });
  }, [hilos, busqueda, soloConMensajes]);

  const fecha = (iso: string) => {
    const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutos < 1) return 'Ahora';
    if (minutos < 60) return `Hace ${minutos} min`;
    if (minutos < 1440) return `Hace ${Math.floor(minutos / 60)} h`;
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Conversaciones</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Hilos de pedidos y proyectos. Las notas internas no las ve el cliente.
          </p>
        </div>
        {enVivo && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <Radio className="w-3 h-3 animate-pulse" /> En vivo
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[15rem] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por pedido, proyecto o cliente…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30" />
        </div>
        <button onClick={() => setSoloConMensajes(!soloConMensajes)}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition-colors ${
            soloConMensajes ? 'bg-[#004F9F] text-white border-[#004F9F]'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}>
          Solo con mensajes de clientes
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 space-y-2">
          {cargando && <p className="text-sm text-slate-400 text-center py-10">Cargando…</p>}
          {!cargando && filtrados.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-10 text-center">
              <MessagesSquare className="w-7 h-7 text-slate-300 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-slate-700">No hay conversaciones</p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Los hilos se crean solos con cada pedido y cada proyecto.
              </p>
            </div>
          )}
          {filtrados.map((h) => (
            <button key={h.id} onClick={() => setAbierto(h)}
              className={`w-full text-left bg-white rounded-xl border p-4 transition-all ${
                abierto?.id === h.id
                  ? 'border-[#004F9F] shadow-md'
                  : 'border-slate-200 shadow-2xs hover:border-slate-300'
              }`}>
              <div className="flex items-center gap-2">
                {h.tipo === 'PEDIDO'
                  ? <ShoppingBag className="w-3.5 h-3.5 text-[#004F9F] shrink-0" />
                  : <FolderKanban className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                <p className="font-bold text-slate-900 text-sm truncate">{h.titulo}</p>
                <span className="text-[10px] text-slate-400 ml-auto shrink-0">{fecha(h.ultimaFecha)}</span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{h.contraparte}</p>
              <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{h.ultimoMensaje}</p>
              {h.soloEventos && (
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  <Zap className="w-2.5 h-2.5" /> Solo trazabilidad
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          {abierto ? (
            <Chatter campo={abierto.tipo === 'PEDIDO' ? 'order_id' : 'project_id'} id={abierto.id} />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-12 text-center">
              <MessagesSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">Elige una conversación</p>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Verás los mensajes del cliente, las notas del equipo y la trazabilidad juntos.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
