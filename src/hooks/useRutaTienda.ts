import { useCallback, useEffect, useState } from 'react';

/**
 * Sincroniza la página de la tienda con la URL (History API) para que recargar,
 * compartir enlaces y «atrás» funcionen. nginx sirve index.html en cualquier ruta.
 */

/** Pantalla interna ↔ segmento de URL; explícito para cambiar la URL pública sin renombrar estado. */
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
  /** Segundo segmento: el id o código que necesite la pantalla. */
  param: string | undefined;
}

function leerUrl(): RutaTienda {
  const partes = window.location.pathname.split('/').filter(Boolean);
  if (partes.length === 0) return { pagina: 'landing', param: undefined };

  // Primero las rutas de dos segmentos: `proyectos/nuevo` no es el proyecto "nuevo".
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
  /** Navega dejando rastro en el historial. */
  navegar: (pagina: string, param?: string) => void;
  /** Cambia la URL sin añadir entrada al historial (redirecciones). */
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
        // Sin History API se pierde la URL, no la navegación.
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
