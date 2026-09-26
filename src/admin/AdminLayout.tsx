import React, { useState } from 'react';
import { LogOut, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import { iconoDeModulo } from './IconosDeModulo';
import { CampanaMensajes } from './CampanaMensajes';
import { CampanaAvisos } from './CampanaAvisos';
import { useAdminAuth } from './AdminAuthContext';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';
import { SelectorSede } from './SelectorSede';
import { RUTA_TABLERO } from './useRutaUrl';

const CLAVE_BARRA = 'colorlink.admin.barra.v1';

/** Armazón del back-office; el menú sale de `app_views` y `role_views`, no del código. */
export const AdminLayout: React.FC<{
  rutaActual: string;
  onNavegar: (ruta: string) => void;
  /** Lo usa la campana de mensajes. */
  onAbrirPedido?: (numero: string) => void;
  children: React.ReactNode;
}> = ({ rutaActual, onNavegar, onAbrirPedido, children }) => {
  const { acceso, nombre, email, salir } = useAdminAuth();

  const icono = (nombreIcono: string | null) => iconoDeModulo(nombreIcono);

  /** Módulo en el que se está, para mostrarlo aunque la lista esté plegada. */
  const moduloActual = acceso.views.find((v) => v.route === rutaActual);

  /** Barra oculta por defecto para dar espacio al módulo; la preferencia se recuerda. */
  const [barraVisible, setBarraVisible] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CLAVE_BARRA) === 'visible';
    } catch {
      return false;
    }
  });

  const cambiarBarra = (visible: boolean) => {
    setBarraVisible(visible);
    try {
      window.localStorage.setItem(CLAVE_BARRA, visible ? 'visible' : 'oculta');
    } catch (e) {
      console.warn('[layout] no se pudo recordar el estado de la barra', e);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-100 flex">
      {/* Fondo de óvalos difusos (las líneas competirían con las tablas), en el contenedor raíz
          para verse tras las tarjetas; los centros deben quedar dentro del área visible. */}
      <div
        aria-hidden
        className="pointer-events-none select-none fixed inset-0 z-0"
        style={{
          backgroundImage: [
            'radial-gradient(32rem 32rem at 3% 42%, rgba(0,79,159,0.30), transparent 72%)',
            'radial-gradient(28rem 28rem at 98% 28%, rgba(2,132,199,0.26), transparent 72%)',
            'radial-gradient(30rem 28rem at 86% 88%, rgba(217,119,6,0.20), transparent 72%)',
            'radial-gradient(26rem 26rem at 6% 96%, rgba(0,45,92,0.24), transparent 72%)',
          ].join(', '),
        }}
      />

      <aside
        className={`relative z-20 shrink-0 bg-[#002D5C] text-white flex flex-col ${
          barraVisible ? 'w-64' : 'hidden'
        }`}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {/* Logo sobre azul: su fondo se funde con la barra. */}
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

        {/* Selector de sede siempre visible, para no confundir la sede activa. */}
        <SelectorSede />

        {/* Inicio en posición fija. */}
        <button
          onClick={() => onNavegar(RUTA_TABLERO)}
          title="Ir a las aplicaciones"
          className="mx-3 mt-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold
                     text-blue-100/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Home className="w-4 h-4 text-yellow-400" />
          Inicio
        </button>

        {/* Lista completa; se oculta la barra entera, no la lista. */}
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
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{nombre ?? 'Usuario'}</p>
              <p className="text-[11px] text-blue-200/60 truncate">{email}</p>
            </div>
            {/* En la barra, para que se vea desde cualquier módulo. */}
            <div className="flex items-center gap-0.5 shrink-0">
              {onAbrirPedido && (
                <CampanaMensajes onAbrirPedido={onAbrirPedido} variante="lateral" />
              )}
              <CampanaAvisos onIr={(ruta) => onNavegar(ruta)} haciaArriba />
            </div>
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

      <main className="relative z-10 flex-1 min-w-0 overflow-x-auto">
        {/* Marca de agua detrás del contenido, sin clics ni accesibilidad. */}
        {/* Recorta la marca, que sobresale 5rem y provocaría desplazamiento horizontal. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden z-0">
          <img
            src={logoPintuco}
            alt=""
            className="select-none absolute right-[-5rem] bottom-[-3rem]
                       w-[34rem] max-w-[60vw] opacity-[0.05] mix-blend-luminosity"
            style={{
              maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
            }}
          />
        </div>

        {/* Sin tope de ancho a propósito: el portal es de tablas y aprovecha toda la pantalla.
            No nombrar clases aquí: Tailwind lee los comentarios. */}
        <div className="relative z-10 p-6 lg:p-8 w-full">{children}</div>
      </main>

      {/* Una sola pestaña muestra y oculta la barra; viaja con su borde. */}
      <div
        className={`fixed top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1.5
                    transition-all duration-200 ${barraVisible ? 'left-64' : 'left-0'}`}
      >
        <button
          onClick={() => cambiarBarra(!barraVisible)}
          title={barraVisible ? 'Ocultar el menú' : 'Mostrar el menú'}
          aria-label={barraVisible ? 'Ocultar el menú' : 'Mostrar el menú'}
          aria-expanded={barraVisible}
          className="group w-7 h-14 rounded-r-lg bg-[#002D5C]/70 hover:bg-[#002D5C]
                     text-blue-100/70 hover:text-white shadow-lg
                     flex items-center justify-center transition-all cursor-pointer"
        >
          {barraVisible ? (
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          ) : (
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>

        {/* Inicio solo con la barra oculta. */}
        {!barraVisible && (
          <button
            onClick={() => onNavegar(RUTA_TABLERO)}
            title="Ir a las aplicaciones"
            aria-label="Ir a las aplicaciones"
            className="w-7 h-10 rounded-r-lg bg-[#002D5C]/70 hover:bg-[#002D5C]
                       text-yellow-400/80 hover:text-yellow-400 shadow-lg
                       flex items-center justify-center transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
