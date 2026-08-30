import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useProjects } from '../context/ProjectContext';
import { useColorPalette, useProducts } from '../hooks/useCatalog';
import { CatalogError, CatalogLoading } from '../components/common/CatalogState';
import { SimuladorAmbiente } from '../components/common/SimuladorAmbiente';
import { ColorSwatch } from '../types';
import {
  Palette,
  Search,
  Check,
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Home,
  Building,
  Layers,
  ArrowRight,
  Eye,
  Sliders,
  Maximize2,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { Button } from '../components/common/Button';

interface ColorVisualizerPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const ColorVisualizerPage: React.FC<ColorVisualizerPageProps> = ({ onNavigate }) => {
  // FASE 4 — carta de color y productos desde Supabase.
  const { data: PINTUCO_COLOR_PALETTES, isLoading: cargandoColores, error: errorColores, reload } =
    useColorPalette();
  const { data: PINTUCO_PRODUCTS, isLoading: cargandoProductos } = useProducts();
  const isLoading = cargandoColores || cargandoProductos;
  const error = errorColores;

  const { addToCart } = useCart();
  const { showToast, activeProject } = useProjects();

  const [selectedFamily, setSelectedFamily] = useState<string>('Blancos & Neutros');
  const [searchQuery, setSearchQuery] = useState<string>('');
  /**
   * CORRECCIÓN: el estado inicial no puede leer del catálogo.
   *
   * El inicializador de useState corre UNA sola vez, en el primer render,
   * cuando la carta de color todavía está vacía porque llega por red. El
   * valor quedaba en `undefined` para siempre y la página se caía en blanco
   * al pintar `selectedColor.hex`.
   *
   * Ahora el estado guarda solo la elección explícita del usuario y el color
   * mostrado se deriva en cada render, con respaldo al primer color de la
   * carta mientras no haya elegido ninguno.
   */
  const [colorElegido, setColorElegido] = useState<ColorSwatch | null>(null);
  const selectedColor =
    colorElegido ?? PINTUCO_COLOR_PALETTES[1] ?? PINTUCO_COLOR_PALETTES[0];
  const setSelectedColor = setColorElegido;
  const [selectedRoom, setSelectedRoom] = useState<'facade' | 'living' | 'bedroom' | 'office'>('facade');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const families = [
    'Blancos & Neutros',
    'Cálidos & Tierras',
    'Azules & Frescos',
    'Verdes & Naturales',
    'Tendencias 2025',
  ];

  const filteredColors = PINTUCO_COLOR_PALETTES.filter((col) => {
    const matchFamily = selectedFamily === 'Todos' || col.family === selectedFamily;
    const matchSearch =
      !searchQuery.trim() ||
      col.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      col.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFamily && matchSearch;
  });

  const handleCopyCode = () => {
    navigator.clipboard.writeText(`${selectedColor.name} (${selectedColor.code}) - ${selectedColor.hex}`);
    setCopiedCode(true);
    showToast(`Código de color ${selectedColor.code} copiado al portapapeles`, 'info');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleBuyPaint = () => {
    // Find matching product
    const prod =
      selectedRoom === 'facade'
        ? PINTUCO_PRODUCTS.find((p) => p.id === 'prod-koraza-5') || PINTUCO_PRODUCTS[0]
        : PINTUCO_PRODUCTS.find((p) => p.id === 'prod-viniltex-avanzada') || PINTUCO_PRODUCTS[1];

    addToCart(prod, prod.presentations[0]?.label, selectedColor.name, selectedColor.hex, 1);
  };

  const roomEnvironments = [
    {
      id: 'facade',
      name: 'Fachada Exterior',
      subtitle: 'Concreto y revoque a la intemperie (Koraza 5 Años)',
      icon: Building,
    },
    {
      id: 'living',
      name: 'Sala & Muro Focal',
      subtitle: 'Interior luz natural (Viniltex Avanzada)',
      icon: Home,
    },
    {
      id: 'bedroom',
      name: 'Habitación Principal',
      subtitle: 'Ambiente de descanso y calidez',
      icon: Layers,
    },
    {
      id: 'office',
      name: 'Oficina / Comercial',
      subtitle: 'Espacios de trabajo modernos',
      icon: Palette,
    },
  ];

  const currentRoomObj = roomEnvironments.find((r) => r.id === selectedRoom) || roomEnvironments[0];

  // FASE 4 — estados de carga y error (MÓDULO 37).
  if (isLoading) return <CatalogLoading />;
  if (error) return <CatalogError mensaje={error} onReintentar={reload} />;
  // Sin colores no hay nada que visualizar: se evita el render en vez de
  // dejar que reviente al leer una propiedad de undefined.
  if (!selectedColor) {
    return (
      <CatalogError
        mensaje="La carta de color no está disponible en este momento."
        onReintentar={reload}
      />
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-[#004F9F] px-3 py-1 rounded-full text-xs font-bold border border-blue-200">
              <Palette className="w-3.5 h-3.5" />
              <span>Carta de Color Oficial Pintuco 2025</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Encuentra y Simula tu Color Ideal
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl font-medium">
              Prueba cientos de combinaciones cromáticas en tiempo real sobre ambientes reales de fachadas e interiores con formulación exacta para preparación en tienda.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('solutions')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Ver Kits de Solución
            </button>
            <button
              onClick={() => onNavigate('store')}
              className="bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Comprar Pinturas
            </button>
          </div>
        </div>
      </div>

      {/* Main Visualizer Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left / Top: Interactive Room Simulator (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            {/* Room Selector Tabs */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#004F9F]" /> Simulador de Ambientes en Vivo
              </span>

              <div className="flex gap-1.5 overflow-x-auto">
                {roomEnvironments.map((env) => {
                  const Icon = env.icon;
                  return (
                    <button
                      key={env.id}
                      onClick={() => setSelectedRoom(env.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedRoom === env.id
                          ? 'bg-[#004F9F] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{env.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Room Canvas Simulation */}
            <div className="relative h-80 sm:h-96 rounded-xl overflow-hidden border border-slate-200 shadow-inner group">
              {/* La escena se dibuja en SVG: así el color entra solo en el
                  muro y no vira la fotografía entera, que era lo que pasaba
                  al teñir con mix-blend sobre una foto de archivo. */}
              <SimuladorAmbiente ambiente={currentRoomObj.id} color={selectedColor.hex} />

              {/* Ambient Info Floating Badge */}
              <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md text-white px-3 py-2 rounded-xl shadow-lg border border-white/15 flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full border-2 border-white shadow-xs shrink-0"
                  style={{ backgroundColor: selectedColor.hex }}
                />
                <div>
                  <p className="text-xs font-bold leading-none">{selectedColor.name}</p>
                  <p className="text-[10px] text-slate-300 font-mono mt-0.5">{selectedColor.code} • {selectedColor.hex}</p>
                </div>
              </div>

              {/* Bottom Environment Label */}
              <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold shadow-md border border-slate-200">
                {currentRoomObj.name} — {currentRoomObj.subtitle}
              </div>
            </div>

            {/* Active Selected Color Control Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-12 h-12 rounded-xl border-2 border-white shadow-md shrink-0"
                  style={{ backgroundColor: selectedColor.hex }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      {selectedColor.name}
                    </h3>
                    <span className="text-[10px] font-bold uppercase bg-blue-100 text-[#004F9F] px-2 py-0.5 rounded">
                      {selectedColor.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pintura recomendada: <strong className="text-slate-700">{selectedColor.recommendedProduct}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleCopyCode}
                  className="p-2 rounded-lg border border-slate-300 hover:bg-white text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copiar código de color"
                >
                  {copiedCode ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copiado' : 'Copiar'}</span>
                </button>
                <Button
                  onClick={handleBuyPaint}
                  variant="primary"
                  className="bg-[#004F9F] text-xs font-bold flex-1 sm:flex-initial flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Comprar Pintura</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right / Bottom: Palette Browser & Search (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar color por nombre o código (ej. Nieve, 101)..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            {/* Family Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {families.map((fam) => (
                <button
                  key={fam}
                  onClick={() => setSelectedFamily(fam)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedFamily === fam
                      ? 'bg-[#004F9F] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {fam}
                </button>
              ))}
            </div>

            {/* Color Swatch Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto p-1">
              {filteredColors.map((color) => {
                const isSelected = selectedColor.code === color.code;
                return (
                  <div
                    key={color.code}
                    onClick={() => setSelectedColor(color)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 text-left group ${
                      isSelected
                        ? 'border-[#004F9F] bg-blue-50/70 ring-2 ring-blue-600 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    <div
                      className="w-full h-16 rounded-lg border border-slate-200/80 shadow-inner relative flex items-center justify-center group-hover:scale-[1.02] transition-transform"
                      style={{ backgroundColor: color.hex }}
                    >
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center shadow-md">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        {color.code}
                      </span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {color.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
