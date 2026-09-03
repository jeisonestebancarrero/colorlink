import React, { useMemo } from 'react';
import { Store, Layers } from 'lucide-react';
import { useSedes } from './SedeContext';
import { imagenPunto } from '../assets/puntosVenta';

/**
 * Cuando hay VARIAS sedes activas, muestra una tarjeta por sede con su
 * contador, para poder verlas por separado sin perder el total.
 *
 * Por qué existe: con dos o más sedes activas, un "TOTAL: 47" no dice nada
 * útil —¿47 repartidas cómo?—. La comparación entre sedes es justo la
 * información que se busca al activar varias.
 *
 * Con UNA sola sede activa no se muestra: sería una tarjeta repitiendo el
 * total que ya está arriba.
 *
 * Al pulsar una tarjeta se aísla esa sede (equivale al «solo» del selector de
 * la cabecera), y «Todas» vuelve a la vista completa. Es el mismo estado del
 * selector, no uno propio: dos selecciones distintas de sede en la misma
 * pantalla sería mentirle a quien la mira.
 */

/** Cualquier fila que sepa a qué sede pertenece. */
export interface FilaConSede {
  locationId: string | null;
}

interface Props {
  /**
   * Filas acotadas por la selección GLOBAL, sin aplicar el aislamiento local.
   *
   * Tiene que ser la lista previa al aislamiento: si se pasara la lista ya
   * filtrada, al entrar a una sede las demás tarjetas mostrarían 0 y se
   * perdería justo la comparación que el contador viene a dar.
   */
  filas: readonly FilaConSede[];
  /** Etiqueta del conteo, en plural: "facturas", "pedidos", "movimientos". */
  sustantivo: string;
  /**
   * Etiqueta para las filas sin sede. Existen a propósito: un egreso de
   * tesorería o una visita no pertenecen a una tienda.
   */
  etiquetaSinSede?: string;
  /** Sede aislada EN ESTA PANTALLA. `null` = se ven todas las activas. */
  sedeAislada: string | null;
  /** Alterna el aislamiento local. No toca la sede activa del portal. */
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

  // Con una sola sede activa esto no aporta nada sobre el total de arriba.
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
              // Alterna el aislamiento SOLO de esta pantalla. Antes llamaba a
              // `soloEsta` del selector y cambiaba la sede activa de todo el
              // portal: entrar a ver las facturas de Barranquilla dejaba el
              // resto de los módulos acotados a Barranquilla sin pedirlo.
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
              {/* La foto del punto de venta como fondo de la tarjeta.
                  Es la MISMA imagen que ya usa la pantalla de Puntos de venta
                  (`imagenPunto`), así que Medellín se reconoce por su skyline
                  y Barranquilla por la Ventana al Mundo sin leer la etiqueta.
                  Atenuada y con un velo blanco encima: la cifra es lo que se
                  viene a leer y tiene que ganarle a la imagen siempre. */}
              {(() => {
                const img = imagenPunto(s.externalRef, s.imageUrl);
                return (
                  <>
                    <img
                      src={img.src}
                      alt=""
                      aria-hidden
                      className={`absolute inset-0 w-full h-full pointer-events-none select-none ${
                        // El fondo de marca es un logotipo: recortarlo lo
                        // estropea, así que se centra en lugar de cubrir.
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

        {/* Las filas sin sede se muestran aparte y solo si hay: esconderlas
            haría que la suma de las tarjetas no diera el total. */}
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
 * Aislamiento de sede DENTRO de una pantalla.
 *
 * Separa dos cosas que se estaban confundiendo:
 *   * la SEDE ACTIVA del selector de la cabecera, que acota todo el portal;
 *   * el AISLAMIENTO local, que acota solo la pantalla en la que se está.
 *
 * Entrar a ver las facturas de Barranquilla no puede dejar el inventario y los
 * pedidos acotados a Barranquilla sin haberlo pedido. `filtroEfectivo` es la
 * intersección: nunca deja ver una sede fuera de las activas.
 */
export function useAislamientoDeSede(): {
  sedeAislada: string | null;
  aislar: (locationId: string | null) => void;
  /** Global ∩ local. Es lo que el módulo debe usar para filtrar sus filas. */
  filtroEfectivo: string[] | null;
} {
  const { filtroSedes, activas } = useSedes();
  const [sedeAislada, setSedeAislada] = React.useState<string | null>(null);

  // Si dejan de estar activas la sede aislada, el aislamiento se cae solo:
  // mantenerlo mostraría una pantalla vacía sin explicación.
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
 * Acota una lista a las sedes activas.
 *
 * Se usa en los módulos junto con `ContadorPorSede`: el contador cuenta sobre
 * lo YA acotado por RLS, y este filtro aplica la selección de pantalla.
 *
 * `null` en `filtroSedes` significa "todas activas": no se filtra nada. Las
 * filas SIN sede se conservan siempre, porque no pertenecen a ninguna y
 * esconderlas al elegir una sede las haría desaparecer sin explicación.
 */
/**
 * ¿Esta fila entra en la selección de pantalla?
 *
 * Sin genéricos a propósito. Este proyecto compila SIN `strictNullChecks`
 * (ver tsconfig.json), así que `string | null` colapsa a `string` y una
 * restricción del tipo `<T extends { locationId: string | null }>` degenera:
 * TypeScript infiere `T` desde la restricción y la fila pierde todos sus
 * campos. Con esta forma, el `.filter()` del llamante conserva su tipo y no
 * hay nada que inferir.
 *
 * Las filas SIN sede entran siempre: no pertenecen a ninguna, y esconderlas al
 * elegir una sede las haría desaparecer sin explicación.
 *
 *   const visibles = facturas.filter((f) => sedeVisible(f.locationId, filtroSedes));
 */
export function sedeVisible(
  locationId: string | null | undefined,
  filtroSedes: string[] | null
): boolean {
  if (!filtroSedes) return true;
  if (!locationId) return true;
  return filtroSedes.includes(locationId);
}
