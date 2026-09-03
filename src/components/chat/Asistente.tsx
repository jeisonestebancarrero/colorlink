import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot, Send, X, Loader2, MessageSquare, CheckCircle2, ArrowLeft, Radio, Lock,
} from 'lucide-react';
import {
  responder, saludo, escalar, dijoElCliente, hayIA, NOMBRE,
  type MensajeAsistente, type AccionAsistente, type SelectorPedidos,
} from '../../services/asistente';
import { useAuth } from '../../context/AuthContext';
import {
  conversacionPedidoService, type MensajePedido,
} from '../../services/conversacion';
import { AcuseDeLectura } from '../common/AcuseDeLectura';
import { useMensajes } from '../../context/MensajesContext';

/**
 * Asistente de la tienda: burbuja flotante.
 *
 * SE DICE DESDE EL PRINCIPIO QUE NO ES UNA PERSONA, y el saludo explica qué
 * puede hacer. Un asistente que finge ser humano hace que el cliente le cuente
 * un problema largo para acabar descubriendo que no lo entendió; decirlo de
 * entrada ahorra esa frustración.
 *
 * Tampoco hay un modelo de lenguaje detrás: responde consultando el sistema.
 * Cuando no sabe, lo dice y pasa la conversación a una persona escribiendo en
 * el hilo del pedido, que es donde el equipo ya mira.
 *
 * Va en un PORTAL por la misma razón que el carrito: colgado del contenido
 * quedaría por debajo de la cabecera.
 */
