import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProjects } from '../context/ProjectContext';
import { useCart } from '../context/CartContext';
import { useColorPalette, useProducts, useSolutionKits } from '../hooks/useCatalog';
import { StatusBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { AvisoVinculaciones } from '../components/common/AvisoVinculaciones';
import {
  ShoppingBag,
  ShoppingCart,
  Palette,
  Package,
  Calculator,
  Building2,
  Droplets,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  Clock,
  MapPin,
  Star,
  Layers,
  Store,
  Phone,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  // FASE 4 — bloques de catálogo del panel desde Supabase. Los proyectos
  // siguen viniendo de ProjectContext hasta la FASE 5.
  const { data: PINTUCO_PRODUCTS } = useProducts();
  const { data: PINTUCO_SOLUTION_KITS } = useSolutionKits();
  const { data: PINTUCO_COLOR_PALETTES } = useColorPalette();

  const { user } = useAuth();
  const { projects, activeProject, setActiveProjectId } = useProjects();
  const { addToCart, setIsCartOpen } = useCart();

  const [selectedProblemTab, setSelectedProblemTab] = useState<string>('fachada');

  // Proyecto activo. FASE 5: se retiró el fallback al id de dato mock
  // 'proj-horiz-001', que con proyectos reales nunca coincide.
  const currentProject = activeProject || projects[0];

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleOpenProject = (id: string) => {
    setActiveProjectId(id);
    onNavigate('project-detail', id);
  };

  const quickIntents = [
    {
      id: 'store',
      title: 'Comprar Pintura',
      subtitle: 'Vinilos, Fachadas, Esmaltes e Impermeabilizantes',
      icon: ShoppingBag,
      color: 'bg-blue-600',
      action: () => onNavigate('store'),
      badge: 'Catálogo Oficial',
    },
    {
      id: 'color',
      title: 'Encuentra tu Color',
      subtitle: 'Simulador de ambientes y carta de color 2025',
      icon: Palette,
      color: 'bg-purple-600',
      action: () => onNavigate('colors'),
      badge: 'Visualizador en Vivo',
    },
    {
      id: 'kits',
      title: 'Kits de Solución',
      subtitle: 'Sistemas multicapa empaquetados con hasta 15% dcto',
      icon: Package,
      color: 'bg-amber-600',
      action: () => onNavigate('solutions'),
      badge: 'Paquetes con Descuento',
    },
    {
      id: 'calc',
      title: 'Calculadora de Metraje',
      subtitle: 'Calcula galones y cuñetes según tus m² exactos',
      icon: Calculator,
      color: 'bg-emerald-600',
      action: () => onNavigate('calculator'),
      badge: 'Cálculo Preciso',
    },
  ];

  const problemSolutions = {
    fachada: {
      title: 'Fachada con Grietas y Humedad Exterior (Caso 85 m²)',
      description:
        'Intervención integral para frenar filtraciones de agua de lluvia y puentear microfisuras con garantía de 5 años.',
      kitId: 'kit-fachada-5anos',
      products: ['Masilla Elastomérica', 'Sellador Antialcalino', 'Koraza 5 Años'],
      estimatedCost: 1087700,
      image: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&q=80&w=600',
    },
    humedad: {
      title: 'Muros Interiores con Manchas y Hongos',
      description:
        'Tratamiento higiénico antimicrobiano para eliminar esporas de raíz y sellar la porosidad del estuco.',
      kitId: 'kit-antihumedad-interior',
      products: ['Limpiador Antihongos', 'Sellador Bloqueador', 'Viniltex Avanzada'],
      estimatedCost: 673800,
      image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&q=80&w=600',
    },
    techo: {
      title: 'Terrazas y Techos con Filtraciones / Goteras',
      description:
        'Membrana elástica continua reforzada con microfibras para losas transitables y cubiertas expuestas.',
      kitId: 'kit-techo-impermeable',
      products: ['Masilla Juntas', 'Aquablock Fibratado 8 Años (x2 Cuñetes)'],
      estimatedCost: 1268700,
      image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600',
    },
    metal: {
      title: 'Rejas, Portones y Estructuras Metálicas Oxidadas',
      description:
        'Transforma el óxido existente y brinda acabado brillante anticorrosivo sin requerir base previa.',
      kitId: 'kit-metal-antioxidante',
      products: ['Lija y Desengrasante', 'Pintulux 3 en 1 Anticorrosivo'],
      estimatedCost: 279700,
      image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&q=80&w=600',
    },
  };

  const currentProblem = problemSolutions[selectedProblemTab as keyof typeof problemSolutions];

  return (
    <div className="space-y-8 pb-16">
      {/* Alguien espera una decisión que solo este usuario puede tomar: va
          antes que cualquier banner comercial. Se dibuja solo si hay
          solicitudes pendientes. */}
      <AvisoVinculaciones onNavigate={onNavigate} />

      {/* Top Value Banner */}
      <div className="bg-linear-to-r from-blue-950 via-[#004F9F] to-blue-900 rounded-2xl text-white p-6 sm:p-8 shadow-lg overflow-hidden relative border border-blue-900/40">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-yellow-400 text-slate-950 px-3 py-1 rounded-full text-xs font-extrabold shadow-2xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ecosistema Digital Pintuco • Todo para tu Obra y Hogar</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
            ¿Qué necesitas resolver con Pintuco hoy?
          </h1>

          <p className="text-sm text-blue-100 font-medium leading-relaxed">
            Compra pinturas originales, simula colores en vivo, calcula los galones exactos de tu espacio o gestiona tus obras con respaldo técnico certificado.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('store')}
              className="bg-white hover:bg-slate-100 text-[#004F9F] text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Explorar Tienda Online</span>
            </button>
            <button
              onClick={() => onNavigate('colors')}
              className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-white/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Palette className="w-4 h-4" />
              <span>Simular Color en Ambientes</span>
            </button>
            <button
              onClick={() => onNavigate('projects')}
              className="bg-white/10 hover:bg-white/20 text-blue-100 text-xs font-semibold px-4 py-2.5 rounded-xl border border-white/15 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>Mis Proyectos de Obra</span>
            </button>
          </div>
        </div>

        {/* Decorative ambient background */}
        <div className="absolute -right-10 -bottom-10 w-96 h-96 rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />
      </div>

      {/* 4 Quick Intent Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickIntents.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={item.action}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between space-y-3"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl ${item.color} text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    {item.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-[#004F9F] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-[#004F9F] font-bold">
                <span>Comenzar</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Client Active Project Highlight (Constructora Horizonte 85m2) */}
      {currentProject && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6 shadow-xs relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-[#004F9F] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Proyecto B2B Activo • {user?.company || 'Constructora Horizonte S.A.S.'}
                </span>
                <StatusBadge status={currentProject.status} />
              </div>

              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  {currentProject.name} ({currentProject.areaM2} m² • {currentProject.surface})
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {currentProject.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#004F9F]" /> {currentProject.city}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Paso {currentProject.currentStepProgress || 3} de 8 en Proceso
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Sistema Koraza 5 Años Asignado
                </span>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
              <Button
                onClick={() => handleOpenProject(currentProject.id)}
                variant="primary"
                className="bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold px-4 py-2.5 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Ver Diagnóstico y Ficha de Obra</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              <button
                onClick={() => {
                  const kit = PINTUCO_SOLUTION_KITS[0];
                  addToCart(PINTUCO_PRODUCTS[0], 'Cuñete 5 Galones (18.9 L)', 'Blanco Nieve', '#F8FAFC', 1);
                }}
                className="bg-blue-50 hover:bg-blue-100 text-[#004F9F] text-xs font-bold px-4 py-2 rounded-lg border border-blue-200 transition-colors cursor-pointer text-center"
              >
                + Comprar Materiales del Proyecto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive "Soluciona tu Problema en 1 Clic" Module */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#004F9F] flex items-center gap-1.5">
              <Droplets className="w-4 h-4" /> Diagnóstico y Solución Inmediata
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
              ¿Cuál es la patología o reto de tu superficie?
            </h2>
          </div>
          <button
            onClick={() => onNavigate('solutions')}
            className="text-xs font-bold text-[#004F9F] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ver todos los Kits</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Problem Pills Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedProblemTab('fachada')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedProblemTab === 'fachada'
                ? 'bg-[#004F9F] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            🏢 Fachadas con Fisuras y Humedad (85m²)
          </button>
          <button
            onClick={() => setSelectedProblemTab('humedad')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedProblemTab === 'humedad'
                ? 'bg-[#004F9F] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            💧 Paredes con Hongos & Moho
          </button>
          <button
            onClick={() => setSelectedProblemTab('techo')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedProblemTab === 'techo'
                ? 'bg-[#004F9F] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            🛡️ Goteras & Terrazas Transitables
          </button>
          <button
            onClick={() => setSelectedProblemTab('metal')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedProblemTab === 'metal'
                ? 'bg-[#004F9F] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            ⚙️ Rejas & Metales Oxidados
          </button>
        </div>

        {/* Problem Solution Card Display */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-center gap-6">
          <div className="w-full md:w-56 h-40 rounded-xl overflow-hidden border border-slate-200 shrink-0">
            <img
              src={currentProblem.image}
              alt={currentProblem.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 space-y-3 text-left">
            <div>
              <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                Solución Técnica Recomendada
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-1">
                {currentProblem.title}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                {currentProblem.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">Productos del Kit:</span>
              {currentProblem.products.map((prod, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-semibold bg-white text-[#004F9F] px-2 py-0.5 rounded border border-blue-200 shadow-2xs"
                >
                  ✓ {prod}
                </span>
              ))}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Inversión Kit Completo:</span>
                <span className="text-lg font-extrabold text-[#004F9F]">
                  {formatCOP(currentProblem.estimatedCost)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate('solutions')}
                  className="bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>Ver Kit y Comprar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Products Carousel / Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
              Pinturas Más Vendidas Pintuco
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Líneas arquitectónicas e industriales con mayor demanda en Colombia
            </p>
          </div>
          <button
            onClick={() => onNavigate('store')}
            className="text-xs font-bold text-[#004F9F] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ver todo el catálogo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PINTUCO_PRODUCTS.slice(0, 4).map((product) => {
            const pres = product.presentations[0];
            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between group"
              >
                <div
                  className="relative h-44 bg-slate-100 overflow-hidden cursor-pointer"
                  onClick={() => onNavigate('store')}
                >
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {product.badge && (
                    <span className="absolute top-2.5 left-2.5 bg-[#004F9F] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                      {product.badge}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-[#004F9F]">
                      {product.category}
                    </span>
                    <h3
                      onClick={() => onNavigate('store')}
                      className="text-xs font-bold text-slate-900 group-hover:text-[#004F9F] transition-colors line-clamp-1 cursor-pointer"
                    >
                      {product.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {product.tagline}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Desde</span>
                      <span className="text-sm font-extrabold text-[#004F9F]">
                        {formatCOP(pres.priceCOP)}
                      </span>
                    </div>

                    <button
                      onClick={() => addToCart(product, pres.label)}
                      className="bg-[#004F9F] hover:bg-[#003B77] text-white p-2 rounded-lg transition-colors cursor-pointer shadow-xs"
                      title="Agregar al carrito"
                    >
                      <ShoppingCart className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Color Trends Teaser */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
              Colección Tendencias 2025
            </span>
            <h2 className="text-lg font-extrabold text-slate-900 mt-1">
              Colores Diseñados para Transformar Espacios
            </h2>
          </div>
          <button
            onClick={() => onNavigate('colors')}
            className="text-xs font-bold text-[#004F9F] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Simular en Paredes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {PINTUCO_COLOR_PALETTES.slice(0, 6).map((color) => (
            <div
              key={color.code}
              onClick={() => onNavigate('colors')}
              className="p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-400 transition-all cursor-pointer text-left space-y-2 group"
            >
              <div
                className="w-full h-14 rounded-lg border border-slate-300/80 shadow-2xs group-hover:scale-105 transition-transform"
                style={{ backgroundColor: color.hex }}
              />
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase block">{color.code}</span>
                <p className="text-xs font-bold text-slate-900 truncate">{color.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Store Pickup & Technical Support Banner */}
      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-[#004F9F] flex items-center justify-center shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Retiro Gratis en Tienda Pintuco y Asesoría Técnica en Obra
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Selecciona tu tienda en Medellín, Bogotá, Cali o Barranquilla. Recoge tu pedido listo en 2 horas con mezcla de color computarizada y asesoría gratuita.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => onNavigate('stores')}
            className="w-full md:w-auto bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer text-center"
          >
            Ver Tiendas y Horarios
          </button>
        </div>
      </div>
    </div>
  );
};
