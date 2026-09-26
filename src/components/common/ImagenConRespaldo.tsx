import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * Imagen con marcador si la URL falla. Una URL puede responder 200 con HTML
 * (p. ej. resultados de Google Imágenes), así que solo se detecta al pintarla.
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

  // `key={src}` reinicia el fallo cuando cambia la imagen.
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
 * Aviso inmediato mientras se escribe, para URLs que son páginas y no imágenes
 * (resultados de buscadores, páginas de producto). La validación real es `verificarImagen`.
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

  // Una ruta terminada en `/` es una página, no un archivo (p. ej. producto en pintuco.com.co).
  if (ruta.endsWith('/') && ruta !== '/') {
    return 'Esa parece la página del producto, no la imagen. '
      + 'Haz clic derecho sobre la FOTO y elige «Copiar dirección de la imagen».';
  }

  return null;
}

/**
 * Validación definitiva: carga la imagen. Usa `new Image()` y no `fetch` porque
 * `fetch` a otro dominio falla por CORS aunque la imagen sea válida.
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

    // Sin tope, un host que no responde deja el formulario «verificando» indefinidamente.
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
