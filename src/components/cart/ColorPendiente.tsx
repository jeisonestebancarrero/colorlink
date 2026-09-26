import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import type { CartItem } from '../../types';
import { SelectorColor } from '../tienda/SelectorColor';

/**
 * Pintura sin color o con un color que ya no se ofrece: la base no deja crear el pedido así,
 * por eso se pide aquí mismo (o que se quite la línea).
 */
export const ColorPendienteLinea: React.FC<{ item: CartItem }> = ({ item }) => {
  const { lineasSinColor, coloresDeLinea, elegirColorLinea } = useCart();
  if (!lineasSinColor.some((l) => l.id === item.id)) return null;
  return (
    <div className="mt-1.5">
      <SelectorColor
        colores={coloresDeLinea(item)}
        valor={null}
        onElegir={(codigo) => void elegirColorLinea(item.id, codigo)}
        etiqueta={item.colorCode ? `${item.colorName ?? 'Ese color'} ya no se ofrece: elige otro` : 'Falta el color'}
        faltante
        compacto
      />
    </div>
  );
};

/** Aviso general encima de las acciones mientras haya líneas sin color. */
export const AvisoColoresPendientes: React.FC = () => {
  const { lineasSinColor } = useCart();
  if (lineasSinColor.length === 0) return null;
  return (
    <div role="alert" className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2 text-[11px] text-red-800">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>
        {lineasSinColor.length === 1
          ? `Elige un color disponible para «${lineasSinColor[0].productName}» o quítalo para poder confirmar el pedido.`
          : `Hay ${lineasSinColor.length} pinturas sin un color disponible. Elige su color o quítalas para poder confirmar el pedido.`}
      </span>
    </div>
  );
};
