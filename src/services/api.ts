import {
  Project,
  User,
  NotificationItem,
  SolutionCatalogItem,
  ProjectFormData,
  ProjectStatus,
  TechnicalService,
} from '../types';
import {
  getStoredUser,
  setStoredUser,
  getStoredSession,
  setStoredSession,
  getStoredProjects,
  setStoredProjects,
  getStoredNotifications,
  setStoredNotifications,
  generatePreliminaryAnalysis,
} from './storage';
import { SOLUTIONS_CATALOG } from '../data/mockData';

// Helper to simulate minor network latency
const simulateDelay = (ms = 250): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const authService = {
  async getCurrentUser(): Promise<User | null> {
    await simulateDelay(100);
    const isAuth = getStoredSession();
    if (!isAuth) return null;
    return getStoredUser();
  },

  async login(email: string, _password: string): Promise<User> {
    await simulateDelay(350);
    const user = getStoredUser();
    // For demo purposes, we accept any login or keep existing profile
    if (email && email !== user.email) {
      user.email = email;
      setStoredUser(user);
    }
    setStoredSession(true);
    return user;
  },

  async register(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    await simulateDelay(400);
    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
    };
    setStoredUser(newUser);
    setStoredSession(true);
    return newUser;
  },

  async logout(): Promise<void> {
    await simulateDelay(150);
    setStoredSession(false);
  },

  async updateUser(updates: Partial<User>): Promise<User> {
    await simulateDelay(250);
    const current = getStoredUser();
    const updated = { ...current, ...updates };
    setStoredUser(updated);
    return updated;
  },
};

export const projectService = {
  async getProjects(filters?: { status?: ProjectStatus; search?: string }): Promise<Project[]> {
    await simulateDelay(200);
    let projects = getStoredProjects();

    if (filters?.status) {
      projects = projects.filter((p) => p.status === filters.status);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.surface.toLowerCase().includes(q)
      );
    }

    return projects;
  },

  async getProjectById(id: string): Promise<Project | null> {
    await simulateDelay(150);
    const projects = getStoredProjects();
    return projects.find((p) => p.id === id) || null;
  },

  async createProject(formData: ProjectFormData): Promise<Project> {
    await simulateDelay(450);
    const projects = getStoredProjects();
    const { analysis, recommendedProducts, budgetSummary, timeline } = generatePreliminaryAnalysis(formData);

    const projectCount = projects.length + 1;
    const randomCode = `PLK-2025-${String(projectCount).padStart(4, '0')}`;

    const newProject: Project = {
      id: `proj-${Date.now()}`,
      code: randomCode,
      name: formData.name,
      city: formData.city,
      projectType: formData.projectType,
      areaM2: Number(formData.areaM2) || 0,
      requiredDate: formData.requiredDate || '20 días',
      description: formData.description,
      surface: formData.surface,
      environment: formData.environment,
      currentColor: formData.currentColor || 'No especificado',
      selectedColor: {
        name: 'Blanco Nieve',
        code: 'PNT-101',
        hex: '#F8FAFC',
        family: 'Blancos & Neutros Pintuco',
      },
      conditions: formData.conditions,
      customCondition: formData.customCondition,
      photos: formData.photos,
      status: 'analyzing', // Initially in analysis by ColorLink
      currentStepProgress: 3,
      nextRecommendedAction: {
        title: 'Revisar diagnóstico técnico y presupuesto preliminar',
        description: 'Se generó la estimación de materiales y productos sugeridos. Puedes solicitar visita técnica especializada.',
        actionLabel: 'Ver expediente completo',
        actionType: 'validate_solution',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preliminaryAnalysis: analysis,
      recommendedProducts,
      budgetSummary,
      timeline,
      technicalService: {
        requested: false,
        status: 'none',
      },
    };

    const updatedList = [newProject, ...projects];
    setStoredProjects(updatedList);

    // Create a notification for the new project
    const notifs = getStoredNotifications();
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: 'Diagnóstico preliminar generado',
      message: `Tu proyecto "${newProject.name}" fue creado exitosamente. Se ha calculado la estimación preliminar de materiales para ${newProject.areaM2} m².`,
      date: 'Ahora',
      read: false,
      projectId: newProject.id,
      projectName: newProject.name,
      actionRequired: true,
      actionLabel: 'Ver diagnóstico',
      type: 'info',
    };
    setStoredNotifications([newNotif, ...notifs]);

    return newProject;
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    await simulateDelay(250);
    const projects = getStoredProjects();
    const index = projects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');

    const updated = {
      ...projects[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    projects[index] = updated;
    setStoredProjects(projects);
    return updated;
  },

  async requestTechnicalAssistance(
    projectId: string,
    details: { notes?: string; contactPhone?: string; preferredDate?: string }
  ): Promise<Project> {
    await simulateDelay(350);
    const projects = getStoredProjects();
    const index = projects.findIndex((p) => p.id === projectId);
    if (index === -1) throw new Error('Project not found');

    const proj = projects[index];
    const techService: TechnicalService = {
      requested: true,
      status: 'solicitado',
      requestedAt: new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }),
      scheduledDate: details.preferredDate || 'En coordinación con el especialista Pintuco',
      specialistName: 'Por asignar (Asesor Técnico Pintuco)',
      notes: details.notes || 'Acompañamiento técnico y diagnóstico en obra solicitado por el cliente.',
      contactPhone: details.contactPhone || getStoredUser().phone,
    };

    // Update timeline step 6
    const updatedTimeline = proj.timeline.map((step) => {
      if (step.stepNumber === 6) {
        return {
          ...step,
          status: 'current' as const,
          description: 'Acompañamiento técnico solicitado por el cliente. En proceso de asignación de especialista.',
        };
      }
      return step;
    });

    const updatedProject: Project = {
      ...proj,
      technicalService: techService,
      timeline: updatedTimeline,
      updatedAt: new Date().toISOString(),
    };

    projects[index] = updatedProject;
    setStoredProjects(projects);

    // Notification
    const notifs = getStoredNotifications();
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: 'Acompañamiento técnico solicitado',
      message: `Hemos recibido tu solicitud para "${proj.name}". Un especialista Pintuco se comunicará contigo.`,
      date: 'Ahora',
      read: false,
      projectId: proj.id,
      projectName: proj.name,
      type: 'success',
    };
    setStoredNotifications([newNotif, ...notifs]);

    return updatedProject;
  },
};

export const notificationService = {
  async getNotifications(): Promise<NotificationItem[]> {
    await simulateDelay(150);
    return getStoredNotifications();
  },

  async markAsRead(id: string): Promise<NotificationItem[]> {
    const list = getStoredNotifications().map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    setStoredNotifications(list);
    return list;
  },

  async markAllAsRead(): Promise<NotificationItem[]> {
    const list = getStoredNotifications().map((n) => ({ ...n, read: true }));
    setStoredNotifications(list);
    return list;
  },
};

export const catalogService = {
  async getSolutions(category?: string, search?: string): Promise<SolutionCatalogItem[]> {
    await simulateDelay(150);
    let items = SOLUTIONS_CATALOG;
    if (category && category !== 'Todas') {
      items = items.filter((item) => item.category === category);
    }
    if (search) {
      const q = search.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.surface.toLowerCase().includes(q) ||
          item.application.toLowerCase().includes(q)
      );
    }
    return items;
  },
};
