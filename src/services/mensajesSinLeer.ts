import { supabase } from '../lib/supabase';

/**
 * Mensajes sin leer de las conversaciones de pedidos.
 *
 * La cuenta la lleva `conversation_messages.read_at`, que existía desde el
 * principio y no lo usaba nadie: sin él no había forma de distinguir un
 * mensaje nuevo de uno de la semana pasada.
 *
 * LA REGLA: se marca leído al ABRIR el chat, nunca al recibir el mensaje ni al
 * desplegar la campana. Ver un número no es haber leído nada, y si el aviso se
 * quitara al abrir el desplegable, un mensaje visto de reojo desaparecería sin
 * que nadie lo hubiera atendido.
 */

export interface ConversacionSinLeer {
  orderId: string;
  numero: string;
  sinLeer: number;
  /** Texto del más reciente, para mostrarlo en la campana. */
  ultimo: string;
  ultimaFecha: string;
}

export const mensajesSinLeerService = {
  async listar(): Promise<ConversacionSinLeer[]> {
    const { data, error } = await supabase.rpc('mensajes_sin_leer');
    if (error) {
      // Un fallo aquí no puede tumbar la barra de navegación: la campana se
      // queda sin número, y la persona sigue navegando.
      console.error('[mensajes-sin-leer] listar:', error.message);
      return [];
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((f) => ({
      orderId: String(f.order_id),
      numero: (f.order_number as string) ?? '',
      sinLeer: Number(f.sin_leer ?? 0),
      ultimo: (f.ultimo as string) ?? '',
      ultimaFecha: String(f.ultima_fecha ?? ''),
    }));
  },

  /** Al abrir la conversación. Devuelve cuántos se marcaron. */
  async marcarLeida(orderId: string): Promise<number> {
    const { data, error } = await supabase.rpc('marcar_conversacion_leida', {
      _order_id: orderId,
    });
    if (error) {
      console.error('[mensajes-sin-leer] marcarLeida:', error.message);
      return 0;
    }
    return Number(data ?? 0);
  },

  /**
   * Avisa cuando llega cualquier mensaje nuevo, de cualquier pedido.
   *
   * `conversation_messages` ya está en la publicación de tiempo real y RLS
   * sigue aplicando: solo llegan los de sus propios pedidos, y nunca una nota
   * interna. No se filtra por pedido porque la campana es global.
   */
  suscribir(alLlegar: () => void): () => void {
    const canal = supabase
      .channel('campana-mensajes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_messages' },
        () => alLlegar(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(canal); };
  },
};
