import React, { useState } from 'react';

/**
 * Foto del cliente o, lo habitual, iniciales sobre un color estable derivado del nombre.
 * Cuadrado redondeado para empresa, círculo para persona.
 */

interface Props {
  nombre: string;
  fotoUrl?: string | null;
  tipo: 'EMPRESA' | 'PERSONA';
  /** Lado del avatar en píxeles. */
  tamano?: number;
  className?: string;
}

/** Paleta secundaria (el azul de marca queda para lo accionable), con contraste para texto blanco. */
const COLORES = [
  '#0F766E', '#B45309', '#9333EA', '#0369A1', '#BE123C',
  '#4D7C0F', '#7C2D12', '#1E40AF', '#86198F', '#065F46',
];

/** Color determinista por nombre. */
function colorDe(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i += 1) {
    h = (h * 31 + nombre.charCodeAt(i)) % 100000;
  }
  return COLORES[h % COLORES.length];
}

/** Iniciales sin forma jurídica («S.A.S.», «LTDA») ni palabras de relleno. */
export function inicialesDe(nombre: string): string {
  const RELLENO = new Set([
    'SAS', 'SA', 'LTDA', 'SAC', 'EU', 'SCA', 'DE', 'DEL', 'LA', 'LAS',
    'LOS', 'Y', 'E', 'EL',
  ]);
  const palabras = nombre
    .toUpperCase()
    // Se quitan los puntos (no se cambian por espacio) para que «S.A.S.» quede «SAS» y se reconozca.
    .replace(/\./g, '')
    .replace(/[,&()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !RELLENO.has(w));

  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2);
  return palabras[0][0] + palabras[1][0];
}

export const AvatarCliente: React.FC<Props> = ({
  nombre, fotoUrl, tipo, tamano = 44, className = '',
}) => {
  const [fallo, setFallo] = useState(false);
  const forma = tipo === 'EMPRESA' ? 'rounded-xl' : 'rounded-full';
  const lado = { width: tamano, height: tamano };

  if (fotoUrl && fotoUrl.trim() !== '' && !fallo) {
    return (
      <img
        key={fotoUrl}
        src={fotoUrl}
        alt=""
        aria-hidden
        style={lado}
        onError={() => setFallo(true)}
        loading="lazy"
        className={`${forma} shrink-0 object-cover border border-slate-200 bg-slate-100 ${className}`}
      />
    );
  }

  const texto = inicialesDe(nombre);
  return (
    <span
      aria-hidden
      style={{ ...lado, backgroundColor: colorDe(nombre) }}
      className={`${forma} shrink-0 flex items-center justify-center text-white font-extrabold
                  select-none ${className}`}
    >
      <span style={{ fontSize: Math.round(tamano * 0.36) }}>{texto}</span>
    </span>
  );
};
