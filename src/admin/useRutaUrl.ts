import { useCallback, useEffect, useState } from 'react';

/**
 * La ruta del portal vive en la URL, no en un `useState`.
 *
 * Antes la navegación era estado local: la barra de direcciones se quedaba en
 * `/` y al recargar la persona volvía al tablero de aplicaciones, perdiendo lo
 * que estaba mirando. Tampoco se podía compartir un enlace a un pedido ni usar
 * el botón «atrás» del navegador, que es lo primero que intenta cualquiera.
 *
 * Se hace con la History API y no con una librería de rutas porque la
 * aplicación ya tiene su propio `switch` de pantallas: lo único que faltaba
 * era mantener la URL sincronizada. Añadir un enrutador implicaría reescribir
 * las diecisiete pantallas para nada.
 *
 * `nginx-admin.conf` ya sirve `admin.html` para cualquier ruta
 * (`try_files $uri $uri/ /admin.html`), así que recargar en
 * `/pedidos/ORD-PNT-000045` funciona: no hace falta tocar el servidor.
 */

/**
 * El tablero de aplicaciones tiene su propia ruta.
 *
 * Antes vivía en `/`, que no dice nada: al recargar no se distinguía "estoy en
 * el tablero" de "no sé dónde estoy". Con `/apps` el tablero es una pantalla
 * más, se puede enlazar y se ve en la barra de direcciones como cualquier otra.
 */
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
  /** Módulo, p. ej. `/pedidos`. Es lo que consume el `switch` de pantallas. */
  modulo: string;
  /**
   * Identificador del registro abierto, si la ruta lo trae.
   * `/facturacion/POS-000004` → `'POS-000004'`.
   */
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
  /**
   * Navega y deja rastro en el historial: el botón «atrás» vuelve a la
   * pantalla anterior, que es lo que espera cualquiera.
   */
  ir: (destino: string) => void;
  /**
   * Cambia la URL SIN dejar rastro. Para abrir el detalle de un registro
   * dentro de la misma pantalla: si cada apertura empujara al historial,
   * «atrás» obligaría a recorrer uno por uno todos los que se abrieron.
   */
  reemplazar: (destino: string) => void;
  /** Abre un registro dentro del módulo actual: `/pedidos` + id. */
  abrir: (modulo: string, id: string) => void;
  /** Vuelve al listado del módulo, quitando el id. */
  cerrarDetalle: () => void;
}

export function useRutaUrl(): NavegacionUrl {
  const [completa, setCompleta] = useState<string>(() => rutaDeLaUrl());

  // Quien entra a `/` acaba en `/apps` sin dejar rastro en el historial: con
  // `pushState`, «atrás» devolvería a `/` y volvería a redirigir en bucle.
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
      // Ya estamos ahí: no se ensucia el historial con una entrada repetida.
      setCompleta(limpio);
      return;
    }
    try {
      if (reemplazando) window.history.replaceState(null, '', limpio);
      else window.history.pushState(null, '', limpio);
    } catch (e) {
      // Un navegador que niegue la History API no debe dejar la aplicación
      // sin navegar: se pierde la URL, no la pantalla.
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
