import React from 'react';
import { useProjects } from '../../context/ProjectContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toast, hideToast } = useProjects();

  if (!toast.visible) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
  };

  const borders = {
    success: 'border-emerald-200 bg-white text-slate-800 shadow-emerald-500/10',
    error: 'border-rose-200 bg-white text-slate-800 shadow-rose-500/10',
    info: 'border-blue-200 bg-white text-slate-800 shadow-blue-500/10',
  };

  return (
    <div
      id="colorlink-toast-container"
      className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border shadow-xl ${borders[toast.type]}`}
      >
        {icons[toast.type]}
        <div className="flex-1 text-sm font-medium pr-2 text-slate-800 leading-snug">
          {toast.message}
        </div>
        <button
          onClick={hideToast}
          className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
          aria-label="Cerrar notificación"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
