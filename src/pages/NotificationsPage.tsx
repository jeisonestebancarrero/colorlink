import React, { useState } from 'react';
import { useProjects } from '../context/ProjectContext';
import { Button } from '../components/common/Button';
import {
  Bell,
  CheckCheck,
  Sparkles,
  UserCheck,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  Clock,
} from 'lucide-react';

interface NotificationsPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNavigate }) => {
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    setActiveProjectId,
  } = useProjects();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'analysis_ready':
        return <Sparkles className="w-4 h-4 text-blue-600" />;
      case 'specialist_assigned':
        return <UserCheck className="w-4 h-4 text-purple-600" />;
      case 'visit_scheduled':
        return <Calendar className="w-4 h-4 text-emerald-600" />;
      case 'specification_updated':
        return <Layers className="w-4 h-4 text-amber-600" />;
      default:
        return <Info className="w-4 h-4 text-slate-500" />;
    }
  };

  const handleClickNotification = (n: typeof notifications[0]) => {
    markNotificationRead(n.id);
    if (n.projectId) {
      setActiveProjectId(n.projectId);
      onNavigate('project-detail', n.projectId);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-left pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Centro de Notificaciones</span>
            {unreadNotificationsCount > 0 && (
              <span className="bg-[#004F9F] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadNotificationsCount} nuevas
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500">
            Actualizaciones en tiempo real sobre diagnósticos, visitas técnicas y proyectos
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadNotificationsCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllNotificationsRead}
              leftIcon={<CheckCheck className="w-4 h-4 text-slate-600" />}
              className="text-xs"
            >
              Marcar todas como leídas
            </Button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
            filter === 'all'
              ? 'bg-[#004F9F] text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Todas ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
            filter === 'unread'
              ? 'bg-[#004F9F] text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          No leídas ({unreadNotificationsCount})
        </button>
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <Bell className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">
            No tienes notificaciones pendientes
          </h3>
          <p className="text-xs text-slate-500">
            Cuando haya avances en tus obras o diagnósticos, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-2xs">
          {filteredNotifications.map((item) => (
            <div
              key={item.id}
              onClick={() => handleClickNotification(item)}
              className={`p-4 sm:p-5 flex items-start gap-4 transition-colors cursor-pointer group ${
                !item.read ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'
              }`}
            >
              {/* Icon */}
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0 group-hover:scale-105 transition-transform">
                {getIcon(item.type)}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`text-sm ${
                        !item.read
                          ? 'font-bold text-slate-900'
                          : 'font-semibold text-slate-700'
                      }`}
                    >
                      {item.title}
                    </h4>
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {item.date}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {item.message}
                </p>

                {item.projectId && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#004F9F]">
                    <span>Ver proyecto relacionado</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
