import React from 'react';
import {
  BookOpen, Building2, ChartLine, Circle, FolderKanban, Landmark,
  LayoutDashboard, MessagesSquare, Package, PackagePlus, Palette,
  ReceiptText, Settings, ShieldCheck, ShoppingBag, Store, Truck, Users, Wrench,
} from 'lucide-react';

/**
 * Los iconos de los módulos, en un solo sitio.
 *
 * El nombre lo define `app_views.icon` en la base, así que el mapa tiene que
 * cubrir lo que hay ahí. Estaba dentro de `AdminLayout` y le faltaban tres:
 * `PackagePlus`, `Store` y `Building2`, de modo que Recepciones, Puntos de
 * venta y Clientes salían en el menú con un círculo genérico.
 *
 * Se listan uno a uno a propósito. `import * as Iconos from 'lucide-react'`
 * funciona, pero mete el paquete completo en el bundle: más de 500 KB para
 * dibujar diecisiete entradas de menú.
 */
export const ICONOS_DE_MODULO: Record<string, React.FC<{ className?: string }>> = {
  LayoutDashboard, ShoppingBag, Truck, Package, PackagePlus, FolderKanban,
  Wrench, ReceiptText, Landmark, BookOpen, MessagesSquare, Palette, ChartLine,
  Users, Store, Settings, Building2, ShieldCheck,
};

/** Si llega un nombre desconocido se dibuja un círculo, no se rompe el menú. */
export function iconoDeModulo(nombre: string | null | undefined) {
  return ICONOS_DE_MODULO[nombre ?? ''] ?? Circle;
}

/**
 * El icono del módulo en una placa, para ponerlo junto al título.
 *
 * Es EL MISMO icono que el módulo tiene en el menú lateral, no uno decorativo
 * elegido aparte: con la barra azul oculta —que es lo normal— el título es la
 * única señal de en qué módulo se está, y que coincida con el menú es lo que
 * lo hace reconocible de un vistazo.
 *
 * Va `aria-hidden`: el título ya dice el nombre, y un lector de pantalla
 * anunciando «icono» antes de cada encabezado solo estorba.
 */
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
