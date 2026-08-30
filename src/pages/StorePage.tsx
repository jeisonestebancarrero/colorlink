import React, { useEffect, useState, useMemo } from 'react';
import { useCart } from '../context/CartContext';
import { useProducts, useProductCategories } from '../hooks/useCatalog';
import { CatalogError, CatalogLoading } from '../components/common/CatalogState';
import { StoreProduct } from '../types';
import {
  Search,
  Filter,
  Star,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Layers,
  Sparkles,
  Droplets,
  Check,
  Eye,
  FileDown,
  ArrowRight,
  SlidersHorizontal,
  ChevronRight,
  Package,
  Store,
  Clock,
} from 'lucide-react';
import { Button } from '../components/common/Button';

/**
 * Categorías de respaldo, solo para el instante en que la consulta todavía no
 * ha respondido o falló. Las de verdad vienen de la base: cuando estaban
 * escritas aquí, una categoría creada en el portal interno no llegaba nunca a
 * la tienda.
 */
const CATEGORIAS_RESPALDO = ['Todos'];

interface StorePageProps {
  onNavigate: (page: string, param?: string) => void;
  initialCategory?: string;
  /**
   * Término que llega desde el buscador del Navbar.
   *
   * BUG CORREGIDO: App.tsx siempre ha pasado `initialSearch`, pero esta
   * interfaz solo declaraba `initialCategory`, así que buscar desde la barra
   * superior navegaba a la tienda sin filtrar nada. TypeScript no lo detectó
   * porque la configuración actual no valida props sobrantes en JSX.
   *
   * El Navbar usa este mismo parámetro para dos intenciones: enviar un
   * término libre ("Koraza") o una categoría completa ("Esmaltes & Metales"),
   * por eso abajo se distingue entre ambas.
   */
  initialSearch?: string;
}

