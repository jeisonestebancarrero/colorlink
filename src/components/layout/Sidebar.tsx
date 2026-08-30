import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { useCart } from '../../context/CartContext';
import {
  LayoutDashboard,
  ShoppingBag,
  Palette,
  Package,
  Calculator,
  Store,
  FolderKanban,
  PlusCircle,
  Bell,
  User,
  LogOut,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  PhoneCall,
  X,
  Layers,
  Building2,
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string, param?: string) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { user, logout } = useAuth();
  const { projects, unreadNotificationsCount } = useProjects();
  const { selectedStore } = useCart();

  if (!isMobileOpen) return null;

  const storeNavItems = [
    {
      id: 'dashboard',
      label: 'Inicio',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'store',
      label: 'Comprar Pinturas',
      icon: ShoppingBag,
      badge: 'Tienda',
    },
    {
      id: 'colors',
      label: 'Encuentra tu Color',
      icon: Palette,
      badge: 'Visualizador',
    },
    {
      id: 'solutions',
      label: 'Soluciones por Superficie',
      icon: Package,
      badge: 'Kits -15%',
    },
    {
      id: 'calculator',
      label: 'Calculadora de Pintura',
      icon: Calculator,
      badge: null,
    },
    {
      id: 'stores',
      label: 'Puntos de Retiro en Tienda',
      icon: Store,
      badge: 'En 2 hrs',
    },
  ];

  const projectNavItems = [
    {
      id: 'projects',
      label: 'Mis Proyectos & Obras',
      icon: FolderKanban,
      badge: projects.length > 0 ? projects.length : null,
    },
    {
      id: 'create-project',
      label: 'Diagnosticar Superficie',
      icon: PlusCircle,
      badge: 'Asistido',
      isAction: true,
    },
  ];

  const accountNavItems = [
    {
      id: 'notifications',
      label: 'Notificaciones',
      icon: Bell,
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : null,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'profile',
      label: 'Mi Cuenta & Facturación',
      icon: User,
      badge: null,
    },
  ];

  const handleItemClick = (id: string, param?: string) => {
    onNavigate(id, param);
    onCloseMobile();
  };

  const renderNavList = (items: any[]) => (
    <div className="space-y-1">
      {items.map((item: any) => {
        const Icon = item.icon;
        const isActive =
          currentPage === item.id ||
          (item.id === 'projects' && currentPage === 'project-detail');

        if (item.isAction) {
          return (
            <div key={item.id} className="pt-1.5 pb-1">
              <button
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  isActive
                    ? 'bg-yellow-400 text-slate-950 font-extrabold shadow-sm'
                    : 'bg-[#004F9F] text-white hover:bg-[#003875]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded font-extrabold uppercase">
                  {item.badge}
                </span>
              </button>
            </div>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => handleItemClick(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              isActive
                ? 'bg-[#004F9F] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Icon
                className={`w-4 h-4 ${
                  isActive ? 'text-white' : 'text-slate-400'
                }`}
              />
              <span>{item.label}</span>
            </div>

            {item.badge && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  item.badgeColor ||
                  (isActive
                    ? 'bg-blue-900 text-white'
                    : 'bg-slate-800 text-slate-300')
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onCloseMobile}
      />

      {/* Drawer Panel */}
      <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#00172e] text-slate-200 animate-in slide-in-from-left duration-200 shadow-2xl z-10 border-r border-blue-900/60">
        {/* Brand Header */}
        <div className="p-4 border-b border-blue-900/60 flex items-center justify-between bg-[#002244]">
          <div
            onClick={() => handleItemClick('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-yellow-400 text-slate-950 flex items-center justify-center font-black text-sm shadow-md">
              P
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold text-white tracking-tight">
                  COLOR<span className="text-yellow-400">LINK</span>
                </span>
                <span className="text-[9px] bg-white/20 text-white font-bold px-1.5 py-0.5 rounded">
                  PINTUCO
                </span>
              </div>
              <span className="text-[10px] text-blue-200">Ecosistema Digital</span>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation items */}
        <div className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          <div>
            <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-yellow-400 mb-1.5">
              Tienda & Soluciones
            </p>
            {renderNavList(storeNavItems)}
          </div>

          <div>
            <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-yellow-400 mb-1.5">
              Obras & Proyectos B2B
            </p>
            {renderNavList(projectNavItems)}
          </div>

          <div>
            <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-yellow-400 mb-1.5">
              Mi Cuenta
            </p>
            {renderNavList(accountNavItems)}
          </div>
        </div>

        {/* Store pickup card */}
        <div className="p-3 bg-[#001f3f] border-t border-blue-900/60">
          <div
            onClick={() => handleItemClick('stores')}
            className="p-2.5 rounded-xl bg-blue-950/80 hover:bg-blue-900/80 border border-blue-800/60 transition-colors cursor-pointer space-y-1"
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-yellow-400">
              <span className="flex items-center gap-1">
                <Store className="w-3 h-3" /> Tienda de Retiro:
              </span>
              <span className="text-blue-200">Cambiar →</span>
            </div>
            <p className="text-xs font-bold text-white truncate">
              {selectedStore.name}
            </p>
            <p className="text-[10px] text-blue-300 truncate">
              {selectedStore.city} • Listo en 2 hrs
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-blue-900/60 bg-[#00172e] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#004F9F] text-white flex items-center justify-center font-bold text-xs shrink-0">
              {user?.firstName?.charAt(0) || 'I'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[10px] text-blue-300 truncate">
                {user?.company || user?.clientType || 'Cuenta personal'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              logout();
              onCloseMobile();
              onNavigate('landing');
            }}
            className="p-1.5 text-slate-300 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
