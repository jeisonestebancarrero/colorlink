import React from 'react';
import { TimelineStep } from '../../types';
import { CheckCircle2, Clock, CircleDot, User, ArrowRight } from 'lucide-react';

interface ProjectTimelineProps {
  steps: TimelineStep[];
}

export const ProjectTimeline: React.FC<ProjectTimelineProps> = ({ steps }) => {
  return (
    <div className="space-y-6 text-left">
      <div className="relative pl-6 sm:pl-8 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
        {steps.map((step, index) => {
          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';
          const isUpcoming = step.status === 'upcoming';

          return (
            <div key={step.id} className="relative pb-8 last:pb-0 group">
              {/* Timeline Node Icon */}
              <div
                className={`absolute -left-6 sm:-left-8 top-0.5 w-6 sm:w-8 h-6 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                  isCompleted
                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-50'
                    : isCurrent
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                ) : isCurrent ? (
                  <CircleDot className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                ) : (
                  <span>{step.stepNumber}</span>
                )}
              </div>

              {/* Step Content */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-blue-50/40 border-blue-200 shadow-xs'
                    : isCompleted
                    ? 'bg-white border-slate-200/80 hover:border-slate-300'
                    : 'bg-slate-50/50 border-slate-200/60 opacity-80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      PASO {step.stepNumber}
                    </span>
                    <h4
                      className={`text-sm font-bold ${
                        isCurrent
                          ? 'text-blue-900'
                          : isCompleted
                          ? 'text-slate-900'
                          : 'text-slate-600'
                      }`}
                    >
                      {step.title}
                    </h4>
                  </div>
                  {step.date && (
                    <span className="text-xs font-medium text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200/60 w-fit">
                      {step.date}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  {step.description}
                </p>

                {step.responsible && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1 border-t border-slate-200/40">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>Responsable:</span>
                    <strong className="text-slate-700 font-medium">
                      {step.responsible}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
