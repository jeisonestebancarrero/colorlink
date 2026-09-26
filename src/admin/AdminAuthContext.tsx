import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { accesoService, type MiAcceso } from '../services/admin';
import { mfaService } from '../services/mfa';

/** Sesión del personal, separada del AuthContext del cliente: permisos y vistas por rol. */
/** Segundo factor pendiente: 'codigo' debe verificarlo, 'registro' debe inscribirlo, null nada. */
export type PendienteMFA = 'codigo' | 'registro' | null;

interface AdminAuthType {
  cargando: boolean;
  autenticado: boolean;
  pendienteMFA: PendienteMFA;
  /** Vuelve a evaluar la sesión tras registrar o superar el segundo factor. */
  revisar: () => Promise<void>;
  email: string | null;
  nombre: string | null;
  acceso: MiAcceso;
  puede: (permiso: string) => boolean;
  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
}

const ACCESO_VACIO: MiAcceso = { permissions: [], views: [], isAdmin: false, isStaff: false };

const Ctx = createContext<AdminAuthType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cargando, setCargando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [acceso, setAcceso] = useState<MiAcceso>(ACCESO_VACIO);
  const [pendienteMFA, setPendienteMFA] = useState<PendienteMFA>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const usuario = data.session?.user;
    if (!usuario) {
      setAutenticado(false);
      setAcceso(ACCESO_VACIO);
      setPendienteMFA(null);
      setEmail(null);
      return;
    }

    // El MFA va antes que los permisos: sin AAL2 `is_staff` da false y se cerraría la sesión
    // de alguien a quien solo le falta el código.
    const mfa = await mfaService.estado();
    setEmail(usuario.email ?? null);

    if (mfa.configurado && mfa.nivelSesion === 'aal1') {
      setPendienteMFA('codigo');
      setAutenticado(false);
      setAcceso(ACCESO_VACIO);
      return;
    }

    const a = await accesoService.miAcceso();

    // Sin rol interno se cierra la sesión.
    if (!a.isStaff) {
      await supabase.auth.signOut();
      setAutenticado(false);
      setAcceso(ACCESO_VACIO);
      setPendienteMFA(null);
      throw new Error('Esta cuenta no tiene acceso al portal interno.');
    }

    // Sin factor registrado entra, pero queda bloqueado hasta inscribirlo.
    setPendienteMFA(mfa.obligatorio && !mfa.configurado ? 'registro' : null);

    const { data: perfil } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', usuario.id)
      .maybeSingle();

    const p = perfil as { first_name: string; last_name: string } | null;
    setNombre(p ? `${p.first_name} ${p.last_name}`.trim() : usuario.email ?? null);
    setAcceso(a);
    setAutenticado(true);
  }, []);

  useEffect(() => {
    cargar()
      .catch(() => undefined)
      .finally(() => setCargando(false));

    // Reevalúa al renovar el token o cambiar el nivel: una pestaña vieja perdería permisos
    // en el servidor sin mostrar que falta el código.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'TOKEN_REFRESHED' || evento === 'MFA_CHALLENGE_VERIFIED') {
        cargar().catch(() => undefined);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [cargar]);

  const entrar = async (correo: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password });
    if (error) {
      throw new Error(
        /invalid login credentials/i.test(error.message)
          ? 'Correo o contraseña incorrectos.'
          : 'No fue posible iniciar sesión. Inténtalo nuevamente.'
      );
    }
    await cargar();
  };

  const salir = async () => {
    await supabase.auth.signOut();
    setAutenticado(false);
    setAcceso(ACCESO_VACIO);
    setPendienteMFA(null);
    setEmail(null);
  };

  const puede = useCallback(
    (permiso: string) => acceso.isAdmin || acceso.permissions.includes(permiso),
    [acceso]
  );

  return (
    <Ctx.Provider
      value={{
        cargando,
        autenticado,
        pendienteMFA,
        revisar: cargar,
        email,
        nombre,
        acceso,
        puede,
        entrar,
        salir,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useAdminAuth = (): AdminAuthType => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider');
  return c;
};