export const Asistente: React.FC<{
  onNavigate: (pagina: string, param?: string) => void;
}> = ({ onNavigate }) => {
  const { user, isAuthenticated } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeAsistente[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [escalado, setEscalado] = useState<string | null>(null);
  /** Si redacta con IA, para decirlo en la cabecera y no aparentar de más. */
  const [conIA, setConIA] = useState(false);
  /** La invitación que sale una vez, para que la burbuja no pase inadvertida. */
  const [invita, setInvita] = useState(false);
  /** Puntero encima, para levantar la sombra. */
  const [sobre, setSobre] = useState(false);
  /**
   * Filtro del desplegable de pedidos.
   *
   * Vive aqui y no en el mensaje porque es una preferencia de quien mira, no
   * parte de la respuesta: cambiar el filtro no deberia reescribir lo que el
   * asistente ya dijo.
   */
  const [filtroPedidos, setFiltroPedidos] =
    useState<'CURSO' | 'CERRADOS' | 'TODOS'>('CURSO');

  /**
   * Conversación con una PERSONA, cuando la hay.
   *
   * Al escalar, la burbuja deja de ser el asistente y pasa a ser el mismo hilo
   * del pedido visto desde aquí: lo que escribe el equipo aparece en los dos
   * sitios y lo que escribe el cliente también. Antes la respuesta del asesor
   * llegaba solo al detalle del pedido y el cliente se quedaba esperando en la
   * burbuja sin saber que ya le habían contestado.
   */
  const [hilo, setHilo] = useState<{ orderId: string; numero: string } | null>(null);
  const [delHilo, setDelHilo] = useState<MensajePedido[]>([]);
  const [hiloAbierto, setHiloAbierto] = useState(true);
  const { marcarLeida } = useMensajes();

  useEffect(() => { void hayIA().then(setConIA); }, []);

  /**
   * La invitación aparece a los 6 segundos y se retira a los 14.
   *
   * Ni de inmediato —quien acaba de entrar está mirando otra cosa— ni para
   * siempre: un cartel fijo en la esquina se vuelve ruido y deja de verse.
   * Se muestra una sola vez por sesión.
   */
  useEffect(() => {
    if (abierto || mensajes.length > 0) return;
    const aparece = setTimeout(() => setInvita(true), 6000);
    const desaparece = setTimeout(() => setInvita(false), 14000);
    return () => { clearTimeout(aparece); clearTimeout(desaparece); };
  }, [abierto, mensajes.length]);
  const finRef = useRef<HTMLDivElement | null>(null);

  // El saludo se arma al abrir, no al montar: así lleva el nombre de quien
  // entró aunque la sesión se resuelva después.
  useEffect(() => {
    if (abierto && mensajes.length === 0) {
      // El saludo cambia si no hay sesión: se ofrece solo lo que sí puede
      // hacer, en vez de un botón que acabará pidiendo la cuenta.
      setMensajes([saludo(user?.firstName ?? null, isAuthenticated)]);
    }
  }, [abierto, mensajes.length, user, isAuthenticated]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes.length, delHilo.length, pensando]);

  /** El hilo con el equipo: se carga, se escucha en vivo y se marca leído. */
  useEffect(() => {
    if (!hilo) return;
    let vigente = true;

    const cargar = async () => {
      const [msgs, est] = await Promise.all([
        conversacionPedidoService.mensajes(hilo.orderId),
        conversacionPedidoService.estado(hilo.orderId),
      ]);
      if (!vigente) return;
      setDelHilo(msgs);
      // Lo que decide si se puede escribir es el estado del PEDIDO. «Dar por
      // atendida» cierra la atención del momento, no le quita la voz a alguien
      // que sigue esperando su mercancía.
      setHiloAbierto(est?.sePuedeEscribir !== false);
    };

    void cargar();
    // Estando la conversación a la vista, lo que llegue ya se está leyendo.
    void marcarLeida(hilo.orderId);

    const cancelar = conversacionPedidoService.suscribir(hilo.orderId, () => {
      void cargar();
      void marcarLeida(hilo.orderId);
    });
    return () => { vigente = false; cancelar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hilo?.orderId]);

  const enviar = async (pregunta: string): Promise<void> => {
    const limpia = pregunta.trim();
    if (!limpia || pensando) return;

    // Dentro del hilo con el equipo, lo que se escribe va AL EQUIPO. Pasarlo
    // por el asistente aquí sería contestarle a alguien que está esperando a
    // una persona.
    if (hilo) {
      setTexto('');
      setPensando(true);
      try {
        await conversacionPedidoService.escribir(hilo.orderId, limpia);
        setDelHilo(await conversacionPedidoService.mensajes(hilo.orderId));
      } catch (e) {
        setDelHilo((m) => [...m, {
          id: `err-${Date.now()}`, cuerpo: e instanceof Error ? e.message : 'No se pudo enviar.',
          creadoEn: new Date().toISOString(), leidoEn: null, tipo: 'EVENTO', quien: 'SISTEMA', autor: null,
        }]);
      } finally {
        setPensando(false);
      }
      return;
    }

    setMensajes((m) => [...m, dijoElCliente(limpia)]);
    setTexto('');
    setPensando(true);
    try {
      // Se espera la respuesta ANTES de tocar el estado: el `await` no puede
      // ir dentro del callback de `setMensajes`, que no es asíncrono.
      // Se le pasa la conversación para que, con IA encendida, entienda un
      // «¿y de ese cuánto queda?» sin obligar a repetir de qué se hablaba.
      const respuesta = await responder(
        limpia,
        mensajes.map((m) => ({ autor: m.autor, texto: m.texto })),
        isAuthenticated,
      );
      setMensajes((m) => [...m, respuesta]);
    } finally {
      setPensando(false);
    }
  };

  const hacer = async (a: AccionAsistente): Promise<void> => {
    if (a.preguntar) { await enviar(a.preguntar); return; }
    if (a.ir) {
      setAbierto(false);
      onNavigate(a.ir.pagina, a.ir.param);
      return;
    }
    if (a.escalarA) {
      setPensando(true);
      try {
        // Se manda lo ÚLTIMO que preguntó la persona, no toda la charla: el
        // equipo necesita el problema, no el historial de botones.
        const ultima = [...mensajes].reverse().find((m) => m.autor === 'CLIENTE');
        await escalar(a.escalarA, ultima?.texto ?? 'El cliente pidió hablar con una persona.');
        setEscalado(a.escalarA);
        // Se entra al hilo en la misma burbuja: la respuesta del equipo llega
        // aquí, no hay que irse a otra pantalla a esperarla.
        const est = await conversacionPedidoService.estado(a.escalarA);
        setHilo({ orderId: a.escalarA, numero: est?.numero ?? '' });
      } catch {
        setMensajes((m) => [...m, {
          id: `err-${Date.now()}`,
          autor: 'ASISTENTE',
          texto: 'No pude pasar el mensaje. Escríbenos desde el detalle del pedido.',
        }]);
      } finally {
        setPensando(false);
      }
    }
  };

  return createPortal(
    <>
      {!abierto && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2.5">
          {/* Invitación, y solo UNA vez.
              Aparece a los pocos segundos y se va sola: un cartel permanente
              tapando la esquina se vuelve parte del ruido y la gente aprende a
              no mirarlo. Si ya se abrió el chat, no vuelve a salir. */}
          {invita && (
            <span className="hidden sm:flex items-center gap-2 bg-white text-slate-800 text-xs
                             font-bold pl-3.5 pr-2 py-2 rounded-full shadow-lg border
                             border-slate-200 animate-in fade-in slide-in-from-right-3 duration-500">
              ¿Te ayudo a elegir?
              <button
                onClick={() => setInvita(false)}
                aria-label="Cerrar la invitación"
                className="p-0.5 rounded-full text-slate-400 hover:text-slate-700
                           hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}

          <div className="relative asistente-flota">
            {/* Onda que sale del botón. `pointer-events-none` para que no robe
                el clic: es decoración, no un objetivo. */}
            <span
              aria-hidden
              className="asistente-onda pointer-events-none absolute inset-0 rounded-full
                         bg-[#004F9F]"
            />

            <button
              onClick={() => { setAbierto(true); setInvita(false); }}
              aria-label={`Abrir a ${NOMBRE}, el asistente`}
              className="relative w-14 h-14 rounded-full text-white overflow-hidden
                         flex items-center justify-center cursor-pointer
                         bg-linear-to-br from-[#0A5FBF] via-[#004F9F] to-[#002D5C]
                         ring-2 ring-white/25
                         hover:scale-110 active:scale-95
                         transition-[transform,box-shadow] duration-200"
              /* La sombra va en línea y no como clase: Tailwind no interpreta
                 un valor arbitrario con dos sombras y comas dentro de rgba(),
                 y la clase se quedaba sin generar. Comprobado en el navegador:
                 salía `rgba(0,0,0,0)`. */
              style={{
                boxShadow: sobre
                  ? '0 16px 35px -5px rgba(0,79,159,0.75), 0 10px 12px -6px rgba(0,0,0,0.35)'
                  : '0 10px 25px -5px rgba(0,79,159,0.55), 0 8px 10px -6px rgba(0,0,0,0.28)',
              }}
              onMouseEnter={() => setSobre(true)}
              onMouseLeave={() => setSobre(false)}
            >
              {/* Reflejo que cruza cada varios segundos. */}
              <span
                aria-hidden
                className="asistente-brillo pointer-events-none absolute top-0 -left-1/2
                           w-1/2 h-full bg-linear-to-r from-transparent via-white/35 to-transparent"
              />
              <Bot className="w-6 h-6 relative" />

              {/* Punto amarillo de marca: da el toque Pintuco y hace que el
                  ojo lo encuentre sobre cualquier fondo. */}
              <span
                aria-hidden
                className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-yellow-400
                           ring-2 ring-[#004F9F]"
              />
            </button>
          </div>
        </div>
      )}

      {abierto && (
        <div className="fixed bottom-6 right-6 z-[60] w-[min(24rem,calc(100vw-3rem))]
                        h-[min(32rem,calc(100vh-6rem))] bg-white rounded-2xl shadow-2xl
                        border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-[#004F9F] text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {hilo ? (
                <button
                  onClick={() => { setHilo(null); setDelHilo([]); }}
                  aria-label={`Volver a ${NOMBRE}`}
                  className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate">
                  {hilo ? 'Equipo Pintuco' : `${NOMBRE} · Asistente Pintuco`}
                </p>
                {/* Sin ambigüedad: se dice siempre si hay una persona detrás. */}
                <p className="text-[10px] text-blue-200 truncate">
                  {hilo
                    ? (hiloAbierto
                      ? <span className="inline-flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5 animate-pulse" /> {hilo.numero} · en vivo
                        </span>
                      : `${hilo.numero} · pedido terminado`)
                    : (conIA ? 'Con IA · consulta tu información' : 'Automático · consulta tu información')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {hilo && hiloAbierto && (
                <button
                  onClick={async () => {
                    // Da la charla por atendida y vuelve al asistente. NO deja
                    // mudo al cliente: mientras el pedido siga en curso puede
                    // seguir escribiendo desde el pedido, y volver aquí
                    // pidiendo otra vez una persona.
                    await conversacionPedidoService.cerrar(hilo.orderId);
                    setHilo(null);
                    setDelHilo([]);
                    setMensajes((m) => [...m, {
                      id: `fin-${Date.now()}`,
                      autor: 'ASISTENTE',
                      texto: 'Listo, di la conversación por atendida. Si te queda algo, '
                        + 'puedes seguir escribiendo desde el pedido o pedirme otra vez '
                        + 'que te pase con una persona.',
                    }]);
                  }}
                  title="Da la conversación por atendida. Podrás seguir escribiendo desde el pedido."
                  className="text-[11px] font-bold px-2 py-1 rounded-lg hover:bg-white/15
                             transition-colors cursor-pointer"
                >
                  Terminar
                </button>
              )}
              <button onClick={() => setAbierto(false)} aria-label="Cerrar"
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {hilo ? (
              <>
                {delHilo.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Aquí verás la respuesta del equipo.
                  </p>
                )}
                {delHilo.map((m) => {
                  if (m.tipo === 'EVENTO') {
                    return (
                      <p key={m.id} className="text-[11px] text-slate-400 text-center py-1">
                        {m.cuerpo}
                      </p>
                    );
                  }
                  const mio = m.quien === 'YO';
                  return (
                    <div key={m.id} className={mio ? 'flex justify-end' : ''}>
                      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                        mio ? 'bg-[#004F9F] text-white rounded-br-sm'
                            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                      }`}>
                        {!mio && (
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#004F9F] mb-0.5">
                            {m.autor ?? 'Pintuco'}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.cuerpo}</p>
                        <p className={`text-[10px] mt-1 flex items-center gap-1 ${
                          mio ? 'text-blue-200 justify-end' : 'text-slate-400'
                        }`}>
                          {new Date(m.creadoEn).toLocaleTimeString('es-CO', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                          {mio && <AcuseDeLectura leidoEn={m.leidoEn} />}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
            <>
            {mensajes.map((m) => (
              <div key={m.id} className={m.autor === 'CLIENTE' ? 'flex justify-end' : ''}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                  m.autor === 'CLIENTE'
                    ? 'bg-[#004F9F] text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.texto}</p>
                  {/* De dónde salió el dato. Sin esto, una cifra correcta y una
                      inventada se leen igual. */}
                  {m.fuente && (
                    <p className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {m.fuente}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Desplegable, cuando la respuesta lo trae.
                Con treinta pedidos, treinta botones no caben en una burbuja de
                24 rem ni se leen. Una lista con filtro por estado si. */}
            {!hilo && !pensando && mensajes[mensajes.length - 1]?.selector && (
              <SelectorDePedidos
                selector={mensajes[mensajes.length - 1].selector as SelectorPedidos}
                filtro={filtroPedidos}
                onFiltro={setFiltroPedidos}
                onElegir={(numero, plantilla) => {
                  void enviar(plantilla.replace('{numero}', numero));
                }}
              />
            )}

            {!hilo && mensajes.length > 0 && !pensando && (
              <div className="flex flex-wrap gap-1.5">
                {(mensajes[mensajes.length - 1].acciones ?? []).map((a) => (
                  <button
                    key={a.etiqueta}
                    onClick={() => void hacer(a)}
                    disabled={a.escalarA !== undefined && escalado === a.escalarA}
                    className="px-3 py-1.5 rounded-full border border-[#004F9F]/30 text-[#004F9F]
                               text-xs font-bold hover:bg-blue-50 transition-colors cursor-pointer
                               disabled:opacity-40 disabled:cursor-not-allowed
                               inline-flex items-center gap-1.5"
                  >
                    {a.escalarA && <MessageSquare className="w-3 h-3" />}
                    {a.etiqueta}
                  </button>
                ))}
              </div>
            )}

            </>
            )}

            {pensando && (
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {hilo ? 'Enviando…' : 'Consultando…'}
              </p>
            )}
            <div ref={finRef} />
          </div>

          {hilo && !hiloAbierto ? (
            /* Terminada: no se escribe. El botón para retomarla es explícito,
               porque si un mensaje cualquiera la reabriera, «terminar» no
               significaría nada. */
            <div className="p-3 border-t border-slate-100 space-y-2">
              <p className="text-xs text-slate-500 flex items-center gap-1.5 justify-center">
                <Lock className="w-3.5 h-3.5" /> Este pedido ya terminó.
              </p>
              <button
                onClick={() => { setHilo(null); setDelHilo([]); }}
                className="w-full py-2 rounded-xl border border-[#004F9F]/30 text-[#004F9F]
                           text-xs font-bold hover:bg-blue-50 transition-colors cursor-pointer"
              >
                Volver a {NOMBRE}
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}
              className="p-3 border-t border-slate-100 flex items-center gap-2"
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={hilo ? 'Escríbele al equipo…' : `Escríbele a ${NOMBRE}…`}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm
                           focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
              />
              <button
                type="submit"
                disabled={!texto.trim() || pensando}
                aria-label="Enviar"
                className="shrink-0 w-9 h-9 rounded-xl bg-[#004F9F] text-white flex items-center
                           justify-center hover:bg-[#003B77] transition-colors cursor-pointer
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      )}
    </>,
    document.body,
  );
};

/**
 * Desplegable de pedidos con filtro por estado.
 *
 * Por qué un desplegable y no más botones: quien tiene treinta pedidos vería
 * treinta botones en una burbuja de 24 rem. No caben, no se leen y hay que
 * desplazarse para encontrar el que interesa.
 *
 * El filtro arranca en «en curso» porque es de lo que la gente pregunta: nadie
 * escribe para saber por un pedido que recibió hace tres meses. Los demás
 * siguen a un clic, con la cuenta a la vista para que no parezca que se
 * perdieron.
 */
const SelectorDePedidos: React.FC<{
  selector: SelectorPedidos;
  filtro: 'CURSO' | 'CERRADOS' | 'TODOS';
  onFiltro: (f: 'CURSO' | 'CERRADOS' | 'TODOS') => void;
  onElegir: (numero: string, plantilla: string) => void;
}> = ({ selector, filtro, onFiltro, onElegir }) => {
  const enCurso = selector.opciones.filter((o) => o.enCurso);
  const cerrados = selector.opciones.filter((o) => !o.enCurso);

  const visibles = filtro === 'CURSO' ? enCurso
    : filtro === 'CERRADOS' ? cerrados
      : selector.opciones;

  const pestanas = [
    ['CURSO', 'En curso', enCurso.length],
    ['CERRADOS', 'Terminados', cerrados.length],
    ['TODOS', 'Todos', selector.opciones.length],
  ] as const;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
      <div className="flex gap-1">
        {pestanas.map(([clave, texto, cuantos]) => (
          <button
            key={clave}
            type="button"
            onClick={() => onFiltro(clave)}
            // Un filtro sin resultados no se ofrece: pulsarlo solo daría una
            // lista vacía y la sensación de que algo falló.
            disabled={cuantos === 0}
            className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors
                        cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
              filtro === clave
                ? 'bg-white text-[#004F9F] shadow-2xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {texto} <span className="tabular-nums">{cuantos}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-1">Nada por aquí.</p>
      ) : (
        <select
          // Sin valor fijado: el desplegable es para ELEGIR, no para mostrar
          // una selección. Vuelve al texto de invitación tras cada elección.
          value=""
          onChange={(e) => {
            if (e.target.value) onElegir(e.target.value, selector.plantilla);
          }}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs
                     font-semibold text-slate-700 cursor-pointer
                     focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
        >
          <option value="">Elige un pedido…</option>
          {visibles.map((o) => (
            <option key={o.numero} value={o.numero}>
              {o.numero} — {o.descripcion}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};
