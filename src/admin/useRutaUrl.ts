import { useCallback, useEffect, useState } from 'react';

/**
 * Ruta del portal sincronizada con la URL mediante la History API, sin librería de rutas.
 * Depende de que `nginx-admin.conf` sirva `admin.html` para cualquier ruta.
 */

/** Ruta propia del tablero, distinta de la raíz. */
export const RUTA_TABLERO = '/apps';

/** Ruta actual normalizada: siempre empieza por `/` y nunca termina en `/`. */
function rutaDeLaUrl(): string {
  const p = window.location.pathname;
  // `/` es la raíz del portal y equivale al tablero.
  if (!p || p === '/') return RUTA_TABLERO;
  return p.replace(/\/+$/, '') || RUTA_TABLERO;
}

export interface Ruta {
  /** Ruta completa, p. ej. `/pedidos/ORD-PNT-000045`. */
  completa: string;
  /** Módulo, p. ej. `/pedidos`; lo consume el `switch` de pantallas. */
  modulo: string;
  /** Id del registro abierto: `/facturacion/POS-000004` → `'POS-000004'`. */
  id: string | null;
}

function partir(completa: string): Ruta {
  if (completa === '/' || completa === RUTA_TABLERO) {
    return { completa: RUTA_TABLERO, modulo: RUTA_TABLERO, id: null };
  }
  const partes = completa.split('/').filter(Boolean);
  return {
    completa,
    modulo: `/${partes[0]}`,
    id: partes.length > 1 ? decodeURIComponent(partes.slice(1).join('/')) : null,
  };
}

export interface NavegacionUrl {
  ruta: Ruta;
  /** Navega con `pushState`. */
  ir: (destino: string) => void;
  /** Cambia la URL con `replaceState`, para abrir detalles sin llenar el historial. */
  reemplazar: (destino: string) => void;
  /** Abre un registro dentro del módulo actual: `/pedidos` + id. */
  abrir: (modulo: string, id: string) => void;
  /** Vuelve al listado del módulo, quitando el id. */
  cerrarDetalle: () => void;
}

export function useRutaUrl(): NavegacionUrl {
  const [completa, setCompleta] = useState<string>(() => rutaDeLaUrl());

  // `/` → `/apps` con replace: con push, «atrás» redirigiría en bucle.
  useEffect(() => {
    if (window.location.pathname === '/' || window.location.pathname === '') {
      try {
        window.history.replaceState(null, '', RUTA_TABLERO);
      } catch (e) {
        console.warn('[ruta] no se pudo fijar la ruta del tablero', e);
      }
    }
  }, []);

  // «Atrás» y «adelante» del navegador.
  useEffect(() => {
    const alVolver = () => setCompleta(rutaDeLaUrl());
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  const escribir = useCallback((destino: string, reemplazando: boolean) => {
    const limpio = destino.startsWith('/') ? destino.replace(/\/+$/, '') || '/' : `/${destino}`;
    if (limpio === rutaDeLaUrl()) {
      // Evita entradas repetidas en el historial.
      setCompleta(limpio);
      return;
    }
    try {
      if (reemplazando) window.history.replaceState(null, '', limpio);
      else window.history.pushState(null, '', limpio);
    } catch (e) {
      // Si la History API falla, se pierde la URL pero no la navegación.
      console.warn('[ruta] no se pudo actualizar la URL', e);
    }
    setCompleta(limpio);
  }, []);

  const ir = useCallback((destino: string) => escribir(destino, false), [escribir]);
  const reemplazar = useCallback((destino: string) => escribir(destino, true), [escribir]);

  const abrir = useCallback((modulo: string, id: string) => {
    reemplazar(`${modulo}/${encodeURIComponent(id)}`);
  }, [reemplazar]);

  const cerrarDetalle = useCallback(() => {
    reemplazar(partir(rutaDeLaUrl()).modulo);
  }, [reemplazar]);

  return { ruta: partir(completa), ir, reemplazar, abrir, cerrarDetalle };
}
