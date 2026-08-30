import React from 'react';
import {
  BookOpen, ChartLine, Circle, FolderKanban, Landmark, LayoutDashboard,
  LogOut, MessagesSquare, Package, Palette, ReceiptText, Settings,
  ShoppingBag, Truck, Users, Wrench, LayoutGrid,
} from 'lucide-react';

/**
 * Iconos disponibles para el menú.
 *
 * Se listan uno a uno a propósito. Usar `import * as Iconos from
 * 'lucide-react'` funcionaba, pero metía el paquete completo de iconos en el
 * bundle: más de 500 KB para dibujar catorce entradas de menú.
 * El nombre del icono lo define `app_views.icon` en la base; si llega uno
 * desconocido, se dibuja un círculo en lugar de romper el menú.
 */
const ICONOS: Record<string, React.FC<{ className?: string }>> = {
  LayoutDashboard, ShoppingBag, Truck, Package, FolderKanban, Wrench,
  ReceiptText, Landmark, BookOpen, MessagesSquare, Palette, ChartLine,
  Users, Settings,
};
import { useAdminAuth } from './AdminAuthContext';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';

/**
 * Armazón del back-office.
 *
 * El menú NO está escrito en el código: se dibuja con las vistas que el
 * administrador haya habilitado para el rol de quien entra (tablas
 * `app_views` y `role_views`). Cambiar quién ve qué no exige desplegar.
 */
export const AdminLayout: React.FC<{
  rutaActual: string;
  onNavegar: (ruta: string) => void;
  children: React.ReactNode;
}> = ({ rutaActual, onNavegar, children }) => {
  const { acceso, nombre, email, salir } = useAdminAuth();

  const icono = (nombreIcono: string | null) => ICONOS[nombreIcono ?? ''] ?? Circle;

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 shrink-0 bg-[#002D5C] text-white flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {/* El logotipo va sobre azul: su fondo propio se funde con la barra. */}
            <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
              <img src={logoPintuco} alt="Pintuco" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight leading-none">
                COLOR<span className="text-yellow-400">LINK</span>
              </div>
              <div className="text-[10px] text-blue-200/70 font-semibold mt-0.5">
                Portal interno
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => onNavegar('/')}
          className="mx-3 mt-3 mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold text-blue-100/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          Todas las aplicaciones
        </button>

        <nav className="flex-1 overflow-y-auto py-1">
          {acceso.views.length === 0 && (
            <p className="px-5 text-xs text-blue-200/60 font-medium">
              Tu rol no tiene vistas habilitadas.
            </p>
          )}
          {acceso.views.map((v) => {
            const Icono = icono(v.icon);
            const activo = rutaActual === v.route;
            return (
              <button
                key={v.code}
                onClick={() => onNavegar(v.route)}
                className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-sm font-semibold transition-colors text-left ${
                  activo
                    ? 'bg-white/12 text-white border-r-2 border-yellow-400'
                    : 'text-blue-100/75 hover:bg-white/6 hover:text-white'
                }`}
              >
                <Icono className="w-4 h-4 shrink-0" />
                <span>{v.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/10 space-y-2.5">
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{nombre ?? 'Usuario'}</p>
            <p className="text-[11px] text-blue-200/60 truncate">{email}</p>
          </div>
          <button
            onClick={salir}
            className="w-full flex items-center gap-2 text-xs font-semibold text-blue-100/75 hover:text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-auto">
        <div className="p-6 lg:p-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
};
