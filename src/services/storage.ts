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

/**
 * AQUÍ VIVÍA EL MOTOR DE DIAGNÓSTICO.
 *
 * `generatePreliminaryAnalysis` decidía en el navegador la categoría de
 * solución, el nivel de atención, los productos, el presupuesto y el
 * cronograma de cada proyecto. Se retiró el 4 de septiembre de 2026 y ahora lo
 * calcula `public.diagnosticar_proyecto` en la base
 * (migración 20260904100004), que además:
 *
 *   · recomienda SOLO productos que existen en el catálogo activo —los 8
 *     códigos de aquí (`PNT-10520`, `PNT-20100`…) estaban escritos a mano y
 *     ninguno existía en `products`—;
 *   · calcula cantidades con el rendimiento real de cada ficha en vez de
 *     divisiones fijas, que es lo que hacía que la calculadora y el
 *     diagnóstico dieran dos respuestas para la misma obra;
 *   · no se puede alterar desde la consola del navegador.
 *
 * Si hace falta cambiar el criterio técnico, se cambia allá.
 */
