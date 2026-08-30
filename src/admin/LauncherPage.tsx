import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, ChartLine, Circle, FolderKanban, Landmark, LayoutDashboard,
  MessagesSquare, Package, Palette, ReceiptText, Search, Settings,
  ShoppingBag, Truck, Users, Wrench, X,
} from 'lucide-react';
import { useAdminAuth } from './AdminAuthContext';
import { LogOut } from 'lucide-react';
import type { VistaMenu } from '../services/admin';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';

const ICONOS: Record<string, React.FC<{ className?: string }>> = {
  LayoutDashboard, ShoppingBag, Truck, Package, FolderKanban, Wrench,
  ReceiptText, Landmark, BookOpen, MessagesSquare, Palette, ChartLine,
  Users, Settings,
};

/**
 * Tablero de aplicaciones del ERP.
 *
 * IDEA DE DISEÑO: cada módulo es una MUESTRA DE COLOR. Pintuco es una marca
 * de pinturas, así que el lanzador usa su propio material —el color— como
 * lenguaje: la franja superior de cada tarjeta es una pincelada de la carta
 * cromática real, y al pasar el cursor la muestra se derrama sobre la
 * tarjeta, como pintura al extenderse.
 *
 * Los colores no están escritos aquí: vienen de `app_views.color`, de modo
 * que el administrador puede recolorear o reordenar el tablero sin desplegar.
 */
