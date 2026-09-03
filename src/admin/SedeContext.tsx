import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { sedesService, type SedePermitida } from '../services/sedes';

/**
 * Sede activa del portal interno, al estilo del selector de compañías de Odoo.
 *
 * QUÉ ES Y QUÉ NO ES:
 *   * Las sedes PERMITIDAS las decide el servidor (`sedes_permitidas()`) y las
 *     hace cumplir RLS. Aquí solo se leen para poder ofrecerlas.
 *   * Las sedes ACTIVAS son la selección de quien está mirando: acotan la
 *     pantalla DENTRO de lo permitido. Viven en el navegador porque no son un
 *     control de acceso; si lo fueran, bastaría cambiar el desplegable.
 *
 * Se pueden activar VARIAS a la vez, como en Odoo: un jefe regional necesita
 * ver Medellín e Itagüí juntas. Ninguna activa no es un estado válido —dejaría
 * las pantallas vacías sin explicación—, así que al desmarcar la última se
 * vuelve a todas.
 */

const CLAVE = 'colorlink.admin.sedes-activas.v1';

interface SedeContextType {
  /** Todo lo que esta persona tiene permitido. */
  permitidas: SedePermitida[];
  /** Lo que está mirando ahora. Subconjunto no vacío de `permitidas`. */
  activas: string[];
  /** true si el servidor la tiene acotada a algunas sedes. */
  restringido: boolean;
  cargando: boolean;
  alternar: (locationId: string) => void;
  soloEsta: (locationId: string) => void;
  activarTodas: () => void;
  /**
   * Filtro para las consultas de los módulos.
   *
   * `null` cuando están todas activas: así el módulo no manda un `in(...)` con
   * las siete sedes y la consulta queda igual que antes. Un módulo que reciba
   * `null` no debe filtrar: RLS ya limitó las filas a lo permitido.
   */
  filtroSedes: string[] | null;
  recargar: () => Promise<void>;
}

const SedeContext = createContext<SedeContextType | undefined>(undefined);

/**
 * «Todas» se representa con la AUSENCIA de selección guardada, no con la lista
 * completa.
 *
 * Guardar la lista completa tenía un defecto real: con las 7 sedes activas se
 * guardaban esos 7 ids; al crear una octava, los 7 guardados seguían siendo
 * válidos, así que la nueva quedaba PERMITIDA pero no activa y no aparecía en
 * los contadores ni en los filtros. Quien nunca había hecho una selección
 * parcial se perdía la sede nueva sin saber por qué.
 *
 * Con la ausencia como «todas», una sede nueva entra sola. Y quien SÍ eligió
 * un subconjunto conserva su elección, que es lo que pidió.
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

      // La selección guardada se DEPURA contra lo permitido: si a alguien le
      // quitaron una sede, no puede seguir viéndola en su selector.
      const validas = new Set(lista.map((s) => s.id));
      const guardadas = leerGuardadas();
      const depuradas = guardadas?.filter((id) => validas.has(id)) ?? null;

      // Sin preferencia guardada —o si al depurarla no queda ninguna— se
      // activan TODAS las permitidas, incluidas las creadas después.
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
    // Ninguna activa dejaría todas las pantallas vacías sin decir por qué.
    const finales = ids.length > 0 ? ids : todas.map((s) => s.id);
    setActivas(finales);
    // Si quedaron todas, se BORRA la preferencia: así «todas» sigue queriendo
    // decir todas cuando mañana exista una sede más.
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
