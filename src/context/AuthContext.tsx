import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, ClientType } from '../types';
import { authService, type AccessInfo } from '../services/api';
import type { RegistroInput } from '../schemas/auth';
import { EMPTY_ACCESS } from '../services/auth';

/** Cuenta demo del seed; no es secreta (LoginPage la muestra) y sin seed el acceso falla con aviso. */

export interface RegisterData {
  firstName: string;
  lastName: string;
  clientType: ClientType;
  company: string;
  email: string;
  phone: string;
  city: string;
  /** Se entrega a Supabase Auth, que gestiona el hash. */
  password: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Acción de formulario en curso (entrar, registrarse, salir). */
  isSubmitting: boolean;
  /** Roles y empresas del servidor; solo deciden qué se muestra, no autorizan. */
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
    countryCode?: string;
    municipalityCode?: string;
    documentType?: string;
    documentNumber?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  /** Arranca en false: la sesión solo es válida cuando Supabase la confirma. */
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // Solo el arranque: mientras se recupera la sesión se muestra la pantalla de carga.
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Separado de isLoading a propósito: compartir bandera desmontaba el formulario
  // al enviarlo y se perdían los datos y el mensaje de error.
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

    // Sincroniza logout en otra pestaña, expiración del token y enlaces de recuperación.
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

  /** Redirige el navegador; la sesión la recogen el arranque y onAuthStateChange al volver. */
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
    countryCode?: string;
    municipalityCode?: string;
    documentType?: string;
    documentNumber?: string;
  }) => {
    const actualizado = await authService.completeProfile(datos);
    setUser(actualizado);
    setAccess(await authService.getAccess());
  };

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
