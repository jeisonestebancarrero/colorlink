import React, { useState } from 'react';
import { useProjects } from '../context/ProjectContext';
import {
  ProjectType,
  SurfaceType,
  EnvironmentType,
  ConditionType,
  ProjectPhoto,
  ProjectFormData,
  Project,
} from '../types';
import { Input, Textarea } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { FileUploader } from '../components/common/FileUploader';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Layers,
  Sparkles,
  Building,
  MapPin,
  Calendar,
  AlertCircle,
  FileText,
  Camera,
  Send,
  Loader2,
  Check,
  RotateCcw,
  Droplets,
  ShieldCheck,
  UserCheck,
  HelpCircle,
  Info,
  DollarSign,
  Package,
} from 'lucide-react';

interface CreateProjectPageProps {
  onNavigate: (page: string, param?: string) => void;
  initialIntent?: string;
}

export const CreateProjectPage: React.FC<CreateProjectPageProps> = ({
  onNavigate,
  initialIntent,
}) => {
  const { createProject, setActiveProjectId } = useProjects();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdProjectResult, setCreatedProjectResult] = useState<Project | null>(null);

  // Canonical Form State with default realistic Pintuco Case Study (Constructora Horizonte)
  const [formData, setFormData] = useState<ProjectFormData>({
    name: 'Fachada Edificio Residencial Horizonte',
    city: 'Medellín',
    projectType: 'Edificio residencial',
    areaM2: 85,
    requiredDate: '20 días',
    description: 'Intervención de fachada exterior en concreto con presencia de fisuras menores y humedad superficial por lluvias.',
    surface: 'Concreto',
    environment: 'Exterior',
    currentColor: 'Gris concreto natural',
    conditions: ['Humedad', 'Fisuras'],
    photos: [
      {
        id: 'photo-demo-1',
        url: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&q=80&w=800',
        name: 'Fachada_Principal_Fisuras_01.jpg',
        size: '2.4 MB',
        uploadDate: 'Hoy',
        isPrimary: true,
      },
      {
        id: 'photo-demo-2',
        url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&q=80&w=800',
        name: 'Detalle_Humedad_Lateral.jpg',
        size: '3.1 MB',
        uploadDate: 'Hoy',
        isPrimary: false,
      },
    ],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const projectTypes: ProjectType[] = [
    'Edificio residencial',
    'Vivienda',
    'Edificio comercial',
    'Industria',
    'Infraestructura',
    'Mantenimiento',
    'Otro',
  ];

  const surfaceTypes: Array<{ type: SurfaceType; label: string; desc: string; icon: string }> = [
    { type: 'Concreto', label: 'Concreto', desc: 'Muros, losas y vigas estructurales a la vista', icon: '🏢' },
    { type: 'Cemento', label: 'Cemento / Mortero', desc: 'Revoque tradicional, pañete o repellado', icon: '🧱' },
    { type: 'Fachada', label: 'Fachada / Ladrillo', desc: 'Fachadas exteriores mixtas o mampostería', icon: '🏛️' },
    { type: 'Drywall', label: 'Drywall / Yeso', desc: 'Tabiquería, placas de yeso y cielo rasos interiores', icon: '📐' },
    { type: 'Metal', label: 'Metal / Acero', desc: 'Estructuras, barandas, rejas y cubiertas metálicas', icon: '⚙️' },
    { type: 'Madera', label: 'Madera / Deck', desc: 'Pérgolas, decks, puertas y vigas de madera', icon: '🪵' },
    { type: 'Otra', label: 'Otra superficie', desc: 'Sustratos especiales o combinados', icon: '🔍' },
  ];

  const environmentTypes: Array<{ type: EnvironmentType; label: string; desc: string }> = [
    { type: 'Exterior', label: 'Exterior', desc: 'Expuesto a sol directo, lluvia e intemperie' },
    { type: 'Interior', label: 'Interior', desc: 'Salas, habitaciones, oficinas y pasillos techados' },
    { type: 'Industrial', label: 'Industrial / Severo', desc: 'Bodegas, plantas con tráfico pesado o químicos' },
    { type: 'Alta humedad', label: 'Alta humedad', desc: 'Zonas costeras, terrazas expuestas o lavanderías' },
  ];

  const conditionOptions: Array<{ type: ConditionType; label: string; desc: string; badge: string }> = [
    { type: 'Humedad', label: 'Humedad / Filtración', desc: 'Manchas de agua superficial o filtración por lluvia', badge: 'Atención Alta' },
    { type: 'Fisuras', label: 'Fisuras / Grietas', desc: 'Microfisuras superficiales o juntas con abertura', badge: 'Requiere Masilla' },
    { type: 'Desprendimiento', label: 'Desprendimiento', desc: 'Pintura descascarada, revoque soplado o ampolla', badge: 'Raspado Previo' },
    { type: 'Oxidación', label: 'Oxidación / Herrumbre', desc: 'Corrosión visible en metales o pernos', badge: 'Anticorrosivo' },
    { type: 'Desgaste', label: 'Desgaste / Decoloración', desc: 'Pérdida de brillo, desgaste por tráfico o sol', badge: 'Mantenimiento' },
    { type: 'Hongos / Moho', label: 'Hongos / Moho', desc: 'Manchas negras o verdosas por biomasa', badge: 'Lavado Fúngico' },
    { type: 'Alcalinidad', label: 'Alcalinidad / Salitre', desc: 'Eflorescencias blancas de cal en el cemento', badge: 'Sellador Antialcalino' },
    { type: 'Buen estado', label: 'Buen estado general', desc: 'Superficie sana lista para renovación o nuevo color', badge: 'Directo' },
  ];

  const areaPresets = [50, 85, 120, 250, 500];

  const helperFillExamples = [
    {
      title: 'Fachada con humedad y fisuras (85 m²)',
      fill: {
        name: 'Fachada Edificio Residencial Horizonte',
        city: 'Medellín',
        projectType: 'Edificio residencial' as ProjectType,
        areaM2: 85,
        requiredDate: '20 días',
        description: 'Intervención de fachada exterior en concreto con presencia de fisuras menores y humedad superficial por lluvias.',
        surface: 'Concreto' as SurfaceType,
        environment: 'Exterior' as EnvironmentType,
        conditions: ['Humedad', 'Fisuras'] as ConditionType[],
      },
    },
    {
      title: 'Piso industrial bodega (450 m²)',
      fill: {
        name: 'Mantenimiento Pisos Bodega Logística',
        city: 'Medellín',
        projectType: 'Industria' as ProjectType,
        areaM2: 450,
        requiredDate: '30 días',
        description: 'Renovación de piso industrial de concreto con alto tránsito de montacargas y transpaletas. Desgaste severo.',
        surface: 'Concreto' as SurfaceType,
        environment: 'Industrial' as EnvironmentType,
        conditions: ['Desgaste', 'Oxidación'] as ConditionType[],
      },
    },
    {
      title: 'Pintura interior drywall (210 m²)',
      fill: {
        name: 'Renovación Muros Interiores Torre Médica',
        city: 'Cali',
        projectType: 'Edificio comercial' as ProjectType,
        areaM2: 210,
        requiredDate: '15 días',
        description: 'Pintura interior antibacterial en muros de drywall para consultorios médicos y salas de espera.',
        surface: 'Drywall' as SurfaceType,
        environment: 'Interior' as EnvironmentType,
        conditions: ['Buen estado'] as ConditionType[],
      },
    },
  ];

  const validateStep = (step: number): boolean => {
    const errs: Record<string, string> = {};

    if (step === 1) {
      if (!formData.name.trim()) errs.name = 'El nombre del proyecto es requerido';
      if (!formData.city.trim()) errs.city = 'La ciudad es requerida';
      if (!formData.description.trim()) errs.description = 'Describe brevemente qué necesitas intervenir';
    }

    if (step === 2) {
      if (!formData.surface) errs.surface = 'Selecciona la superficie';
    }

    if (step === 3) {
      if (!formData.environment) errs.environment = 'Selecciona el ambiente';
      if (!formData.areaM2 || Number(formData.areaM2) <= 0) {
        errs.areaM2 = 'Ingresa un área en m² válida mayor a 0';
      }
    }

    if (step === 4) {
      if (formData.conditions.length === 0) {
        errs.conditions = 'Selecciona al menos una condición o estado actual';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const toggleCondition = (cond: ConditionType) => {
    setFormData((prev) => {
      let nextConditions = [...prev.conditions];
      if (cond === 'Buen estado') {
        return { ...prev, conditions: ['Buen estado'] };
      }
      // If adding another condition, remove 'Buen estado'
      nextConditions = nextConditions.filter((c) => c !== 'Buen estado');

      if (nextConditions.includes(cond)) {
        nextConditions = nextConditions.filter((c) => c !== cond);
      } else {
        nextConditions.push(cond);
      }
      return { ...prev, conditions: nextConditions };
    });
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsSubmitting(true);
    try {
      const result = await createProject(formData);
      setCreatedProjectResult(result);
    } catch (e) {
      console.error('Error creating project', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If already created, render the structured Preliminary Diagnostic Results Engine
  if (createdProjectResult) {
    const analysis = createdProjectResult.preliminaryAnalysis;
    const products = createdProjectResult.recommendedProducts;
    const budget = createdProjectResult.budgetSummary;

    return (
      <div className="max-w-4xl mx-auto space-y-6 text-left pb-16 animate-in fade-in duration-300">
        {/* Success Header */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  Diagnóstico Preliminar Completado
                </span>
                <span className="text-xs font-mono font-bold text-emerald-800">
                  {createdProjectResult.code}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                {createdProjectResult.name}
              </h2>
              <p className="text-xs text-slate-600">
                Registrado para {createdProjectResult.city} ({createdProjectResult.areaM2} m² · {createdProjectResult.surface})
              </p>
            </div>
          </div>

          <Button
            variant="pintuco"
            onClick={() => {
              setActiveProjectId(createdProjectResult.id);
              onNavigate('project-detail', createdProjectResult.id);
            }}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="shadow-sm whitespace-nowrap self-stretch sm:self-auto"
          >
            Ver expediente del proyecto
          </Button>
        </div>

        {/* 1. Diagnostic Findings & System Recommendation */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Motor de Clasificación Técnica Pintuco
              </span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  analysis.attentionLevel === 'Alta' || analysis.attentionLevel === 'Especializada'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                Nivel de Atención: {analysis.attentionLevel}
              </span>
            </div>

            <h3 className="text-lg font-bold text-slate-900 mt-2">
              Sistema Recomendado: {analysis.solutionCategory}
            </h3>

            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              {analysis.aiSummary}
            </p>
          </div>

          {/* Key Technical Rules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Consideraciones de Aplicación
              </h4>
              <ul className="space-y-1.5 text-slate-600">
                {analysis.keyConsiderations.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[#004F9F] font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-100 space-y-2">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#004F9F]" />
                Acompañamiento Técnico Pintuco ($0 COP)
              </h4>
              <p className="text-slate-600 text-xs leading-relaxed">
                Este proyecto califica para acompañamiento técnico presencial o virtual por parte del departamento de ingeniería de Pintuco para validar lecturas de humedad y prueba de adherencia.
              </p>
              <div className="pt-1">
                <span className="text-[11px] font-semibold text-[#004F9F] bg-white border border-blue-200 px-2 py-1 rounded inline-block">
                  ✓ Incluido en el programa B2B Pintuco
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Calculated Products Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#004F9F]" />
                Estimación Preliminar de Materiales ({createdProjectResult.areaM2} m²)
              </h3>
              <p className="text-xs text-slate-500">
                Cantidades calculadas según rendimiento teórico de Pintuco (Área × Manos ÷ Rendimiento).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {products.map((prod, idx) => (
              <div
                key={prod.id}
                className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-[#004F9F] px-2 py-0.5 rounded inline-block mb-2">
                    Paso {idx + 1}: {prod.role}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">{prod.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{prod.description}</p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cantidad estimada:</span>
                    <span className="font-bold text-slate-800">{prod.estimatedQuantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Disponibilidad:</span>
                    <span className="font-semibold text-emerald-700">{prod.availability}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 italic pt-1">
            * Cantidades referenciales sujetas a verificación en obra por el contratista o especialista técnico.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onNavigate('dashboard')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Ir al Inicio
          </Button>

          <Button
            variant="pintuco"
            size="lg"
            onClick={() => {
              setActiveProjectId(createdProjectResult.id);
              onNavigate('project-detail', createdProjectResult.id);
            }}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="shadow-md"
          >
            Abrir Expediente y Solicitar Visita Técnica
          </Button>
        </div>
      </div>
    );
  }

  // Multi-Step Customer Assistant Wizard View
  return (
    <div className="max-w-3xl mx-auto space-y-6 text-left pb-16">
      {/* Top Breadcrumb & Step Indicators */}
      <div className="space-y-3 border-b border-slate-200/80 pb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('dashboard')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancelar y volver al Inicio</span>
          </button>

          <span className="text-xs font-bold text-[#004F9F] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
            Asistente de Solución · Paso {currentStep} de 5
          </span>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { num: 1, label: '1. Tu necesidad' },
            { num: 2, label: '2. Superficie' },
            { num: 3, label: '3. Ambiente & Área' },
            { num: 4, label: '4. Condición' },
            { num: 5, label: '5. Fotos & Resumen' },
          ].map((st) => (
            <div key={st.num} className="space-y-1">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentStep >= st.num ? 'bg-[#004F9F]' : 'bg-slate-200'
                }`}
              />
              <span
                className={`text-[10px] hidden sm:block truncate ${
                  currentStep === st.num
                    ? 'font-bold text-[#004F9F]'
                    : currentStep > st.num
                    ? 'font-medium text-slate-600'
                    : 'text-slate-400'
                }`}
              >
                {st.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Wizard Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-6">
        {/* STEP 1: Cuéntanos qué necesitas */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                Paso 1 de 5
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                Cuéntanos qué necesitas solucionar
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Describe con tus palabras el proyecto o el problema que deseas intervenir.
              </p>
            </div>

            {/* Quick Demo Pre-fills */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#004F9F]" />
                Casos frecuentes de ejemplo (Haz clic para autocompletar):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {helperFillExamples.map((ex, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, ...ex.fill }));
                    }}
                    className="text-[11px] font-medium bg-white hover:bg-blue-50 text-slate-700 hover:text-[#004F9F] border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    {ex.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Textarea
                id="field-project-desc"
                label="¿Qué necesitas hacer o qué problema presenta la obra?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ej. Necesito pintar la fachada exterior de un edificio de 85 m² en concreto. Tiene filtraciones de humedad y microfisuras."
                rows={3}
                error={errors.description}
                helperText="Explica el contexto: qué tipo de espacio es, si hay humedad o si buscas renovar color."
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="field-project-name"
                  label="Nombre de referencia del proyecto"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Fachada Edificio Residencial Horizonte"
                  error={errors.name}
                  required
                />

                <Input
                  id="field-project-city"
                  label="Ciudad o Municipio"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Ej. Medellín, Bogotá, Cali, Barranquilla..."
                  error={errors.city}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  id="field-project-type"
                  label="Tipo de edificación"
                  value={formData.projectType}
                  onChange={(e) =>
                    setFormData({ ...formData, projectType: e.target.value as ProjectType })
                  }
                  options={projectTypes.map((t) => ({ value: t, label: t }))}
                />

                <Input
                  id="field-project-date"
                  label="¿Cuándo necesitas realizar el proyecto?"
                  value={formData.requiredDate}
                  onChange={(e) => setFormData({ ...formData, requiredDate: e.target.value })}
                  placeholder="Ej. 20 días, En 1 mes, Inmediato..."
                  helperText="Nos ayuda a coordinar visitas y disponibilidad de material."
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: ¿Qué superficie vas a intervenir? */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                Paso 2 de 5
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                ¿Qué superficie vas a intervenir?
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                La formulación química y el sellador dependen directamente del sustrato.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {surfaceTypes.map((s) => {
                const isSelected = formData.surface === s.type;
                return (
                  <div
                    key={s.type}
                    onClick={() => setFormData({ ...formData, surface: s.type })}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'border-[#004F9F] bg-blue-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="text-2xl">{s.icon}</span>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">{s.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#004F9F]" />}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {errors.surface && (
              <p className="text-xs text-rose-600 font-medium">{errors.surface}</p>
            )}
          </div>
        )}

        {/* STEP 3: Ambiente & Metraje (Área m2) */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                Paso 3 de 5
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                ¿Dónde se encuentra y cuánto mide la superficie?
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Indica la exposición al clima y el área aproximada en metros cuadrados (m²).
              </p>
            </div>

            {/* Environment selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Ambiente de exposición
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {environmentTypes.map((env) => {
                  const isSelected = formData.environment === env.type;
                  return (
                    <div
                      key={env.type}
                      onClick={() => setFormData({ ...formData, environment: env.type })}
                      className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#004F9F] bg-blue-50/50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">{env.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#004F9F]" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{env.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Area in m² Section */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-bold text-slate-900 block">
                    Área aproximada a intervenir
                  </label>
                  <span className="text-xs text-slate-500">
                    Utilizada para calcular galones, cuñetes y mano de obra preliminar
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-white border border-slate-300 px-3 py-1.5 rounded-xl shadow-2xs">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={formData.areaM2}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        areaM2: e.target.value === '' ? '' : Number(e.target.value),
                      })
                    }
                    className="w-20 text-right font-extrabold text-lg text-[#004F9F] focus:outline-none"
                  />
                  <span className="text-xs font-bold text-slate-500">m²</span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/80">
                <span className="text-[11px] text-slate-400 font-medium">Metrajes habituales:</span>
                {areaPresets.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFormData({ ...formData, areaM2: val })}
                    className={`text-xs px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      formData.areaM2 === val
                        ? 'bg-[#004F9F] text-white shadow-2xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {val} m²
                  </button>
                ))}
              </div>

              {errors.areaM2 && (
                <p className="text-xs text-rose-600 font-medium">{errors.areaM2}</p>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: Condición / Patología */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                Paso 4 de 5
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                ¿Qué problema o condición presenta la superficie?
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Puedes seleccionar más de una opción para ajustar el esquema de preparación técnica.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {conditionOptions.map((cond) => {
                const isSelected = formData.conditions.includes(cond.type);
                return (
                  <div
                    key={cond.type}
                    onClick={() => toggleCondition(cond.type)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#004F9F] bg-blue-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">{cond.label}</span>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                            isSelected
                              ? 'bg-[#004F9F] border-[#004F9F] text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{cond.desc}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {cond.badge}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {errors.conditions && (
              <p className="text-xs text-rose-600 font-medium">{errors.conditions}</p>
            )}
          </div>
        )}

        {/* STEP 5: Fotografías & Resumen "Esto es lo que entendimos" */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded">
                Paso 5 de 5
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                Muéstranos la superficie & Confirma tu solicitud
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Las fotografías ayudan a nuestro sistema y a nuestros especialistas a comprender mejor la superficie antes de la visita.
              </p>
            </div>

            {/* Photo Uploader */}
            <div className="space-y-2">
              <FileUploader
                photos={formData.photos}
                onChange={(photos) => setFormData({ ...formData, photos })}
                maxPhotos={6}
              />
            </div>

            {/* "Esto es lo que entendimos" Summary Box */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#004F9F]" />
                Esto es lo que entendimos de tu proyecto:
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-white rounded-xl p-4 border border-slate-200/80">
                <div>
                  <span className="text-slate-400 block text-[11px]">Proyecto:</span>
                  <span className="font-bold text-slate-800">{formData.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Ubicación:</span>
                  <span className="font-bold text-slate-800">{formData.city}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Superficie & Área:</span>
                  <span className="font-bold text-[#004F9F]">
                    {formData.surface} ({formData.areaM2} m²)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Ambiente:</span>
                  <span className="font-bold text-slate-800">{formData.environment}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Condición:</span>
                  <span className="font-bold text-amber-700">
                    {formData.conditions.join(', ')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Plazo requerido:</span>
                  <span className="font-bold text-slate-800">{formData.requiredDate}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  Al enviar, el Asistente generará el cálculo de materiales y asignará un especialista técnico de Pintuco.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Form Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          {currentStep > 1 ? (
            <Button
              variant="outline"
              onClick={handlePrevStep}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Anterior
            </Button>
          ) : (
            <div />
          )}

          {currentStep < 5 ? (
            <Button
              variant="pintuco"
              onClick={handleNextStep}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              className="shadow-sm"
            >
              Continuar
            </Button>
          ) : (
            <Button
              variant="pintuco"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              leftIcon={<Send className="w-4 h-4" />}
              className="shadow-md"
            >
              Generar Diagnóstico y Solución
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
