import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { accesoService, type MiAcceso } from '../services/admin';
import { mfaService } from '../services/mfa';

/**
 * Sesión del personal interno.
 *
 * Separada del AuthContext del portal: aquí lo que importa no es el perfil
 * comercial del cliente sino los permisos y las vistas que el administrador
 * haya configurado para el rol.
 */
/**
 * Qué falta del segundo factor antes de dejar trabajar a esta persona.
 *  - 'codigo':   ya tiene aplicación registrada y debe escribir el código.
 *  - 'registro': su rol lo obliga y todavía no la ha registrado.
 *  - null:       no hay nada pendiente.
 */
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

    // El estado del segundo factor se consulta ANTES que los permisos, y no
    // es un detalle de orden: en el servidor `is_staff` devuelve false cuando
    // la cuenta tiene factor y la sesión no lo superó. Si se preguntara al
    // revés, a un jefe de bodega con doble factor se le diría "esta cuenta no
    // tiene acceso al portal interno" y se le cerraría la sesión, cuando lo
    // único que falta es que escriba su código.
    const mfa = await mfaService.estado();
    setEmail(usuario.email ?? null);

    if (mfa.configurado && mfa.nivelSesion === 'aal1') {
      setPendienteMFA('codigo');
      setAutenticado(false);
      setAcceso(ACCESO_VACIO);
      return;
    }

    const a = await accesoService.miAcceso();

    // Un cliente puede tener credenciales válidas y aun así no pintar nada
    // aquí: sin rol interno no hay back-office. Se cierra la sesión para no
    // dejarlo en una pantalla vacía sin saber por qué.
    if (!a.isStaff) {
      await supabase.auth.signOut();
      setAutenticado(false);
      setAcceso(ACCESO_VACIO);
      setPendienteMFA(null);
      throw new Error('Esta cuenta no tiene acceso al portal interno.');
    }

    // Personal interno sin doble factor: entra, pero el portal no lo deja
    // trabajar hasta que registre su aplicación de códigos.
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

    // Reevaluar cuando la sesión cambie de nivel o se renueve el token.
    //
    // Sin esto, una pestaña abierta desde antes de que la cuenta activara el
    // segundo factor se queda con permisos revocados en el servidor y todas
    // las pantallas empiezan a fallar con errores genéricos, sin decir en
    // ningún momento que lo que falta es el código. Al renovarse el token
    // —cada hora, y de inmediato tras cualquier cambio de factores— se vuelve
    // a mirar y aparece la pantalla que corresponde.
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
