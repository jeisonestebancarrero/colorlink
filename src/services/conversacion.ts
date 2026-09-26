import { supabase } from '../lib/supabase';

/**
 * Conversación de un pedido del lado del cliente; separado de backoffice.ts para no
 * empaquetar el portal en la tienda. Las notas internas las excluye RLS y
 * `post_message` valida que el pedido sea del cliente.
 */

export interface MensajePedido {
  id: string;
  cuerpo: string;
  creadoEn: string;
  /** Null = entregado sin abrir. Solo aplica a mensajes propios: `read_at` lo escribe quien abre. */
  leidoEn: string | null;
  /** MENSAJE lo escribe una persona; EVENTO, la base al cambiar de estado. */
  tipo: 'MENSAJE' | 'EVENTO';
  /** Autor desde el punto de vista del cliente. */
  quien: 'YO' | 'PINTUCO' | 'SISTEMA';
  autor: string | null;
}

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[conversacion] ${contexto}:`, mensaje);
  if (/FORBIDDEN/.test(mensaje)) {
    return new Error('Este pedido no es tuyo.');
  }
  if (/UNAUTHENTICATED/.test(mensaje)) {
    return new Error('Tu sesión expiró. Vuelve a entrar para escribir.');
  }
  if (/PEDIDO_CERRADO/.test(mensaje)) {
    return new Error(
      'Este pedido ya terminó, así que su conversación quedó cerrada. Si necesitas '
      + 'algo más, escríbenos desde un pedido en curso.',
    );
  }
  if (/VALIDATION/.test(mensaje)) {
    return new Error('Escribe un mensaje antes de enviarlo.');
  }
  return new Error('No fue posible cargar la conversación. Inténtalo nuevamente.');
}

export const conversacionPedidoService = {
  async mensajes(orderId: string): Promise<MensajePedido[]> {
    // Por función: RLS impide al cliente leer `profiles` ajenos; la función devuelve solo
    // el nombre de pila de quien escribió en su pedido.
    const [{ data, error }, sesion] = await Promise.all([
      supabase.rpc('mensajes_del_pedido', { _order_id: orderId }),
      supabase.auth.getUser(),
    ]);
    if (error) throw fallo('mensajes', error.message);

    const yo = sesion.data.user?.id ?? null;

    return ((data ?? []) as unknown as Array<{
      id: string; kind: string; body: string; created_at: string;
      read_at: string | null;
      author_id: string | null;
      autor: string | null;
    }>).map((m) => ({
      id: m.id,
      cuerpo: m.body,
      creadoEn: m.created_at,
      leidoEn: m.read_at,
      // Las notas internas ya las excluye la política de la base.
      tipo: m.kind === 'EVENTO' ? 'EVENTO' : 'MENSAJE',
      quien: !m.author_id ? 'SISTEMA' : m.author_id === yo ? 'YO' : 'PINTUCO',
      autor: m.autor ?? null,
    }));
  },

  /**
   * `sePuedeEscribir` depende del estado del pedido (entregado o cancelado cierra).
   * `atendida` solo marca el asunto como resuelto; no bloquea.
   */
  async estado(orderId: string): Promise<{
    sePuedeEscribir: boolean; atendida: boolean; numero: string; estadoPedido: string;
  } | null> {
    const { data, error } = await supabase.rpc('estado_conversacion', { _order_id: orderId });
    if (error || !data) return null;
    const d = data as Record<string, unknown>;
    return {
      sePuedeEscribir: d.se_puede_escribir !== false,
      atendida: d.atendida === true,
      numero: (d.numero as string) ?? '',
      estadoPedido: (d.estado_pedido as string) ?? '',
    };
  },

  /** Cualquiera de los dos lados puede cerrar; no borra, solo impide mensajes nuevos. */
  async cerrar(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('cerrar_conversacion', { _order_id: orderId });
    if (error) throw fallo('cerrar', error.message);
  },

  /** Reabre y escribe en una sola operación para no dejar el hilo abierto sin mensaje. */
  async escalar(orderId: string, texto: string): Promise<void> {
    const { error } = await supabase.rpc('escalar_conversacion', {
      _order_id: orderId, _texto: texto,
    });
    if (error) throw fallo('escalar', error.message);
  },

  async escribir(orderId: string, cuerpo: string): Promise<void> {
    const { error } = await supabase.rpc('post_message', {
      _order_id: orderId,
      _project_id: null,
      _body: cuerpo,
      // El cliente nunca escribe notas internas.
      _internal: false,
    });
    if (error) throw fallo('escribir', error.message);
  },

  /** Tiempo real sobre `conversation_messages`; RLS sigue filtrando pedido y notas internas. */
  suscribir(orderId: string, alLlegar: () => void): () => void {
    const canal = supabase
      .channel(`pedido-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
          filter: `order_id=eq.${orderId}`,
        },
        () => alLlegar(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(canal); };
  },
};
