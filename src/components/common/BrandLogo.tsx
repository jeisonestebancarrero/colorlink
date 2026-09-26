import React, { useEffect, useState } from 'react';
import { settingsService } from '../../services/settings';

/**
 * Logotipo: `logo_url` de Configuración, luego el archivo oficial de assets/brand, luego el escudo tipográfico.
 * El isotipo es marca registrada y no se redibuja en código (ver assets/brand/LEEME.md).
 */

// El archivo oficial es un JPEG con fondo azul: va dentro de un marco del mismo azul.
// Con un SVG/PNG transparente bastaría cambiar esta importación y quitar el marco.
import logoPintuco from '../../../assets/brand/pintuco-logo.jpeg';

const LOGO_LOCAL = logoPintuco;

export const BrandLogo: React.FC<{
  onClick?: () => void;
  compacto?: boolean;
  claro?: boolean;
  /** Muestra «COLORLINK» en móvil; lo decide quien lo coloca según el espacio libre en su barra. */
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
        /* En móvil no cabe todo: se ocultan descriptivo y distintivo y se reduce la palabra
           para evitar scroll horizontal; el isotipo nunca se toca. */
        <div className={`${palabraEnMovil ? 'flex' : 'hidden sm:flex'} flex-col min-w-0`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-base sm:text-xl font-black tracking-tight leading-none truncate ${claro ? 'text-white' : 'text-slate-900'}`}
            >
              {/* En fondo oscuro "LINK" va en amarillo Pintuco: el azul no se ve. */}
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
