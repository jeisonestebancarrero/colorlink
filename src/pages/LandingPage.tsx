import React, { useState } from 'react';
import {
  Layers,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Building2,
  Wrench,
  Truck,
  Award,
  ChevronRight,
  Play,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Package,
  Calculator,
  Store,
  Phone,
  Search,
  MapPin,
  Star,
  SlidersHorizontal,
  Droplets,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useColorPalette, useProducts, useSolutionKits } from '../hooks/useCatalog';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';

interface LandingPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  // FASE 4 — catálogo desde Supabase.
  // Sin guarda de carga: la landing es una página de marketing con secciones
  // propias; mientras llegan los datos las rejillas se pintan vacías y se
  // rellenan solas. Bloquear la página entera sería un cambio de experiencia.
  const { data: PINTUCO_PRODUCTS } = useProducts();
  const { data: PINTUCO_SOLUTION_KITS } = useSolutionKits();
  const { data: PINTUCO_COLOR_PALETTES } = useColorPalette();

  const { addToCart, selectedStore } = useCart();
  const [heroSearch, setHeroSearch] = useState('');
  const [selectedProblemTab, setSelectedProblemTab] = useState('fachada');

  const handleHeroSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      onNavigate('store', heroSearch.trim());
    }
  };

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const problemSolutions = {
    fachada: {
      title: 'Fachada Exterior con Fisuras y Lluvia (Caso 85 m²)',
      description:
        'Tratamiento integral de sellado elástico y acabado hidrófugo con Koraza 5 Años. Resistente a rayos UV, hongos y polvo.',
      kitId: 'kit-fachada-5anos',
      products: ['Masilla Elastomérica', 'Sellador Antialcalino', 'Koraza 5 Años'],
      estimatedCost: 1087700,
      image:
        'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&q=80&w=800',
    },
    humedad: {
      title: 'Paredes con Manchas de Humedad y Moho',
      description:
        'Elimina el hongo de raíz, neutraliza la alcalinidad y sella con Viniltex Antibacterial de alta lavabilidad.',
      kitId: 'kit-antihumedad-interior',
      products: ['Limpiador Antihongos', 'Sellador Bloqueador', 'Viniltex Avanzada'],
      estimatedCost: 673800,
      image:
        'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&q=80&w=800',
    },
    techo: {
      title: 'Terrazas, Techos y Losas con Goteras',
      description:
        'Membrana elástica continua reforzada con microfibras sintéticas que puentea fisuras y soporta empozamientos leves.',
      kitId: 'kit-techo-impermeable',
      products: ['Masilla Acrílica Juntas', 'Aquablock Fibratado 8 Años (x2 Cuñetes)'],
      estimatedCost: 1268700,
      image:
        'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=800',
    },
    metal: {
      title: 'Rejas, Puertas y Vigas Metálicas Oxidadas',
      description:
        'Pintulux 3 en 1 actúa directo sobre el óxido sin necesidad de aplicar anticorrosivo previo, dejando acabado brillante.',
      kitId: 'kit-metal-antioxidante',
      products: ['Lija Grano 120', 'Pintulux 3 en 1 Anticorrosivo Directo al Óxido'],
      estimatedCost: 279700,
      image:
        'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&q=80&w=800',
    },
  };

  const currentProblem = problemSolutions[selectedProblemTab as keyof typeof problemSolutions];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-[#004F9F] selection:text-white">
      {/* 1. TOP CORPORATE RIBBON */}
      <div className="bg-[#002244] text-white text-[11px] py-1.5 px-4 sm:px-6 lg:px-8 flex items-center justify-between font-medium">
        <div className="flex items-center gap-4 truncate">
          <span className="flex items-center gap-1.5 text-blue-200">
            <Store className="w-3.5 h-3.5 text-yellow-400" />
            <span>Retiro en Tienda Pintuco:</span>
            <strong className="text-white font-bold">{selectedStore.name} ({selectedStore.city})</strong>
            <span className="hidden sm:inline bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
              Listo en 2 hrs
            </span>
          </span>
          <span className="hidden md:inline text-blue-400">•</span>
          <span className="hidden md:flex items-center gap-1 text-blue-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Garantía Directa de Fábrica Pintuco
          </span>
        </div>

        <div className="flex items-center gap-3 text-blue-200 shrink-0">
          <span className="hidden lg:inline flex items-center gap-1 text-blue-100">
            <Phone className="w-3 h-3 text-yellow-400" /> Línea Constructor: <strong>(01 8000) 111-247</strong>
          </span>
        </div>
      </div>

      {/* 2. MAIN HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            {/* Logotipo oficial. Su fondo azul propio se enmarca en el mismo
                azul para que no quede un recorte flotando sobre el blanco. */}
            <div className="w-10 h-10 rounded-xl bg-[#002D5C] flex items-center justify-center overflow-hidden shadow-md group-hover:scale-105 transition-transform shrink-0">
              <img src={logoPintuco} alt="Pintuco" className="w-full h-full object-contain p-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight text-slate-900 leading-none">
                  COLOR<span className="text-[#004F9F]">LINK</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-slate-950 px-1.5 py-0.5 rounded shadow-2xs">
                  PINTUCO
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold tracking-tight">
                Tienda Oficial & Ecosistema Digital
              </span>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 text-xs font-bold text-slate-700">
            <button
              onClick={() => onNavigate('store')}
              className="px-3 py-2 rounded-lg hover:text-[#004F9F] hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Comprar Pinturas
            </button>
            <button
              onClick={() => onNavigate('colors')}
              className="px-3 py-2 rounded-lg hover:text-[#004F9F] hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Encuentra tu Color
            </button>
            <button
              onClick={() => onNavigate('solutions')}
              className="px-3 py-2 rounded-lg hover:text-[#004F9F] hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Soluciones por Superficie
            </button>
            <button
              onClick={() => onNavigate('calculator')}
              className="px-3 py-2 rounded-lg hover:text-[#004F9F] hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Calculadora de Pintura
            </button>
            <button
              onClick={() => onNavigate('stores')}
              className="px-3 py-2 rounded-lg hover:text-[#004F9F] hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Puntos de Retiro
            </button>
          </nav>

          {/* Right CTAs */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('login')}
              className="text-slate-700 text-xs font-bold"
            >
              Iniciar sesión
            </Button>
            <Button
              variant="pintuco"
              size="sm"
              onClick={() => onNavigate('store')}
              leftIcon={<ShoppingBag className="w-3.5 h-3.5" />}
              className="text-xs font-bold shadow-md shadow-[#004F9F]/20"
            >
              Explorar Tienda
            </Button>
          </div>
        </div>
      </header>

      {/* 3. HERO COMMERCIAL BANNER */}
      <section className="relative pt-12 pb-20 overflow-hidden bg-linear-to-b from-blue-950 via-[#003875] to-[#004F9F] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-slate-950 px-3.5 py-1 rounded-full text-xs font-black shadow-md">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ecosistema Digital Oficial de Pinturas Pintuco</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
              Todo lo que necesitas para tu espacio,{' '}
              <span className="text-yellow-400">respaldado por Pintuco</span>
            </h1>

            <p className="text-base sm:text-lg text-blue-100 font-medium leading-relaxed max-w-2xl mx-auto">
              Compra pinturas originales con retiro en 2 horas, simula paletas de color en vivo, calcula galones exactos para tu metraje y diagnostica patologías de muro con garantía certificada.
            </p>

            {/* Smart Intent Search Box in Hero */}
            <form
              onSubmit={handleHeroSearchSubmit}
              className="max-w-2xl mx-auto bg-white p-2 rounded-2xl shadow-2xl flex items-center gap-2 border border-blue-200"
            >
              <div className="pl-3 text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder="¿Qué necesitas? Ej: Fachada 85 m², humedad en pared, Viniltex Blanco, Koraza..."
                className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium focus:outline-none py-2"
              />
              <button
                type="submit"
                className="bg-[#004F9F] hover:bg-[#003875] text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                Buscar Solución
              </button>
            </form>

            {/* 4 Quick Entry Intent Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 max-w-4xl mx-auto">
              <button
                onClick={() => onNavigate('store')}
                className="bg-white/10 hover:bg-white/20 border border-white/20 p-3 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs group"
              >
                <ShoppingBag className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-white">Comprar Pinturas</span>
                <span className="text-[10px] text-blue-200">Viniltex, Koraza, Aquablock</span>
              </button>

              <button
                onClick={() => onNavigate('colors')}
                className="bg-white/10 hover:bg-white/20 border border-white/20 p-3 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs group"
              >
                <Palette className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-white">Encuentra tu Color</span>
                <span className="text-[10px] text-blue-200">Simulador en Vivo</span>
              </button>

              <button
                onClick={() => onNavigate('solutions')}
                className="bg-white/10 hover:bg-white/20 border border-white/20 p-3 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs group"
              >
                <Package className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-white">Kits de Solución</span>
                <span className="text-[10px] text-yellow-300 font-extrabold">Hasta 15% Dcto</span>
              </button>

              <button
                onClick={() => onNavigate('calculator')}
                className="bg-white/10 hover:bg-white/20 border border-white/20 p-3 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs group"
              >
                <Calculator className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-white">Calculadora</span>
                <span className="text-[10px] text-blue-200">Galones por m² exactos</span>
              </button>
            </div>
          </div>
        </div>

        {/* Decorative backdrop shapes */}
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* 4. VALUE PROPOSITION STRIP */}
      <section className="bg-white border-b border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#004F9F] flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">Retiro en 2 Horas</p>
              <p className="text-[11px] text-slate-500">En tiendas Pintuco de Colombia</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">Garantía Directa</p>
              <p className="text-[11px] text-slate-500">De 5 a 8 años certificada</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">Color Computarizado</p>
              <p className="text-[11px] text-slate-500">+1,000 tonos exactos al instante</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">Asesoría en Obra</p>
              <p className="text-[11px] text-slate-500">Acompañamiento técnico B2B</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. INTERACTIVE INTENT SOLVER: "Tengo un problema y quiero resolverlo" */}
      <section className="py-14 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#004F9F] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Solución Técnica en 1 Clic
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
              ¿Cuál es la patología o necesidad de tu espacio?
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Selecciona tu caso y obtén de inmediato el sistema multicapa Pintuco recomendado con cantidades calculadas.
            </p>
          </div>

          {/* Problem Selector Tabs */}
          <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedProblemTab('fachada')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedProblemTab === 'fachada'
                  ? 'bg-[#004F9F] text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              🏢 Fachada Exterior 85 m²
            </button>
            <button
              onClick={() => setSelectedProblemTab('humedad')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedProblemTab === 'humedad'
                  ? 'bg-[#004F9F] text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              💧 Manchas de Humedad & Moho
            </button>
            <button
              onClick={() => setSelectedProblemTab('techo')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedProblemTab === 'techo'
                  ? 'bg-[#004F9F] text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              🛡️ Goteras & Terrazas Transitables
            </button>
            <button
              onClick={() => setSelectedProblemTab('metal')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedProblemTab === 'metal'
                  ? 'bg-[#004F9F] text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              ⚙️ Rejas & Metales Oxidados
            </button>
          </div>

          {/* Active Solution Showcase */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-md flex flex-col lg:flex-row items-center gap-8">
            <div className="w-full lg:w-96 h-60 rounded-2xl overflow-hidden border border-slate-200 shrink-0 relative group">
              <img
                src={currentProblem.image}
                alt={currentProblem.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <span className="absolute top-3 left-3 bg-[#004F9F] text-white text-[10px] font-extrabold px-2.5 py-1 rounded-md shadow-xs">
                Kit Oficial Pintuco
              </span>
            </div>

            <div className="flex-1 space-y-4 text-left">
              <div>
                <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded">
                  Sistema Multicapa Certificado
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                  {currentProblem.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                  {currentProblem.description}
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">Componentes del Kit:</span>
                <div className="flex flex-wrap gap-2">
                  {currentProblem.products.map((prod, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-bold bg-blue-50 text-[#004F9F] px-3 py-1 rounded-lg border border-blue-200 flex items-center gap-1.5 shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#004F9F]" />
                      {prod}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Inversión Estimada del Kit:</span>
                  <span className="text-2xl font-black text-[#004F9F]">
                    {formatCOP(currentProblem.estimatedCost)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="pintuco"
                    size="md"
                    onClick={() => onNavigate('solutions')}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                    className="font-bold text-xs shadow-md"
                  >
                    Ver Kit & Comprar (-12%)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BEST-SELLING PRODUCTS SHOWCASE */}
      <section className="py-14 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-extrabold uppercase text-[#004F9F]">
                Catálogo Oficial Pintuco
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                Pinturas Más Vendidas en Colombia
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Calidad profesional con entrega express o retiro inmediato en tienda
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('store')}
              rightIcon={<ChevronRight className="w-4 h-4" />}
              className="text-xs font-bold self-start sm:self-auto"
            >
              Ver Todo el Catálogo
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PINTUCO_PRODUCTS.slice(0, 4).map((product) => {
              const pres = product.presentations[0];
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-xl hover:border-blue-400 transition-all flex flex-col justify-between group"
                >
                  <div
                    className="relative h-48 bg-slate-100 overflow-hidden cursor-pointer"
                    onClick={() => onNavigate('store', product.name)}
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
                      <span className="text-[10px] font-black uppercase text-[#004F9F]">
                        {product.category}
                      </span>
                      <h3
                        onClick={() => onNavigate('store', product.name)}
                        className="text-sm font-bold text-slate-900 group-hover:text-[#004F9F] transition-colors line-clamp-1 cursor-pointer"
                      >
                        {product.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {product.tagline}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Desde</span>
                        <span className="text-base font-black text-[#004F9F]">
                          {formatCOP(pres.priceCOP)}
                        </span>
                        {/* El precio de góndola ya incluye IVA. */}
                        <span className="text-[10px] text-slate-400 block font-medium">
                          IVA incluido
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          addToCart(product, pres.label);
                          onNavigate('store');
                        }}
                        className="bg-[#004F9F] hover:bg-[#003875] text-white px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Comprar</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. COLOR TRENDS 2025 SIMULATOR TEASER */}
      <section className="py-14 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
                Tendencias del Color Pintuco 2025
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
                Descubre el Color Perfecto para tus Espacios
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
                Prueba en vivo tonos en salas, fachadas y dormitorios antes de pintar con nuestro simulador interactivo.
              </p>
            </div>

            <Button
              variant="pintuco"
              size="md"
              onClick={() => onNavigate('colors')}
              leftIcon={<Palette className="w-4 h-4" />}
              className="bg-yellow-400 text-slate-950 hover:bg-yellow-300 font-black text-xs self-start sm:self-auto shadow-md"
            >
              Abrir Simulador de Ambientes
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {PINTUCO_COLOR_PALETTES.slice(0, 6).map((color) => (
              <div
                key={color.code}
                onClick={() => onNavigate('colors')}
                className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700/80 hover:border-yellow-400 transition-all cursor-pointer text-left space-y-2.5 group"
              >
                <div
                  className="w-full h-16 rounded-xl border border-white/10 shadow-xs group-hover:scale-105 transition-transform"
                  style={{ backgroundColor: color.hex }}
                />
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">{color.code}</span>
                  <p className="text-xs font-extrabold text-white truncate">{color.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. BOTTOM B2B & BUILDER CTA BANNER */}
      <section className="bg-linear-to-r from-[#002D5C] to-[#004F9F] text-white py-12 border-t border-blue-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-left space-y-2 max-w-2xl">
            <span className="text-xs font-black uppercase text-yellow-300 bg-white/10 px-2.5 py-0.5 rounded">
              Para Constructoras & Profesionales
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              ¿Gestionas proyectos u obras de gran metraje?
            </h2>
            <p className="text-xs sm:text-sm text-blue-100">
              Registra tu obra en COLORLINK para recibir listas de corte por etapas, diagnóstico patológico, precios mayoristas y despacho programado a obra.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="pintuco"
              size="lg"
              onClick={() => onNavigate('create-project')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              className="bg-yellow-400 text-slate-950 hover:bg-yellow-300 font-black text-xs shadow-lg"
            >
              Iniciar Diagnóstico B2B
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
