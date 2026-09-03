import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * Imagen que no se rompe cuando su URL falla.
 *
 * El navegador, ante una URL que no devuelve una imagen, pinta su icono de
 * roto. En un catálogo eso se lee como «el producto está mal cargado», y no
 * dice qué producto ni por qué. Aquí, cuando la carga falla, se muestra un
 * marcador limpio con el nombre y —para quien administra— la pista de que la
 * URL no sirve.
 *
 * CASO REAL que lo motivó: un producto tenía guardada
 * `https://www.google.com/imgres?q=Brocha...`, que es la página de RESULTADOS
 * de Google Imágenes, no una imagen. Devuelve 200 y `text/html`, así que no
 * hay forma de detectarlo antes de intentar pintarlo.
 */

interface Props {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Marcador alternativo, p. ej. el fondo de marca. */
  respaldo?: string;
  /** Muestra el aviso de «imagen no disponible». Solo para pantallas internas. */
  avisarAlPersonal?: boolean;
}

export const ImagenConRespaldo: React.FC<Props> = ({
  src, alt, className = '', respaldo, avisarAlPersonal = false,
}) => {
  const [fallo, setFallo] = useState(false);

  // `key` en el src: si el producto cambia de imagen, hay que volver a
  // intentarlo. Sin esto, un fallo anterior dejaría el marcador para siempre.
  const sinImagen = !src || src.trim() === '' || fallo;

  if (sinImagen && respaldo && !fallo) {
    return <img src={respaldo} alt="" aria-hidden className={className} />;
  }

  if (sinImagen) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 ${className}`}
        title={avisarAlPersonal ? 'La imagen guardada no se pudo cargar' : undefined}
      >
        <ImageOff className="w-5 h-5" />
        {avisarAlPersonal && (
          <span className="text-[10px] font-semibold px-2 text-center leading-tight">
            Imagen no disponible
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFallo(true)}
      loading="lazy"
    />
  );
};

/**
 * Pista rápida mientras se escribe, ANTES de intentar cargar.
 *
 * No es la validación definitiva —esa es `verificarImagen`, que carga la
 * imagen de verdad—, sino un aviso inmediato para los dos errores que ya
 * ocurrieron de verdad en este catálogo:
 *
 *   1. `https://www.google.com/imgres?q=Brocha...` — la página de RESULTADOS
 *      de Google Imágenes. Es el enlace que se copia al hacer clic derecho
 *      sobre el resultado, en lugar de sobre la foto.
 *   2. `https://www.pintuco.com.co/productos/brocha-.../` — la página del
 *      producto en el sitio de Pintuco. Termina en `/` y no es un archivo.
 *
 * Los dos son PÁGINAS, no imágenes, y el navegador solo puede pintar su icono
 * de roto. Cargar por URL sigue siendo perfectamente válido: lo que se ataja
 * es pegar la dirección equivocada.
 */
export function urlDeImagenSospechosa(url: string): string | null {
  const u = url.trim();
  if (u === '') return null;

  if (!/^https?:\/\//i.test(u)) {
    return 'La dirección debe empezar por http:// o https://';
  }

  let host = '';
  let ruta = '';
  try {
    const parsed = new URL(u);
    host = parsed.hostname.toLowerCase();
    ruta = parsed.pathname.toLowerCase();
  } catch {
    return 'Esa dirección no es válida.';
  }

  // Páginas de resultados de buscadores de imágenes.
  if (/(^|\.)google\./.test(host) && /^\/(imgres|search|url)/.test(ruta)) {
    return 'Esa es la página de resultados de Google Imágenes, no la imagen. '
      + 'Abre la foto, haz clic derecho sobre ELLA y copia la dirección de la imagen.';
  }
  if (/(^|\.)bing\.com$/.test(host) && ruta.startsWith('/images/search')) {
    return 'Esa es la página de resultados de Bing Imágenes, no la imagen.';
  }
  if (/(^|\.)pinterest\./.test(host) && !/\.(jpe?g|png|webp|avif|gif)$/.test(ruta)) {
    return 'Ese es el enlace del pin, no la imagen. Copia la dirección de la foto.';
  }

  // Una ruta que termina en `/` es una página, no un archivo. Es exactamente
  // la forma de la URL del producto en pintuco.com.co.
  if (ruta.endsWith('/') && ruta !== '/') {
    return 'Esa parece la página del producto, no la imagen. '
      + 'Haz clic derecho sobre la FOTO y elige «Copiar dirección de la imagen».';
  }

  return null;
}

/**
 * Verificación DEFINITIVA: intenta cargar la imagen.
 *
 * Es la única comprobación que no se puede engañar. Las pistas por patrón
 * atajan los errores conocidos, pero no cubren una URL que simplemente ya no
 * existe, un host caído o una página cualquiera que no se parezca a las que se
 * conocen —y eso es justo lo que pasó dos veces en este catálogo—.
 *
 * Se usa `new Image()` y no `fetch` a propósito: `fetch` a otro dominio choca
 * con CORS y falla incluso cuando la imagen es válida. El navegador sí puede
 * PINTAR una imagen de otro dominio, así que se le pregunta a él.
 */
export function verificarImagen(
  url: string,
  msTimeout = 10000
): Promise<{ ok: boolean; aviso?: string }> {
  const u = url.trim();
  if (u === '') return Promise.resolve({ ok: true });

  const porPatron = urlDeImagenSospechosa(u);
  if (porPatron) return Promise.resolve({ ok: false, aviso: porPatron });

  return new Promise((resolve) => {
    const img = new Image();
    let resuelto = false;
    const terminar = (r: { ok: boolean; aviso?: string }) => {
      if (resuelto) return;
      resuelto = true;
      img.onload = null;
      img.onerror = null;
      resolve(r);
    };

    // Un host que no responde deja la promesa colgada para siempre: sin este
    // tope, el formulario se quedaría «verificando» sin decir nada.
    const reloj = setTimeout(() => terminar({
      ok: false,
      aviso: 'La imagen tardó demasiado en responder. Revisa la dirección.',
    }), msTimeout);

    img.onload = () => {
      clearTimeout(reloj);
      // Una imagen de 0×0 se «carga» pero no se ve.
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        terminar({ ok: false, aviso: 'Esa dirección no devuelve una imagen válida.' });
        return;
      }
      terminar({ ok: true });
    };

    img.onerror = () => {
      clearTimeout(reloj);
      terminar({
        ok: false,
        aviso: 'Esa dirección no carga como imagen. '
          + 'Si la copiaste de una página web, haz clic derecho sobre la FOTO '
          + 'y elige «Copiar dirección de la imagen».',
      });
    };

    img.src = u;
  });
}
