import React, { useState } from 'react';
import { useProjects } from '../context/ProjectContext';
import { StatusBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { TechnicalSupportModal } from '../components/projects/TechnicalSupportModal';
import { Modal } from '../components/common/Modal';
import { PINTUCO_COLOR_PALETTES } from '../data/mockData';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
  ShieldCheck,
  UserCheck,
  PhoneCall,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Camera,
  Maximize2,
  Download,
  Info,
  DollarSign,
  Package,
  Droplets,
  Check,
  ChevronRight,
  Eye,
  Sliders,
  Store,
  Share2,
} from 'lucide-react';

interface ProjectDetailPageProps {
  projectId: string;
  onNavigate: (page: string, param?: string) => void;
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({
  projectId,
  onNavigate,
}) => {
  const { projects, activeProjectId } = useProjects();
  const project =
    projects.find((p) => p.id === projectId) ||
    projects.find((p) => p.id === activeProjectId) ||
    projects[0];

  const [activeTab, setActiveTab] = useState<
    'solution' | 'materials' | 'budget' | 'advisor' | 'photos' | 'timeline'
  >('solution');
  const [showTechModal, setShowTechModal] = useState(false);
  const [showTechnicalDetailsToggle, setShowTechnicalDetailsToggle] = useState(false);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(
    project?.selectedColor || {
      name: 'Blanco Nieve',
      code: 'PNT-101',
      hex: '#F8FAFC',
      family: 'Blancos & Neutros Pintuco',
    }
  );

  if (!project) {
    return (
      <div className="p-12 text-center text-slate-500">
        <p>Proyecto no encontrado.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => onNavigate('projects')}
        >
          Volver a Mis Proyectos
        </Button>
      </div>
    );
  }

  const analysis = project.preliminaryAnalysis;
  const products = project.recommendedProducts || [];
  const budget = project.budgetSummary;

  const journeySteps = [
    { num: 1, label: 'Necesidad registrada', done: true, current: false },
    { num: 2, label: 'Información validada', done: true, current: false },
    { num: 3, label: 'Diagnóstico técnico', done: true, current: false },
    { num: 4, label: 'Solución y sistema', done: false, current: true },
    { num: 5, label: 'Materiales & Stock', done: false, current: false },
    { num: 6, label: 'Presupuesto preliminar', done: false, current: false },
    { num: 7, label: 'Asesoría en obra', done: false, current: false },
    { num: 8, label: 'Garantía final', done: false, current: false },
  ];

