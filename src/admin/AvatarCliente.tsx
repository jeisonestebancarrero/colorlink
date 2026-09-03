import React, { useState } from 'react';

/**
 * Foto de un cliente, con iniciales cuando no hay foto.
 *
 * En la práctica casi ningún cliente tiene foto —hoy, uno de sesenta y seis—,
 * así que el caso NORMAL es el respaldo, no la excepción. Un icono genérico
 * repetido sesenta veces convierte la vista de tarjetas en una cuadrícula
 * indistinguible; con iniciales sobre un color derivado del nombre, cada
 * cliente se reconoce de lejos y el color es siempre el mismo para el mismo
 * nombre, así que sirve de referencia visual.
 *
 * La FORMA distingue el tipo: cuadrado redondeado para una empresa, círculo
 * para una persona. Es la convención de cualquier agenda, y en una lista
 * mezclada permite ver de qué tipo es cada cliente sin leer la etiqueta.
 */

interface Props {
  nombre: string;
  fotoUrl?: string | null;
  tipo: 'EMPRESA' | 'PERSONA';
  /** Lado del avatar en píxeles. */
  tamano?: number;
  className?: string;
}

/**
 * Paleta de acompañamiento, no la de marca.
 *
 * El azul Pintuco se reserva para lo accionable —botones, enlaces—; si los
 * avatares también fueran azules, la pantalla dejaría de indicar dónde se
 * puede hacer clic. Todos con contraste suficiente para texto blanco.
 */
const COLORES = [
  '#0F766E', '#B45309', '#9333EA', '#0369A1', '#BE123C',
  '#4D7C0F', '#7C2D12', '#1E40AF', '#86198F', '#065F46',
];

/** Mismo nombre, mismo color, siempre. */
function colorDe(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i += 1) {
    h = (h * 31 + nombre.charCodeAt(i)) % 100000;
  }
  return COLORES[h % COLORES.length];
}

/**
 * Iniciales.
 *
 * Se salta lo que no identifica: la forma jurídica («S.A.S.», «LTDA») y las
 * palabras de relleno. Sin eso, «CONSTRUCTORA HORIZONTE S.A.S.» daría «CH»
 * pero «COMERCIAL HORIZONTE S.A.» también, y en cambio «C S» para media
 * pantalla de empresas no distingue nada.
 */
export function inicialesDe(nombre: string): string {
  const RELLENO = new Set([
    'SAS', 'SA', 'LTDA', 'SAC', 'EU', 'SCA', 'DE', 'DEL', 'LA', 'LAS',
    'LOS', 'Y', 'E', 'EL',
  ]);
  const palabras = nombre
    .toUpperCase()
    // Los puntos se QUITAN, no se cambian por espacio: «S.A.S.» tiene que
    // quedar «SAS» para reconocerlo como forma jurídica. Partiéndolo en
    // «S A S» ninguna de las tres letras coincide con la lista y la sigla
    // acababa dando las iniciales.
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
