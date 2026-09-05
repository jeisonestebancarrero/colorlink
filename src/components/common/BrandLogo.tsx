import React, { useEffect, useState } from 'react';
import { settingsService } from '../../services/settings';

/**
 * Logotipo de la marca.
 *
 * Orden de preferencia:
 *   1. `logo_url` configurado desde Administración → Configuración.
 *      Permite cambiar el logo sin desplegar código.
 *   2. El archivo oficial en assets/brand/pintuco-logo.(svg|png).
 *   3. El escudo tipográfico que la aplicación ya usaba, como último recurso.
 *
 * El isotipo de Pintuco es marca registrada y no se dibuja en código: se usa
 * el archivo oficial. Ver assets/brand/LEEME.md.
 */

// Vite procesa la imagen en el build: la versiona y la sirve con hash.
//
// El archivo oficial es un JPEG con FONDO AZUL incorporado, no transparente.
// Por eso no se coloca suelto sobre superficies claras —quedaría un
// rectángulo azul flotando— sino dentro de un marco del mismo azul de marca,
// de modo que se lea como una pieza y no como un recorte mal hecho.
// Si algún día se dispone de un SVG o PNG con transparencia, basta con
// cambiar esta importación y quitar el marco.
import logoPintuco from '../../../assets/brand/pintuco-logo.jpeg';

const LOGO_LOCAL = logoPintuco;

export const BrandLogo: React.FC<{
  onClick?: () => void;
  compacto?: boolean;
  claro?: boolean;
  /**
   * ¿Se escribe «COLORLINK» junto al isotipo en pantallas de teléfono?
   *
   * Depende del sitio, y por eso lo decide quien lo coloca. En la portada la
   * barra solo lleva dos botones y la palabra cabe entera. En la barra de
   * alguien que ya entró conviven el carrito, los mensajes, los avisos y la
   * cuenta: ahí quedan unos setenta píxeles y la palabra saldría cortada en
   * «COL…», que se lee como un error, no como un logotipo.
   */
  palabraEnMovil?: boolean;
}> = ({ onClick, compacto = false, claro = false, palabraEnMovil = true }) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [falloImagen, setFalloImagen] = useState(false);

  useEffect(() => {
    settingsService
      .get()
      .then((s) => setLogoUrl(s?.logoUrl ?? LOGO_LOCAL))
      .catch(() => setLogoUrl(LOGO_LOCAL));
  }, []);

  const alto = compacto ? 'h-8' : 'h-10';

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 sm:gap-3 select-none min-w-0 ${onClick ? 'cursor-pointer group' : ''}`}
    >
      {logoUrl && !falloImagen ? (
        <div
          className={`${compacto ? 'h-8' : 'h-10'} shrink-0 rounded-xl overflow-hidden bg-[#002D5C] flex items-center justify-center px-1.5 shadow-md group-hover:scale-105 transition-transform`}
        >
          <img
            src={logoUrl}
            alt="Pintuco"
            onError={() => setFalloImagen(true)}
            className={`${compacto ? 'h-6' : 'h-8'} w-auto object-contain`}
          />
        </div>
      ) : (
        <div
          className={`${compacto ? 'w-8 h-8 text-base' : 'w-10 h-10 text-xl'} rounded-xl bg-linear-to-br from-[#004F9F] to-[#002D5C] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform font-black`}
        >
          P
        </div>
      )}

      {!compacto && (
        /* En un teléfono la barra tiene ~354 px y el grupo de la derecha
           —carrito, mensajes, avisos, cuenta— se lleva 182. Al logotipo le
           quedan poco más de cien, y con la palabra completa, el distintivo y
           el descriptivo pedía 255: la página entera se desplazaba de lado.

           Se cede en este orden, que es el de menor a mayor pérdida:
           el descriptivo (diez píxeles, ilegible en un móvil), el distintivo
           amarillo (el isotipo ya dice Pintuco justo al lado) y el tamaño de
           la palabra. El isotipo no se toca nunca. */
        <div className={`${palabraEnMovil ? 'flex' : 'hidden sm:flex'} flex-col min-w-0`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-base sm:text-xl font-black tracking-tight leading-none truncate ${claro ? 'text-white' : 'text-slate-900'}`}
            >
              {/* Sobre fondo oscuro el azul de marca desaparece; ahí "LINK"
                  va en el amarillo Pintuco, que es el otro color oficial. */}
              COLOR<span className={claro ? 'text-[#FFB81C]' : 'text-[#004F9F]'}>LINK</span>
            </span>
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-slate-950 px-1.5 py-0.5 rounded shadow-2xs shrink-0">
              PINTUCO
            </span>
          </div>
          <span className={`hidden sm:block text-[10px] font-semibold tracking-tight truncate ${claro ? 'text-white/70' : 'text-slate-500'}`}>
            Tienda Oficial &amp; Ecosistema Digital
          </span>
        </div>
      )}
    </div>
  );
};
