import React from 'react';
import { Check, CheckCheck } from 'lucide-react';

/**
 * Acuse de lectura: los «chulitos» del chat.
 *
 * Un chulo = entregado, todavía sin abrir.
 * Dos chulos = la otra parte abrió la conversación.
 *
 * El dato es `conversation_messages.read_at`, que escribe
 * `marcar_conversacion_leida` al ABRIR el hilo. Así que aquí «leído» significa
 * exactamente eso: que la persona abrió la conversación donde estaba el
 * mensaje. No es una suposición ni un acuse del servidor de correo.
 *
 * SOLO SE PINTA EN LOS MENSAJES PROPIOS. En uno ajeno, `read_at` dice cuándo
 * lo leí yo —que ya lo sé— y mostrarlo daría a entender que el otro leyó lo
 * que en realidad leí yo.
 *
 * Se marca la conversación entera, no mensaje por mensaje: si alguien abre el
 * hilo, ha visto todo lo que había. Por eso varios mensajes seguidos pasan a
 * dos chulos a la vez, igual que en cualquier chat.
 */
export const AcuseDeLectura: React.FC<{
  /** `null` mientras no lo haya abierto la otra parte. */
  leidoEn: string | null;
  /** Sobre fondo azul (burbuja propia) o sobre fondo claro. */
  sobreAzul?: boolean;
  className?: string;
}> = ({ leidoEn, sobreAzul = true, className = '' }) => {
  const leido = leidoEn !== null;

  const titulo = leido
    ? `Leído el ${new Date(leidoEn).toLocaleString('es-CO', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })}`
    : 'Enviado, todavía sin abrir';

  // El color, no solo la forma: dos chulos del mismo tono que uno se
  // distinguen mal en un icono de 12 px.
  const color = leido
    ? (sobreAzul ? 'text-sky-300' : 'text-[#004F9F]')
    : (sobreAzul ? 'text-blue-200/70' : 'text-slate-400');

  return (
    <span
      title={titulo}
      aria-label={titulo}
      className={`inline-flex items-center ${color} ${className}`}
    >
      {leido
        ? <CheckCheck className="w-3.5 h-3.5" />
        : <Check className="w-3.5 h-3.5" />}
    </span>
  );
};
