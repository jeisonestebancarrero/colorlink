import React, { useState } from 'react';
import { SolutionCatalogItem, SolutionCategory } from '../types';
import { useSolutionsCatalog } from '../hooks/useCatalog';
import { CatalogError, CatalogLoading } from '../components/common/CatalogState';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import {
  Layers,
  Search,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  PlusCircle,
  Clock,
  Droplets,
  Package,
  Paintbrush,
  Check,
} from 'lucide-react';

interface SolutionsCatalogPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const SolutionsCatalogPage: React.FC<SolutionsCatalogPageProps> = ({
  onNavigate,
}) => {
  // FASE 4 — sistemas técnicos desde Supabase (solutions con is_kit = false).
  const { data: SOLUTIONS_CATALOG, isLoading, error, reload } = useSolutionsCatalog();

  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSolution, setSelectedSolution] = useState<SolutionCatalogItem | null>(null);

  const categories: string[] = [
    'Todas',
    'Fachadas',
    'Interiores',
    'Impermeabilización',
    'Metal',
    'Madera',
    'Industrial',
    'Mantenimiento',
  ];

  const filteredSolutions = SOLUTIONS_CATALOG.filter((item) => {
    if (selectedCategory !== 'Todas' && item.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.application.toLowerCase().includes(q) ||
        item.surface.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // FASE 4 — estados de carga y error (MÓDULO 37).
  if (isLoading) return <CatalogLoading />;
  if (error) return <CatalogError mensaje={error} onReintentar={reload} />;

  return (
    <div className="space-y-6 text-left pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              Catálogo Oficial de Sistemas Pintuco
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Soluciones y Sistemas de Recubrimiento
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Explora las tecnologías formuladas para cada exigencia arquitectónica e industrial.
          </p>
        </div>

        <Button
          variant="pintuco"
          size="sm"
          onClick={() => onNavigate('create-project')}
          leftIcon={<PlusCircle className="w-4 h-4" />}
          className="shadow-sm"
        >
          Iniciar Asistente de Proyecto
        </Button>
      </div>

      {/* Search & Categories Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre de sistema, superficie (ej. Fachada, Concreto, Epóxico, Madera)..."
            className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-[#004F9F] rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition-all"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs px-3.5 py-1 rounded-full font-bold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#004F9F] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Solutions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSolutions.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all duration-200 flex flex-col justify-between overflow-hidden group"
          >
            <div>
              {/* Image Banner */}
              <div className="relative aspect-16/9 overflow-hidden bg-slate-100">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-linear-to-t from-slate-950/70 via-transparent to-transparent" />

                {/* Category Pill */}
                <div className="absolute top-3 left-3 bg-[#004F9F] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded shadow-xs">
                  {item.category}
                </div>

                {item.badge && (
                  <div className="absolute top-3 right-3 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
                    {item.badge}
                  </div>
                )}

                <div className="absolute bottom-3 left-3 right-3 text-white text-xs font-semibold">
                  <span className="bg-black/40 backdrop-blur-xs px-2 py-0.5 rounded text-[11px]">
                    {item.durabilityEstimate || 'Tecnología Pintuco'}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-3 text-left">
                <h3 className="text-base font-extrabold text-slate-900 leading-snug group-hover:text-[#004F9F] transition-colors">
                  {item.name}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>

                {/* System Specs Tags */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-1.5">
                  <div className="flex items-start gap-1 text-slate-700">
                    <span className="font-bold text-slate-900 shrink-0">Superficie:</span>
                    <span className="text-slate-600 truncate">{item.surface}</span>
                  </div>
                  <div className="flex items-start gap-1 text-slate-700">
                    <span className="font-bold text-slate-900 shrink-0">Esquema:</span>
                    <span className="text-slate-600 truncate">{item.systemSummary}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 pt-0 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSolution(item)}
                className="text-xs flex-1"
              >
                Ver Ficha Completa
              </Button>

              <Button
                variant="pintuco"
                size="sm"
                onClick={() => onNavigate('create-project')}
                className="text-xs"
              >
                Aplicar
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Solution Modal */}
      {selectedSolution && (
        <Modal
          isOpen={!!selectedSolution}
          onClose={() => setSelectedSolution(null)}
          title={selectedSolution.name}
          maxWidth="3xl"
        >
          <div className="space-y-6 text-left">
            <div className="relative aspect-16/9 rounded-xl overflow-hidden bg-slate-100">
              <img
                src={selectedSolution.image}
                alt={selectedSolution.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-[#004F9F] text-white text-xs font-bold px-2.5 py-0.5 rounded">
                Categoría: {selectedSolution.category}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">¿Para qué sirve y dónde se utiliza?</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {selectedSolution.description}
              </p>
            </div>

            {/* Step by step guide */}
            {selectedSolution.stepByStepGuide && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#004F9F]" />
                  Guía de Aplicación Paso a Paso
                </h4>
                <div className="space-y-1.5 bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-700">
                  {selectedSolution.stepByStepGuide.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="font-bold text-[#004F9F] shrink-0">•</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Features */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-900">Ventajas Técnicas Pintuco</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedSolution.features.map((feat, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs text-slate-700 bg-blue-50/60 p-2.5 rounded-lg border border-blue-100"
                  >
                    <Check className="w-3.5 h-3.5 text-[#004F9F] shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Color swatches preview */}
            {selectedSolution.colorSwatches && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">Colores Populares de Línea</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedSolution.colorSwatches.map((col, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs"
                    >
                      <div
                        className="w-4 h-4 rounded-full border border-slate-300"
                        style={{ backgroundColor: col.hex }}
                      />
                      <span className="font-semibold text-slate-800">{col.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <span className="text-xs text-slate-500">
                Rendimiento estimado: <strong>{selectedSolution.spreadRateInfo || '20-25 m²/galón'}</strong>
              </span>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedSolution(null)}>
                  Cerrar
                </Button>
                <Button
                  variant="pintuco"
                  size="sm"
                  onClick={() => {
                    setSelectedSolution(null);
                    onNavigate('create-project');
                  }}
                  leftIcon={<PlusCircle className="w-4 h-4" />}
                >
                  Crear proyecto con esta solución
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
