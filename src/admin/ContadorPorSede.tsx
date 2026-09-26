import React, { useMemo } from 'react';
import { Store, Layers } from 'lucide-react';
import { useSedes } from './SedeContext';
import { imagenPunto } from '../assets/puntosVenta';

/**
 * Con varias sedes activas, una tarjeta de conteo por sede (con una sola no se muestra).
 * Pulsar una tarjeta aísla esa sede solo en la pantalla actual.
 */

/** Fila con sede. */
export interface FilaConSede {
  locationId: string | null;
}

interface Props {
  /** Filas de la selección global, antes del aislamiento local; si no, las otras sedes darían 0. */
  filas: readonly FilaConSede[];
  /** En plural: "facturas", "pedidos". */
  sustantivo: string;
  /** Etiqueta de filas sin sede (egresos, visitas), que existen a propósito. */
  etiquetaSinSede?: string;
  /** Sede aislada en esta pantalla; `null` = todas las activas. */
  sedeAislada: string | null;
  /** Alterna el aislamiento local sin tocar la sede activa del portal. */
  onAislar: (locationId: string | null) => void;
}

export const ContadorPorSede: React.FC<Props> = ({
  filas, sustantivo, etiquetaSinSede = 'Sin sede', sedeAislada, onAislar,
}) => {
  const { permitidas, activas } = useSedes();

  const conteos = useMemo(() => {
    const m = new Map<string, number>();
    let sinSede = 0;
    for (const f of filas) {
      if (!f.locationId) { sinSede += 1; continue; }
      m.set(f.locationId, (m.get(f.locationId) ?? 0) + 1);
    }
    return { porSede: m, sinSede };
  }, [filas]);

  if (activas.length < 2) return null;

  const visibles = permitidas.filter((s) => activas.includes(s.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          {sustantivo} por sede
        </p>
        <button
          onClick={() => onAislar(null)}
          className={`text-[10px] font-bold cursor-pointer ${
            sedeAislada
              ? 'text-[#004F9F] hover:underline'
              : 'text-slate-400 cursor-default'
          }`}
          disabled={!sedeAislada}
        >
          Todas ({filas.length})
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {visibles.map((s) => {
          return (
            <button
              key={s.id}
              // Aislamiento local; `soloEsta` del selector cambiaría todo el portal.
              onClick={() => onAislar(sedeAislada === s.id ? null : s.id)}
              title={sedeAislada === s.id
                ? `Quitar el filtro de ${s.nombre}`
                : `Ver solo ${s.nombre} en esta pantalla`}
              className={`relative overflow-hidden text-left rounded-xl px-3.5 py-2.5
                          transition-all cursor-pointer border ${
                sedeAislada === s.id
                  ? 'border-[#004F9F] ring-1 ring-[#004F9F] shadow-2xs'
                  : 'border-slate-200 hover:border-[#004F9F] hover:shadow-2xs'
              }`}
            >
              {/* Foto del punto (`imagenPunto`) atenuada como fondo, para que la cifra domine. */}
              {(() => {
                const img = imagenPunto(s.externalRef, s.imageUrl);
                return (
                  <>
                    <img
                      src={img.src}
                      alt=""
                      aria-hidden
                      className={`absolute inset-0 w-full h-full pointer-events-none select-none ${
                        // El respaldo es un logotipo: se centra en vez de recortarlo.
                        img.esFoto ? 'object-cover' : 'object-contain p-4'
                      }`}
                    />
                    <div
                      aria-hidden
                      className={`absolute inset-0 pointer-events-none ${
                        sedeAislada === s.id
                          ? 'bg-gradient-to-br from-blue-50/92 via-white/88 to-blue-50/80'
                          : 'bg-gradient-to-br from-white/94 via-white/90 to-white/82'
                      }`}
                    />
                  </>
                );
              })()}

              <span className="relative block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600
                                 flex items-center gap-1 truncate">
                  <Store className="w-3 h-3 text-[#004F9F]/70 shrink-0" />
                  <span className="truncate">{s.ciudad || s.nombre}</span>
                </span>
                <span className={`block text-xl font-extrabold mt-0.5 ${
                  (conteos.porSede.get(s.id) ?? 0) === 0 ? 'text-slate-400' : 'text-[#004F9F]'
                }`}>
                  {conteos.porSede.get(s.id) ?? 0}
                </span>
                <span className="block text-[10px] text-slate-500 truncate leading-tight">
                  {s.nombre}
                </span>
              </span>
            </button>
          );
        })}

        {/* Filas sin sede aparte, para que la suma cuadre con el total. */}
        {conteos.sinSede > 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl px-3.5 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {etiquetaSinSede}
            </p>
            <p className="text-xl font-extrabold text-slate-400 mt-0.5">
              {conteos.sinSede}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight">
              No pertenecen a una tienda
            </p>
          </div>
        )}
      </div>

      {sedeAislada && (
        <p className="text-[10px] text-slate-500">
          Filtrando solo esta pantalla. La sede activa del portal no cambió.
        </p>
      )}
    </div>
  );
};

/**
 * Aislamiento de sede local a una pantalla, distinto de la sede activa del portal.
 * `filtroEfectivo` es la intersección y nunca sale de las sedes activas.
 */
export function useAislamientoDeSede(): {
  sedeAislada: string | null;
  aislar: (locationId: string | null) => void;
  /** Global ∩ local: lo que el módulo usa para filtrar. */
  filtroEfectivo: string[] | null;
} {
  const { filtroSedes, activas } = useSedes();
  const [sedeAislada, setSedeAislada] = React.useState<string | null>(null);

  // Si la sede aislada deja de estar activa, se anula el aislamiento.
  React.useEffect(() => {
    if (sedeAislada && !activas.includes(sedeAislada)) setSedeAislada(null);
  }, [sedeAislada, activas]);

  return {
    sedeAislada,
    aislar: setSedeAislada,
    filtroEfectivo: sedeAislada ? [sedeAislada] : filtroSedes,
  };
}

/**
 * ¿La fila entra en la selección? `null` = todas; las filas sin sede entran siempre.
 * Sin genéricos: sin `strictNullChecks` la restricción degenera y la fila pierde sus campos.
 */
export function sedeVisible(
  locationId: string | null | undefined,
  filtroSedes: string[] | null
): boolean {
  if (!filtroSedes) return true;
  if (!locationId) return true;
  return filtroSedes.includes(locationId);
}