export const StorePage: React.FC<StorePageProps> = ({ onNavigate, initialCategory, initialSearch }) => {
  // FASE 4 — los productos vienen de Supabase.
  // Se conserva el identificador PINTUCO_PRODUCTS a propósito: así ninguna
  // de sus referencias en el JSX de esta página necesita cambiar.
  const { data: PINTUCO_PRODUCTS, isLoading, error, reload } = useProducts();

  const { addToCart, setIsCartOpen } = useCart();

  const { data: categoriasBD } = useProductCategories();

  const categories = useMemo(
    () => (categoriasBD.length ? ['Todos', ...categoriasBD] : CATEGORIAS_RESPALDO),
    [categoriasBD],
  );

  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'Todos');
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? '');

  // El Navbar usa `initialSearch` para dos intenciones: un término libre
  // ("Koraza") o una categoría completa ("Esmaltes & Metales"). Cuál de las dos
  // es solo se sabe cuando las categorías llegan de la base, así que la
  // reclasificación ocurre aquí y no en el estado inicial.
  useEffect(() => {
    if (!initialSearch || !categoriasBD.includes(initialSearch)) return;
    setSelectedCategory(initialSearch);
    setSearchQuery('');
  }, [initialSearch, categoriasBD]);
  const [selectedFinish, setSelectedFinish] = useState<string>('Todos');
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('Todos');
  const [selectedProductDetail, setSelectedProductDetail] = useState<StoreProduct | null>(null);

  // Modal active selection
  const [modalPresentation, setModalPresentation] = useState<string>('');
  const [modalColor, setModalColor] = useState<{ name: string; hex: string; code: string } | null>(null);
  const [modalQuantity, setModalQuantity] = useState<number>(1);

  const filteredProducts = useMemo(() => {
    return PINTUCO_PRODUCTS.filter((prod) => {
      const matchCategory = selectedCategory === 'Todos' || prod.category === selectedCategory;
      const matchQuery =
        !searchQuery.trim() ||
        prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prod.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prod.surface.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchFinish = selectedFinish === 'Todos' || prod.finish === selectedFinish;
      const matchEnv =
        selectedEnvironment === 'Todos' ||
        prod.environment === selectedEnvironment ||
        prod.environment === 'Ambos';

      return matchCategory && matchQuery && matchFinish && matchEnv;
    });
    // PINTUCO_PRODUCTS va en las dependencias: sin él, el filtro se calculaba
    // una sola vez con la lista todavía vacía —los productos llegan después,
    // en una consulta— y la tienda decía "no se encontraron productos" hasta
    // que el usuario tocaba un filtro y forzaba el recálculo.
  }, [PINTUCO_PRODUCTS, selectedCategory, searchQuery, selectedFinish, selectedEnvironment]);

  const handleOpenProductDetail = (product: StoreProduct) => {
    setSelectedProductDetail(product);
    setModalPresentation(product.presentations[0]?.label || '');
    setModalColor(product.availableColors?.[0] || null);
    setModalQuantity(1);
  };

  const handleAddToCartFromModal = () => {
    if (!selectedProductDetail) return;
    addToCart(
      selectedProductDetail,
      modalPresentation,
      modalColor?.name,
      modalColor?.hex,
      modalQuantity
    );
    setSelectedProductDetail(null);
  };

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  // FASE 4 — estados de carga y error (MÓDULO 37).
  if (isLoading) return <CatalogLoading />;
  if (error) return <CatalogError mensaje={error} onReintentar={reload} />;

  return (
    <div className="space-y-8 pb-16">
      {/* Hero Banner Tienda */}
      <div className="relative rounded-2xl bg-linear-to-r from-[#002D5C] via-[#004F9F] to-[#0066CC] text-white p-6 sm:p-8 overflow-hidden shadow-lg border border-blue-900/40">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-xs px-3 py-1 rounded-full text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>Tienda Oficial Pintuco • Retiro Gratis en 2 Horas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Catálogo Completo de Pinturas y Recubrimientos
          </h1>
          <p className="text-sm text-blue-100 leading-relaxed font-medium">
            Encuentra las soluciones originales Pintuco para fachadas, interiores, impermeabilización y protección industrial con garantía de fábrica y precios directos.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('solutions')}
              className="bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-xs font-extrabold px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Package className="w-4 h-4" />
              <span>Ver Kits de Solución por Problema (-10%)</span>
            </button>
            <button
              onClick={() => onNavigate('calculator')}
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-lg border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Calcular Galones Necesarios</span>
            </button>
          </div>
        </div>

        {/* Decorative Graphic Element */}
        <div className="absolute right-[-40px] -bottom-10 w-72 h-72 rounded-full bg-blue-400/10 blur-2xl pointer-events-none" />
      </div>

      {/* Categories Horizontal Scroller */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === cat
                ? 'bg-[#004F9F] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, sustrato (concreto, metal, yeso)..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
          />
        </div>

        {/* Quick Dropdowns */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-semibold">Filtros:</span>
          </div>

          <select
            value={selectedEnvironment}
            onChange={(e) => setSelectedEnvironment(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none"
          >
            <option value="Todos">Ambiente: Todos</option>
            <option value="Exterior">Exterior</option>
            <option value="Interior">Interior</option>
            <option value="Industrial">Industrial</option>
          </select>

          <select
            value={selectedFinish}
            onChange={(e) => setSelectedFinish(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none"
          >
            <option value="Todos">Acabado: Todos</option>
            <option value="Mate">Mate</option>
            <option value="Satinado">Satinado</option>
            <option value="Brillante">Brillante</option>
          </select>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map((product) => {
          const mainPres = product.presentations[0];
          return (
            <div
              key={product.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col group"
            >
              {/* Product Image & Badge */}
              <div className="relative h-48 bg-slate-100 overflow-hidden cursor-pointer" onClick={() => handleOpenProductDetail(product)}>
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
                <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded text-[10px] font-semibold text-slate-700 flex items-center gap-1 shadow-2xs">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  <span>{product.rating}</span>
                  <span className="text-slate-400">({product.reviewsCount})</span>
                </div>
              </div>

              {/* Product Info */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#004F9F]">
                    {product.category}
                  </span>
                  <h3
                    onClick={() => handleOpenProductDetail(product)}
                    className="text-sm font-bold text-slate-900 group-hover:text-[#004F9F] transition-colors line-clamp-1 cursor-pointer"
                  >
                    {product.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {product.tagline}
                  </p>
                </div>

                {/* Color swatches preview if available */}
                {product.availableColors && product.availableColors.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400">
                      Colores disponibles:
                    </span>
                    <div className="flex items-center gap-1.5">
                      {product.availableColors.slice(0, 5).map((col) => (
                        <div
                          key={col.code}
                          className="w-4 h-4 rounded-full border border-slate-300 shadow-2xs"
                          style={{ backgroundColor: col.hex }}
                          title={`${col.name} (${col.code})`}
                        />
                      ))}
                      {product.availableColors.length > 5 && (
                        <span className="text-[10px] text-slate-400 font-bold">
                          +{product.availableColors.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Price & Action */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      Desde ({mainPres?.label})
                    </span>
                    <span className="text-base font-extrabold text-[#004F9F]">
                      {formatCOP(mainPres?.priceCOP || 0)}
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenProductDetail(product)}
                    className="bg-[#004F9F] hover:bg-[#003B77] text-white p-2 rounded-lg transition-colors cursor-pointer shadow-xs"
                    title="Ver detalle y comprar"
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
          <p className="text-base font-bold text-slate-800">
            No se encontraron productos con los filtros seleccionados
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Prueba cambiando la categoría o limpiando el término de búsqueda.
          </p>
          <Button
            onClick={() => {
              setSelectedCategory('Todos');
              setSearchQuery('');
              setSelectedFinish('Todos');
              setSelectedEnvironment('Todos');
            }}
            variant="outline"
            className="text-xs font-semibold"
          >
            Restablecer Filtros
          </Button>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProductDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 bg-[#004F9F] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                  {selectedProductDetail.category}
                </span>
                <span className="text-xs text-blue-100">Código: {selectedProductDetail.code}</span>
              </div>
              <button
                onClick={() => setSelectedProductDetail(null)}
                className="text-white/80 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-56">
                    <img
                      src={selectedProductDetail.image}
                      alt={selectedProductDetail.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 text-xs text-blue-950 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Clock className="w-3.5 h-3.5 text-blue-700" /> Rendimiento & Secado:
                    </div>
                    <p className="text-[11px] text-slate-600">
                      • {selectedProductDetail.coverage}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      • {selectedProductDetail.dryingTime}
                    </p>
                  </div>
                </div>

                {/* Info & Options */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">
                      {selectedProductDetail.name}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {selectedProductDetail.description}
                    </p>
                  </div>

                  {/* Presentations Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800">
                      Selecciona la Presentación:
                    </label>
                    <div className="space-y-1.5">
                      {selectedProductDetail.presentations.map((pres) => (
                        <button
                          key={pres.id}
                          type="button"
                          onClick={() => setModalPresentation(pres.label)}
                          className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                            modalPresentation === pres.label
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

                  {/* Color Selector if available */}
                  {selectedProductDetail.availableColors && selectedProductDetail.availableColors.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold text-slate-800">
                          Color Seleccionado:
                        </label>
                        <span className="font-semibold text-slate-600">
                          {modalColor?.name} ({modalColor?.code})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedProductDetail.availableColors.map((col) => (
                          <button
                            key={col.code}
                            type="button"
                            onClick={() => setModalColor(col)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all ${
                              modalColor?.code === col.code
                                ? 'border-[#004F9F] bg-blue-50 text-[#004F9F] font-bold ring-1 ring-blue-600'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                              style={{ backgroundColor: col.hex }}
                            />
                            <span>{col.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quantity and Actions */}
                  <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
                    <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setModalQuantity((q) => Math.max(1, q - 1))}
                        className="px-3 py-2 text-slate-600 hover:bg-slate-100"
                      >
                        -
                      </button>
                      <span className="px-3 font-bold text-xs text-slate-800">
                        {modalQuantity}
                      </span>
                      <button
                        onClick={() => setModalQuantity((q) => q + 1)}
                        className="px-3 py-2 text-slate-600 hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>

                    <Button
                      onClick={handleAddToCartFromModal}
                      variant="primary"
                      className="flex-1 bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold py-2.5 shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span>Agregar al Carrito</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Beneficios y Certificaciones Pintuco
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  {selectedProductDetail.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
