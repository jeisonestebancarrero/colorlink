import React from 'react';
import {
  BookOpen, Building2, ChartLine, Circle, FolderKanban, Landmark,
  LayoutDashboard, MessagesSquare, Package, PackagePlus, Palette,
  ReceiptText, Settings, ShieldCheck, ShoppingBag, Store, Truck, Users, Wrench,
} from 'lucide-react';

/**
 * Mapa de `app_views.icon` a componentes; debe cubrir los nombres de la base.
 * Importados uno a uno: `import *` de lucide-react mete todo el paquete en el bundle.
 */
export const ICONOS_DE_MODULO: Record<string, React.FC<{ className?: string }>> = {
  LayoutDashboard, ShoppingBag, Truck, Package, PackagePlus, FolderKanban,
  Wrench, ReceiptText, Landmark, BookOpen, MessagesSquare, Palette, ChartLine,
  Users, Store, Settings, Building2, ShieldCheck,
};

/** Respaldo para nombres desconocidos. */
export function iconoDeModulo(nombre: string | null | undefined) {
  return ICONOS_DE_MODULO[nombre ?? ''] ?? Circle;
}

/** Icono del menú junto al título del módulo; `aria-hidden` porque el título ya lo nombra. */
export const IconoModulo: React.FC<{ nombre: string; className?: string }> = ({
  nombre, className = '',
}) => {
  const Icono = iconoDeModulo(nombre);
  return (
    <span
      aria-hidden
      className={`shrink-0 w-9 h-9 rounded-xl bg-[#004F9F]/10 border border-[#004F9F]/15
                  flex items-center justify-center ${className}`}
    >
      <Icono className="w-[1.15rem] h-[1.15rem] text-[#004F9F]" />
    </span>
  );
};
