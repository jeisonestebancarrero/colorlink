import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  mensajesSinLeerService, type ConversacionSinLeer,
} from '../services/mensajesSinLeer';
/**
 * Mensajes sin leer, compartido por tienda y portal. Recibe `activo` por prop para
 * no atarse a AuthContext ni a AdminAuthContext; el acceso lo filtra la base.
 * El aviso se quita al abrir la conversación, no al desplegar la campana.
 */

interface Valor {
  conversaciones: ConversacionSinLeer[];
  total: number;
  cargando: boolean;
  refrescar: () => Promise<void>;
  /** La invoca el chat al abrirse. */
  marcarLeida: (orderId: string) => Promise<void>;
}

const Contexto = createContext<Valor | undefined>(undefined);

export const MensajesProvider: React.FC<{
  /** Sin sesión no se consulta nada. */
  activo: boolean;
  children: React.ReactNode;
}> = ({ activo, children }) => {
  const [conversaciones, setConversaciones] = useState<ConversacionSinLeer[]>([]);
  const [cargando, setCargando] = useState(false);

  const refrescar = useCallback(async () => {
    if (!activo) { setConversaciones([]); return; }
    setCargando(true);
    try {
      setConversaciones(await mensajesSinLeerService.listar());
    } finally {
      setCargando(false);
    }
  }, [activo]);

  useEffect(() => { void refrescar(); }, [refrescar]);

  // En vivo: el contador sube sin recargar cuando el equipo escribe.
  useEffect(() => {
    if (!activo) return;
    const cancelar = mensajesSinLeerService.suscribir(() => { void refrescar(); });
    return cancelar;
  }, [activo, refrescar]);

  const marcarLeida = useCallback(async (orderId: string) => {
    const marcados = await mensajesSinLeerService.marcarLeida(orderId);
    if (marcados > 0) {
      // Actualización optimista: el contador baja en cuanto se abre el chat.
      setConversaciones((c) => c.filter((x) => x.orderId !== orderId));
    }
  }, []);

  const total = useMemo(
    () => conversaciones.reduce((suma, c) => suma + c.sinLeer, 0),
    [conversaciones],
  );

  return (
    <Contexto.Provider value={{ conversaciones, total, cargando, refrescar, marcarLeida }}>
      {children}
    </Contexto.Provider>
  );
};

export function useMensajes(): Valor {
  const c = useContext(Contexto);
  if (!c) throw new Error('useMensajes debe usarse dentro de MensajesProvider');
  return c;
}
