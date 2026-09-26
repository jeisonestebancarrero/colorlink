import React, { useId, useMemo, useState } from 'react';

/**
 * Gráficos SVG sin librería: línea para series de tiempo, líneas superpuestas por año,
 * barra 100 % apilada en lugar de torta y dispersión para margen contra volumen.
 */

export interface PuntoSerie {
  etiqueta: string;
  valor: number;
  /** Segunda serie opcional, dibujada sobre la misma escala. */
  valor2?: number | null;
  clave: string;
}

interface LineaProps {
  datos: PuntoSerie[];
  formato: (n: number) => string;
  color?: string;
  color2?: string;
  nombre?: string;
  nombre2?: string;
  onElegir?: (clave: string) => void;
  alto?: number;
}

/** Serie de tiempo con área bajo la línea. */
export const GraficoLinea: React.FC<LineaProps> = ({
  datos, formato, color = '#004F9F', color2 = '#059669',
  nombre = 'Ingresos', nombre2, onElegir, alto = 220,
}) => {
  const id = useId();
  const [activo, setActivo] = useState<number | null>(null);

  const { puntos, puntos2, max, escalaY } = useMemo(() => {
    const valores = datos.flatMap((d) => [d.valor, d.valor2 ?? 0]);
    const maximo = Math.max(1, ...valores);
    const x = (i: number) => (datos.length === 1 ? 50 : (i / (datos.length - 1)) * 100);
    const y = (v: number) => 100 - (v / maximo) * 92 - 4;
    return {
      max: maximo,
      escalaY: y,
      puntos: datos.map((d, i) => ({ x: x(i), y: y(d.valor), d })),
      puntos2: datos.map((d, i) => ({ x: x(i), y: y(d.valor2 ?? 0), d })),
    };
  }, [datos]);

  if (datos.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">Sin datos en este periodo.</p>;
  }

  const trazo = (ps: typeof puntos) =>
    ps.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${trazo(puntos)} L 100 100 L 0 100 Z`;
  const hayDos = datos.some((d) => d.valor2 !== null && d.valor2 !== undefined);

  return (
    <div>
      <div className="relative" style={{ height: alto }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
          role="img"
          aria-label={`${nombre} por periodo`}
        >
          <defs>
            <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Rejilla de cuatro líneas. */}
          {[0, 25, 50, 75, 100].map((p) => (
            <line
              key={p} x1="0" x2="100" y1={escalaY((max * p) / 100)} y2={escalaY((max * p) / 100)}
              stroke="#e2e8f0" strokeWidth="0.3" vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill={`url(#g-${id})`} />
          <path
            d={trazo(puntos)} fill="none" stroke={color} strokeWidth="2"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
          />
          {hayDos && (
            <path
              d={trazo(puntos2)} fill="none" stroke={color2} strokeWidth="2"
              strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round"
            />
          )}

        </svg>

        {/* Marcadores en HTML: con preserveAspectRatio="none" un <circle> saldría como elipse. */}
        {puntos.map((p, i) => (
          <span
            key={p.d.clave}
            className="absolute rounded-full bg-white pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: activo === i ? 11 : 8,
              height: activo === i ? 11 : 8,
              transform: 'translate(-50%, -50%)',
              border: `2px solid ${color}`,
              transition: 'width .12s, height .12s',
            }}
          />
        ))}

        {/* Zona de interacción por punto, a toda la altura. */}
        <div className="absolute inset-0 flex">
          {datos.map((p, i) => (
            <button
              key={p.clave}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(i)}
              onBlur={() => setActivo(null)}
              onClick={() => onElegir?.(p.clave)}
              className="flex-1 h-full focus:outline-none focus:bg-slate-900/5"
              aria-label={`${p.etiqueta}: ${formato(p.valor)}`}
            />
          ))}
        </div>

        {activo !== null && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg z-10"
            style={{
              left: `${puntos[activo].x}%`,
              top: `${puntos[activo].y}%`,
              marginTop: -8,
            }}
          >
            <span className="font-bold block capitalize">{datos[activo].etiqueta}</span>
            <span className="tabular-nums">{nombre}: {formato(datos[activo].valor)}</span>
            {hayDos && datos[activo].valor2 !== null && datos[activo].valor2 !== undefined && (
              <span className="tabular-nums block">
                {nombre2}: {formato(datos[activo].valor2!)}
              </span>
            )}
          </div>
        )}
      </div>

      {hayDos && (
        <div className="flex flex-wrap gap-4 mt-2 text-[11px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ background: color }} /> {nombre}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-4 h-0.5 rounded"
              style={{ background: `repeating-linear-gradient(90deg, ${color2} 0 4px, transparent 4px 7px)` }}
            />
            {nombre2}
          </span>
        </div>
      )}
    </div>
  );
};

