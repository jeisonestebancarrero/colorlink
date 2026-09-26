import React, { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useCart } from '../../context/CartContext';
import type { StoreProduct } from '../../types';
import { SelectorColor, type ColorDeProducto } from './SelectorColor';

interface ComprarProductoModalProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Productos entre los que elegir; con uno solo no se muestra el selector de producto. */
  productos: StoreProduct[];
  /** Color ya decidido (p. ej. desde «Encuentra tu color»): no se vuelve a pedir. */
  colorFijo?: ColorDeProducto;
  presentacionInicial?: string;
  titulo?: string;
}

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

/**
 * Compra rápida sin abrir la ficha completa: producto, presentación, color y cantidad.
 * Una pintura con carta no se agrega sin color porque la base rechazaría el pedido.
 */
export const ComprarProductoModal: React.FC<ComprarProductoModalProps> = ({
  abierto, onCerrar, productos, colorFijo, presentacionInicial, titulo,
}) => {
  const { addToCart } = useCart();
  const [productoId, setProductoId] = useState<string>('');
  const [presentacion, setPresentacion] = useState<string>('');
  const [color, setColor] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [intentoSinColor, setIntentoSinColor] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const producto = productos.find((p) => p.id === productoId) ?? productos[0];

  // Cada apertura arranca limpia, sin color preseleccionado.
  useEffect(() => {
    if (!abierto) return;
    const primero = productos[0];
    setProductoId(primero?.id ?? '');
    setPresentacion(
      primero?.presentations.find((p) => p.label === presentacionInicial)?.label ??
        primero?.presentations[0]?.label ?? ''
    );
    setColor(null);
    setCantidad(1);
    setIntentoSinColor(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (!abierto || !producto) return null;

  const carta = producto.availableColors ?? [];
  const pideColor = carta.length > 0 && !colorFijo;
  const codigoColor = colorFijo ? colorFijo.code : color;
  const falta = carta.length > 0 && !codigoColor;

  const elegirProducto = (p: StoreProduct) => {
    setProductoId(p.id);
    setPresentacion(p.presentations[0]?.label ?? '');
    setColor(null);
  };

  const agregar = async () => {
    if (falta) {
      setIntentoSinColor(true);
      return;
    }
    setAgregando(true);
    const ok = await addToCart(producto, presentacion, codigoColor ?? undefined, undefined, cantidad);
    setAgregando(false);
    if (ok) onCerrar();
  };

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title={titulo ?? producto.name} maxWidth="lg">
      <div className="space-y-4">
        {colorFijo && (
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span
              className="w-5 h-5 rounded-full border border-slate-300 shrink-0"
              style={{ backgroundColor: colorFijo.hex }}
            />
            <span>
              Color: <strong>{colorFijo.name}</strong> ({colorFijo.code})
            </span>
          </div>
        )}

        {/* Con una sola pintura no hay selector, pero el cliente debe saber cuál compra. */}
        {productos.length === 1 && (
          <p className="text-xs text-slate-700">
            Pintura: <strong>{producto.name}</strong>
          </p>
        )}

        {productos.length > 1 && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-800">Pintura:</span>
            <div className="space-y-1.5">
              {productos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => elegirProducto(p)}
                  className={`w-full p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                    p.id === producto.id
                      ? 'border-[#004F9F] bg-blue-50/80 font-bold text-[#004F9F] ring-1 ring-blue-600'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="block">{p.name}</span>
                  <span className="block text-[10px] font-medium text-slate-500">{p.category}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-800">Presentación:</span>
          <div className="space-y-1.5">
            {producto.presentations.map((pres) => (
              <button
                key={pres.id}
                type="button"
                onClick={() => setPresentacion(pres.label)}
                className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                  presentacion === pres.label
                    ? 'border-[#004F9F] bg-blue-50/80 font-bold text-[#004F9F] ring-1 ring-blue-600'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span>{pres.label}</span>
                <span className="font-extrabold">{formatCOP(pres.priceCOP)}</span>
              </button>
            ))}
          </div>
        </div>

        {pideColor && (
          <SelectorColor
            colores={carta}
            valor={color}
            onElegir={(c) => { setColor(c); setIntentoSinColor(false); }}
            faltante={intentoSinColor}
          />
        )}
        {intentoSinColor && falta && (
          <p className="text-xs font-semibold text-red-600">
            Elige el color antes de agregarlo al carrito.
          </p>
        )}

        <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setCantidad((q) => Math.max(1, q - 1))}
              className="px-3 py-2 text-slate-600 hover:bg-slate-100"
              aria-label="Menos"
            >
              -
            </button>
            <span className="px-3 font-bold text-xs text-slate-800">{cantidad}</span>
            <button
              type="button"
              onClick={() => setCantidad((q) => Math.min(999, q + 1))}
              className="px-3 py-2 text-slate-600 hover:bg-slate-100"
              aria-label="Más"
            >
              +
            </button>
          </div>
          <Button
            onClick={agregar}
            disabled={agregando}
            variant="primary"
            className="flex-1 bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold py-2.5 shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{agregando ? 'Agregando…' : 'Agregar al carrito'}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
