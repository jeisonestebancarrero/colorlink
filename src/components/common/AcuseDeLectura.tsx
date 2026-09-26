import React from 'react';
import { Check, CheckCheck } from 'lucide-react';

/**
 * Chulitos de lectura según `read_at`, que marca `marcar_conversacion_leida` al abrir el hilo
 * (se marca la conversación entera). Solo en mensajes propios: en los ajenos `read_at` es mi lectura.
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

  // Cambia también el color: a 12 px la forma sola se distingue mal.
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
