import React, { useState } from 'react';
import { LogOut, Home, ChevronLeft, ChevronRight } from 'lucide-react';
// El mapa de iconos vive en un solo sitio y lo comparten el menú y el
// encabezado de cada pantalla: si estuviera duplicado, añadir un módulo
// obligaría a acordarse de los dos.
import { iconoDeModulo } from './IconosDeModulo';
import { CampanaMensajes } from './CampanaMensajes';
import { CampanaAvisos } from './CampanaAvisos';
import { useAdminAuth } from './AdminAuthContext';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';
import { SelectorSede } from './SelectorSede';
import { RUTA_TABLERO } from './useRutaUrl';

const CLAVE_BARRA = 'colorlink.admin.barra.v1';

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
  /** Abre un pedido concreto. Lo usa la campana de mensajes. */
  onAbrirPedido?: (numero: string) => void;
  children: React.ReactNode;
}> = ({ rutaActual, onNavegar, onAbrirPedido, children }) => {
  const { acceso, nombre, email, salir } = useAdminAuth();

  const icono = (nombreIcono: string | null) => iconoDeModulo(nombreIcono);

  /** Módulo en el que se está, para mostrarlo aunque la lista esté plegada. */
  const moduloActual = acceso.views.find((v) => v.route === rutaActual);

  /**
   * La BARRA COMPLETA va oculta por defecto.
   *
   * Al abrir un módulo desde el tablero, lo que se quiere ver es el módulo. La
   * barra azul con las diecisiete aplicaciones se quedaba ahí ocupando un
   * cuarto de la pantalla para repetir un menú que ya se acababa de usar.
   *
   * Oculta queda una franja delgada con lo único que hace falta: volver al
   * inicio y abrir la barra. El estado se recuerda, para quien prefiera
   * trabajar con la barra visible.
   */
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
      {/* Fondo de la marca: óvalos difusos con los colores reales de Pintuco.
          ÓVALOS Y NO LÍNEAS porque un patrón de líneas compite con las filas
          de una tabla y cansa la vista al leer cifras.
          VA EN EL CONTENEDOR RAÍZ, no dentro de `main`: puesto dentro solo se
          asomaba por los márgenes.
          CÓMO SE CALIBRÓ: se probó pintando este mismo div de rojo sólido.
          El mecanismo era correcto desde el principio —el div cubre todo el
          fondo y las tarjetas son semitransparentes, así que el color se ve
          incluso a través de ellas—; lo que fallaba eran los valores. Se pasó
          por 3 %, 9 % y 20 % sin que se percibiera nada, porque los centros de
          las manchas quedaban fuera de pantalla o detrás de la barra de
          navegación, que es opaca.
          Ahora los centros están DENTRO del área visible y por debajo de la
          barra, con intensidades que se ven sin ensuciar el texto.
          Los colores son los que ya usa la aplicación: #004F9F el azul
          Pintuco, #0284C7 el de Pedidos, #D97706 el de Inventario y #002D5C
          el de la barra. */}
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

        {/* Selector de sede, al estilo del de compañías de Odoo. Va arriba y
            siempre visible: si estuviera dentro de cada módulo, sería fácil
            mirar el inventario de una sede creyendo que es otra. */}
        <SelectorSede />

        {/* Inicio. Un icono de casa en un sitio fijo: al abrir un módulo lo
            primero que se busca es cómo volver, y un enlace de texto dentro de
            una lista de diecisiete no es "un sitio fijo". */}
        <button
          onClick={() => onNavegar(RUTA_TABLERO)}
          title="Ir a las aplicaciones"
          className="mx-3 mt-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold
                     text-blue-100/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Home className="w-4 h-4 text-yellow-400" />
          Inicio
        </button>

        {/* La lista completa. Ya no se pliega por su cuenta: lo que se oculta
            es la barra entera, y dos niveles de plegado solo estorban. */}
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
            {/* Aquí y no en la cabecera de cada pantalla: la barra está en
                todas, y así el aviso se ve sin importar en qué módulo se
                esté. Con la barra oculta queda el del tablero. */}
            <div className="flex items-center gap-0.5 shrink-0">
              {onAbrirPedido && (
                <CampanaMensajes onAbrirPedido={onAbrirPedido} variante="lateral" />
              )}
              <CampanaAvisos onIr={(ruta) => onNavegar(ruta)} />
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
        {/* Marca de agua, igual que en el tablero: identifica la pantalla sin
            competir con el dato. Va detrás del contenido, sin capturar clics y
            fuera del árbol de accesibilidad. */}
        <img
          src={logoPintuco}
          alt=""
          aria-hidden
          className="pointer-events-none select-none absolute right-[-5rem] bottom-[-3rem]
                     w-[34rem] max-w-[60vw] opacity-[0.05] mix-blend-luminosity z-0"
          style={{
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          }}
        />

        {/* SIN tope de ancho, a propósito.
            Tenía un tope de 1280 px y dejaba una franja muerta a la derecha
            en cualquier pantalla grande —más todavía con la barra azul oculta,
            que es justo cuando se esconde para ganar sitio—. Subirlo a 1760 px
            no bastó: seguían sobrando unos 240 px. (El nombre de la clase no se
            escribe aquí: Tailwind lee los comentarios y emitiría la regla CSS
            de una clase que ya nadie usa.) El portal es de
            tablas y contadores, no de lectura corrida, así que se ocupa todo el
            ancho disponible y el único margen es el relleno de la página. */}
        <div className="relative z-10 p-6 lg:p-8 w-full">{children}</div>
      </main>

      {/* UNA sola pestaña para las dos cosas.
          Viaja con la barra —pegada a su borde cuando está visible, al borde
          de la pantalla cuando está oculta— y la flecha apunta a donde va a
          moverse el menú. Antes ocultar era un botón distinto, con otra forma
          y metido junto al logotipo: mostrar y ocultar son la misma acción y
          tienen que vivir en el mismo sitio, o hay que aprender dos. */}
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

        {/* El inicio solo hace falta con la barra oculta: cuando está visible
            ya tiene su propia entrada dentro. */}
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
