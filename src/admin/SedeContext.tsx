import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { sedesService, type SedePermitida } from '../services/sedes';

/**
 * Sedes permitidas (`sedes_permitidas()`, aplicadas por RLS) y activas (selección local, no es
 * control de acceso). Puede haber varias activas; nunca ninguna.
 */

const CLAVE = 'colorlink.admin.sedes-activas.v1';

interface SedeContextType {
  /** Todo lo que esta persona tiene permitido. */
  permitidas: SedePermitida[];
  /** Subconjunto no vacío de `permitidas`. */
  activas: string[];
  /** true si el servidor la tiene acotada a algunas sedes. */
  restringido: boolean;
  cargando: boolean;
  alternar: (locationId: string) => void;
  soloEsta: (locationId: string) => void;
  activarTodas: () => void;
  /** Filtro para consultas; `null` con todas activas: no filtrar, RLS ya limita. */
  filtroSedes: string[] | null;
  recargar: () => Promise<void>;
}

const SedeContext = createContext<SedeContextType | undefined>(undefined);

/**
 * «Todas» es la ausencia de selección guardada, no la lista completa: así una sede nueva
 * queda activa sola en vez de quedar permitida pero oculta.
 */
function leerGuardadas(): string[] | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const dato: unknown = JSON.parse(crudo);
    if (!Array.isArray(dato)) return null;
    return dato.filter((x): x is string => typeof x === 'string');
  } catch {
    return null;
  }
}

/** `null` borra la preferencia y vuelve a significar «todas». */
function guardar(ids: string[] | null): void {
  try {
    if (ids === null) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, JSON.stringify(ids));
  } catch (e) {
    console.warn('[sedes] no se pudo recordar la selección', e);
  }
}

export const SedeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permitidas, setPermitidas] = useState<SedePermitida[]>([]);
  const [activas, setActivas] = useState<string[]>([]);
  const [restringido, setRestringido] = useState(false);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, acotado] = await Promise.all([
        sedesService.permitidas(),
        sedesService.estoyRestringido(),
      ]);
      setPermitidas(lista);
      setRestringido(acotado);

      // Depura la selección guardada contra lo permitido.
      const validas = new Set(lista.map((s) => s.id));
      const guardadas = leerGuardadas();
      const depuradas = guardadas?.filter((id) => validas.has(id)) ?? null;

      // Sin preferencia válida se activan todas las permitidas.
      setActivas(depuradas && depuradas.length > 0 ? depuradas : lista.map((s) => s.id));
    } catch (e) {
      console.error('[sedes] no se pudieron cargar las sedes permitidas', e);
      setPermitidas([]);
      setActivas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  const fijar = useCallback((ids: string[], todas: SedePermitida[]) => {
    // Ninguna activa dejaría las pantallas vacías.
    const finales = ids.length > 0 ? ids : todas.map((s) => s.id);
    setActivas(finales);
    // Con todas seleccionadas se borra la preferencia para incluir sedes futuras.
    guardar(finales.length === todas.length ? null : finales);
  }, []);

  const alternar = useCallback((locationId: string) => {
    setActivas((actuales) => {
      const siguiente = actuales.includes(locationId)
        ? actuales.filter((x) => x !== locationId)
        : [...actuales, locationId];
      const finales = siguiente.length > 0 ? siguiente : permitidas.map((s) => s.id);
      guardar(finales.length === permitidas.length ? null : finales);
      return finales;
    });
  }, [permitidas]);

  const soloEsta = useCallback((locationId: string) => {
    fijar([locationId], permitidas);
  }, [fijar, permitidas]);

  const activarTodas = useCallback(() => {
    fijar(permitidas.map((s) => s.id), permitidas);
  }, [fijar, permitidas]);

  const filtroSedes = useMemo(() => {
    if (permitidas.length === 0) return null;
    // Todas activas = sin filtro, para no mandar un `in(...)` innecesario.
    return activas.length === permitidas.length ? null : activas;
  }, [activas, permitidas]);

  return (
    <SedeContext.Provider
      value={{
        permitidas, activas, restringido, cargando,
        alternar, soloEsta, activarTodas, filtroSedes, recargar,
      }}
    >
      {children}
    </SedeContext.Provider>
  );
};

export const useSedes = (): SedeContextType => {
  const ctx = useContext(SedeContext);
  if (!ctx) throw new Error('useSedes debe usarse dentro de SedeProvider');
  return ctx;
};
