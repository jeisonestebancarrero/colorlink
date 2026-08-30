import React from 'react';
import fotoFachada from '../../assets/ambientes/fachada.jpg';
import fotoSala from '../../assets/ambientes/sala.jpg';
import fotoHabitacion from '../../assets/ambientes/habitacion.jpg';
import fotoOficina from '../../assets/ambientes/oficina.jpg';

/**
 * Simulador de ambientes.
 *
 * POR QUÉ NO ES UNA FOTO TEÑIDA:
 * La versión anterior ponía una foto de archivo y le aplicaba el color encima
 * con `mix-blend-multiply` sobre TODO el elemento. El resultado no era una
 * pared pintada sino la fotografía entera virada a ese tono: los muebles, el
 * piso y hasta el cielo cambiaban de color. Para teñir solo el muro haría
 * falta una máscara de esa foto en concreto, y para una foto cualquiera eso
 * exige segmentación con un modelo de visión: varios megabytes de descarga y
 * un resultado que falla con frecuencia.
 *
 * Aquí las escenas se dibujan en SVG, así que la pared es una figura con
 * identidad propia: recibe el color y nada más lo recibe. La luz y las
 * sombras se conservan porque van en capas aparte, con degradados que
 * multiplican sobre el color elegido. Es exacto, pesa unos pocos kilobytes y
 * funciona sin conexión.
 */

// ── Utilidades de color ──────────────────────────────────────────────────
function aRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const completo = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(completo.slice(0, 2), 16) || 0,
    parseInt(completo.slice(2, 4), 16) || 0,
    parseInt(completo.slice(4, 6), 16) || 0,
  ];
}