  return (
    <div className="space-y-6 text-left pb-16">
      {/* Top Breadcrumbs & Direct Utility Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('projects')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Mis Proyectos</span>
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-mono font-bold text-slate-700">{project.code}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Download className="w-3.5 h-3.5" />}
            className="hidden sm:inline-flex text-xs"
          >
            Descargar Ficha Técnica
          </Button>

          <Button
            variant="pintuco"
            size="sm"
            onClick={() => setShowTechModal(true)}
            leftIcon={<UserCheck className="w-3.5 h-3.5" />}
            className="text-xs shadow-xs"
          >
            {project.technicalService?.requested
              ? 'Ver Asesor Técnico Asignado'
              : 'Solicitar Visita Técnica ($0)'}
          </Button>
        </div>
      </div>

      {/* Project Hero Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={project.status} size="md" />
              <span className="text-xs font-mono bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded">
                {project.code}
              </span>
              <span className="text-xs font-medium bg-blue-50 text-[#004F9F] px-2 py-0.5 rounded border border-blue-200">
                {project.projectType}
              </span>
              <span className="text-xs text-slate-500">
                Atención: <strong>{analysis.attentionLevel}</strong>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {project.name}
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
              {project.description}
            </p>

            {/* Quick Metrics Bar */}
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-700">
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin className="w-4 h-4 text-[#004F9F]" />
                <span>Ubicación:</span> <strong>{project.city}</strong>
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Layers className="w-4 h-4 text-[#004F9F]" />
                <span>Superficie:</span> <strong>{project.surface} ({project.areaM2} m²)</strong>
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Droplets className="w-4 h-4 text-amber-600" />
                <span>Patología:</span> <strong>{project.conditions.join(', ')}</strong>
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="w-4 h-4 text-[#004F9F]" />
                <span>Plazo:</span> <strong>{project.requiredDate}</strong>
              </span>
            </div>
          </div>

          {/* Specialist Card Mini */}
          {project.technicalService?.requested && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 min-w-[260px] space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#004F9F] block">
                Acompañamiento Pintuco Activo
              </span>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#004F9F] text-white flex items-center justify-center text-xs font-bold">
                  MG
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {project.technicalService.specialistName || 'Ing. Mateo Gómez'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Visita: {project.technicalService.scheduledDate || '24 Feb 2025'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* "¿Qué debo hacer ahora? / Próximo Paso" Action Bar */}
        <div className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#004F9F] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              ¿Qué debes hacer ahora? — Próximo Paso Recomendado
            </span>
            <h4 className="text-sm font-bold text-slate-900">
              {project.nextRecommendedAction?.title || 'Validar sistema de recubrimiento y confirmar visita'}
            </h4>
            <p className="text-xs text-slate-600">
              {project.nextRecommendedAction?.description ||
                'Revisa el esquema multicapa propuesto y solicita la confirmación de la visita técnica para lectura de humedad.'}
            </p>
          </div>

          <Button
            variant="pintuco"
            size="sm"
            onClick={() => setShowTechModal(true)}
            className="text-xs whitespace-nowrap self-start sm:self-auto shadow-xs"
          >
            {project.nextRecommendedAction?.actionLabel || 'Confirmar Visita Técnica'}
          </Button>
        </div>

        {/* Customer Progress Stepper */}
        <div className="space-y-1.5 pt-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Ruta de Solución Pintuco
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1 text-[11px]">
            {journeySteps.map((step) => (
              <div
                key={step.num}
                className={`px-2 py-1.5 rounded-lg border text-center font-medium flex items-center justify-center gap-1 ${
                  step.done
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : step.current
                    ? 'bg-[#004F9F] text-white border-blue-600 font-bold shadow-xs'
                    : 'bg-slate-50 text-slate-400 border-slate-200/60'
                }`}
              >
                {step.done && <Check className="w-3 h-3 text-emerald-600" />}
                <span className="truncate">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-1 sm:space-x-3 overflow-x-auto pb-px">
          {[
            { id: 'solution', label: 'Diagnóstico & Solución', icon: Layers },
            { id: 'materials', label: 'Materiales & Cálculo', icon: Package },
            { id: 'budget', label: 'Presupuesto Demostrativo', icon: DollarSign },
            { id: 'advisor', label: 'Acompañamiento Técnico', icon: UserCheck },
            { id: 'photos', label: `Fotografías (${project.photos.length})`, icon: Camera },
            { id: 'timeline', label: 'Historial / Bitácora', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-[#004F9F] text-[#004F9F] bg-blue-50/40 rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: DIAGNÓSTICO & SOLUCIÓN */}
      {activeTab === 'solution' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Client-Centric Recommendation Box */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                  Sistema Recomendado
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  {analysis.solutionCategory}
                </h3>
              </div>

              {/* Technical Engineer Details Toggle */}
              <button
                onClick={() => setShowTechnicalDetailsToggle(!showTechnicalDetailsToggle)}
                className="text-xs font-semibold text-slate-600 hover:text-[#004F9F] bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer self-start sm:self-auto"
              >
                {showTechnicalDetailsToggle ? 'Ocultar vista técnica' : 'Ver detalle para especialistas'}
              </button>
            </div>

            {/* Simple Client Summary */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2 text-xs text-slate-700">
              <span className="font-bold text-slate-900 block text-sm">
                Explicación del Diagnóstico:
              </span>
              <p className="leading-relaxed">{analysis.aiSummary}</p>
            </div>

            {/* Specialist Engineering Deep Dive (Toggled) */}
            {showTechnicalDetailsToggle && (
              <div className="bg-blue-950 text-blue-100 rounded-xl p-5 border border-blue-900 space-y-3 text-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-blue-300 font-mono font-bold text-[11px]">
                  <span>MEMORIA TÉCNICA Y PROTOCOLO DE ESPECIFICACIÓN</span>
                  <span>NORMA NTC 5828</span>
                </div>
                <p className="leading-relaxed text-blue-200 font-mono text-[11px]">
                  {analysis.technicalSummary ||
                    'Evaluación de patología de humedad capilar y fisuras por retracción térmica. Se determina esquema de neutralización alcalina con sellador acrílico y película elastomérica de 12-14 mils secos con elongación superior al 300%.'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-blue-900 text-[11px]">
                  <div>Perfil de anclaje: <strong>CSP 1-2</strong></div>
                  <div>Humedad admisible: <strong>&lt; 5%</strong></div>
                  <div>Garantía técnica: <strong>5 Años</strong></div>
                </div>
              </div>
            )}

            {/* Multilayer Application Scheme */}
            <div className="space-y-3 pt-1">
              <h4 className="text-sm font-bold text-slate-900">
                Esquema Multicapa de Aplicación Paso a Paso
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {products.map((prod, idx) => (
                  <div
                    key={prod.id}
                    className="bg-white border-2 border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-all flex flex-col justify-between shadow-2xs"
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-[#004F9F] px-2 py-0.5 rounded inline-block mb-2">
                        Paso {idx + 1}: {prod.role}
                      </span>
                      <h5 className="text-sm font-bold text-slate-900">{prod.name}</h5>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{prod.description}</p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Aplicación:</span>
                        <span className="font-medium text-slate-800">{prod.applicationMethod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rendimiento:</span>
                        <span className="font-bold text-[#004F9F]">{prod.theoreticalSpreadRate}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pintuco Color Swatch Selection */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Carta de Color Pintuco (Más de 1.800 Colores)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Seleccionado actualmente: <strong>{selectedColor.name} ({selectedColor.code})</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                  <div
                    className="w-5 h-5 rounded-full border border-slate-300 shadow-xs"
                    style={{ backgroundColor: selectedColor.hex }}
                  />
                  <span className="text-xs font-bold text-slate-800">{selectedColor.name}</span>
                </div>
              </div>

              {/* Swatch options */}
              <div className="space-y-2 pt-1">
                {PINTUCO_COLOR_PALETTES.map((pal, pIdx) => (
                  <div key={pIdx} className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {pal.category}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {pal.colors.map((col) => {
                        const isChosen = selectedColor.code === col.code;
                        return (
                          <button
                            key={col.code}
                            type="button"
                            onClick={() => setSelectedColor({ ...col, family: pal.category })}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                              isChosen
                                ? 'bg-white border-[#004F9F] shadow-xs ring-2 ring-blue-500/20'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full border border-slate-300 shadow-2xs"
                              style={{ backgroundColor: col.hex }}
                            />
                            <span>{col.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MATERIALES & CÁLCULO */}
      {activeTab === 'materials' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                Cálculo de Materiales ({project.areaM2} m²)
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                Materiales y Cantidades Sugeridas
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Fórmula de cálculo: <strong>Área ({project.areaM2} m²) × Número de Manos ÷ Rendimiento Teórico = Unidades</strong>.
              </p>
            </div>

            <div className="space-y-4">
              {products.map((prod, idx) => (
                <div
                  key={prod.id}
                  className="bg-slate-50 rounded-xl p-4.5 border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-[#004F9F] px-2 py-0.5 rounded">
                        Paso {idx + 1}: {prod.role}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{prod.code}</span>
                    </div>
                    <h4 className="text-base font-bold text-slate-900">{prod.name}</h4>
                    <p className="text-xs text-slate-600">{prod.description}</p>
                    <p className="text-xs text-slate-400">
                      Rendimiento: <strong>{prod.theoreticalSpreadRate}</strong>
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 text-xs min-w-[240px] space-y-1.5 shadow-2xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cantidad estimada:</span>
                      <span className="font-bold text-slate-900">{prod.estimatedQuantity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Disponibilidad:</span>
                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {prod.availability || 'Disponible'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <Store className="w-3.5 h-3.5 text-[#004F9F]" />
                      <span>{prod.storeLocation || 'Puntos de Venta Pintuco'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>Nota técnica sobre rendimientos:</strong> Los consumos definitivos pueden variar según la rugosidad del sustrato, porosidad real y método de aplicación (brocha, rodillo o airless). El especialista técnico de Pintuco valida el metraje final en la visita.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PRESUPUESTO DEMOSTRATIVO */}
      {activeTab === 'budget' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                  Presupuesto Estimado Demostrativo
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  Resumen de Materiales y Servicios
                </h3>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                leftIcon={<Download className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Exportar Presupuesto
              </Button>
            </div>

            {/* Itemized Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Producto / Concepto</th>
                    <th className="px-4 py-3">Presentación</th>
                    <th className="px-4 py-3 text-center">Cant.</th>
                    <th className="px-4 py-3 text-right">Precio Ref. (COP)</th>
                    <th className="px-4 py-3 text-right">Subtotal (COP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {budget?.items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900 block">{it.productName}</span>
                        <span className="text-[11px] text-slate-400">{it.role}</span>
                      </td>
                      <td className="px-4 py-3">{it.presentation}</td>
                      <td className="px-4 py-3 text-center font-bold">{it.quantity}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        ${it.unitPriceRef.toLocaleString('es-CO')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold font-mono text-slate-900">
                        ${it.subtotal.toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))}

                  {/* Free Technical Assistance Line Item */}
                  <tr className="bg-blue-50/50 font-medium">
                    <td className="px-4 py-3" colSpan={2}>
                      <span className="font-bold text-[#004F9F] flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-[#004F9F]" />
                        Acompañamiento Técnico Especializado en Obra
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Inspección, lecturas de humedad y emisión de garantía oficial Pintuco
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold">1 Servicio</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700 font-bold">$0</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700 font-bold">$0 (Incluido)</td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50/90 font-bold text-sm text-slate-900 border-t-2 border-slate-200">
                  <tr>
                    <td className="px-4 py-4" colSpan={4}>
                      Total Estimado de Materiales (Demostrativo):
                    </td>
                    <td className="px-4 py-4 text-right font-extrabold text-[#004F9F] font-mono text-base">
                      ${budget?.estimatedTotal.toLocaleString('es-CO')} COP
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-500 space-y-1">
              <span className="font-bold text-slate-700 block">Condiciones comerciales:</span>
              <p>
                * Valores demostrativos para fines de estimación presupuestal. La cotización oficial y disponibilidad de despacho se consolidan a través de la red de Distribuidores Autorizados y Centros de Pintura Pintuco.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ACOMPAÑAMIENTO TÉCNICO */}
      {activeTab === 'advisor' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                  Servicio Técnico Especializado Pintuco ($0 COP)
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  Acompañamiento en Terreno
                </h3>
              </div>

              <Button
                variant="pintuco"
                size="sm"
                onClick={() => setShowTechModal(true)}
                leftIcon={<Calendar className="w-4 h-4" />}
                className="text-xs"
              >
                {project.technicalService?.requested ? 'Modificar fecha de visita' : 'Agendar visita técnica'}
              </Button>
            </div>

            {/* Specialist Profile Card */}
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-[#004F9F] to-blue-800 text-white flex items-center justify-center text-xl font-extrabold shadow-sm">
                  MG
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-[#004F9F] px-2 py-0.5 rounded">
                    Especialista Asignado
                  </span>
                  <h4 className="text-lg font-extrabold text-slate-900">
                    {project.technicalService?.specialistName || 'Ing. Mateo Gómez'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {project.technicalService?.specialistTitle || 'Especialista en Fachadas & Recubrimientos Pintuco'}
                  </p>
                  <p className="text-xs font-semibold text-[#004F9F]">
                    Teléfono directo: {project.technicalService?.contactPhone || '+57 (310) 902-3344'}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 text-xs min-w-[240px] space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Estado de visita:</span>
                  <span className="font-bold text-[#004F9F] uppercase text-[11px]">
                    {project.technicalService?.status === 'programado' ? 'Programada' : 'Confirmada'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Fecha fijada:</span>
                  <span className="font-bold text-slate-900">
                    {project.technicalService?.scheduledDate || '24 Feb 2025 - 10:00 AM'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Costo para el cliente:</span>
                  <span className="font-extrabold text-emerald-700">$0 COP (100% Incluido)</span>
                </div>
              </div>
            </div>

            {/* What will the specialist do? */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">
                Protocolo de Inspección en la Visita Técnica
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#004F9F] flex items-center justify-center font-bold">
                    1
                  </div>
                  <h5 className="font-bold text-slate-900">Medición de Humedad</h5>
                  <p className="text-slate-500 leading-relaxed">
                    Lectura con higrómetro electrónico en el concreto para garantizar humedad &lt; 5% antes de aplicar sellador.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#004F9F] flex items-center justify-center font-bold">
                    2
                  </div>
                  <h5 className="font-bold text-slate-900">Prueba de Adherencia</h5>
                  <p className="text-slate-500 leading-relaxed">
                    Verificación de sustrato firme mediante prueba de corte en celosía y perfil de anclaje mecánico.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#004F9F] flex items-center justify-center font-bold">
                    3
                  </div>
                  <h5 className="font-bold text-slate-900">Emisión de Certificado</h5>
                  <p className="text-slate-500 leading-relaxed">
                    Generación del informe técnico oficial que respalda la garantía de 5 años Pintuco.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: FOTOGRAFÍAS */}
      {activeTab === 'photos' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Registro Fotográfico del Sustrato ({project.photos.length} fotos)
                </h3>
                <p className="text-xs text-slate-500">
                  Imágenes analizadas para clasificar la patología de humedad y fisuras.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {project.photos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhotoModal(photo.url)}
                  className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-4/3 cursor-pointer shadow-2xs hover:shadow-md transition-all"
                >
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end text-white">
                    <p className="text-xs font-bold truncate">{photo.name}</p>
                    <p className="text-[10px] text-slate-300">{photo.size} · {photo.uploadDate}</p>
                  </div>
                  {photo.isPrimary && (
                    <span className="absolute top-2 left-2 bg-[#004F9F] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-xs">
                      Foto Principal
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: HISTORIAL / TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Bitácora de Trazabilidad y Eventos
              </h3>
              <p className="text-xs text-slate-500">
                Registro cronológico de avances, diagnósticos y visitas técnicas.
              </p>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {project.timeline.map((step) => {
                const isCompleted = step.status === 'completed';
                const isCurrent = step.status === 'current';

                return (
                  <div key={step.id} className="relative space-y-1">
                    <div
                      className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isCompleted
                          ? 'bg-emerald-600 border-white text-white shadow-xs'
                          : isCurrent
                          ? 'bg-[#004F9F] border-white text-white shadow-xs'
                          : 'bg-white border-slate-300 text-slate-300'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h4 className="text-sm font-bold text-slate-900">
                        Paso {step.stepNumber}: {step.title}
                      </h4>
                      {step.date && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          {step.date}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {step.description}
                    </p>

                    {step.responsible && (
                      <p className="text-[11px] text-[#004F9F] font-medium">
                        Responsable: {step.responsible}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Technical Support Modal */}
      <TechnicalSupportModal
        isOpen={showTechModal}
        onClose={() => setShowTechModal(false)}
        projectId={project.id}
        projectName={project.name}
      />

      {/* Photo Lightbox Modal */}
      <Modal
        isOpen={!!selectedPhotoModal}
        onClose={() => setSelectedPhotoModal(null)}
        title="Visualización de Evidencia Fotográfica"
        maxWidth="4xl"
      >
        {selectedPhotoModal && (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-[70vh]">
              <img
                src={selectedPhotoModal}
                alt="Detalle"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedPhotoModal(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
