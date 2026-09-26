import {
  Project,
  User,
  NotificationItem,
  ProjectFormData,
  PreliminaryAnalysis,
  RecommendedProduct,
  TimelineStep,
  BudgetSummary,
  ConditionType,
} from '../types';
import {
  INITIAL_USER,
  INITIAL_PROJECTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TIMELINE_STEPS,
} from '../data/mockData';

const STORAGE_KEYS = {
  USER: 'colorlink_pintuco_user',
  PROJECTS: 'colorlink_pintuco_projects',
  NOTIFICATIONS: 'colorlink_pintuco_notifications',
  SESSION: 'colorlink_pintuco_session',
};

export const getStoredUser = (): User => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading stored user', e);
  }
  return INITIAL_USER;
};

export const setStoredUser = (user: User): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (e) {
    console.error('Error saving user', e);
  }
};

export const getStoredSession = (): boolean => {
  try {
    const session = localStorage.getItem(STORAGE_KEYS.SESSION);
    return session !== null ? session === 'true' : true;
  } catch {
    return true;
  }
};

export const setStoredSession = (isAuthenticated: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION, String(isAuthenticated));
  } catch (e) {
    console.error('Error updating session', e);
  }
};

export const getStoredProjects = (): Project[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading projects', e);
  }
  return INITIAL_PROJECTS;
};

export const setStoredProjects = (projects: Project[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('Error saving projects', e);
  }
};

export const getStoredNotifications = (): NotificationItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading notifications', e);
  }
  return INITIAL_NOTIFICATIONS;
};

export const setStoredNotifications = (notifications: NotificationItem[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  } catch (e) {
    console.error('Error saving notifications', e);
  }
};

/** El motor de diagnóstico vive en `public.diagnosticar_proyecto`; el criterio técnico se cambia allí. */
