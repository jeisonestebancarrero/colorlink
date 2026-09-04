import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PhoneOff, Mic, MicOff, Loader2, AlertTriangle } from 'lucide-react';
import {
  iniciarLlamada, type EstadoLlamada, type ManejadorLlamada, type TurnoVoz,
} from '../../services/voz';
import logoPintuco from '../../../assets/brand/pintuco-logo.jpeg';

/**
 * La llamada con Pintu.
 *
 * Se dibuja como una llamada de teléfono a propósito: pantalla propia, avatar
 * grande, contador corriendo y un solo botón rojo para colgar. Un chat con un
 * micrófono al lado se usa como un chat —la gente escribe— y entonces no hay
 * conversación, hay dictado.
 *
 * El avatar reacciona al ESTADO REAL de la conversación, no a un temporizador:
 * los anillos crecen con la amplitud de la voz de Pintu, que llega medida del
 * audio que está sonando. Una animación decorativa que no sigue a la voz se
 * nota enseguida y rompe la ilusión de que hay alguien al otro lado.
 *
 * Va en un PORTAL colgado de `document.body` por el mismo motivo que el resto
 * de diálogos del sistema: dentro del `<main>` con `z-10` quedaría por debajo
 * de la cabecera de la tienda.
 */

const ETIQUETA: Record<EstadoLlamada, string> = {
  inactiva: '',
  conectando: 'Conectando…',
  escuchando: 'Te escucho',
  pensando: 'Un momento…',
  hablando: 'Pintu está hablando',
  finalizada: 'Llamada terminada',
  error: 'Se cortó la llamada',
};

const reloj = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Pintu, el asesor.
 *
 * Es una PERSONA dibujada, no un icono. La primera versión era un círculo con
 * dos puntos y una raya, y se leía como lo que era: un chatbot. En una llamada
 * de voz el avatar es lo único que se ve durante minutos, y un símbolo plano
 * no sostiene la idea de que hay un asesor al otro lado.
 *
 * Regla de esta pantalla: **nunca se queda quieta**. Cuatro capas de
 * movimiento, y solo dos dependen de que haya voz:
 *
 *   1. RESPIRA SIEMPRE. Hombros y cabeza suben y bajan, aunque nadie hable.
 *   2. PARPADEA a intervalos irregulares. Cada N segundos exactos se nota
 *      mecánico; el azar es lo que lo hace parecer vivo.
 *   3. LA BOCA SIGUE LA VOZ REAL — la amplitud medida del audio que suena, no
 *      un temporizador. Una animación que no sigue a la voz se descubre al
 *      segundo turno.
 *   4. LAS CEJAS Y LA MIRADA cambian con el estado: sube las cejas cuando
 *      escucha, mira de lado cuando piensa.
 */
