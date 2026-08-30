import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useProjects } from '../context/ProjectContext';
import { useSolutionKits } from '../hooks/useCatalog';
import { CatalogError, CatalogLoading } from '../components/common/CatalogState';
import { SolutionKit } from '../types';
import {
  Package,
  ShieldCheck,
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Layers,
  Droplets,
  SlidersHorizontal,
  ArrowRight,
  Clock,
  Hammer,
  HelpCircle,
  Building2,
} from 'lucide-react';
import { Button } from '../components/common/Button';

interface SolutionKitsPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const SolutionKitsPage: React.FC<SolutionKitsPageProps> = ({ onNavigate }) => {
  // FASE 4 — kits y sus pasos desde Supabase. El precio de cada paso se lee
  // de la variante real del producto, no de una copia guardada en el kit.
  const { data: PINTUCO_SOLUTION_KITS, isLoading, error, reload } = useSolutionKits();

  const { addKitToCart } = useCart();
  const { activeProject, setActiveProjectId, showToast } = useProjects();

  /**
   * CORRECCIÓN: mismo problema que en el visualizador de color, pero peor.
   * `PINTUCO_SOLUTION_KITS[0].id` se evaluaba en el primer render, cuando el
   * array aún está vacío, y lanzaba al leer `.id` de undefined: la página no
   * llegaba a pintarse nunca.
   */
  const [kitElegidoId, setKitElegidoId] = useState<string | null>(null);
  const selectedKitId = kitElegidoId ?? PINTUCO_SOLUTION_KITS[0]?.id ?? '';
  const setSelectedKitId = setKitElegidoId;
  const [areaM2, setAreaM2] = useState<number>(85); // Default to Horizonte 85 m2

  const activeKit =
    PINTUCO_SOLUTION_KITS.find((k) => k.id === selectedKitId) || PINTUCO_SOLUTION_KITS[0];

  const multiplier = Math.max(0.5, Math.round((areaM2 / 85) * 10) / 10);

  /**
   * Estos cálculos se ejecutan en CADA render, incluido el primero, cuando
   * el catálogo todavía viene en camino y `activeKit` es undefined. La
   * guarda de carga está más abajo, junto al return, así que no los protege:
   * por eso toleran explícitamente la ausencia de kit en lugar de confiar
   * en que nunca ocurra.
   */
  const calculateKitSubtotal = (kit?: SolutionKit) => {
    if (!kit) return 0;
    return kit.steps.reduce((sum, step) => sum + step.unitPriceCOP * step.quantityFor85m2 * multiplier, 0);
  };

  const kitSubtotal = calculateKitSubtotal(activeKit);
  const kitDiscount = activeKit ? Math.round(kitSubtotal * (activeKit.discountPercent / 100)) : 0;
  const kitTotal = kitSubtotal - kitDiscount;

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleAddFullKitToCart = () => {
    if (!activeKit) return;
    addKitToCart(activeKit, multiplier);
    showToast(`¡${activeKit.name} agregado al carrito con descuento de paquete!`, 'success');
  };

  const handleLinkToProject = () => {
    if (activeProject) {
      showToast(`Kit vinculado al proyecto "${activeProject.name}"`, 'success');
      onNavigate('project-detail', activeProject.id);
    } else {
      onNavigate('create-project');
    }
  };

