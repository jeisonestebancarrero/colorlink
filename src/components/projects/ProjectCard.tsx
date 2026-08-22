import React from 'react';
import { Project } from '../../types';
import { StatusBadge } from '../common/Badge';
import {
  MapPin,
  Calendar,
  Layers,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Maximize2,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../common/Button';

interface ProjectCardProps {
  project: Project;
  onViewDetail: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onViewDetail }) => {
  const primaryPhoto = project.photos.find((p) => p.isPrimary) || project.photos[0];

  return (
    <div
      id={`project-card-${project.id}`}
      className="bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-blue-300 transition-all duration-200 flex flex-col justify-between overflow-hidden group text-left"
    >
      {/* Top Media & Badges */}
      <div className="relative aspect-16/9 overflow-hidden bg-slate-100">
        {primaryPhoto ? (
          <img
            src={primaryPhoto.url}
            alt={project.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
            <Layers className="w-8 h-8 mb-1 opacity-50" />
            <span className="text-xs">Sin fotografías adjuntas</span>
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-slate-950/70 via-transparent to-transparent" />

        {/* Status Badge overlay */}
        <div className="absolute top-3 left-3">
          <StatusBadge status={project.status} size="sm" />
        </div>

        {/* Project Code */}
        <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-mono font-medium px-2 py-0.5 rounded">
          {project.code}
        </div>

        {/* Area & City over image */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white text-xs">
          <span className="flex items-center gap-1 font-medium drop-shadow-xs">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            {project.city}
          </span>
          <span className="bg-white/20 backdrop-blur-xs font-semibold px-2 py-0.5 rounded text-[11px]">
            {project.areaM2} m²
          </span>
        </div>
      </div>

      {/* Body Info */}
      <div className="p-4 flex-1 flex flex-col">
        <h3
          onClick={() => onViewDetail(project.id)}
          className="text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors cursor-pointer"
        >
          {project.name}
        </h3>

        <p className="text-xs text-slate-500 line-clamp-2 mt-1 mb-3 leading-relaxed flex-1">
          {project.description}
        </p>

        {/* Surface & Condition Pills */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
            Superficie: <strong>{project.surface}</strong>
          </span>
          <span className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
            {project.environment}
          </span>
          {project.conditions.slice(0, 2).map((c) => (
            <span
              key={c}
              className="text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60 px-2 py-0.5 rounded"
            >
              {c}
            </span>
          ))}
          {project.conditions.length > 2 && (
            <span className="text-[11px] text-slate-400 font-medium">
              +{project.conditions.length - 2}
            </span>
          )}
        </div>

        {/* Preliminary Recommendation Highlight */}
        {project.preliminaryAnalysis && (
          <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-2.5 mb-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-900">
              <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
              <span className="truncate">
                {project.preliminaryAnalysis.solutionCategory}
              </span>
            </div>
          </div>
        )}

        {/* Footer Meta & Action */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Calendar className="w-3 h-3" />
            Meta: {project.requiredDate}
          </span>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewDetail(project.id)}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            className="text-xs h-7.5 px-2.5 group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-200"
          >
            Ver detalle
          </Button>
        </div>
      </div>
    </div>
  );
};
