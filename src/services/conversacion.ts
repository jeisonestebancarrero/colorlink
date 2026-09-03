import { supabase } from '../lib/supabase';

/**
 * Conversación de un pedido, del lado del CLIENTE.
 *
 * Existe aparte de `services/backoffice.ts` a propósito: ese módulo es el del
 * portal interno y no puede entrar en el paquete de la tienda. Los dos
 * despliegues son independientes —así está montado el Dockerfile— y el cliente
 * no debe recibir ni una línea del back-office.
 *
 * NO HAY NADA NUEVO EN LA BASE. Lo que faltaba era la pantalla: la política
 * `mensajes_cliente` ya dejaba al cliente LEER los mensajes de su pedido
 * (excluyendo las notas internas, que quedan fuera por RLS y no por un filtro
 * de aquí), y `post_message` ya contemplaba que escribiera —comprueba que el
 * pedido sea suyo o de su empresa—. El personal escribía y el cliente nunca lo
 * veía.
 *
 * Si un cliente intentara marcar su mensaje como nota interna, la función lo
 * degrada a mensaje normal en lugar de rechazarlo, para no perder lo que
 * escribió. Aquí ni siquiera se ofrece la opción.
 */

export interface MensajePedido {
  id: string;
  cuerpo: string;
  creadoEn: string;
  /**
   * Cuándo lo leyó el destinatario. Null = entregado pero sin abrir.
   *
   * Solo tiene sentido en los mensajes PROPIOS: `read_at` lo escribe quien
   * abre la conversación, así que en un mensaje ajeno diría cuándo lo leí yo,
   * que ya lo sé.
   */
  leidoEn: string | null;
  /** MENSAJE lo escribe una persona; EVENTO lo escribe la base al cambiar de estado. */
  tipo: 'MENSAJE' | 'EVENTO';
  /** Quién lo escribió, desde el punto de vista del cliente. */
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
    const [{ data, error }, sesion] = await Promise.all([
      supabase
        .from('conversation_messages')
        .select('id, kind, body, created_at, read_at, author_id, '
          + 'profiles:author_id ( first_name, last_name )')
        .eq('order_id', orderId)
        .order('created_at'),
      supabase.auth.getUser(),
    ]);
    if (error) throw fallo('mensajes', error.message);

    const yo = sesion.data.user?.id ?? null;

    return ((data ?? []) as unknown as Array<{
      id: string; kind: string; body: string; created_at: string;
      read_at: string | null;
      author_id: string | null;
      profiles: { first_name: string; last_name: string } | null;
    }>).map((m) => ({
      id: m.id,
      cuerpo: m.body,
      creadoEn: m.created_at,
      leidoEn: m.read_at,
      // Las notas internas no llegan hasta aquí: las excluye la política de la
      // base. Lo que queda son mensajes y eventos de trazabilidad.
      tipo: m.kind === 'EVENTO' ? 'EVENTO' : 'MENSAJE',
      quien: !m.author_id ? 'SISTEMA' : m.author_id === yo ? 'YO' : 'PINTUCO',
      autor: m.profiles
        ? `${m.profiles.first_name ?? ''} ${m.profiles.last_name ?? ''}`.trim() || null
        : null,
    }));
  },

  /**
   * Estado de la conversación.
   *
   * `sePuedeEscribir` depende del PEDIDO, no de que alguien haya pulsado
   * «terminar»: mientras el pedido siga en curso, el cliente tiene que poder
   * escribir. Lo que cierra el hilo de verdad es que el pedido llegue a
   * entregado o cancelado.
   *
   * `atendida` es otra cosa: alguien la dio por resuelta. No bloquea nada;
   * sirve para saber qué queda pendiente y para que la burbuja vuelva al
   * asistente.
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

  /**
   * Da por terminada la conversación.
   *
   * Lo puede hacer cualquiera de los dos lados: los dos pueden considerar
   * resuelto el asunto. No borra nada; solo impide escribir mensajes nuevos.
   */
  async cerrar(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('cerrar_conversacion', { _order_id: orderId });
    if (error) throw fallo('cerrar', error.message);
  },

  /**
   * Pide una persona: reabre el hilo si estaba cerrado y escribe, en una sola
   * operación. Si fueran dos llamadas, un fallo entre medias dejaría la
   * conversación abierta sin el mensaje que explica por qué.
   */
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

  /**
   * Avisa cuando llega un mensaje nuevo.
   *
   * `conversation_messages` ya está en la publicación de tiempo real, y RLS
   * sigue aplicando: solo llegan los mensajes del propio pedido, y nunca una
   * nota interna.
   */
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
