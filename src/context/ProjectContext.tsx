import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Project,
  NotificationItem,
  ProjectFormData,
  ProjectStatus,
} from '../types';
import {
  projectService,
  notificationService,
} from '../services/api';
import { INITIAL_PROJECTS, INITIAL_NOTIFICATIONS } from '../data/mockData';
import { setStoredProjects, setStoredNotifications } from '../services/storage';

interface ToastState {
  message: string;
  type: 'success' | 'info' | 'error';
  visible: boolean;
}

interface ProjectContextType {
  projects: Project[];
  notifications: NotificationItem[];
  unreadNotificationsCount: number;
  isLoading: boolean;
  activeProject: Project | null;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  refreshProjects: () => Promise<void>;
  createProject: (formData: ProjectFormData) => Promise<Project>;
  getProjectById: (id: string) => Promise<Project | null>;
  requestTechnicalAssistance: (
    projectId: string,
    details: { notes?: string; contactPhone?: string; preferredDate?: string }
  ) => Promise<Project>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  toast: ToastState;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  hideToast: () => void;
  statusStats: {
    total: number;
    active: number;
    pending: number;
    inProgress: number;
    completed: number;
    requiresInfo: number;
  };
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>('proj-horiz-001');
  const [toast, setToast] = useState<ToastState>({
    message: '',
    type: 'info',
    visible: false,
  });

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4500);
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedProjects, fetchedNotifs] = await Promise.all([
        projectService.getProjects(),
        notificationService.getNotifications(),
      ]);
      setProjects(fetchedProjects);
      setNotifications(fetchedNotifs);
    } catch (e) {
      console.error('Error loading initial data', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const refreshProjects = async () => {
    const updated = await projectService.getProjects();
    setProjects(updated);
  };

  const createProject = async (formData: ProjectFormData): Promise<Project> => {
    setIsLoading(true);
    try {
      const newProj = await projectService.createProject(formData);
      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProj.id);
      const updatedNotifs = await notificationService.getNotifications();
      setNotifications(updatedNotifs);
      showToast(`¡Proyecto "${newProj.name}" creado con éxito!`, 'success');
      return newProj;
    } catch (e) {
      showToast('Ocurrió un error al crear el proyecto', 'error');
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const getProjectById = async (id: string): Promise<Project | null> => {
    const existing = projects.find((p) => p.id === id);
    if (existing) return existing;
    return await projectService.getProjectById(id);
  };

  const requestTechnicalAssistance = async (
    projectId: string,
    details: { notes?: string; contactPhone?: string; preferredDate?: string }
  ): Promise<Project> => {
    const updated = await projectService.requestTechnicalAssistance(projectId, details);
    setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
    const updatedNotifs = await notificationService.getNotifications();
    setNotifications(updatedNotifs);
    showToast('Acompañamiento técnico solicitado a Pintuco', 'success');
    return updated;
  };

  const markNotificationRead = async (id: string) => {
    const updated = await notificationService.markAsRead(id);
    setNotifications(updated);
  };

  const markAllNotificationsRead = async () => {
    const updated = await notificationService.markAllAsRead();
    setNotifications(updated);
    showToast('Todas las notificaciones marcadas como leídas', 'info');
  };

  const resetDemoData = async () => {
    setStoredProjects(INITIAL_PROJECTS);
    setStoredNotifications(INITIAL_NOTIFICATIONS);
    setProjects(INITIAL_PROJECTS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setActiveProjectId('proj-horiz-001');
    showToast('Datos de demostración restablecidos', 'info');
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const statusStats = {
    total: projects.length,
    active: projects.filter((p) => p.status !== 'completed').length,
    pending: projects.filter((p) => p.status === 'pending' || p.status === 'analyzing').length,
    inProgress: projects.filter((p) => p.status === 'in_progress').length,
    completed: projects.filter((p) => p.status === 'completed').length,
    requiresInfo: projects.filter((p) => p.status === 'requires_info').length,
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        notifications,
        unreadNotificationsCount,
        isLoading,
        activeProject,
        activeProjectId,
        setActiveProjectId,
        refreshProjects,
        createProject,
        getProjectById,
        requestTechnicalAssistance,
        markNotificationRead,
        markAllNotificationsRead,
        resetDemoData,
        toast,
        showToast,
        hideToast,
        statusStats,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};
