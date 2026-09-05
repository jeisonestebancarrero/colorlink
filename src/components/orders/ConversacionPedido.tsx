import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2, Info, Radio, Lock } from 'lucide-react';
import {
  conversacionPedidoService, type MensajePedido,
} from '../../services/conversacion';
import { useMensajes } from '../../context/MensajesContext';
import { AcuseDeLectura } from '../common/AcuseDeLectura';

/**
 * Conversación del pedido, en la tienda.
 *
 * Faltaba de este lado: el personal escribía desde el portal y el cliente
 * nunca lo veía, así que las preguntas sobre un pedido acababan en WhatsApp y
 * no quedaban con el pedido. La base ya lo permitía todo —la política
 * `mensajes_cliente` deja leer, `post_message` deja escribir— y lo único que
 * no existía era la pantalla.
 *
 * Los EVENTOS de trazabilidad («pedido alistado», «guía asignada») se muestran
 * en la misma línea de tiempo, no en una pestaña aparte: es lo que da sentido
 * a la conversación. Se pintan distinto porque no son de nadie.
 *
 * Las NOTAS INTERNAS no aparecen, y no porque aquí se filtren: no llegan. Las
 * excluye la política de la base, así que ni siquiera viajan al navegador.
 */

interface Props {
  orderId: string;
  /** Número visible del pedido, para el texto de ayuda. */
  numero: string;
}

const HORA = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export const ConversacionPedido: React.FC<Props> = ({ orderId, numero }) => {
  const [mensajes, setMensajes] = useState<MensajePedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enVivo, setEnVivo] = useState(false);
  /** Null mientras se averigua; así no parpadea el aviso de «terminada». */
  const [abierta, setAbierta] = useState<boolean | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  const { marcarLeida } = useMensajes();

  const cargar = async () => {
    try {
      const [msgs, est] = await Promise.all([
        conversacionPedidoService.mensajes(orderId),
        conversacionPedidoService.estado(orderId),
      ]);
      setMensajes(msgs);
      // Manda el estado del PEDIDO. «Dar por atendida» no cierra nada mientras
      // el pedido siga en curso: cortarle la voz a alguien que espera
      // mercancía es lo peor que puede hacer un sistema de pedidos.
      setAbierta(est?.sePuedeEscribir !== false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar la conversación.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    setCargando(true);
    void cargar();

    // ABRIR la conversación es lo que la marca leída, y es lo único que lo
    // hace: no basta con recibir el mensaje ni con desplegar la campana.
    void marcarLeida(orderId);

    const cancelar = conversacionPedidoService.suscribir(orderId, () => {
      void cargar();
      // Si llega uno mientras la persona está mirando el chat, ya lo está
      // viendo: se marca en el acto para que la campana no suba por algo que
      // tiene delante.
      void marcarLeida(orderId);
    });
    setEnVivo(true);
    return () => { cancelar(); setEnVivo(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Al fondo cuando llega algo: lo último es lo que importa.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes.length]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setError('');
    try {
      await conversacionPedidoService.escribir(orderId, texto.trim());
      setTexto('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#004F9F]" />
          Conversación
        </h2>
        <div className="flex items-center gap-2">
          {abierta === false ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500
                             bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5" /> Pedido terminado
            </span>
          ) : enVivo && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700
                             bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <Radio className="w-2.5 h-2.5 animate-pulse" /> En vivo
            </span>
          )}

          {/* El cliente también puede darla por terminada: no tiene por qué
              esperar a que el equipo la cierre para dejar de recibir avisos. */}
          {abierta === true && mensajes.length > 0 && (
            <button
              onClick={async () => {
                await conversacionPedidoService.cerrar(orderId);
                await cargar();
              }}
              title="Da la conversación por atendida. Podrás seguir escribiendo mientras el pedido esté en curso."
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800
                         hover:underline cursor-pointer"
            >
              Dar por atendida
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-4 max-h-[26rem] overflow-y-auto space-y-3">
        {cargando ? (
          <p className="text-sm text-slate-400 flex items-center gap-2 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </p>
        ) : mensajes.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-7 h-7 text-slate-300 mx-auto mb-2.5" />
            <p className="text-sm font-bold text-slate-700">Aún no hay mensajes</p>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-sm mx-auto leading-relaxed">
              Escríbenos si tienes una duda sobre el pedido {numero}. Queda aquí,
              con el pedido, y lo ve el equipo que lo está atendiendo.
            </p>
          </div>
        ) : (
          mensajes.map((m) => {
            if (m.tipo === 'EVENTO') {
              // Trazabilidad: no es de nadie, así que va centrado y discreto.
              return (
                <div key={m.id} className="flex items-center gap-2 justify-center py-1">
                  <Info className="w-3 h-3 text-slate-300 shrink-0" />
                  <p className="text-[11px] text-slate-400 font-medium text-center">
                    {m.cuerpo} · {HORA(m.creadoEn)}
                  </p>
                </div>
              );
            }
            const mio = m.quien === 'YO';
            return (
              <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  mio
                    ? 'bg-[#004F9F] text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}>
                  {!mio && (
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#004F9F] mb-0.5">
                      {/* Con el nombre se sabe con quién se está hablando, y la
                          marca detrás dice desde dónde. «Pintuco» a secas no lo
                          decía, y con dos personas escribiendo tampoco se
                          distinguían entre sí. */}
                      {m.autor ? `${m.autor} · Pintuco` : 'Pintuco'}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.cuerpo}</p>
                  <p className={`text-[10px] mt-1 flex items-center gap-1 ${
                    mio ? 'text-blue-200 justify-end' : 'text-slate-400'
                  }`}>
                    {HORA(m.creadoEn)}
                    {/* Solo en los propios: en uno ajeno diría cuándo lo leí yo. */}
                    {mio && <AcuseDeLectura leidoEn={m.leidoEn} />}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={finRef} />
      </div>

      {abierta === false ? (
        <div className="px-6 py-4 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500 flex items-center gap-1.5 justify-center">
            <Lock className="w-3.5 h-3.5" /> Este pedido ya terminó.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Su conversación quedó cerrada. Si necesitas algo, escríbenos desde un
            pedido en curso.
          </p>
        </div>
      ) : (
      <form onSubmit={enviar} className="px-6 py-4 border-t border-slate-100 space-y-2">
        {error && (
          <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía, Mayús+Enter hace salto de línea: es lo que la
              // gente espera de un chat.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(e); }
            }}
            rows={2}
            placeholder="Escribe tu mensaje…"
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm
                       focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
          />
          <button
            type="submit"
            disabled={!texto.trim() || enviando}
            className="shrink-0 h-10 px-4 rounded-xl bg-[#004F9F] text-white text-sm font-bold
                       inline-flex items-center gap-2 hover:bg-[#003B77] transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </button>
        </div>
      </form>
      )}
    </div>
  );
};
