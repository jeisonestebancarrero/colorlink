import React from 'react';
import type { StoreProduct } from '../../types';

export type ColorDeProducto = NonNullable<StoreProduct['availableColors']>[number];

interface SelectorColorProps {
  colores: ColorDeProducto[];
  /** Código del color elegido; null mientras no se elija (nunca se preselecciona). */
  valor: string | null;
  onElegir: (codigo: string) => void;
  /** Texto de la etiqueta; por defecto «Color». */
  etiqueta?: string;
  /** Marca en rojo que falta elegir. */
  faltante?: boolean;
  compacto?: boolean;
}

/** Carta de colores de un producto. Solo muestra los colores que ese producto ofrece. */
export const SelectorColor: React.FC<SelectorColorProps> = ({
  colores, valor, onElegir, etiqueta = 'Color', faltante = false, compacto = false,
}) => {
  const elegido = colores.find((c) => c.code === valor);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-slate-800">{etiqueta}:</span>
        <span className={elegido ? 'font-semibold text-slate-600' : faltante ? 'font-bold text-red-600' : 'text-slate-500'}>
          {elegido ? `${elegido.name} (${elegido.code})` : 'Elige un color'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={etiqueta}>
        {colores.map((c) => {
          const activo = c.code === valor;
          return (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={activo}
              title={`${c.name} (${c.code})`}
              onClick={() => onElegir(c.code)}
              className={`flex items-center gap-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                compacto ? 'px-1.5 py-1' : 'px-2.5 py-1'
              } ${
                activo
                  ? 'border-[#004F9F] bg-blue-50 text-[#004F9F] font-bold ring-1 ring-blue-600'
                  : faltante
                    ? 'border-red-300 bg-white hover:bg-red-50 text-slate-700'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                style={{ backgroundColor: c.hex }}
              />
              {!compacto && <span>{c.name}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
