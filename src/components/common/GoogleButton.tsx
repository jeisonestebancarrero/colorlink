import React from 'react';

/**
 * Botón "Continuar con Google".
 *
 * Se implementa como componente propio y no con `Button` porque las guías de
 * marca de Google exigen su logotipo oficial y un botón blanco con borde.
 * Reutiliza las mismas clases de radio, altura, tipografía y foco que la
 * variante `outline` de Button, para que no desentone con el resto del
 * formulario.
 */
export const GoogleButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  texto?: string;
}> = ({ onClick, disabled = false, texto = 'Continuar con Google' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full inline-flex items-center justify-center gap-2.5 h-12 px-5 rounded-lg text-sm font-bold
               bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300
               shadow-xs transition-all duration-150 select-none cursor-pointer active:scale-[0.99]
               focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
               disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {/* Logotipo oficial de Google */}
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
    <span>{texto}</span>
  </button>
);

/** Separador "o" entre el formulario y los accesos externos. */
export const SeparadorAcceso: React.FC = () => (
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <div className="w-full border-t border-slate-200" />
    </div>
    <div className="relative flex justify-center">
      <span className="bg-white px-3 text-xs font-semibold text-slate-400">o</span>
    </div>
  </div>
);
