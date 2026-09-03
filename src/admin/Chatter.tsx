import React, { useEffect, useState } from 'react';
import { Lock, MessageSquare, Send, Zap, RotateCcw } from 'lucide-react';
import { chatterService, type Mensaje } from '../services/backoffice';
import { useAdminAuth } from './AdminAuthContext';
import { Button } from '../components/common/Button';
import { AcuseDeLectura } from '../components/common/AcuseDeLectura';
import { useMensajes } from '../context/MensajesContext';

/**
 * Chatter: conversación y trazabilidad en un mismo hilo.
 *
 * Los tres tipos de entrada conviven ordenados por fecha:
 *   MENSAJE       — lo escribe el cliente o el personal, y el cliente lo ve.
 *   NOTA_INTERNA  — solo la ve el personal. La política RLS la excluye para
 *                   el cliente, no un filtro de esta pantalla.
 *   EVENTO        — lo escribe la base al cambiar un estado. Es la
 *                   trazabilidad, y vive aquí en vez de en una pestaña
 *                   aparte que nadie mira.
 */
export const Chatter: React.FC<{
  campo: 'order_id' | 'project_id';
  id: string;
}> = ({ campo, id }) => {
  const { puede } = useAdminAuth();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  /** Null mientras se averigua. Solo los pedidos se pueden dar por terminados. */
  const [abierta, setAbierta] = useState<boolean | null>(null);

  const cargar = async () => {
    try {
      setMensajes(await chatterService.mensajes(campo, id));
      if (campo === 'order_id') {
        const est = await chatterService.estadoConversacion(id);
        setAbierta(est?.sePuedeEscribir !== false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar la conversación.');
    } finally {
      setCargando(false);
    }
  };

  const { marcarLeida } = useMensajes();

  useEffect(() => {
    void cargar();
    // Abrir el hilo es lo que apaga el aviso, igual que del lado del cliente.
    // Solo aplica a pedidos: la campana cuenta conversaciones de pedidos.
    if (campo === 'order_id') void marcarLeida(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campo, id]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError('');
    try {
      await chatterService.publicar(campo, id, texto.trim(), interno);
      setTexto('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  };

  /** Iniciales para el avatar. Dos letras bastan y no desbordan el círculo. */
  const iniciales = (nombre: string | null) =>
    (nombre ?? 'Sistema')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <MessageSquare className="w-4 h-4 text-[#004F9F]" />
        <h3 className="text-sm font-extrabold text-slate-900">Conversación y trazabilidad</h3>

        {abierta === false && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500
                           bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            <Lock className="w-2.5 h-2.5" /> Pedido terminado
          </span>
        )}

        {/* Terminar cierra el hilo para los DOS lados. Sirve para que el
            equipo sepa qué queda pendiente: un hilo que nunca cierra parece
            siempre abierto. */}
        {campo === 'order_id' && puede('chat.reply') && abierta !== null && (
          <button
            type="button"
            onClick={async () => {
              try {
                if (abierta) await chatterService.cerrarConversacion(id);
                else await chatterService.reabrirConversacion(id);
                await cargar();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'No fue posible cambiar el estado.');
              }
            }}
            className="ml-auto text-[11px] font-bold text-slate-500 hover:text-slate-800
                       hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            {abierta ? 'Dar por atendida' : <><RotateCcw className="w-3 h-3" /> Retomar</>}
          </button>
        )}
      </div>

      <div className="max-h-[26rem] overflow-y-auto px-5 py-4 space-y-3.5 bg-slate-50/60">
        {cargando && <p className="text-xs text-slate-400 text-center py-6">Cargando…</p>}
        {!cargando && mensajes.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">
            Todavía no hay actividad en este hilo.
          </p>
        )}

        {mensajes.map((m) => {
          if (m.tipo === 'EVENTO') {
            return (
              <div key={m.id} className="flex justify-center py-0.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1">
                  <Zap className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-medium">{m.cuerpo}</span>
                  <span className="text-slate-400">· {fecha(m.creadoEn)}</span>
                </span>
              </div>
            );
          }
          const esNota = m.tipo === 'NOTA_INTERNA';
          // El cliente a la izquierda, el equipo a la derecha. Es la
          // convención de cualquier chat y evita tener que leer el nombre
          // para saber quién habla.
          const mio = m.quien !== 'CLIENTE';

          const etiqueta =
            m.quien === 'YO' ? 'Tú' : m.quien === 'CLIENTE' ? 'Cliente' : 'Equipo Pintuco';

          const avatar = esNota
            ? 'bg-amber-100 text-amber-800 border-amber-200'
            : m.quien === 'CLIENTE'
              ? 'bg-slate-200 text-slate-700 border-slate-300'
              : 'bg-[#004F9F] text-white border-[#004F9F]';

          const burbuja = esNota
            ? 'bg-amber-50 border-amber-200 text-amber-950 rounded-tr-sm'
            : m.quien === 'CLIENTE'
              ? 'bg-white border-slate-200 text-slate-700 rounded-tl-sm'
              : 'bg-[#004F9F] border-[#004F9F] text-white rounded-tr-sm';

          return (
            <div
              key={m.id}
              className={`flex items-end gap-2 ${mio ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-extrabold ${avatar}`}
                title={m.autor ?? 'Sistema'}
                aria-hidden="true"
              >
                {esNota ? <Lock className="w-3.5 h-3.5" /> : iniciales(m.autor)}
              </div>

              <div className={`max-w-[78%] min-w-0 ${mio ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div
                  className={`flex items-baseline gap-2 text-[11px] px-0.5 ${
                    mio ? 'flex-row-reverse' : ''
                  }`}
                >
                  <span className="font-bold text-slate-800">{m.autor ?? 'Sistema'}</span>
                  <span
                    className={`font-bold uppercase tracking-wide ${
                      esNota
                        ? 'text-amber-700'
                        : m.quien === 'CLIENTE'
                          ? 'text-slate-500'
                          : 'text-[#004F9F]'
                    }`}
                  >
                    {esNota ? 'Nota interna' : etiqueta}
                  </span>
                  <span className="text-slate-400">{fecha(m.creadoEn)}</span>
                </div>

                <div className={`rounded-2xl border px-3.5 py-2.5 shadow-2xs ${burbuja}`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.cuerpo}</p>
                </div>

                {/* Acuse SOLO en lo que escribió el equipo y el cliente puede
                    ver. En un mensaje del cliente diría cuándo lo leímos
                    nosotros —que ya lo sabemos— y en una nota interna no
                    significa nada: el cliente nunca la va a abrir. */}
                {mio && !esNota && (
                  <span className="flex items-center gap-1 px-0.5 text-[10px] text-slate-400">
                    <AcuseDeLectura leidoEn={m.leidoEn} sobreAzul={false} />
                    {m.leidoEn ? 'Leído por el cliente' : 'Enviado'}
                  </span>
                )}

                {esNota && (
                  <span className="text-[10px] text-amber-700 px-0.5">
                    El cliente no ve esta nota.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {abierta === false ? (
        <div className="px-5 py-4 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> El pedido ya terminó. Nadie puede escribir.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Los mensajes se conservan. La conversación se cierra sola cuando el
            pedido llega a entregado o cancelado.
          </p>
        </div>
      ) : puede('chat.reply') && (
        <form onSubmit={enviar} className="px-5 py-4 border-t border-slate-100 space-y-2.5">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder={interno ? 'Nota visible solo para el equipo…' : 'Escribe al cliente…'}
            className={`w-full text-sm rounded-lg border px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30 ${
              interno ? 'bg-amber-50/60 border-amber-200' : 'border-slate-200'
            }`}
          />
          <div className="flex items-center justify-between gap-3">
            {puede('chat.internal') ? (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={interno}
                  onChange={(e) => setInterno(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                Nota interna — el cliente no la verá
              </label>
            ) : <span />}
            <Button type="submit" variant="pintuco" size="sm" isLoading={enviando}
              leftIcon={<Send className="w-3.5 h-3.5" />}>
              Enviar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