/** Aclara (f > 0) u oscurece (f < 0) un color. Para las caras en sombra. */
function tono(hex: string, f: number): string {
  const [r, g, b] = aRgb(hex);
  const m = (v: number) =>
    Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

/**
 * Luminancia percibida. Sirve para decidir si el texto y los detalles sobre la
 * pared deben ir claros u oscuros: un gris medio y un amarillo pálido tienen
 * un brillo muy distinto aunque en la carta se vean parecidos.
 */
export function esClaro(hex: string): boolean {
  const [r, g, b] = aRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

interface EscenaProps {
  color: string;
}

// ── Fachada exterior ─────────────────────────────────────────────────────
const Fachada: React.FC<EscenaProps> = ({ color }) => (
  <svg viewBox="0 0 800 500" className="w-full h-full" role="img" aria-label="Fachada exterior">
    <defs>
      <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7EB6E8" />
        <stop offset="100%" stopColor="#D6E9F7" />
      </linearGradient>
      <linearGradient id="luzFachada" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
        <stop offset="55%" stopColor="#fff" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.12" />
      </linearGradient>
    </defs>

    <rect width="800" height="500" fill="url(#cielo)" />
    <circle cx="672" cy="78" r="34" fill="#FFF4CE" opacity="0.9" />

    {/* Muro principal — recibe el color */}
    <polygon points="120,150 560,150 560,430 120,430" fill={color} />
    <polygon points="120,150 560,150 560,430 120,430" fill="url(#luzFachada)" />

    {/* Muro lateral en sombra: la misma pintura da distinto según la luz */}
    <polygon points="560,150 680,190 680,430 560,430" fill={tono(color, -0.22)} />

    {/* Zócalo, que en Colombia casi siempre va en otro material */}
    <rect x="120" y="404" width="440" height="26" fill="#8D8478" />
    <polygon points="560,404 680,404 680,430 560,430" fill="#756D63" />

    {/* Cubierta */}
    <polygon points="100,150 580,150 700,190 700,206 100,166" fill="#8C3B2E" />
    <polygon points="100,166 700,206 700,190 100,150" fill="#6F2E24" opacity="0.5" />

    {/* Ventanas */}
    {[180, 330, 460].map((x) => (
      <g key={x}>
        <rect x={x} y="210" width="90" height="110" rx="3" fill="#2C4A63" />
        <rect x={x + 5} y="215" width="80" height="100" rx="2" fill="#4E7A9B" />
        <rect x={x + 5} y="215" width="38" height="100" fill="#6FA0C0" opacity="0.55" />
        <rect x={x - 4} y="322" width="98" height="8" rx="2" fill={tono(color, -0.3)} />
      </g>
    ))}

    {/* Puerta */}
    <rect x="250" y="330" width="86" height="74" rx="2" fill="#5A3C28" />
    <rect x="256" y="336" width="74" height="68" fill="#6B4A32" />
    <circle cx="322" cy="370" r="4" fill="#C9A227" />

    {/* Piso y jardín */}
    <rect y="430" width="800" height="70" fill="#B9B2A6" />
    <rect y="430" width="800" height="10" fill="#A49C90" />
    {[60, 730].map((x) => (
      <g key={x}>
        <rect x={x - 4} y="392" width="8" height="42" fill="#6B5A45" />
        <circle cx={x} cy="378" r="30" fill="#4E7A46" />
        <circle cx={x - 16} cy="392" r="20" fill="#5C8A52" />
        <circle cx={x + 16} cy="392" r="18" fill="#436B3D" />
      </g>
    ))}
  </svg>
);

// ── Sala y muro focal ────────────────────────────────────────────────────
const Sala: React.FC<EscenaProps> = ({ color }) => (
  <svg viewBox="0 0 800 500" className="w-full h-full" role="img" aria-label="Sala con muro focal">
    <defs>
      <linearGradient id="luzSala" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
        <stop offset="60%" stopColor="#fff" stopOpacity="0.04" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.14" />
      </linearGradient>
      <linearGradient id="pisoSala" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#B98F5F" />
        <stop offset="100%" stopColor="#8E6A44" />
      </linearGradient>
    </defs>

    {/* Muro del fondo — el que se pinta */}
    <rect width="800" height="400" fill={color} />
    <rect width="800" height="400" fill="url(#luzSala)" />

    {/* Muro lateral: la misma pintura, menos luz */}
    <polygon points="0,0 110,52 110,372 0,400" fill={tono(color, -0.18)} />

    {/* Cornisa y guardaescoba, en blanco como se usa */}
    <rect y="0" width="800" height="16" fill="#F5F3EF" />
    <rect y="384" width="800" height="16" fill="#F5F3EF" />

    {/* Ventana con luz natural */}
    <rect x="560" y="70" width="180" height="180" rx="4" fill="#F5F3EF" />
    <rect x="572" y="82" width="156" height="156" fill="#CBE3F2" />
    <line x1="650" y1="82" x2="650" y2="238" stroke="#F5F3EF" strokeWidth="8" />
    <line x1="572" y1="160" x2="728" y2="160" stroke="#F5F3EF" strokeWidth="8" />
    {/* El haz de luz que entra: aclara la pared cerca de la ventana */}
    <polygon points="560,250 740,250 800,400 470,400" fill="#fff" opacity="0.12" />

    {/* Cuadro */}
    <rect x="200" y="86" width="150" height="110" rx="2" fill="#3C3128" />
    <rect x="209" y="95" width="132" height="92" fill="#E8DFD0" />
    <circle cx="252" cy="140" r="22" fill="#C9724E" />
    <rect x="286" y="120" width="42" height="52" fill="#5D7FA3" />

    {/* Piso */}
    <rect y="400" width="800" height="100" fill="url(#pisoSala)" />
    {[80, 200, 320, 440, 560, 680].map((x) => (
      <line key={x} x1={x} y1="400" x2={x - 30} y2="500" stroke="#7C5B39" strokeWidth="2" opacity="0.5" />
    ))}

    {/* Sofá */}
    <rect x="170" y="300" width="330" height="86" rx="12" fill="#4A5A6B" />
    <rect x="182" y="286" width="306" height="46" rx="10" fill="#5A6C7E" />
    <rect x="196" y="296" width="80" height="34" rx="8" fill="#8FA3B5" />
    <rect x="392" y="296" width="80" height="34" rx="8" fill="#8FA3B5" />
    <rect x="188" y="382" width="14" height="20" fill="#3A2E24" />
    <rect x="468" y="382" width="14" height="20" fill="#3A2E24" />

    {/* Mesa auxiliar y lámpara */}
    <rect x="540" y="330" width="86" height="8" rx="3" fill="#6B4A32" />
    <rect x="578" y="338" width="10" height="48" fill="#6B4A32" />
    <polygon points="556,300 610,300 620,330 546,330" fill="#F0E4C8" />
    <circle cx="583" cy="300" r="6" fill="#D8C9A8" />
  </svg>
);

// ── Habitación principal ─────────────────────────────────────────────────
const Habitacion: React.FC<EscenaProps> = ({ color }) => (
  <svg viewBox="0 0 800 500" className="w-full h-full" role="img" aria-label="Habitación principal">
    <defs>
      <linearGradient id="luzHab" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.26" />
        <stop offset="70%" stopColor="#fff" stopOpacity="0.02" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.16" />
      </linearGradient>
      <radialGradient id="lampara" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#FFE9B0" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#FFE9B0" stopOpacity="0" />
      </radialGradient>
    </defs>

    <rect width="800" height="410" fill={color} />
    <rect width="800" height="410" fill="url(#luzHab)" />
    <polygon points="690,52 800,0 800,410 690,376" fill={tono(color, -0.2)} />

    <rect y="394" width="800" height="16" fill="#F5F3EF" />
    <rect y="410" width="800" height="90" fill="#7E6A55" />

    {/* Cabecero y cama */}
    <rect x="230" y="150" width="340" height="120" rx="10" fill="#6B5344" />
    <rect x="244" y="164" width="312" height="92" rx="8" fill="#7E6252" />
    <rect x="210" y="266" width="380" height="26" rx="6" fill="#EFEAE1" />
    <rect x="196" y="286" width="408" height="86" rx="10" fill="#DCD3C6" />
    <rect x="196" y="286" width="408" height="34" rx="10" fill="#B8C4CE" />
    <rect x="262" y="240" width="110" height="38" rx="8" fill="#FAF7F1" />
    <rect x="424" y="240" width="110" height="38" rx="8" fill="#FAF7F1" />
    <rect x="206" y="370" width="14" height="24" fill="#4A3A2C" />
    <rect x="580" y="370" width="14" height="24" fill="#4A3A2C" />

    {/* Mesas de noche con lámparas encendidas */}
    {[130, 618].map((x) => (
      <g key={x}>
        <circle cx={x + 26} cy="238" r="72" fill="url(#lampara)" />
        <rect x={x} y="290" width="80" height="82" rx="5" fill="#6B5344" />
        <rect x={x + 8} y="302" width="64" height="22" rx="3" fill="#856A57" />
        <rect x={x + 22} y="262" width="10" height="30" fill="#4A3A2C" />
        <polygon points={`${x + 8},232 ${x + 46},232 ${x + 54},262 ${x},262`} fill="#F4E7C7" />
      </g>
    ))}

    {/* Tapete */}
    <ellipse cx="400" cy="452" rx="250" ry="34" fill="#9A8778" opacity="0.7" />
  </svg>
);

// ── Oficina / comercial ──────────────────────────────────────────────────
const Oficina: React.FC<EscenaProps> = ({ color }) => (
  <svg viewBox="0 0 800 500" className="w-full h-full" role="img" aria-label="Oficina o local comercial">
    <defs>
      <linearGradient id="luzOfi" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.24" />
        <stop offset="65%" stopColor="#fff" stopOpacity="0.03" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.15" />
      </linearGradient>
    </defs>

    <rect width="800" height="404" fill={color} />
    <rect width="800" height="404" fill="url(#luzOfi)" />
    <polygon points="0,0 96,44 96,368 0,404" fill={tono(color, -0.17)} />

    {/* Cielo raso con luminarias */}
    <rect width="800" height="34" fill="#EDEDEA" />
    {[180, 400, 620].map((x) => (
      <rect key={x} x={x - 55} y="10" width="110" height="12" rx="3" fill="#FFF8DC" />
    ))}
    <rect y="388" width="800" height="16" fill="#E9E7E2" />
    <rect y="404" width="800" height="96" fill="#9E9E9C" />

    {/* Estantería */}
    <rect x="596" y="120" width="150" height="268" fill="#5F5A54" />
    {[164, 224, 284, 344].map((y) => (
      <rect key={y} x="604" y={y} width="134" height="8" fill="#7A746C" />
    ))}
    {[[614, 130], [648, 130], [682, 190], [716, 250]].map(([x, y], i) => (
      <rect key={i} x={x} y={y} width="16" height="32" fill={['#B4544A', '#3D6E8E', '#C9A227', '#4E7A46'][i]} />
    ))}

    {/* Escritorio y silla */}
    <rect x="180" y="284" width="300" height="12" rx="3" fill="#8A6B4E" />
    <rect x="196" y="296" width="12" height="92" fill="#6B5340" />
    <rect x="452" y="296" width="12" height="92" fill="#6B5340" />
    <rect x="284" y="222" width="112" height="66" rx="4" fill="#2E3742" />
    <rect x="290" y="228" width="100" height="54" fill="#5D8FB5" />
    <rect x="326" y="288" width="28" height="6" fill="#2E3742" />
    <rect x="228" y="276" width="52" height="8" rx="2" fill="#C9C6C0" />

    <rect x="330" y="330" width="76" height="14" rx="6" fill="#3B4552" />
    <rect x="342" y="296" width="52" height="44" rx="8" fill="#46525F" />
    <rect x="362" y="344" width="10" height="40" fill="#6E7580" />
    <ellipse cx="367" cy="388" rx="34" ry="7" fill="#6E7580" />

    {/* Planta */}
    <rect x="96" y="332" width="52" height="56" rx="5" fill="#B4795A" />
    <ellipse cx="122" cy="300" rx="38" ry="30" fill="#3F6E43" />
    <ellipse cx="98" cy="316" rx="26" ry="20" fill="#4E8551" />
    <ellipse cx="146" cy="316" rx="24" ry="18" fill="#35603A" />
  </svg>
);

// ── Fotografía real con máscara de muro ─────────────────────────────────

/**
 * Cuando hay foto para el ambiente se usa la foto, no el dibujo.
 *
 * Pintar de verdad un muro fotografiado son dos pasos, no uno:
 *
 *  1. BORRAR EL COLOR QUE TENÍA. Se dibuja una segunda copia de la foto,
 *     recortada al muro, pasada a gris y comprimida a un rango claro. Sin
 *     este paso, pintar de blanco el muro azul oscuro de la oficina daría un
 *     azul un poco menos oscuro: multiplicar nunca aclara.
 *  2. APLICAR EL COLOR con `multiply` sobre ese gris. Como el gris conserva
 *     las variaciones de luz de la foto —la sombra del sofá, el degradado de
 *     la ventana, la textura del revoque—, el color entra con ellas y parece
 *     pintura y no un parche plano.
 *
 * La máscara se traza una vez por foto, en las coordenadas propias de la
 * imagen. Recorta lo que está por delante del muro (una puerta, una ventana,
 * un mueble): son las zonas donde no hay pared que pintar.
 */
interface Foto {
  src: string;
  ancho: number;
  alto: number;
  /** Zonas de muro que se pintan. */
  muros: string[];
  /** Lo que está por delante y no se pinta. */
  recortes?: string[];
}

const FOTOS: Record<string, Foto> = {
  facade: {
    src: fotoFachada,
    ancho: 1400,
    alto: 1050,
    muros: [
      '514,223 1036,223 1036,763 514,763', // volumen principal en revoque
      '395,260 514,260 514,306 395,306',   // paño alto a la izquierda
    ],
    recortes: [
      '514,306 900,306 900,553 514,553', // balcón en concreto a la vista
      '542,568 710,568 710,731 542,731', // ventanal de la planta baja
    ],
  },
  living: {
    src: fotoSala,
    ancho: 1400,
    alto: 738,
    muros: [
      // Baja hasta el borde superior del sofá: cortar más arriba dejaba una
      // franja del color viejo asomando por encima del espaldar.
      '22,0 1150,0 1150,406 22,406',
      '22,406 86,406 86,558 22,558',      // franja a la izquierda de la puerta
    ],
    recortes: [
      '86,222 242,222 242,560 86,560',    // puerta
      '312,218 1148,218 1148,310 312,310', // ventana horizontal
      '370,336 462,336 462,402 370,402',  // matera colgante
    ],
  },
  bedroom: {
    src: fotoHabitacion,
    ancho: 1400,
    alto: 933,
    // El muro se traza siguiendo la línea del techo, que aquí baja en
    // diagonal de izquierda a derecha hasta el rincón y vuelve a subir. Con un
    // rectángulo, como estaba antes, quedaban franjas rectas atravesando la
    // pared: se veían parches y no pintura.
    muros: [
      '105,95 660,262 660,455 265,452 265,630 105,660',   // muro del cabecero
      '660,262 1400,145 1400,700 660,700', // muro de la ventana
    ],
    recortes: [
      '338,276 532,276 532,440 338,440',   // cuadro
      '768,244 1110,244 1110,572 768,572', // ventana
      // Los muebles se recortan en lugar de cortar el muro en horizontal: una
      // línea recta a media pared se lee como un friso que no existe.
      '655,452 1016,452 1016,840 655,840', // cama
      '1016,545 1348,545 1348,795 1016,795', // banca y mesa auxiliar
    ],
  },
  office: {
    src: fotoOficina,
    ancho: 1400,
    alto: 935,
    muros: [
      '0,150 578,180 578,458 0,454',      // muro largo de la izquierda
      '902,178 1242,152 1242,292 902,292', // muro del fondo a la derecha
    ],
  },
};

const FotoConMuro: React.FC<{ foto: Foto; color: string; id: string }> = ({ foto, color, id }) => (
  <svg
    viewBox={`0 0 ${foto.ancho} ${foto.alto}`}
    preserveAspectRatio="xMidYMid slice"
    className="w-full h-full"
    role="img"
    aria-label="Ambiente con el color aplicado en el muro"
  >
    <defs>
      {/* Gris comprimido al tramo claro: es lo que borra el color original
          sin borrar la luz. */}
      <filter id={`base-${id}`} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.46" intercept="0.54" />
          <feFuncG type="linear" slope="0.46" intercept="0.54" />
          <feFuncB type="linear" slope="0.46" intercept="0.54" />
        </feComponentTransfer>
      </filter>

      {/* El borde de la máscara se difumina un poco: un canto perfecto delata
          el recorte y se ve pegado. */}
      <filter id={`borde-${id}`}>
        <feGaussianBlur stdDeviation="2" />
      </filter>

      <mask id={`muro-${id}`}>
        <g filter={`url(#borde-${id})`}>
          <rect width={foto.ancho} height={foto.alto} fill="#000" />
          {foto.muros.map((m, i) => (
            <polygon key={`m${i}`} points={m} fill="#fff" />
          ))}
          {(foto.recortes ?? []).map((r, i) => (
            <polygon key={`r${i}`} points={r} fill="#000" />
          ))}
        </g>
      </mask>
    </defs>

    <image href={foto.src} width={foto.ancho} height={foto.alto} preserveAspectRatio="xMidYMid slice" />

    <g mask={`url(#muro-${id})`} style={{ isolation: 'isolate' }}>
      <image
        href={foto.src}
        width={foto.ancho}
        height={foto.alto}
        preserveAspectRatio="xMidYMid slice"
        filter={`url(#base-${id})`}
      />
      <rect
        width={foto.ancho}
        height={foto.alto}
        fill={color}
        style={{ mixBlendMode: 'multiply' }}
      />
    </g>
  </svg>
);

const ESCENAS: Record<string, React.FC<EscenaProps>> = {
  facade: Fachada,
  living: Sala,
  bedroom: Habitacion,
  office: Oficina,
};

export const SimuladorAmbiente: React.FC<{ ambiente: string; color: string }> = ({
  ambiente, color,
}) => {
  const foto = FOTOS[ambiente];
  const Escena = ESCENAS[ambiente] ?? Fachada;

  return (
    <div className="w-full h-full bg-slate-100 transition-colors duration-500">
      {foto ? (
        <FotoConMuro foto={foto} color={color} id={ambiente} />
      ) : (
        <Escena color={color} />
      )}
    </div>
  );
};
