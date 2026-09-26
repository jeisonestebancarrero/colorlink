import { supabase } from '../lib/supabase';

/**
 * Mensajes sin leer según `conversation_messages.read_at`. Se marcan leídos al abrir
 * el chat, no al desplegar la campana: ver un número no es haber leído.
 */

export interface ConversacionSinLeer {
  orderId: string;
  numero: string;
  sinLeer: number;
  /** Texto del más reciente, para la campana. */
  ultimo: string;
  ultimaFecha: string;
}

export const mensajesSinLeerService = {
  async listar(): Promise<ConversacionSinLeer[]> {
    const { data, error } = await supabase.rpc('mensajes_sin_leer');
    if (error) {
      // Un fallo aquí no puede tumbar la barra de navegación.
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

  /** Al abrir la conversación; devuelve cuántos se marcaron. */
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

  /** Tiempo real de todos los pedidos (la campana es global); RLS filtra pedidos ajenos y notas internas. */
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