export const LauncherPage: React.FC<{ onAbrir: (ruta: string) => void }> = ({ onAbrir }) => {
  const { acceso, nombre, salir } = useAdminAuth();
  const [filtro, setFiltro] = useState('');
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Espejo del estado para la escucha de teclado: el listener se registra
  // una sola vez y de otro modo leería siempre el valor inicial.
  const buscandoRef = useRef(false);
  buscandoRef.current = buscando;

  /**
   * Búsqueda oculta: no ocupa sitio hasta que hace falta.
   *
   * Basta con empezar a escribir para que aparezca, como en un lanzador de
   * escritorio. Se usa un input real —enfocado al abrirse— en vez de acumular
   * pulsaciones a mano: así funcionan el pegado, el acento y el teclado del
   * móvil, que un contador de teclas rompería.
   */
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      const escribiendoEnOtroSitio =
        destino &&
        (destino.tagName === 'INPUT' || destino.tagName === 'TEXTAREA' || destino.isContentEditable);

      if (e.key === 'Escape') {
        setFiltro('');
        setBuscando(false);
        inputRef.current?.blur();
        return;
      }
      if (escribiendoEnOtroSitio || e.metaKey || e.ctrlKey || e.altKey) return;

      // Una sola letra, número o signo abre el buscador. Las teclas de
      // navegación y función no deben dispararlo.
      //
      // El carácter que abrió la búsqueda se SIEMBRA en el campo: el foco
      // llega un fotograma después, así que esa primera pulsación se perdería
      // y el usuario vería el buscador abierto pero vacío.
      // A partir de ahí el foco ya está en el input y esta escucha se
      // detiene sola en la comprobación de arriba, de modo que no se duplica
      // ninguna letra.
      if (!buscandoRef.current && e.key.length === 1 && e.key !== ' ') {
        setBuscando(true);
        setFiltro(e.key);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };

    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, []);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return acceso.views;
    return acceso.views.filter(
      (v) =>
        v.label.toLowerCase().includes(q) ||
        (v.description ?? '').toLowerCase().includes(q)
    );
  }, [acceso.views, filtro]);

  const cerrarBusqueda = () => {
    setFiltro('');
    setBuscando(false);
  };

  const icono = (v: VistaMenu) => ICONOS[v.icon ?? ''] ?? Circle;
  const color = (v: VistaMenu) => v.color ?? '#004F9F';

  return (
    <div className="min-h-screen bg-[#00142E] relative overflow-hidden">
      {/* Ambiente: halos de color muy difusos, como pintura diluida. */}
      <div aria-hidden className="pointer-events-none absolute -top-44 -left-36 w-[42rem] h-[42rem] rounded-full bg-[#004F9F]/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 right-[-10rem] w-[34rem] h-[34rem] rounded-full bg-[#0284C7]/14 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-52 left-1/4 w-[38rem] h-[38rem] rounded-full bg-[#CA8A04]/10 blur-3xl" />

      {/*
        Marca de agua. El archivo oficial es un JPEG con fondo azul sólido,
        así que se difumina con una máscara radial para que no se recorte
        como un rectángulo.
      */}
      <img
        src={logoPintuco}
        alt=""
        aria-hidden
        className="pointer-events-none select-none absolute right-[-6rem] bottom-[-4rem] w-[46rem] max-w-[75vw] opacity-[0.08] mix-blend-luminosity"
        style={{
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
        }}
      />

      <div className="relative w-full px-6 sm:px-10 lg:px-14 py-7">
        {/*
          Barra delgada en vez de un encabezado grande. El saludo y el
          recuento ocupaban un tercio de la pantalla para decir algo que se
          lee una vez; el espacio rinde más mostrando aplicaciones.
        */}
        <header className="flex items-center justify-between gap-4 mb-7">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoPintuco}
              alt="Pintuco"
              className="h-9 w-auto rounded-lg shrink-0 shadow-2xs"
            />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-white leading-none truncate">
                {nombre ?? 'Portal interno'}
              </p>
              <p className="text-[11px] text-blue-200/60 font-medium mt-0.5">
                {filtro
                  ? `${visibles.length} ${visibles.length === 1 ? 'coincidencia' : 'coincidencias'}`
                  : `${visibles.length} aplicaciones`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* La búsqueda no ocupa sitio hasta que se usa. */}
            {buscando ? (
              <div className="relative w-56 sm:w-72">
                <Search className="w-4 h-4 text-blue-200/60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  onBlur={() => { if (!filtro) setBuscando(false); }}
                  placeholder="Buscar aplicación…"
                  aria-label="Buscar aplicación"
                  className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder:text-blue-200/40 font-medium focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-transparent"
                />
                <button
                  onClick={cerrarBusqueda}
                  aria-label="Cerrar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-blue-200/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setBuscando(true);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                aria-label="Buscar aplicación"
                className="p-2 rounded-lg text-blue-200/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={salir}
              aria-label="Cerrar sesión"
              className="p-2 rounded-lg text-blue-200/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {visibles.length === 0 ? (
          <div className="bg-white/8 border border-white/15 rounded-2xl p-10 text-center backdrop-blur-sm">
            <p className="text-white font-bold">
              {filtro ? 'Ninguna aplicación coincide con tu búsqueda.' : 'Tu rol no tiene aplicaciones habilitadas.'}
            </p>
            {!filtro && (
              <p className="text-blue-100/60 text-sm font-medium mt-1.5">
                Pídele a un administrador que te asigne los módulos que necesitas.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibles.map((v) => {
              const Icono = icono(v);
              const c = color(v);
              return (
                <button
                  key={v.code}
                  onClick={() => onAbrir(v.route)}
                  className="group relative text-left rounded-2xl overflow-hidden bg-white
                             border border-white/25
                             shadow-[0_2px_6px_rgba(0,0,0,.18),0_18px_36px_-18px_rgba(0,0,0,.5)]
                             transition-all duration-200 ease-out
                             hover:-translate-y-1.5
                             hover:shadow-[0_6px_14px_rgba(0,0,0,.24),0_28px_56px_-20px_rgba(0,0,0,.6)]
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400
                             focus-visible:ring-offset-2 focus-visible:ring-offset-[#00142E]"
                  style={{ ['--c' as string]: c }}
                >
                  {/*
                    Franja de color del módulo: la identidad cromática vive
                    arriba, no en toda la tarjeta, para que veinte módulos no
                    compitan entre sí. Al pasar el cursor se derrama y cubre
                    la tarjeta, como pintura al extenderse.
                  */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-2 group-hover:h-full transition-all duration-300 ease-out"
                    style={{ background: `linear-gradient(90deg, ${c}, ${c}D9)` }}
                  />

                  <span className="relative flex items-start gap-4 p-5 pt-6">
                    {/* Baldosa del icono: grande, con su propio borde y sombra. */}
                    <span
                      className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center
                                 border shadow-2xs transition-colors duration-200
                                 group-hover:bg-white/95 group-hover:border-white"
                      style={{ backgroundColor: `${c}14`, borderColor: `${c}33` }}
                    >
                      <Icono className="w-8 h-8 [color:var(--c)]" />
                    </span>

                    <span className="min-w-0 pt-0.5">
                      <span className="block text-[16px] font-extrabold text-slate-900 tracking-tight
                                       group-hover:text-white transition-colors duration-200">
                        {v.label}
                      </span>
                      <span className="block text-[13px] text-slate-500 font-medium mt-1 leading-snug
                                       group-hover:text-white/85 transition-colors duration-200">
                        {v.description ?? 'Módulo del sistema'}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