  // FASE 4 — estados de carga y error (MÓDULO 37).
  if (isLoading) return <CatalogLoading />;
  if (error) return <CatalogError mensaje={error} onReintentar={reload} />;
  if (PINTUCO_SOLUTION_KITS.length === 0 || !activeKit) {
    return (
      <CatalogError
        mensaje="No hay kits de solución disponibles en este momento."
        onReintentar={reload}
      />
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004F9F] to-[#002D5C] text-white rounded-2xl p-6 sm:p-8 shadow-lg border border-blue-900/40">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 bg-yellow-400 text-slate-950 px-3 py-1 rounded-full text-xs font-extrabold shadow-2xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Soluciones Integrales Empaquetadas • Hasta 15% Descuento</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Kits de Solución Pintuco
          </h1>
          <p className="text-sm text-blue-100 font-medium leading-relaxed">
            No compres solo pintura: adquiere el sistema técnico completo (preparación + imprimación + acabado + herramientas recomendadas) diseñado para erradicar patologías de raíz con garantía oficial.
          </p>
        </div>
      </div>

      {/* Kit Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PINTUCO_SOLUTION_KITS.map((kit) => {
          const isSelected = kit.id === selectedKitId;
          return (
            <div
              key={kit.id}
              onClick={() => setSelectedKitId(kit.id)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                isSelected
                  ? 'bg-blue-50/80 border-[#004F9F] ring-2 ring-blue-600 shadow-md'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase bg-blue-100 text-[#004F9F] px-2 py-0.5 rounded">
                    {kit.category}
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    -{kit.discountPercent}% Kit
                  </span>
                </div>
                <h3 className="text-xs font-bold text-slate-900 line-clamp-2">
                  {kit.name}
                </h3>
                <p className="text-[11px] text-slate-500 line-clamp-2">
                  {kit.problemTarget}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400 font-semibold">{kit.steps.length} Pasos</span>
                <span className="text-xs font-extrabold text-[#004F9F]">
                  Ver Sistema →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Kit Deep Dive Layout */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-8">
        {/* Kit Header & Area Adjuster */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {activeKit.warranty}
              </span>
              <span className="text-xs font-semibold text-slate-500">• Ideal para: {activeKit.idealFor}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              {activeKit.name}
            </h2>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {activeKit.subtitle}
            </p>
          </div>

          {/* Area Slider */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 w-full lg:w-80 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-slate-800">
              <span>Área de la Superficie:</span>
              <span className="text-sm text-[#004F9F] font-extrabold">{areaM2} m²</span>
            </div>
            <input
              type="range"
              min="20"
              max="300"
              step="5"
              value={areaM2}
              onChange={(e) => setAreaM2(Number(e.target.value))}
              className="w-full accent-[#004F9F] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
              <span>20 m² (Muro pequeño)</span>
              <span>85 m² (Estándar)</span>
              <span>300 m² (Obra grande)</span>
            </div>
          </div>
        </div>

        {/* Step by Step Breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#004F9F]" />
            Pasos Técnicos del Sistema Multicapa Pintuco
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeKit.steps.map((step) => {
              const qty = Math.ceil(step.quantityFor85m2 * multiplier);
              return (
                <div
                  key={step.stepNumber}
                  className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3 relative group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="w-6 h-6 rounded-full bg-[#004F9F] text-white text-xs font-extrabold flex items-center justify-center shadow-2xs">
                        {step.stepNumber}
                      </span>
                      <span className="text-[10px] font-extrabold uppercase text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {step.phaseName}
                      </span>
                    </div>

                    <div className="h-32 rounded-lg overflow-hidden border border-slate-200 bg-white">
                      <img
                        src={step.image}
                        alt={step.productName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 leading-snug">
                      {step.productName}
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {step.roleDescription}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Presentación:</span>
                      <strong className="text-slate-800">{step.presentation}</strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Cantidad para {areaM2}m²:</span>
                      <strong className="text-[#004F9F] font-bold">{qty} unidades</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tools Included Box */}
        <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Hammer className="w-5 h-5 text-[#004F9F] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900">
                Herramientas y Complementos Incluidos en el Kit
              </h4>
              <div className="flex flex-wrap gap-2">
                {activeKit.toolsIncluded.map((tool, idx) => (
                  <span
                    key={idx}
                    className="text-[11px] bg-white text-slate-700 font-semibold px-2 py-0.5 rounded border border-blue-200 shadow-2xs"
                  >
                    ✓ {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Summary & Actions */}
        <div className="p-5 bg-slate-900 text-white rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-300">
              Resumen de Inversión • Kit Completo Certificado
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {formatCOP(kitTotal)}
              </span>
              <span className="text-xs text-slate-400 line-through">
                {formatCOP(kitSubtotal)}
              </span>
              <span className="text-xs bg-emerald-900/80 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-700">
                Ahorras {formatCOP(kitDiscount)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Incluye retiro gratis en tienda Pintuco o despacho directo a obra.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <button
              onClick={handleLinkToProject}
              className="px-4 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Vincular a Mi Proyecto</span>
            </button>
            <Button
              onClick={handleAddFullKitToCart}
              variant="primary"
              className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 text-xs font-extrabold px-6 py-2.5 shadow-md flex items-center justify-center gap-2 cursor-pointer flex-1 md:flex-initial"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Comprar Kit Completo (-{activeKit.discountPercent}%)</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
