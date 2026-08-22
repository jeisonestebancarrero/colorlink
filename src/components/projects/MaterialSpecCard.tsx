import React from 'react';
import { RecommendedProduct } from '../../types';
import { Layers, CheckCircle2, FileText, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '../common/Button';

interface MaterialSpecCardProps {
  products: RecommendedProduct[];
  onRequestQuote?: () => void;
}

export const MaterialSpecCard: React.FC<MaterialSpecCardProps> = ({
  products,
  onRequestQuote,
}) => {
  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#004F9F]" />
            <span>Sistema y Materiales Pintuco Sugeridos</span>
          </h3>
          <p className="text-xs text-slate-500">
            Esquema multicapa diseñado para el sustrato y condiciones de tu proyecto.
          </p>
        </div>
        <span className="text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-1 rounded-full w-fit">
          Cantidades definitivas sujetas a memoria técnica
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((prod, index) => (
          <div
            key={prod.id}
            className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              {/* Role badge */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-[#004F9F] border border-blue-200/70 px-2 py-0.5 rounded">
                  Paso {index + 1}: {prod.role}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {prod.code}
                </span>
              </div>

              <h4 className="text-sm font-bold text-slate-900 leading-snug">
                {prod.name}
              </h4>

              <p className="text-xs text-slate-600 mt-1.5 line-clamp-3 leading-relaxed">
                {prod.description}
              </p>

              {/* Specs */}
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Aplicación:</span>
                  <span className="font-medium text-slate-700">{prod.applicationMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Rendimiento:</span>
                  <span className="font-medium text-slate-700 text-right text-[11px]">
                    {prod.theoreticalSpreadRate}
                  </span>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-3 pt-2.5 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 italic">
                * {prod.disclaimer}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