export interface SerieAnual {
  anio: number;
  /** 12 posiciones, enero a diciembre. `null` = mes sin ventas. */
  meses: Array<number | null>;
}

const ETIQUETAS_MES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const PALETA_ANIOS = ['#004F9F', '#F5A623', '#059669', '#DC2626', '#7C3AED'];

/** Estacionalidad: un año por línea, sobre el mismo eje enero-diciembre. */
export const GraficoAnios: React.FC<{
  series: SerieAnual[];
  formato: (n: number) => string;
}> = ({ series, formato }) => {
  const [activo, setActivo] = useState<{ anio: number; mes: number } | null>(null);

  const max = Math.max(
    1,
    ...series.flatMap((s) => s.meses.filter((v): v is number => v !== null)),
  );
  const x = (m: number) => (m / 11) * 100;
  const y = (v: number) => 100 - (v / max) * 92 - 4;

  if (series.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">Sin datos.</p>;
  }

  return (
    <div>
      <div className="relative h-56">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full" role="img"
          aria-label="Comparación de años mes a mes">
          {[0, 25, 50, 75, 100].map((p) => (
            <line key={p} x1="0" x2="100" y1={y((max * p) / 100)} y2={y((max * p) / 100)}
              stroke="#e2e8f0" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
          ))}

          {series.map((s, si) => {
            // Un mes sin ventas corta la línea en vez de dibujar un cero.
            const tramos: string[] = [];
            let actual = '';
            s.meses.forEach((v, m) => {
              if (v === null) { if (actual) { tramos.push(actual); actual = ''; } return; }
              actual += `${actual ? 'L' : 'M'} ${x(m)} ${y(v)} `;
            });
            if (actual) tramos.push(actual);

            return (
              <g key={s.anio}>
                {tramos.map((t, i) => (
                  <path key={i} d={t} fill="none"
                    stroke={PALETA_ANIOS[si % PALETA_ANIOS.length]} strokeWidth="2"
                    vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Marcadores en HTML, como en el gráfico de línea. */}
        {series.map((s, si) =>
          s.meses.map((v, m) =>
            v === null ? null : (
              <span
                key={`${s.anio}-${m}`}
                onMouseEnter={() => setActivo({ anio: s.anio, mes: m })}
                onMouseLeave={() => setActivo(null)}
                className="absolute rounded-full bg-white cursor-pointer"
                style={{
                  left: `${x(m)}%`,
                  top: `${y(v)}%`,
                  width: 8,
                  height: 8,
                  transform: 'translate(-50%, -50%)',
                  border: `2px solid ${PALETA_ANIOS[si % PALETA_ANIOS.length]}`,
                }}
              />
            ),
          ),
        )}

        {activo && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg z-10"
            style={{ left: `${x(activo.mes)}%`, top: `${y(series.find((s) => s.anio === activo.anio)!.meses[activo.mes]!)}%`, marginTop: -8 }}
          >
            <span className="font-bold block">{activo.anio}</span>
            <span className="tabular-nums">
              {formato(series.find((s) => s.anio === activo.anio)!.meses[activo.mes]!)}
            </span>
          </div>
        )}
      </div>

      <div className="flex mt-1.5">
        {ETIQUETAS_MES.map((m, i) => (
          <span key={i} className="flex-1 text-center text-[10px] font-bold text-slate-400">
            {m}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 mt-3 text-[11px] font-bold text-slate-600">
        {series.map((s, i) => (
          <span key={s.anio} className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="w-4 h-0.5 rounded"
              style={{ background: PALETA_ANIOS[i % PALETA_ANIOS.length] }} />
            {s.anio}
          </span>
        ))}
      </div>
    </div>
  );
};

export interface PuntoDispersion {
  etiqueta: string;
  x: number;
  y: number;
  peso: number;
}

/** Margen contra volumen; las medianas separan cuadrantes (abajo-derecha: mucha venta, poco margen). */
export const GraficoDispersion: React.FC<{
  datos: PuntoDispersion[];
  ejeX: string;
  ejeY: string;
  formatoPeso: (n: number) => string;
}> = ({ datos, ejeX, ejeY, formatoPeso }) => {
  const [activo, setActivo] = useState<number | null>(null);

  if (datos.length < 2) {
    return (
      <p className="text-sm text-slate-400 text-center py-10">
        Hacen falta al menos dos productos vendidos para comparar.
      </p>
    );
  }

  const maxX = Math.max(1, ...datos.map((d) => d.x));
  const maxPeso = Math.max(1, ...datos.map((d) => d.peso));

  // El eje de margen usa el rango real ±10 %, no cero: anclado en cero los puntos se apilan.
  const ys = datos.map((d) => d.y);
  const crudoMin = Math.min(...ys);
  const crudoMax = Math.max(...ys);
  const holgura = Math.max(1, (crudoMax - crudoMin) * 0.15);
  const minY = crudoMin - holgura;
  const maxY = crudoMax + holgura;

  const mediana = (xs: number[]) => {
    const o = [...xs].sort((a, b) => a - b);
    const m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  };
  const medX = mediana(datos.map((d) => d.x));
  const medY = mediana(datos.map((d) => d.y));

  const px = (v: number) => 6 + (v / maxX) * 88;
  const py = (v: number) => 94 - ((v - minY) / (maxY - minY || 1)) * 88;

  return (
    <div>
      <div className="relative h-64">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full" role="img"
          aria-label={`${ejeY} contra ${ejeX}`}>
          <line x1={px(medX)} x2={px(medX)} y1="2" y2="98"
            stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <line x1="2" x2="98" y1={py(medY)} y2={py(medY)}
            stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />

        </svg>

        {/* Burbujas en HTML para que el lienzo estirado no las deforme. */}
        {datos.map((d, i) => {
          const lado = 10 + (d.peso / maxPeso) * 22;
          return (
            <span
              key={d.etiqueta}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
              className="absolute rounded-full cursor-pointer border-2 border-white"
              style={{
                left: `${px(d.x)}%`,
                top: `${py(d.y)}%`,
                width: lado,
                height: lado,
                transform: 'translate(-50%, -50%)',
                background: d.y >= medY ? '#059669' : '#DC2626',
                opacity: activo === i ? 0.95 : 0.6,
              }}
            />
          );
        })}

        {activo !== null && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg z-10 max-w-[16rem]"
            style={{ left: `${px(datos[activo].x)}%`, top: `${py(datos[activo].y)}%`, marginTop: -10 }}
          >
            <span className="font-bold block">{datos[activo].etiqueta}</span>
            <span className="tabular-nums block">{ejeX}: {datos[activo].x}</span>
            <span className="tabular-nums block">{ejeY}: {datos[activo].y} %</span>
            <span className="tabular-nums block text-white/70">
              {formatoPeso(datos[activo].peso)}
            </span>
          </div>
        )}

        <span className="absolute left-1 top-0 text-[10px] font-bold text-slate-400">
          {ejeY} {Math.round(maxY)} %
        </span>
        <span className="absolute left-1 bottom-0 text-[10px] font-bold text-slate-400">
          {ejeY} {Math.round(minY)} %
        </span>
        <span className="absolute right-1 bottom-0 text-[10px] font-bold text-slate-400">
          {ejeX} · hasta {maxX}
        </span>
      </div>

      <p className="text-[10px] text-slate-400 mt-2">
        El eje del margen no empieza en cero: se ajusta al rango real para que
        las diferencias entre productos se puedan ver.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] leading-relaxed">
        <p className="text-emerald-700 font-medium">
          <strong>Arriba:</strong> dejan más margen que la mitad del catálogo.
        </p>
        <p className="text-rose-700 font-medium">
          <strong>Abajo y a la derecha:</strong> mucho volumen y poco margen. Son los candidatos a
          revisar el precio o el costo de compra.
        </p>
      </div>
    </div>
  );
};

/** Composición: barra 100 % apilada. */
export const BarraComposicion: React.FC<{
  partes: Array<{ etiqueta: string; valor: number }>;
  formato: (n: number) => string;
}> = ({ partes, formato }) => {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return null;

  const colores = ['#004F9F', '#0068d4', '#3B92E8', '#F5A623', '#059669', '#DC2626', '#7C3AED', '#94a3b8'];

  return (
    <div>
      <div className="flex h-7 rounded-lg overflow-hidden border border-slate-200">
        {partes.map((p, i) => (
          <div
            key={p.etiqueta}
            title={`${p.etiqueta}: ${formato(p.valor)} (${Math.round((p.valor / total) * 100)} %)`}
            style={{ width: `${(p.valor / total) * 100}%`, background: colores[i % colores.length] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px]">
        {partes.map((p, i) => (
          <span key={p.etiqueta} className="inline-flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: colores[i % colores.length] }} />
            <span className="truncate max-w-[14rem]">{p.etiqueta}</span>
            <span className="tabular-nums font-bold text-slate-800">
              {Math.round((p.valor / total) * 100)} %
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};
