import React from 'react';
import { ProjectStatus } from '../../types';
import { Clock, Loader2, PlayCircle, CheckCircle2, AlertCircle } from 'lucide-react';

interface BadgeProps {
  status: ProjectStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<BadgeProps> = ({
  status,
  size = 'md',
  className = '',
  showIcon = true,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          label: 'Pendiente',
          bg: 'bg-amber-50 text-amber-700 border-amber-200/80',
          dot: 'bg-amber-500',
          icon: Clock,
        };
      case 'analyzing':
        return {
          label: 'En análisis',
          bg: 'bg-sky-50 text-sky-700 border-sky-200/80',
          dot: 'bg-sky-500',
          icon: Loader2,
          animateIcon: true,
        };
      case 'in_progress':
        return {
          label: 'En proceso',
          bg: 'bg-purple-50 text-purple-700 border-purple-200/80',
          dot: 'bg-purple-500',
          icon: PlayCircle,
        };
      case 'completed':
        return {
          label: 'Completado',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
          dot: 'bg-emerald-500',
          icon: CheckCircle2,
        };
      case 'requires_info':
        return {
          label: 'Requiere información',
          bg: 'bg-rose-50 text-rose-700 border-rose-200/80',
          dot: 'bg-rose-500',
          icon: AlertCircle,
        };
      default:
        return {
          label: status,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
          icon: Clock,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs font-medium px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-medium px-3 py-1.5 gap-2',
  };

  return (
    <span
      id={`badge-status-${status}`}
      className={`inline-flex items-center rounded-full border tracking-normal ${config.bg} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && (
        <Icon
          className={`w-3.5 h-3.5 ${config.animateIcon ? 'animate-spin' : ''}`}
        />
      )}
      <span>{config.label}</span>
    </span>
  );
};