const CaraPintu: React.FC<{ estado: EstadoLlamada; nivel: number }> = ({ estado, nivel }) => {
  const [parpadeo, setParpadeo] = useState(false);

  useEffect(() => {
    let vivo = true;
    const ciclo = () => {
      if (!vivo) return;
      setParpadeo(true);
      window.setTimeout(() => setParpadeo(false), 120);
      window.setTimeout(ciclo, 2400 + Math.random() * 3600);
    };
    const t = window.setTimeout(ciclo, 1200);
    return () => { vivo = false; window.clearTimeout(t); };
  }, []);

  const hablando = estado === 'hablando';
  const escuchando = estado === 'escuchando';
  const pensando = estado === 'pensando';
  const activo = hablando || escuchando;

  // Boca: alto y ancho siguen la amplitud. El mínimo no es cero, o parece un
  // muñeco mal sincronizado.
  const altoBoca = hablando ? 2.5 + nivel * 13 : 2.5;
  const anchoBoca = hablando ? 15 + nivel * 5 : 16;
  const cejas = escuchando ? -3.5 : hablando ? -1 : 0;
  // Al pensar mira a un lado, como quien recuerda algo.
  const pupila = pensando ? 2.2 : 0;

  return (
    <div className="relative w-44 h-44 flex items-center justify-center">
      <style>{`
        @keyframes pintu-respira {
          0%,100% { transform: translateY(0);    }
          50%     { transform: translateY(-4px); }
        }
        @keyframes pintu-halo {
          0%   { transform: scale(.9);  opacity:.5; }
          70%  { transform: scale(1.3); opacity:0;  }
          100% { transform: scale(1.3); opacity:0;  }
        }
        @keyframes pintu-barra {
          0%,100% { transform: scaleY(.3); }
          50%     { transform: scaleY(1);  }
        }
      `}</style>

      {activo && [0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute w-32 h-32 rounded-full border-2 border-[#004F9F]/20"
          style={{ animation: `pintu-halo 2.6s ease-out ${i * 0.85}s infinite` }}
        />
      ))}

      {activo && (
        <span
          className="absolute rounded-full border-2 border-[#FFD100]/50"
          style={{
            width: `${132 + nivel * 46}px`, height: `${132 + nivel * 46}px`,
            transition: 'width .09s ease-out, height .09s ease-out',
          }}
        />
      )}

      <div
        className="relative w-32 h-32 rounded-full overflow-hidden shadow-xl ring-4 ring-white"
        style={{ background: 'linear-gradient(#dbeafe 0%, #eff6ff 60%, #ffffff 100%)' }}
      >
        <svg viewBox="0 0 120 120" className="w-full h-full"
             style={{ animation: 'pintu-respira 3.6s ease-in-out infinite' }}>
          <defs>
            <clipPath id="pintu-recorte"><circle cx="60" cy="60" r="60" /></clipPath>
          </defs>
          <g clipPath="url(#pintu-recorte)">
            {/* Hombros y polo de trabajo, azul Pintuco */}
            <path d="M10 120 C13 95 32 85 60 85 C88 85 107 95 110 120 Z" fill="#004F9F" />
            <path d="M50 86 L60 98 L70 86 L64 83 L56 83 Z" fill="#f8fafc" />
            {/* Cuello */}
            <path d="M51 71 h18 v14 c-4 4 -14 4 -18 0 Z" fill="#d69a72" />
            {/* Orejas, discretas y a la altura de los ojos */}
            <ellipse cx="32" cy="55" rx="4" ry="6" fill="#e8ab81" />
            <ellipse cx="88" cy="55" rx="4" ry="6" fill="#e8ab81" />
            {/* Cara */}
            <ellipse cx="60" cy="52" rx="28" ry="32" fill="#f0b98f" />
            {/* Pelo: corto y con la frente DESPEJADA. Antes bajaba hasta las
                cejas y con las orejas grandes la cara se leía como un
                pasamontañas. */}
            <path d="M32 44 C34 27 46 20 60 20 C74 20 86 27 88 44
                     C86 36 78 31 60 31 C48 31 39 34 32 44 Z" fill="#3b2a1e" />
            <path d="M32 44 C36 38 44 34 54 33 C46 36 40 40 36 47 Z" fill="#2b1e15" />
            {/* Rubor: quita el aire de retrato policial */}
            <ellipse cx="41" cy="60" rx="6" ry="3.5" fill="#e08a6a" opacity=".28" />
            <ellipse cx="79" cy="60" rx="6" ry="3.5" fill="#e08a6a" opacity=".28" />
            {/* Cejas, más suaves y arqueadas */}
            <path d="M42 41.5 q7.5 -3.5 15 0" fill="none" stroke="#3b2a1e"
                  strokeWidth="3" strokeLinecap="round"
                  transform={`translate(0 ${cejas})`}
                  style={{ transition: 'transform .25s ease-out' }} />
            <path d="M63 41.5 q7.5 -3.5 15 0" fill="none" stroke="#3b2a1e"
                  strokeWidth="3" strokeLinecap="round"
                  transform={`translate(0 ${cejas})`}
                  style={{ transition: 'transform .25s ease-out' }} />
            {/* Ojos */}
            <ellipse cx="48.5" cy="51" rx="6" ry={parpadeo ? 0.7 : 5} fill="#fff"
                     style={{ transition: 'ry .07s ease-out' }} />
            <ellipse cx="71.5" cy="51" rx="6" ry={parpadeo ? 0.7 : 5} fill="#fff"
                     style={{ transition: 'ry .07s ease-out' }} />
            {!parpadeo && (
              <>
                <circle cx={48.5 + pupila} cy="51.5" r="2.8" fill="#4a3421"
                        style={{ transition: 'cx .4s ease-out' }} />
                <circle cx={71.5 + pupila} cy="51.5" r="2.8" fill="#4a3421"
                        style={{ transition: 'cx .4s ease-out' }} />
                <circle cx={49.7 + pupila} cy="50.2" r="1.05" fill="#fff" />
                <circle cx={72.7 + pupila} cy="50.2" r="1.05" fill="#fff" />
              </>
            )}
            {/* Nariz */}
            <path d="M60 54 v6 c0 1.5 -1.5 2.4 -3.2 2.4" fill="none" stroke="#d69a72"
                  strokeWidth="2" strokeLinecap="round" />
            {/* La boca. EN REPOSO SONRÍE.
                Antes era un óvalo oscuro fijo, y una cara seria con la boca
                entreabierta es exactamente lo que le daba mala pinta. Solo se
                abre cuando hay voz, y entonces sigue la amplitud. */}
            {hablando && nivel > 0.08 ? (
              <>
                <ellipse cx="60" cy={70 + altoBoca / 4} rx={anchoBoca / 2} ry={altoBoca / 2}
                         fill="#8d3f43"
                         style={{ transition: 'ry .07s ease-out, rx .12s ease-out' }} />
                <ellipse cx="60" cy={68 + altoBoca / 8} rx={anchoBoca / 2.7} ry="1.5"
                         fill="#fff" opacity=".9" />
              </>
            ) : (
              <path d="M50 69 q10 7 20 0" fill="none" stroke="#8d3f43"
                    strokeWidth="2.6" strokeLinecap="round" />
            )}
          </g>
        </svg>

      </div>

      {/* La chapa de la marca, como el gafete de un asesor. Fuera del círculo
          de la cara: encima se apoyaba sobre el hombro y ensuciaba el polo. */}
      <img
        src={logoPintuco}
        alt="Pintuco"
        className="absolute bottom-0 right-0 w-9 h-9 rounded-lg object-cover
                   ring-2 ring-white shadow-md bg-white"
      />

      {/* Los puntos de «está pensando» van ARRIBA, como un bocadillo. Dentro
          del círculo caían sobre el cuello y parecían un collar. */}
      {pensando && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 flex gap-1.5
                        bg-white rounded-full px-2.5 py-1.5 shadow-md border border-slate-200">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#004F9F] animate-bounce"
                  style={{ animationDelay: `${i * 130}ms` }} />
          ))}
        </div>
      )}

      {hablando && (
        <div className="absolute -bottom-2 flex items-end gap-1 h-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-[#004F9F]/70 origin-bottom"
              style={{
                height: `${8 + nivel * 12}px`,
                animation: `pintu-barra ${0.5 + i * 0.09}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface Props {
  onCerrar: () => void;
  /** Para que el hilo de texto se quede con lo que se habló. */
  onTranscripcion?: (turnos: TurnoVoz[]) => void;
}

export const LlamadaPintu: React.FC<Props> = ({ onCerrar, onTranscripcion }) => {
  const [estado, setEstado] = useState<EstadoLlamada>('conectando');
  const [nivel, setNivel] = useState(0);
  const [turnos, setTurnos] = useState<TurnoVoz[]>([]);
  const [segundos, setSegundos] = useState(0);
  const [consultas, setConsultas] = useState(0);
  const [aviso, setAviso] = useState('');
  const [silenciado, setSilenciado] = useState(false);
  /** Cuánto te está oyendo el micrófono ahora mismo. */
  const [nivelMicro, setNivelMicro] = useState(0);

  const manejador = useRef<ManejadorLlamada | null>(null);
  const turnosRef = useRef<TurnoVoz[]>([]);
  const arrancada = useRef(false);

  const colgar = useCallback(() => {
    manejador.current?.colgar();
    onTranscripcion?.(turnosRef.current);
    onCerrar();
  }, [onCerrar, onTranscripcion]);

  useEffect(() => {
    // En modo estricto el efecto corre dos veces; una segunda llamada
    // significaría un segundo token efímero y audio duplicado.
    if (arrancada.current) return;
    arrancada.current = true;

    iniciarLlamada({
      onEstado: setEstado,
      onNivel: setNivel,
      onNivelMicro: setNivelMicro,
      onTurno: (t) => {
        turnosRef.current = [...turnosRef.current, t].slice(-40);
        setTurnos(turnosRef.current);
      },
      onConsumo: (c) => { setSegundos(c.segundos); setConsultas(c.consultas); },
      onError: setAviso,
    })
      .then((m) => { manejador.current = m; })
      .catch((e: Error) => { setAviso(e.message); setEstado('error'); });

    return () => { manejador.current?.colgar(); };
  }, []);

  const ultimos = turnos.slice(-4);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Cabecera con el avatar */}
        <div className="bg-linear-to-b from-slate-50 to-white px-6 pt-8 pb-5 flex flex-col items-center">
          <CaraPintu estado={estado} nivel={nivel} />

          <h2 className="mt-3 text-xl font-extrabold text-slate-900 tracking-tight">Pintu</h2>
          <p className="text-xs text-slate-500">Asesor de color y obra · Pintuco</p>

          <div className="mt-3 flex items-center gap-2">
            {estado === 'conectando' && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#004F9F]" />}
            <span
              className={`text-xs font-bold ${
                estado === 'error' ? 'text-rose-600'
                  : estado === 'hablando' ? 'text-[#004F9F]'
                  : 'text-slate-600'
              }`}
            >
              {ETIQUETA[estado]}
            </span>
            {segundos > 0 && (
              <span className="text-xs font-mono text-slate-400 tabular-nums">{reloj(segundos)}</span>
            )}
          </div>
        </div>

        {aviso && (
          <div className="mx-5 mb-3 flex items-start gap-2 text-xs font-semibold rounded-lg px-3 py-2.5 bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>{aviso}</span>
          </div>
        )}

        {/* Lo que se va diciendo. No es decoración: deja ver que Pintu entendió
            bien, y es lo que queda como registro de la llamada. */}
        <div className="px-5 pb-4 min-h-[132px] max-h-52 overflow-y-auto space-y-2">
          {ultimos.length === 0 && estado !== 'conectando' && (
            <p className="text-xs text-slate-400 text-center pt-6">
              Habla con naturalidad. Pintu te escucha.
            </p>
          )}
          {ultimos.map((t, i) => (
            <div
              key={`${i}-${t.texto.slice(0, 12)}`}
              className={`text-xs leading-relaxed rounded-xl px-3 py-2 ${
                t.autor === 'PINTU'
                  ? 'bg-[#004F9F]/5 text-slate-700 border border-[#004F9F]/10'
                  : 'bg-slate-100 text-slate-600 ml-6'
              }`}
            >
              <span className="font-bold">{t.autor === 'PINTU' ? 'Pintu' : 'Tú'}: </span>
              {t.texto}
            </div>
          ))}
        </div>

        {/* Controles */}
        <div className="px-6 py-5 border-t border-slate-100 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              const v = !silenciado;
              setSilenciado(v);
              manejador.current?.silenciar(v);
            }}
            disabled={estado === 'conectando' || estado === 'finalizada'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 ${
              silenciado ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            aria-label={silenciado ? 'Activar micrófono' : 'Silenciar micrófono'}
          >
            {silenciado ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Barras del micrófono. Responden a «¿me está oyendo?», que es la
              primera pregunta cuando Pintu no contesta. Si hablas y estas
              barras no se mueven, el problema es el micrófono o su permiso, no
              Pintu. */}
          <div className="flex items-end gap-[3px] h-8 w-14" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const umbral = (i + 1) / 7;
              const encendida = !silenciado && nivelMicro >= umbral * 0.55;
              return (
                <span
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    encendida ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                  style={{ height: `${8 + i * 3.5}px` }}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={colgar}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer"
            aria-label="Colgar"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>

        {/* Lo que va costando, a la vista. Un asistente de voz que no muestra
            su consumo es una factura sorpresa. */}
        <div className="px-6 pb-4 -mt-2 text-center">
          <p className="text-[11px] text-slate-400">
            {consultas > 0
              ? `${consultas} consulta${consultas === 1 ? '' : 's'} a datos reales · la llamada se cierra sola a los 5 minutos`
              : 'La llamada se cierra sola a los 5 minutos'}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
