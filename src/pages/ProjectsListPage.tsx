import React, { useState } from 'react';
import { useProjects } from '../context/ProjectContext';
import { Project, ProjectStatus, SurfaceType } from '../types';
import { ProjectCard } from '../components/projects/ProjectCard';
import { StatusBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import {
  FolderKanban,
  Search,
  PlusCircle,
  Filter,
  Grid,
  List,
  MapPin,
  Calendar,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface ProjectsListPageProps {
  onNavigate: (page: string, param?: string) => void;
  initialFilter?: string;
}

export const ProjectsListPage: React.FC<ProjectsListPageProps> = ({
  onNavigate,
  initialFilter,
}) => {
  const { projects, setActiveProjectId } = useProjects();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>(initialFilter || 'all');
  const [selectedSurface, setSelectedSurface] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const filteredProjects = projects.filter((p) => {
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matches =
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.surface.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      if (!matches) return false;
    }

    // Status filter
    if (selectedStatus !== 'all' && p.status !== selectedStatus) {
      return false;
    }

    // Surface filter
    if (selectedSurface !== 'all' && p.surface !== selectedSurface) {
      return false;
    }

    return true;
  });

  const handleViewDetail = (id: string) => {
    setActiveProjectId(id);
    onNavigate('project-detail', id);
  };

  const statusFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'analyzing', label: '🔵 En análisis' },
    { value: 'in_progress', label: '🟣 En proceso' },
    { value: 'pending', label: '🟡 Pendientes' },
    { value: 'completed', label: '🟢 Completados' },
    { value: 'requires_info', label: '🔴 Requiere info' },
  ];

  const surfaceFilters = [
    'all',
    'Concreto',
    'Cemento',
    'Fachada',
    'Drywall',
    'Metal',
    'Madera',
  ];

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Mis Proyectos
          </h1>
          <p className="text-xs text-slate-500">
            Historial y seguimiento de todas tus solicitudes y especificaciones técnicas
          </p>
        </div>

        <Button
          variant="pintuco"
          size="sm"
          onClick={() => onNavigate('create-project')}
          leftIcon={<PlusCircle className="w-4 h-4" />}
          className="shadow-sm"
        >
          Crear nuevo proyecto
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, código, ciudad o superficie..."
              className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition-all"
            />
          </div>

          {/* Surface dropdown & View Mode Toggle */}
          <div className="flex items-center gap-2">
            <select
              value={selectedSurface}
              onChange={(e) => setSelectedSurface(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="all">Todas las superficies</option>
              {surfaceFilters
                .filter((s) => s !== 'all')
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>

            <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#004F9F] shadow-xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Vista en cuadrícula"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-[#004F9F] shadow-xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Vista en tabla"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
          {statusFilters.map((st) => (
            <button
              key={st.value}
              onClick={() => setSelectedStatus(st.value)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                selectedStatus === st.value
                  ? 'bg-[#004F9F] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Projects List / Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
          <FolderKanban className="w-12 h-12 text-slate-300 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-slate-800">
              No se encontraron proyectos con los filtros seleccionados
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Prueba cambiando la búsqueda o restableciendo los filtros de estado.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setSelectedStatus('all');
              setSelectedSurface('all');
            }}
          >
            Limpiar filtros
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              onViewDetail={handleViewDetail}
            />
          ))}
        </div>
      ) : (
        /* Modern Table View */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Código & Proyecto</th>
                  <th className="px-4 py-3">Ubicación</th>
                  <th className="px-4 py-3">Superficie & Área</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha meta</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/60 transition-colors group cursor-pointer"
                    onClick={() => handleViewDetail(p.id)}
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[10px] text-slate-400 block">
                        {p.code}
                      </span>
                      <strong className="text-slate-900 group-hover:text-blue-600 transition-colors">
                        {p.name}
                      </strong>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {p.city}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-slate-800">
                        {p.surface}
                      </span>
                      <span className="text-slate-400 block text-[11px]">
                        {p.areaM2} m² • {p.environment}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={p.status} size="sm" />
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 font-medium">
                      {p.requiredDate}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetail(p.id);
                        }}
                        rightIcon={<ArrowRight className="w-3 h-3" />}
                        className="text-xs h-7 px-2.5"
                      >
                        Detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
