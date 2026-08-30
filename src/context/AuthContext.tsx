import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, ClientType } from '../types';
import { authService, type AccessInfo } from '../services/api';
import type { RegistroInput } from '../schemas/auth';
import { EMPTY_ACCESS } from '../services/auth';

/**
 * Credenciales de la cuenta de demostración que siembra el seed
 * (supabase/seed.sql). No son un secreto: LoginPage.tsx ya las muestra
 * prellenadas en el formulario. En un despliegue real el seed demo no se
 * ejecuta y este botón simplemente falla con un mensaje claro.
 */
const DEMO_EMAIL = 'carlos.mendoza@constructorahorizonte.com';
const DEMO_PASSWORD = 'pintuco2025*';

export interface RegisterData {
  firstName: string;
  lastName: string;
  clientType: ClientType;
  company: string;
  email: string;
  phone: string;
  city: string;
  /**
   * FASE 2: antes se recogía en RegisterPage y se descartaba silenciosamente
   * (riesgo R2 de la auditoría). Ahora viaja hasta Supabase Auth, que es
   * quien gestiona el hash y el almacenamiento de la credencial.
   */
  password: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Hay una acción de formulario (entrar, registrarse, salir) en curso. */
  isSubmitting: boolean;
  /** Roles y empresas resueltos por el servidor. Solo para decidir qué se MUESTRA. */
  access: AccessInfo;
  hasRole: (role: string) => boolean;
  login: (email: string, password?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  /** Devuelve true si la empresa ya existía y quedó pendiente de aprobación. */
  registrar: (data: RegistroInput) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  /** true cuando el usuario entró por Google y le faltan datos por completar. */
  necesitaCompletarPerfil: boolean;
  completeProfile: (datos: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    city?: string;
    clientType?: ClientType;
    company?: string;
  }) => Promise<void>;
  loadDemoAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  /**
   * FASE 2 — riesgo R1 resuelto.
   * Antes arrancaba en `true`, de modo que cualquier visitante entraba
   * directamente al panel como el usuario de demostración. Con autenticación
   * real el valor inicial debe ser `false`: la sesión solo se considera
   * válida cuando Supabase confirma que existe.
   */
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // `isLoading` es SOLO el arranque: mientras se recupera la sesión guardada,
  // la aplicación entera muestra la pantalla de carga.
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // `isSubmitting` es una acción de formulario en curso. Va aparte a
  // propósito: cuando compartían la misma bandera, enviar el formulario de
  // registro reemplazaba toda la aplicación por la pantalla de carga, y al
  // fallar el formulario volvía a montarse vacío —sin lo que la persona había
  // escrito y, peor, sin el mensaje que explicaba el error.
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [access, setAccess] = useState<AccessInfo>(EMPTY_ACCESS);

  const cargarSesion = useCallback(async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        setAccess(await authService.getAccess());
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAccess(EMPTY_ACCESS);
      }
    } catch (err) {
      console.error('Failed to initialize auth', err);
      setUser(null);
      setIsAuthenticated(false);
      setAccess(EMPTY_ACCESS);
    }
  }, []);

  useEffect(() => {
    let activo = true;

    const init = async () => {
      await cargarSesion();
      if (activo) setIsLoading(false);
    };
    init();

    // Mantiene el contexto sincronizado ante logout en otra pestaña,
    // expiración del token o llegada desde un enlace de recuperación.
    const unsubscribe = authService.onAuthStateChange((userId) => {
      if (!activo) return;
      if (!userId) {
        setUser(null);
        setIsAuthenticated(false);
        setAccess(EMPTY_ACCESS);
      } else {
        void cargarSesion();
      }
    });

    return () => {
      activo = false;
      unsubscribe();
    };
  }, [cargarSesion]);

  const login = async (email: string, password = '') => {
    setIsSubmitting(true);
    try {
      const loggedUser = await authService.login(email, password);
      setUser(loggedUser);
      setIsAuthenticated(true);
      setAccess(await authService.getAccess());
    } finally {
      setIsSubmitting(false);
    }
  };

  const register = async (data: RegisterData) => {
    setIsSubmitting(true);
    try {
      const newUser = await authService.register(data);
      setUser(newUser);
      setIsAuthenticated(true);
      setAccess(await authService.getAccess());
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Registro bifurcado (persona o empresa). */
  const registrar = async (data: RegistroInput): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const { user: nuevo, vinculacionPendiente } = await authService.registrar(data);
      setUser(nuevo);
      setIsAuthenticated(true);
      setAccess(await authService.getAccess());
      return vinculacionPendiente;
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setIsSubmitting(true);
    try {
      await authService.logout();
      setUser(null);
      setIsAuthenticated(false);
      setAccess(EMPTY_ACCESS);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = await authService.updateUser(updates);
    setUser(updated);
  };

  const requestPasswordReset = async (email: string) => {
    await authService.requestPasswordReset(email);
  };

  /**
   * Acceso con Google. Provoca una redirección del navegador, así que no
   * actualiza el estado aquí: al volver, el efecto de arranque y
   * onAuthStateChange recogen la sesión ya creada.
   */
  const loginWithGoogle = async () => {
    await authService.signInWithGoogle();
  };

  const completeProfile = async (datos: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    city?: string;
    clientType?: ClientType;
    company?: string;
  }) => {
    const actualizado = await authService.completeProfile(datos);
    setUser(actualizado);
    setAccess(await authService.getAccess());
  };

  const loadDemoAccount = async () => {
    await login(DEMO_EMAIL, DEMO_PASSWORD);
  };

  // Se recalcula con el usuario: en cuanto complete sus datos, desaparece.
  const necesitaCompletarPerfil = isAuthenticated && authService.perfilIncompleto(user);

  const hasRole = useCallback(
    (role: string) => access.roles.includes(role),
    [access.roles]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        isSubmitting,
        access,
        hasRole,
        login,
        register,
        registrar,
        logout,
        updateProfile,
        requestPasswordReset,
        loginWithGoogle,
        necesitaCompletarPerfil,
        completeProfile,
        loadDemoAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
