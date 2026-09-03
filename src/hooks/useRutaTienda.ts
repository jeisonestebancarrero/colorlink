import { useCallback, useEffect, useState } from 'react';

/**
 * La página de la tienda vive en la URL, no en un `useState`.
 *
 * Mismo problema que tenía el portal interno: la barra de direcciones se
 * quedaba en `/`, así que recargar devolvía a la landing y no se podía
 * compartir el enlace de un pedido ni usar el botón «atrás». En una tienda eso
 * pesa más todavía: un cliente que recarga mientras mira su pedido pierde el
 * hilo, y no hay forma de mandarle a alguien el enlace del catálogo.
 *
 * Se usa la History API en lugar de una librería de rutas porque `App.tsx` ya
 * decide la pantalla con un `switch`: solo faltaba mantener la URL al día.
 *
 * `nginx.conf` sirve `index.html` para cualquier ruta
 * (`try_files $uri $uri/ /index.html`), así que recargar en
 * `/pedidos/ORD-PNT-000045` funciona.
 */

/**
 * Nombre interno de pantalla ↔ segmento de la URL.
 *
 * Se declara explícito y no se derivan uno del otro: así se puede cambiar la
 * URL que ve el cliente —que es parte de la marca— sin renombrar el estado
 * interno de la aplicación.
 */
const A_URL: Record<string, string> = {
  landing: '',
  login: 'ingresar',
  register: 'registro',
  dashboard: 'panel',
  store: 'tienda',
  colors: 'colores',
  solutions: 'kits',
  calculator: 'calculadora',
  stores: 'puntos-de-retiro',
  'create-project': 'proyectos/nuevo',
  projects: 'proyectos',
  'project-detail': 'proyecto',
  orders: 'pedidos',
  notifications: 'notificaciones',
  profile: 'mi-cuenta',
};

const A_PAGINA: Record<string, string> = Object.fromEntries(
  Object.entries(A_URL).filter(([, url]) => url !== '').map(([pagina, url]) => [url, pagina])
);

export interface RutaTienda {
  pagina: string;
  /** Segundo segmento: el id o código que la pantalla necesite. */
  param: string | undefined;
}

function leerUrl(): RutaTienda {
  const partes = window.location.pathname.split('/').filter(Boolean);
  if (partes.length === 0) return { pagina: 'landing', param: undefined };

  // Las rutas de dos segmentos se resuelven primero: `proyectos/nuevo` es una
  // pantalla propia y no el proyecto con id "nuevo".
  const dos = `${partes[0]}/${partes[1] ?? ''}`;
  if (A_PAGINA[dos]) return { pagina: A_PAGINA[dos], param: undefined };

  const pagina = A_PAGINA[partes[0]];
  if (!pagina) return { pagina: 'landing', param: undefined };
  return {
    pagina,
    param: partes.length > 1 ? decodeURIComponent(partes.slice(1).join('/')) : undefined,
  };
}

function aRuta(pagina: string, param?: string): string {
  const base = A_URL[pagina];
  if (base === undefined) return '/';
  if (base === '') return '/';
  return param ? `/${base}/${encodeURIComponent(param)}` : `/${base}`;
}

export interface NavegacionTienda {
  pagina: string;
  param: string | undefined;
  /** Navega dejando rastro en el historial, para que «atrás» funcione. */
  navegar: (pagina: string, param?: string) => void;
  /** Cambia la URL sin ensuciar el historial (redirecciones automáticas). */
  reemplazar: (pagina: string, param?: string) => void;
}

export function useRutaTienda(): NavegacionTienda {
  const [ruta, setRuta] = useState<RutaTienda>(() => leerUrl());

  useEffect(() => {
    const alVolver = () => setRuta(leerUrl());
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  const escribir = useCallback((pagina: string, param: string | undefined, reemplazando: boolean) => {
    const destino = aRuta(pagina, param);
    if (destino !== window.location.pathname) {
      try {
        if (reemplazando) window.history.replaceState(null, '', destino);
        else window.history.pushState(null, '', destino);
      } catch (e) {
        // Si el navegador niega la History API se pierde la URL, no la
        // navegación: la tienda tiene que seguir funcionando.
        console.warn('[ruta] no se pudo actualizar la URL', e);
      }
    }
    setRuta({ pagina, param });
  }, []);

  const navegar = useCallback(
    (pagina: string, param?: string) => escribir(pagina, param, false),
    [escribir]
  );
  const reemplazar = useCallback(
    (pagina: string, param?: string) => escribir(pagina, param, true),
    [escribir]
  );

  return { pagina: ruta.pagina, param: ruta.param, navegar, reemplazar };
}
