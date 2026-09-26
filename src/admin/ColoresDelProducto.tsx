import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Palette, Search, X } from 'lucide-react';
import {
  catalogoService, FAMILIAS_COLOR,
  type ColorCatalogo, type ColorDeProducto,
} from '../services/catalogoAdmin';
import { Button } from '../components/common/Button';

interface Props {
  productId: string;
  /** Carta completa de colores. */
  carta: ColorCatalogo[];
  actuales: ColorDeProducto[];
  escribe: boolean;
  onGuardado: () => Promise<void> | void;
}

/** Muestra de color pequeña; el borde deja ver los blancos sobre fondo blanco. */
export const MuestraColor: React.FC<{ hex: string; className?: string }> = ({ hex, className }) => (
  <span
    aria-hidden
    className={`inline-block rounded-md border border-slate-300 shrink-0 ${className ?? 'w-5 h-5'}`}
    style={{ backgroundColor: hex }}
  />
);

/**
 * «Colores que ofrece»: qué colores de la carta se venden en este producto.
 * El orden de la lista es el de la tienda; sin colores, el producto se vende sin color.
 */
export const ColoresDelProducto: React.FC<Props> = ({ productId, carta, actuales, escribe, onGuardado }) => {
  const [seleccion, setSeleccion] = useState<string[]>(actuales.map((c) => c.id));
  const [busqueda, setBusqueda] = useState('');
  const [familia, setFamilia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  // Al recargar el catálogo tras guardar, la selección vuelve a la de la base.
  const firmaActual = actuales.map((c) => c.id).join(',');
  useEffect(() => { setSeleccion(firmaActual ? firmaActual.split(',') : []); }, [firmaActual]);

  const porId = useMemo(() => {
    const m = new Map<string, { id: string; codigo: string; nombre: string; hex: string; familia?: string }>();
    for (const c of actuales) m.set(c.id, c);
    for (const c of carta) m.set(c.id, c);
    return m;
  }, [carta, actuales]);

  const familias = useMemo(() => {
    const deLaCarta = new Set(carta.map((c) => c.familia).filter(Boolean));
    return [...FAMILIAS_COLOR.filter((f) => deLaCarta.has(f)), ...[...deLaCarta].filter((f) => !(FAMILIAS_COLOR as readonly string[]).includes(f))];
  }, [carta]);

  const disponibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return carta.filter(
      (c) =>
        c.estado === 'ACTIVO' &&
        (!familia || c.familia === familia) &&
        (!q || c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q)),
    );
  }, [carta, busqueda, familia]);

  const cambiado = seleccion.join(',') !== firmaActual;

  const alternar = (id: string) => {
    setAviso('');
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const mover = (i: number, delta: number) => {
    setSeleccion((s) => {
      const j = i + delta;
      if (j < 0 || j >= s.length) return s;
      const copia = [...s];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  };

  const guardar = async () => {
    setError('');
    setAviso('');
    setGuardando(true);
    try {
      await catalogoService.definirColores(productId, seleccion);
      setAviso(
        seleccion.length
          ? `Listo: el producto se ofrece en ${seleccion.length} ${seleccion.length === 1 ? 'color' : 'colores'}.`
          : 'Listo: el producto se vende sin color.',
      );
      await onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar los colores.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Palette className="w-4 h-4 text-slate-400" /> Colores que ofrece
        </h3>
        <span className="text-xs font-semibold text-slate-500">
          {seleccion.length === 0 ? 'Sin colores' : `${seleccion.length} ${seleccion.length === 1 ? 'color' : 'colores'}`}
        </span>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Si eliges colores, cada recepción, movimiento y venta de este producto exige uno de
          ellos. Un producto <strong>sin colores</strong> se vende sin color, como las brochas y
          los rodillos.
        </p>

        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}
        {aviso && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">
            {aviso}
          </div>
        )}

        {/* Seleccionados, en el orden en que los verá el cliente */}
        {seleccion.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Este producto se vende sin color.</p>
        ) : (
          <ol className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {seleccion.map((id, i) => {
              const c = porId.get(id);
              return (
                <li key={id} className="flex items-center gap-3 px-3 py-2">
                  <span className="text-[11px] font-bold text-slate-400 w-5 text-right tabular-nums">{i + 1}</span>
                  <MuestraColor hex={c?.hex ?? '#ffffff'} />
                  <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">
                    {c?.nombre ?? 'Color'} <span className="text-xs text-slate-400">{c?.codigo}</span>
                  </span>
                  {escribe && (
                    <span className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => mover(i, -1)}
                        disabled={i === 0}
                        aria-label={`Subir ${c?.nombre ?? 'color'}`}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => mover(i, 1)}
                        disabled={i === seleccion.length - 1}
                        aria-label={`Bajar ${c?.nombre ?? 'color'}`}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => alternar(id)}
                        aria-label={`Quitar ${c?.nombre ?? 'color'}`}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {escribe && (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o código…"
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
                />
              </div>
              <select
                value={familia}
                onChange={(e) => setFamilia(e.target.value)}
                aria-label="Familia de color"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20"
              >
                <option value="">Todas las familias</option>
                {familias.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-80 overflow-y-auto pr-1">
              {disponibles.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 col-span-full text-center">Ningún color coincide.</p>
              ) : (
                disponibles.map((c) => {
                  const elegido = seleccion.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternar(c.id)}
                      aria-pressed={elegido}
                      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                        elegido ? 'border-[#004F9F] bg-[#004F9F]/5' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <MuestraColor hex={c.hex} className="w-6 h-6" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-slate-800 truncate">{c.nombre}</span>
                        <span className="block text-[10px] text-slate-400 truncate">{c.codigo} · {c.familia}</span>
                      </span>
                      {elegido && <Check className="w-4 h-4 text-[#004F9F] shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {cambiado && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSeleccion(firmaActual ? firmaActual.split(',') : []); setError(''); }}>
                  Descartar
                </Button>
              )}
              <Button type="button" variant="pintuco" size="sm" isLoading={guardando} disabled={!cambiado} onClick={() => void guardar()}>
                Guardar colores
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
