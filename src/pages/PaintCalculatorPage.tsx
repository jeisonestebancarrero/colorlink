import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useProjects } from '../context/ProjectContext';
import { PINTUCO_PRODUCTS } from '../data/storeMockData';
import { StoreProduct } from '../types';
import {
  SlidersHorizontal,
  Calculator,
  Layers,
  Sparkles,
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle2,
  HelpCircle,
  Building2,
  Paintbrush,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/common/Button';

interface PaintCalculatorPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const PaintCalculatorPage: React.FC<PaintCalculatorPageProps> = ({ onNavigate }) => {
  const { addToCart } = useCart();
  const { showToast } = useProjects();

  // Mode: 'quick' or 'detailed'
  const [calcMode, setCalcMode] = useState<'quick' | 'detailed'>('quick');

  // Quick inputs
  const [areaM2, setAreaM2] = useState<number>(85); // Default 85 m2

  // Detailed inputs
  const [wallHeight, setWallHeight] = useState<number>(2.6);
  const [wallWidth, setWallWidth] = useState<number>(10.0);
  const [wallCount, setWallCount] = useState<number>(4);
  const [doorsCount, setDoorsCount] = useState<number>(2); // 2m² each
  const [windowsCount, setWindowsCount] = useState<number>(2); // 1.5m² each

  // General parameters
  const [surfaceType, setSurfaceType] = useState<'sellada' | 'porosa' | 'nueva'>('sellada');
  const [selectedProductId, setSelectedProductId] = useState<string>('prod-koraza-5');
  const [coats, setCoats] = useState<number>(2);

  const selectedProduct =
    PINTUCO_PRODUCTS.find((p) => p.id === selectedProductId) || PINTUCO_PRODUCTS[0];

  // Calculate Net Area
  const calculatedArea =
    calcMode === 'quick'
      ? areaM2
      : Math.max(
          1,
          Math.round(
            wallHeight * wallWidth * wallCount - doorsCount * 2.0 - windowsCount * 1.5
          )
        );

  // Surface factor multiplier
  const surfaceFactor =
    surfaceType === 'nueva' ? 1.25 : surfaceType === 'porosa' ? 1.35 : 1.0;

  // Total gallons needed: (Area * coats * factor) / spreadRate
  const baseSpreadRate = selectedProduct.spreadRateM2PerGal || 22;
  const totalGallonsRequired = Math.max(
    0.25,
    Math.round(((calculatedArea * (coats / 2) * surfaceFactor) / baseSpreadRate) * 10) / 10
  );

  // Packaging optimization: 5 gallons = 1 cuñete
  const cuñetes5Gal = Math.floor(totalGallonsRequired / 5);
  const remainingGals = Math.ceil(totalGallonsRequired % 5);

  const cuñetePrice =
    selectedProduct.presentations.find((p) => p.label.includes('Cuñete'))?.priceCOP ||
    selectedProduct.presentations[0].priceCOP * 4.5;
  const galonPrice =
    selectedProduct.presentations.find((p) => p.label.includes('1 Galón'))?.priceCOP ||
    selectedProduct.presentations[0].priceCOP;

  const estimatedTotalCOP = cuñetes5Gal * cuñetePrice + remainingGals * galonPrice;

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleAddToCart = () => {
    if (cuñetes5Gal > 0) {
      const cuñetePres = selectedProduct.presentations.find((p) => p.label.includes('Cuñete'));
      addToCart(selectedProduct, cuñetePres?.label, undefined, undefined, cuñetes5Gal);
    }
    if (remainingGals > 0) {
      const galPres = selectedProduct.presentations.find((p) => p.label.includes('1 Galón'));
      addToCart(selectedProduct, galPres?.label, undefined, undefined, remainingGals);
    }
    showToast('¡Materiales calculados agregados al carrito!', 'success');
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
              <Calculator className="w-3.5 h-3.5" />
              <span>Calculadora Técnica de Rendimiento Pintuco</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Calcula los Galones y Cuñetes Exactos
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl font-medium">
              Evita desperdicios de material y sobrecostos. Calcula la cantidad precisa de pintura Pintuco según el tipo de sustrato y dimensiones de tu espacio.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('solutions')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Ver Kits
            </button>
            <button
              onClick={() => onNavigate('store')}
              className="bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Ir a Tienda
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Input Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Mode Switcher */}
          <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1.5 border border-slate-200">
            <button
              onClick={() => setCalcMode('quick')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                calcMode === 'quick'
                  ? 'bg-[#004F9F] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cálculo Rápido por Área Total (m²)
            </button>
            <button
              onClick={() => setCalcMode('detailed')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                calcMode === 'detailed'
                  ? 'bg-[#004F9F] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cálculo Detallado por Paredes y Ventanas
            </button>
          </div>

          {/* Form Container */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
            {calcMode === 'quick' ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                  <span>Área Total a Pintar:</span>
                  <span className="text-base font-extrabold text-[#004F9F]">{areaM2} m²</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="300"
                  step="5"
                  value={areaM2}
                  onChange={(e) => setAreaM2(Number(e.target.value))}
                  className="w-full accent-[#004F9F] cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">O escribe el metraje:</span>
                  <input
                    type="number"
                    value={areaM2}
                    onChange={(e) => setAreaM2(Math.max(1, Number(e.target.value)))}
                    className="w-24 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900"
                  />
                  <span className="text-xs text-slate-500 font-semibold">m²</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Alto de pared (m):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={wallHeight}
                    onChange={(e) => setWallHeight(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Ancho de pared (m):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={wallWidth}
                    onChange={(e) => setWallWidth(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Número de paredes:
                  </label>
                  <input
                    type="number"
                    value={wallCount}
                    onChange={(e) => setWallCount(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Puertas a descontar:
                  </label>
                  <input
                    type="number"
                    value={doorsCount}
                    onChange={(e) => setDoorsCount(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Ventanas a descontar:
                  </label>
                  <input
                    type="number"
                    value={windowsCount}
                    onChange={(e) => setWindowsCount(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Área Neta:</span>
                  <span className="text-base font-extrabold text-[#004F9F]">{calculatedArea} m²</span>
                </div>
              </div>
            )}

            {/* Product Selector */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Selecciona la Pintura Pintuco:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PINTUCO_PRODUCTS.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                      selectedProductId === p.id
                        ? 'border-[#004F9F] bg-blue-50/80 font-bold text-[#004F9F] ring-1 ring-blue-600'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-slate-900 line-clamp-1">{p.name}</p>
                      <p className="text-[10px] text-slate-500">{p.category}</p>
                    </div>
                    <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                      {p.spreadRateM2PerGal} m²/gal
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Surface State */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Estado de la Superficie / Sustrato:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSurfaceType('sellada')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                    surfaceType === 'sellada'
                      ? 'border-[#004F9F] bg-blue-50 text-[#004F9F] ring-1 ring-blue-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Pared Sellada / Repinte
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceType('nueva')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                    surfaceType === 'nueva'
                      ? 'border-[#004F9F] bg-blue-50 text-[#004F9F] ring-1 ring-blue-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Revoque Nuevo (+25%)
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceType('porosa')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                    surfaceType === 'porosa'
                      ? 'border-[#004F9F] bg-blue-50 text-[#004F9F] ring-1 ring-blue-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Concreto Poroso (+35%)
                </button>
              </div>
            </div>

            {/* Number of hands / coats */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Número de Manos Recomendadas:
              </span>
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCoats(c)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      coats === c
                        ? 'bg-[#004F9F] text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Results Card & Recommendations (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800 space-y-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                Resultado Técnico de Rendimiento
              </span>
              <h3 className="text-xl font-extrabold">
                {totalGallonsRequired} Galones Requeridos
              </h3>
              <p className="text-xs text-slate-300">
                Para cubrir <strong>{calculatedArea} m²</strong> con <strong>{selectedProduct.name}</strong> a {coats} manos.
              </p>
            </div>

            {/* Packaging Breakdown Card */}
            <div className="bg-slate-800/90 rounded-xl p-4 border border-slate-700 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Combinación Óptima de Empaque (Más Económica)
              </span>

              <div className="space-y-2 text-xs">
                {cuñetes5Gal > 0 && (
                  <div className="flex justify-between items-center p-2 bg-slate-700/50 rounded-lg">
                    <span className="font-semibold">{cuñetes5Gal} x Cuñete (5 Galones)</span>
                    <strong className="text-yellow-300">{formatCOP(cuñetes5Gal * cuñetePrice)}</strong>
                  </div>
                )}
                {remainingGals > 0 && (
                  <div className="flex justify-between items-center p-2 bg-slate-700/50 rounded-lg">
                    <span className="font-semibold">{remainingGals} x Galón (1 Galón)</span>
                    <strong className="text-yellow-300">{formatCOP(remainingGals * galonPrice)}</strong>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-700 flex justify-between items-baseline">
                <span className="text-xs text-slate-300">Inversión Estimada:</span>
                <span className="text-xl font-extrabold text-white">
                  {formatCOP(estimatedTotalCOP)}
                </span>
              </div>
            </div>

            {/* Included Services */}
            <div className="space-y-2 text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Retiro express en tienda Pintuco gratis</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Asesoría técnica y ficha oficial incluida</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={handleAddToCart}
                variant="primary"
                className="w-full bg-yellow-400 hover:bg-yellow-300 text-slate-950 text-xs font-extrabold py-3 shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Agregar Materiales al Carrito</span>
              </Button>

              <button
                onClick={() => onNavigate('create-project')}
                className="w-full py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Crear Proyecto B2B con estos m²</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
