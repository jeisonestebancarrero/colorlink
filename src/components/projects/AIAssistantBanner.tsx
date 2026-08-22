import React from 'react';
import { PreliminaryAnalysis } from '../../types';
import {
  Sparkles,
  ShieldAlert,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  UserCheck,
} from 'lucide-react';
import { Button } from '../common/Button';

interface AIAssistantBannerProps {
  analysis: PreliminaryAnalysis;
  onRequestSpecialist?: () => void;
  hideAction?: boolean;
}

export const AIAssistantBanner: React.FC<AIAssistantBannerProps> = ({
  analysis,
  onRequestSpecialist,
  hideAction = false,
}) => {
  return (
    <div
      id="colorlink-ai-assistant-card"
      className="bg-linear-to-br from-slate-900 via-[#002D5C] to-[#004F9F] text-white rounded-2xl p-6 shadow-xl border border-blue-400/20 text-left relative overflow-hidden"
    >
      {/* Subtle background glow effect */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-inner">
            <Sparkles className="w-5 h-5 text-blue-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Asistente Técnico ColorLink
              </h3>
              <span className="bg-blue-400/20 text-blue-200 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-300/30">
                Diagnóstico Preliminar
              </span>
            </div>
            <p className="text-xs text-blue-200/80">
              Análisis inteligente de sustrato y clasificación de patologías de recubrimiento
            </p>
          </div>
        </div>

        {/* Attention Level */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-200">Nivel de atención:</span>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border ${
              analysis.attentionLevel === 'Urgente' || analysis.attentionLevel === 'Alta'
                ? 'bg-rose-500/20 text-rose-200 border-rose-400/40'
                : analysis.attentionLevel === 'Especializada'
                ? 'bg-purple-500/20 text-purple-200 border-purple-400/40'
                : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
            }`}
          >
            {analysis.attentionLevel}
          </span>
        </div>
      </div>

      {/* AI Summary Quote */}
      <div className="my-4 p-3.5 bg-white/5 border border-white/10 rounded-xl">
        <p className="text-xs text-blue-100 leading-relaxed font-normal italic">
          "{analysis.aiSummary}"
        </p>
      </div>

      {/* Grid: Detected Conditions & Considerations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
        {/* Left: Recommended System Category */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-200 uppercase tracking-wider">
            <FileCheck className="w-4 h-4 text-blue-400" />
            <span>Sistema Sugerido Preliminar</span>
          </div>
          <p className="text-sm font-semibold text-white">
            {analysis.solutionCategory}
          </p>
          <div className="pt-2">
            <span className="text-[11px] text-blue-200/80 block mb-1 font-medium">
              Patologías detectadas en sustrato:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {analysis.detectedConditions.map((cond) => (
                <span
                  key={cond}
                  className="text-xs bg-amber-400/20 text-amber-200 border border-amber-300/30 px-2 py-0.5 rounded"
                >
                  {cond}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Key Surface Prep Considerations */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-200 uppercase tracking-wider">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Preparación & Puntos Clave</span>
          </div>
          <ul className="space-y-1.5 text-xs text-blue-100/90">
            {analysis.keyConsiderations.slice(0, 3).map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Missing Information / Alerts if any */}
      {analysis.missingInformation.length > 0 && (
        <div className="mb-4 p-3 bg-amber-500/15 border border-amber-400/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-100">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-200 block font-semibold mb-0.5">
              Información complementaria recomendada:
            </strong>
            <ul className="list-disc pl-4 space-y-0.5 text-amber-100/90">
              {analysis.missingInformation.map((info, idx) => (
                <li key={idx}>{info}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Strict Disclaimer & Action */}
      <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-[11px] text-blue-200/70 max-w-xl">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p>{analysis.disclaimer}</p>
        </div>

        {!hideAction && onRequestSpecialist && (
          <Button
            variant="primary"
            size="sm"
            onClick={onRequestSpecialist}
            leftIcon={<UserCheck className="w-4 h-4" />}
            className="bg-white text-slate-900 hover:bg-blue-50 border-none shadow-md font-semibold text-xs whitespace-nowrap"
          >
            Solicitar acompañamiento técnico
          </Button>
        )}
      </div>
    </div>
  );
};
