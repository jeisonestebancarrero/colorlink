import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { useCart } from '../../context/CartContext';
import {
  Bell,
  Search,
  User as UserIcon,
  LogOut,
  Sparkles,
  Menu,
  X,
  Building2,
  ChevronDown,
  HelpCircle,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Home,
  ClipboardList,
  Palette,
  Package,
  Calculator,
  Store,
  MapPin,
  Phone,
  ShieldCheck,
  ArrowRight,
  Droplets,
  Wrench,
  CheckCircle2,
} from 'lucide-react';
import { useProducts } from '../../hooks/useCatalog';
import { BrandLogo } from '../common/BrandLogo';

interface NavbarProps {
  onOpenMobileMenu: () => void;
  onNavigate: (page: string, param?: string) => void;
  currentPage: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenMobileMenu,
  onNavigate,
  currentPage,
}) => {
  // FASE 4 — sugerencias del buscador desde Supabase. La caché del servicio
  // deduplica esta consulta con la de la página que esté abierta.
  const { data: PINTUCO_PRODUCTS } = useProducts();

  const { user, logout, loadDemoAccount } = useAuth();
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    resetDemoData,
    setActiveProjectId,
    activeProject,
  } = useProjects();
  const { cartCount, setIsCartOpen, selectedStore, subtotalCOP } = useCart();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showComprarMenu, setShowComprarMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    markNotificationRead(notif.id);
    setShowNotifications(false);
    if (notif.projectId) {
      setActiveProjectId(notif.projectId);
      onNavigate('project-detail', notif.projectId);
    } else {
      onNavigate('notifications');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchFocused(false);
      onNavigate('store', searchQuery.trim());
    }
  };

  const handleQuickIntentClick = (action: () => void) => {
    setIsSearchFocused(false);
    action();
  };

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Smart Intent Detection based on search input
  const queryLower = searchQuery.toLowerCase();
  const isHumidityIntent =
    queryLower.includes('humed') ||
    queryLower.includes('moho') ||
    queryLower.includes('hongo') ||
    queryLower.includes('filtrac');
  const isFacadeIntent =
    queryLower.includes('facha') ||
    queryLower.includes('koraza') ||
    queryLower.includes('exterior') ||
    queryLower.includes('85');
  const isMetalIntent =
    queryLower.includes('metal') ||
    queryLower.includes('oxid') ||
    queryLower.includes('reja') ||
    queryLower.includes('pintulux');

  const mainNavItems = [
    { id: 'dashboard', label: 'Inicio', icon: Home },
    {
      id: 'store',
      label: 'Comprar Pinturas',
      icon: ShoppingBag,
      hasDropdown: true,
    },
    { id: 'colors', label: 'Encuentra tu Color', icon: Palette, badge: 'Visualizador' },
    { id: 'solutions', label: 'Soluciones por Superficie', icon: Package, badge: 'Kits' },
    { id: 'calculator', label: 'Calculadora de Pintura', icon: Calculator },
    { id: 'projects', label: 'Mis Proyectos', icon: Building2 },
    { id: 'orders', label: 'Mis Pedidos', icon: ClipboardList },
    { id: 'stores', label: 'Puntos de Retiro', icon: Store },
  ];

  const storeCategories = [
    { name: 'Pintura Fachadas & Exteriores', tag: 'Fachadas & Exteriores', desc: 'Koraza 5 y 8 Años, Masillas y Selladores' },
    { name: 'Vinilos & Interiores Lavables', tag: 'Vinilos & Interiores', desc: 'Viniltex Avanzada, Cero Salpique y Antibacterial' },
    { name: 'Impermeabilizantes de Techos & Losas', tag: 'Impermeabilizantes', desc: 'Aquablock Fibratado, Membranas Elásticas' },
    { name: 'Esmaltes & Anticorrosivos para Metal', tag: 'Esmaltes & Metales', desc: 'Pintulux 3 en 1 Directo al Óxido' },
    { name: 'Maderas, Barnices & Filtro UV', tag: 'Maderas & Barnices', desc: 'Madetec Poliuretano y Tintillas' },
    { name: 'Herramientas & Complementos de Pintor', tag: 'Herramientas & Complementos', desc: 'Rodillos Microfibra, Brochas Master, Cintas' },
  ];

  return (
    <header id="colorlink-main-navbar" className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* 1. TOP CORPORATE STRIP */}
      <div className="bg-[#002244] text-white text-[11px] py-1.5 px-4 sm:px-6 lg:px-8 flex items-center justify-between font-medium">
        <div className="flex items-center gap-4 truncate">
          <div className="flex items-center gap-1.5 text-blue-100">
            <Store className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span>Retiro en Tienda Pintuco:</span>
            <strong className="text-white font-bold underline decoration-yellow-400/60 underline-offset-2">
              {selectedStore.name} ({selectedStore.city})
            </strong>
            <span className="hidden sm:inline bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded text-[10px] font-bold border border-emerald-500/30">
              Listo en 2 hrs
            </span>
          </div>

          <span className="hidden md:inline text-blue-400">•</span>

          <span className="hidden md:flex items-center gap-1 text-blue-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Garantía Directa de Fábrica Pintuco</span>
          </span>
        </div>

        <div className="flex items-center gap-3 text-blue-200 shrink-0">
          <span className="hidden lg:inline flex items-center gap-1 text-blue-100">
            <Phone className="w-3 h-3 text-yellow-400" /> Línea Constructor: <strong>(01 8000) 111-247</strong>
          </span>

          <button
            onClick={() => onNavigate('stores')}
            className="text-yellow-300 hover:text-white text-[10px] font-extrabold uppercase tracking-wider bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            Cambiar Tienda
          </button>

          <button
            onClick={async () => {
              await loadDemoAccount();
              onNavigate('dashboard');
            }}
            className="hidden sm:inline-flex items-center gap-1 text-white bg-blue-700/80 hover:bg-blue-600 px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer"
          >
            <Sparkles className="w-2.5 h-2.5 text-yellow-300" />
            <span>Caso Demo Horizonte (85 m²)</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN BRAND & SMART OMNISEARCH ROW */}
      <div className="px-4 sm:px-6 lg:px-8 border-b border-slate-100 bg-white">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Mobile Menu Button + Official Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Identidad de marca. El logotipo oficial se configura desde
                Administración → Configuración, o se deja en
                assets/brand/pintuco-logo.svg. */}
            <BrandLogo onClick={() => onNavigate('dashboard')} />
          </div>

          {/* Center: Intelligent Omnisearch with Intent Recognition */}
          <div ref={searchContainerRef} className="hidden md:flex flex-1 max-w-xl mx-4 relative">
            <form onSubmit={handleSearchSubmit} className="w-full relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Busca pinturas (Koraza, Viniltex), color blanco, 85 m², humedad..."
                className="w-full bg-slate-50 hover:bg-slate-100/90 focus:bg-white border border-slate-300 focus:border-[#004F9F] rounded-xl pl-10 pr-20 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/15 transition-all shadow-2xs font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-14 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-[#004F9F] text-white hover:bg-[#003875] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
              >
                Buscar
              </button>
            </form>

            {/* Smart Intent Search Dropdown */}
            {isSearchFocused && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                {/* Intent suggestions if text is entered */}
                {searchQuery.trim().length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Sugerencias Inteligentes para "{searchQuery}"
                      </span>
                      <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">
                        Asistente Pintuco
                      </span>
                    </div>

                    {isFacadeIntent && (
                      <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-blue-950">
                            ¿Proyecto de Fachada Exterior (ej. 85 m²)?
                          </p>
                          <p className="text-[11px] text-blue-700">
                            Kit recomendado con Masilla Elastomérica + Sellador + Koraza 5 Años
                          </p>
                        </div>
                        <button
                          onClick={() => handleQuickIntentClick(() => onNavigate('solutions'))}
                          className="text-xs font-bold bg-[#004F9F] text-white px-3 py-1.5 rounded-lg hover:bg-[#003875] shrink-0 ml-2 cursor-pointer"
                        >
                          Ver Kit Fachada (-12%)
                        </button>
                      </div>
                    )}

                    {isHumidityIntent && (
                      <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-amber-950">
                            ¿Muros con Humedad o Moho?
                          </p>
                          <p className="text-[11px] text-amber-800">
                            Tratamiento con Sellador Antialcalino y Aquablock / Viniltex Antibacterial
                          </p>
                        </div>
                        <button
                          onClick={() => handleQuickIntentClick(() => onNavigate('solutions'))}
                          className="text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 shrink-0 ml-2 cursor-pointer"
                        >
                          Ver Solución Humedad
                        </button>
                      </div>
                    )}

                    {isMetalIntent && (
                      <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-300 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            ¿Rejas o Estructuras Metálicas Oxidadas?
                          </p>
                          <p className="text-[11px] text-slate-600">
                            Pintulux 3 en 1 Directo al Óxido sin base previa
                          </p>
                        </div>
                        <button
                          onClick={() => handleQuickIntentClick(() => onNavigate('store', 'Esmaltes & Metales'))}
                          className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg shrink-0 ml-2 cursor-pointer"
                        >
                          Ver Pintulux
                        </button>
                      </div>
                    )}

                    {/* Quick matched products */}
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Productos que coinciden</p>
                      {PINTUCO_PRODUCTS.filter(
                        (p) =>
                          p.name.toLowerCase().includes(queryLower) ||
                          p.category.toLowerCase().includes(queryLower) ||
                          p.surface.some((s) => s.toLowerCase().includes(queryLower))
                      )
                        .slice(0, 3)
                        .map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => handleQuickIntentClick(() => onNavigate('store', prod.name))}
                            className="p-2 hover:bg-slate-50 rounded-lg flex items-center justify-between cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5">
                              <img src={prod.image} alt={prod.name} className="w-8 h-8 rounded object-cover border border-slate-200" />
                              <div>
                                <p className="text-xs font-bold text-slate-800 group-hover:text-[#004F9F]">
                                  {prod.name}
                                </p>
                                <p className="text-[10px] text-slate-500">{prod.category} • Desde {formatCOP(prod.presentations[0]?.priceCOP || 0)}</p>
                              </div>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#004F9F]" />
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  /* Popular Intent Shortcuts */
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Búsquedas Frecuentes & Accesos Rápidos
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickIntentClick(() => onNavigate('store', 'Fachadas & Exteriores'))}
                        className="p-2.5 bg-slate-50 hover:bg-blue-50 text-left rounded-xl border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-bold text-slate-800">🏢 Pintura de Fachadas (Koraza)</p>
                        <p className="text-[10px] text-slate-500">Exterior con 5 y 8 años de garantía</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickIntentClick(() => onNavigate('store', 'Vinilos & Interiores'))}
                        className="p-2.5 bg-slate-50 hover:bg-blue-50 text-left rounded-xl border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-bold text-slate-800">🏠 Vinilos de Interior (Viniltex)</p>
                        <p className="text-[10px] text-slate-500">Superlavables y antimanchas</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickIntentClick(() => onNavigate('colors'))}
                        className="p-2.5 bg-slate-50 hover:bg-purple-50 text-left rounded-xl border border-slate-200 hover:border-purple-300 transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-bold text-slate-800">🎨 Simulador de Ambientes 2025</p>
                        <p className="text-[10px] text-slate-500">Prueba tonos en salas y fachadas</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickIntentClick(() => onNavigate('calculator'))}
                        className="p-2.5 bg-slate-50 hover:bg-emerald-50 text-left rounded-xl border border-slate-200 hover:border-emerald-300 transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-bold text-slate-800">📐 ¿Cuánta Pintura Necesito?</p>
                        <p className="text-[10px] text-slate-500">Calcula galones exactos por m²</p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Active Project Quick Button */}
            {activeProject && (
              <button
                onClick={() => onNavigate('project-detail', activeProject.id)}
                className="hidden xl:flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-[#004F9F] border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="truncate max-w-[130px]">{activeProject.name}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </button>
            )}

            {/* Shopping Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative bg-[#004F9F] hover:bg-[#003875] text-white px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-[#004F9F]/20 font-bold text-xs"
              aria-label="Abrir Carrito"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Carrito</span>
              {cartCount > 0 && (
                <span className="bg-yellow-400 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                id="btn-navbar-notifications"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowUserMenu(false);
                }}
                className="relative p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                aria-label="Notificaciones"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-900">Notificaciones Pintuco</h3>
                      <p className="text-[10px] text-slate-500">Actualizaciones de pedidos y obras</p>
                    </div>
                    {unreadNotificationsCount > 0 && (
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-[11px] text-[#004F9F] font-bold hover:underline cursor-pointer"
                      >
                        Marcar leídas
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-400">No tienes notificaciones pendientes</p>
                    ) : (
                      notifications.slice(0, 5).map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-3.5 text-left hover:bg-slate-50 cursor-pointer transition-colors ${
                            !notif.read ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-[#004F9F] mt-1.5 shrink-0" />
                            <div className="flex-1 space-y-0.5">
                              <p className="text-xs font-bold text-slate-800">{notif.title}</p>
                              <p className="text-[11px] text-slate-600 leading-snug">{notif.message}</p>
                              <span className="text-[10px] text-slate-400">{notif.date}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Account Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer border border-slate-200"
              >
                <div className="w-7 h-7 rounded-lg bg-[#004F9F] text-white flex items-center justify-center text-xs font-extrabold">
                  {user?.firstName?.[0] || 'I'}
                </div>
                <div className="hidden md:flex flex-col text-left">
                  <span className="text-xs font-bold text-slate-900 leading-tight">
                    {user?.firstName || 'Invitado'} {user?.lastName?.[0] ? `${user.lastName[0]}.` : ''}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium truncate max-w-[90px]">
                    {user?.company || user?.clientType || 'Cuenta personal'}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <p className="text-xs font-extrabold text-slate-900">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-[11px] text-slate-500">{user?.email}</p>
                    <span className="inline-block mt-1 bg-blue-100 text-[#004F9F] text-[10px] font-bold px-2 py-0.5 rounded">
                      Cuenta {user?.clientType || 'Invitado'}
                    </span>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onNavigate('projects');
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span>Mis Proyectos y Obras B2B</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onNavigate('profile');
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span>Mi Cuenta & Direcciones de Obra</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onNavigate('stores');
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <Store className="w-4 h-4 text-slate-400" />
                      <span>Puntos de Venta & Retiro</span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                        onNavigate('landing');
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-semibold"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. PRIMARY CATEGORY & SECTION NAVIGATION STRIP */}
      <nav className="bg-[#004F9F] text-white px-4 sm:px-6 lg:px-8 hidden md:block">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              if (item.hasDropdown) {
                return (
                  <div
                    key={item.id}
                    className="relative"
                    onMouseEnter={() => setShowComprarMenu(true)}
                    onMouseLeave={() => setShowComprarMenu(false)}
                  >
                    <button
                      onClick={() => onNavigate(item.id)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white text-[#004F9F] shadow-xs'
                          : 'text-white hover:bg-white/15'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                      <ChevronDown className="w-3 h-3 text-blue-200" />
                    </button>

                    {/* Comprar Category Mega Flyout */}
                    {showComprarMenu && (
                      <div className="absolute left-0 top-full w-80 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="px-2 py-1 pb-2 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider">
                            Categorías de Pintura
                          </span>
                          <button
                            onClick={() => onNavigate('store')}
                            className="text-[11px] text-[#004F9F] font-bold hover:underline cursor-pointer"
                          >
                            Ver Todo el Catálogo →
                          </button>
                        </div>
                        <div className="pt-2 space-y-1">
                          {storeCategories.map((cat) => (
                            <button
                              key={cat.tag}
                              onClick={() => {
                                setShowComprarMenu(false);
                                onNavigate('store', cat.tag);
                              }}
                              className="w-full p-2 text-left rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-between group cursor-pointer"
                            >
                              <div>
                                <p className="text-xs font-bold text-slate-800 group-hover:text-[#004F9F]">
                                  {cat.name}
                                </p>
                                <p className="text-[10px] text-slate-500">{cat.desc}</p>
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#004F9F]" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-white text-[#004F9F] shadow-xs'
                      : 'text-white hover:bg-white/15'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="bg-yellow-400 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded shadow-2xs">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Technical Assistance Tag */}
          <div className="hidden lg:flex items-center gap-2 shrink-0 py-1">
            <button
              onClick={() => onNavigate('create-project')}
              className="inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-950" />
              <span>Diagnosticar mi Superficie</span>
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
};
