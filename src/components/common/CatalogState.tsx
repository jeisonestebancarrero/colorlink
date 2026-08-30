import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

/**
 * Estados de carga y error del catálogo (MÓDULO 37).
 *
 * Reutilizan el lenguaje visual que ya existe en la aplicación: el mismo
 * spinner circular de App.tsx, la tipografía slate de las páginas y el
 * componente Button existente. No se introduce ningún estilo, color ni
 * tamaño nuevo.
 */

export const CatalogLoading: React.FC<{ mensaje?: string }> = ({
  mensaje = 'Cargando catálogo Pintuco...',
}) => (
  <div className="flex items-center justify-center py-24">
    <div className="text-center space-y-3">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-sm font-semibold text-slate-500">{mensaje}</p>
    </div>
  </div>
);

export const CatalogError: React.FC<{ mensaje: string; onReintentar: () => void }> = ({
  mensaje,
  onReintentar,
}) => (
  <div className="flex items-center justify-center py-24">
    <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-2xs max-w-md text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-6 h-6 text-amber-600" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
          No pudimos cargar el catálogo
        </h2>
        <p className="text-sm text-slate-500 font-medium">{mensaje}</p>
      </div>
      <Button variant="outline" onClick={onReintentar} leftIcon={<RefreshCw className="w-4 h-4" />}>
        Reintentar
      </Button>
    </div>
  </div>
);
