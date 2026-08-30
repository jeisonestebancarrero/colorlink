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
}> = ({ onClick, compacto = false, claro = false }) => {
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
      className={`flex items-center gap-3 select-none ${onClick ? 'cursor-pointer group' : ''}`}
    >
      {logoUrl && !falloImagen ? (
        <div
          className={`${compacto ? 'h-8' : 'h-10'} rounded-xl overflow-hidden bg-[#002D5C] flex items-center justify-center px-1.5 shadow-md group-hover:scale-105 transition-transform`}
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
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xl font-black tracking-tight leading-none ${claro ? 'text-white' : 'text-slate-900'}`}
            >
              {/* Sobre fondo oscuro el azul de marca desaparece; ahí "LINK"
                  va en el amarillo Pintuco, que es el otro color oficial. */}
              COLOR<span className={claro ? 'text-[#FFB81C]' : 'text-[#004F9F]'}>LINK</span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-slate-950 px-1.5 py-0.5 rounded shadow-2xs">
              PINTUCO
            </span>
          </div>
          <span className={`text-[10px] font-semibold tracking-tight ${claro ? 'text-white/70' : 'text-slate-500'}`}>
            Tienda Oficial &amp; Ecosistema Digital
          </span>
        </div>
      )}
    </div>
  );
};
