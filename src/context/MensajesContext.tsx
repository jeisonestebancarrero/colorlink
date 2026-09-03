import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  mensajesSinLeerService, type ConversacionSinLeer,
} from '../services/mensajesSinLeer';
/**
 * La campana de mensajes. La usan LAS DOS aplicaciones.
 *
 * Vive en un contexto porque las dos piezas que la mueven están lejos: la
 * barra muestra el número y el chat, dentro del detalle del pedido, es quien
 * lo baja al abrirse. Pasarlo por propiedades obligaría a atravesar media
 * aplicación.
 *
 * No usa el contexto de sesión de ninguna de las dos: recibe `activo` por
 * propiedad. La tienda tiene `AuthContext` y el portal `AdminAuthContext`, y
 * atarlo a uno obligaría a escribir el mismo contexto dos veces.
 *
 * Las funciones de la base son las mismas para cliente y personal: cada quien
 * ve lo suyo porque el criterio de acceso está dentro. El aviso NO se quita al
 * desplegar la campana, solo al abrir la conversación.
 */

interface Valor {
  conversaciones: ConversacionSinLeer[];
  /** Suma de todos los mensajes sin leer. */
  total: number;
  cargando: boolean;
  refrescar: () => Promise<void>;
  /** La llama el chat al abrirse. */
  marcarLeida: (orderId: string) => Promise<void>;
}

const Contexto = createContext<Valor | undefined>(undefined);

export const MensajesProvider: React.FC<{
  /** Hay sesión iniciada. Sin ella no se consulta nada. */
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

  // En vivo: si el equipo escribe mientras la persona tiene la tienda abierta,
  // el número sube solo. Sin esto habría que recargar para enterarse.
  useEffect(() => {
    if (!activo) return;
    const cancelar = mensajesSinLeerService.suscribir(() => { void refrescar(); });
    return cancelar;
  }, [activo, refrescar]);

  const marcarLeida = useCallback(async (orderId: string) => {
    const marcados = await mensajesSinLeerService.marcarLeida(orderId);
    if (marcados > 0) {
      // Se quita del estado en el acto en vez de esperar a la recarga: el
      // número tiene que bajar en cuanto se abre el chat, no medio segundo
      // después.
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
