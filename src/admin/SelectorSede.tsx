import React, { useEffect, useRef, useState } from 'react';
import { Store, Check, ChevronDown, Lock, Loader2 } from 'lucide-react';
import { useSedes } from './SedeContext';

/**
 * Selector de sede del portal interno, al estilo del selector de compañías de
 * Odoo: se pueden activar varias a la vez.
 *
 * Por qué varias y no una: un jefe regional necesita ver Medellín e Itagüí
 * juntas para decidir un traslado; obligarlo a alternar entre las dos le
 * esconde justo la comparación que necesita.
 *
 * Lo que ofrece son SOLO las sedes permitidas por el servidor. Y aunque
 * alguien manipule esta lista, RLS sigue negando lo que no tiene asignado: el
 * selector acota la vista, no el acceso.
 */
interface Props {
  /**
   * 'lateral' — barra de navegación de un módulo (ancho completo).
   * 'barra'   — cabecera del lanzador de aplicaciones (compacto).
   * Es el MISMO selector en los dos sitios a propósito: si el lanzador tuviera
   * uno distinto, la sede elegida allí podría no ser la que se aplica dentro.
   */
  variante?: 'lateral' | 'barra';
}

export const SelectorSede: React.FC<Props> = ({ variante = 'lateral' }) => {
  const {
    permitidas, activas, restringido, cargando, alternar, soloEsta, activarTodas,
  } = useSedes();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const esBarra = variante === 'barra';

  if (cargando) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-blue-200/70">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando sedes…
      </div>
    );
  }

  // Sin sedes permitidas no hay nada que elegir, y decirlo es mejor que
  // mostrar un desplegable vacío: significa que le quitaron todas las sedes.
  if (permitidas.length === 0) {
    return (
      <div className={`px-2.5 py-2 rounded-lg bg-rose-500/15 border border-rose-400/30 ${
        esBarra ? '' : 'mx-3 my-2'
      }`}>
        <p className="text-[11px] font-bold text-rose-100 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Sin sedes asignadas
        </p>
        <p className="text-[10px] text-rose-200/80 leading-snug mt-0.5">
          Pídele al administrador que te asigne al menos una sede.
        </p>
      </div>
    );
  }

  const todas = activas.length === permitidas.length;
  const etiqueta = todas
    ? `Todas las sedes (${permitidas.length})`
    : activas.length === 1
      ? permitidas.find((s) => s.id === activas[0])?.nombre ?? '1 sede'
      : `${activas.length} sedes`;

  return (
    <div
      ref={caja}
      className={`relative ${esBarra ? 'w-52 sm:w-64 shrink-0' : 'mx-3 my-2'}`}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/10 border border-white/15
                   hover:bg-white/15 transition-colors text-left cursor-pointer"
        aria-expanded={abierto}
      >
        <Store className="w-4 h-4 text-yellow-400 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[9px] uppercase tracking-wider text-blue-200/70 font-bold leading-none">
            Sede activa
          </span>
          <span className="block text-[11px] font-bold text-white truncate mt-0.5">
            {etiqueta}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-blue-200/70 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <div className={`absolute top-full mt-1 z-50 bg-white rounded-lg shadow-2xl
                        border border-slate-200 overflow-hidden ${
          esBarra ? 'right-0 w-72' : 'left-0 right-0'
        }`}>
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {restringido ? 'Tus sedes' : 'Sedes'}
            </span>
            {!todas && (
              <button
                onClick={activarTodas}
                className="text-[10px] font-bold text-[#004F9F] hover:underline cursor-pointer"
              >
                Ver todas
              </button>
            )}
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {permitidas.map((s) => {
              const activa = activas.includes(s.id);
              return (
                <li key={s.id} className="flex items-stretch">
                  {/* Marcar y desmarcar suma sedes a la vista, como en Odoo. */}
                  <button
                    onClick={() => alternar(s.id)}
                    className="flex-1 min-w-0 flex items-start gap-2 px-3 py-2 text-left
                               hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span
                      className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${
                        activa
                          ? 'bg-[#004F9F] border-[#004F9F]'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      {activa && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-800 truncate">
                        {s.nombre}
                      </span>
                      <span className="block text-[10px] text-slate-500 truncate">
                        {s.ciudad}
                      </span>
                    </span>
                  </button>
                  {/* Atajo para aislar una sola, que es el caso frecuente. */}
                  <button
                    onClick={() => { soloEsta(s.id); setAbierto(false); }}
                    className="px-2.5 text-[10px] font-bold text-slate-400 hover:text-[#004F9F]
                               hover:bg-slate-50 transition-colors cursor-pointer"
                    title={`Ver solo ${s.nombre}`}
                  >
                    solo
                  </button>
                </li>
              );
            })}
          </ul>

          {!restringido && (
            <p className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-500 leading-snug">
              Tu cuenta no está restringida: ves las {permitidas.length} sedes.
              El administrador puede acotarla desde Usuarios.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
