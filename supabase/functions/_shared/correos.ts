import {
  envolver, saludo, titulo, parrafo, tablaPedido, lineaDeTiempo, cop, esc,
  type Emisor, type Punto,
} from './plantillas.ts';

/**
 * Construye cada correo a partir de lo que hay en la base.
 *
 * La plantilla no recibe texto ya armado: recibe el pedido y decide qué decir.
 * Así el mensaje cambia con el estado real y no hay forma de mandar "tu pedido
 * está listo" sobre un pedido que no lo está.
 */

export type Plantilla =
  | 'BIENVENIDA'
  | 'PEDIDO_CREADO'
  | 'PAGO_RECIBIDO'
  | 'PEDIDO_ESTADO';

interface Contexto {
  emisor: Emisor;
  destinatario: { nombre: string; email: string };
  punto?: Punto | null;
  pedido?: {
    numero: string;
    estado: string;
    total: number;
    esEnvio: boolean;
    fechaRetiro?: string | null;
    lineas: Array<{
      producto: string; presentacion?: string | null; color?: string | null;
      cantidad: number; total: number;
    }>;
  } | null;
  pago?: { medio?: string | null; aCredito?: boolean; vence?: string | null } | null;
  sitio: string;
}

const ESTADOS: Record<string, { titulo: string; texto: string }> = {
  CONFIRMADO: {
    titulo: 'Confirmamos tu pedido',
    texto: 'Ya tenemos tu pedido y lo pasamos a alistamiento. Te avisamos apenas esté listo.',
  },
  PREPARANDO: {
    titulo: 'Estamos alistando tu pedido',
    texto: 'Nuestro equipo está separando y preparando tus productos.',
  },
  LISTO_PARA_RETIRO: {
    titulo: 'Tu pedido está listo para retirar',
    texto: 'Puedes pasar por tu pedido cuando quieras. Lleva tu documento y el número del pedido.',
  },
  ENVIADO: {
    titulo: 'Tu pedido va en camino',
    texto: 'El despacho salió hacia la dirección que registraste.',
  },
  ENTREGADO: {
    titulo: 'Entregamos tu pedido',
    texto: 'Gracias por comprar con nosotros. Si algo no quedó bien, respóndenos este correo.',
  },
  CANCELADO: {
    titulo: 'Tu pedido fue cancelado',
    texto: 'Si no reconoces esta cancelación, comunícate con tu punto de venta.',
  },
};

export function construir(
  plantilla: Plantilla,
  ctx: Contexto,
): { asunto: string; html: string; texto: string } {
  const { emisor, destinatario, punto, pedido, pago, sitio } = ctx;

  switch (plantilla) {
    // ── Bienvenida ─────────────────────────────────────────────────────
    case 'BIENVENIDA': {
      const contenido =
        saludo(destinatario.nombre) +
        titulo('Bienvenido a ColorLink') +
        parrafo(
          `Tu cuenta quedó lista. Desde aquí puedes comprar pintura original ${esc(emisor.nombre)}, ` +
          'simular colores sobre ambientes reales, calcular cuántos galones necesitas para tus ' +
          'metros y seguir tus pedidos hasta el retiro.',
        ) +
        parrafo(
          '<strong>Un consejo para empezar:</strong> usa la calculadora antes de comprar. ' +
          'Evita quedarte corto a mitad de obra, que es cuando el tono ya no coincide.',
        );

      return {
        asunto: `Bienvenido a ColorLink, ${destinatario.nombre.split(' ')[0]}`,
        texto: `Hola ${destinatario.nombre}, tu cuenta en ColorLink ya está activa. Entra en ${sitio}`,
        html: envolver({
          titulo: 'Bienvenido a ColorLink',
          preencabezado: 'Tu cuenta quedó lista. Ya puedes comprar y simular colores.',
          contenido,
          emisor,
          accion: { texto: 'Explorar la tienda', url: `${sitio}/tienda` },
        }),
      };
    }

    // ── Pedido creado, pendiente de pago ───────────────────────────────
    case 'PEDIDO_CREADO': {
      const p = pedido!;
      const contenido =
        saludo(destinatario.nombre) +
        titulo(`Recibimos tu pedido ${p.numero}`) +
        parrafo(
          p.estado === 'PENDIENTE'
            ? 'Guardamos tu pedido. <strong>Todavía falta el pago</strong>: en cuanto lo ' +
              'confirmemos pasa a alistamiento. Puedes completarlo desde Mis Pedidos.'
            : 'Ya está confirmado y pasa a alistamiento.',
        ) +
        tablaPedido(p.lineas, p.total) +
        (p.fechaRetiro
          ? parrafo(`Fecha programada de retiro: <strong>${esc(p.fechaRetiro)}</strong>.`)
          : '');

      return {
        asunto: `Pedido ${p.numero} recibido — ${cop(p.total)}`,
        texto: `Recibimos tu pedido ${p.numero} por ${cop(p.total)}. Consúltalo en ${sitio}/mis-pedidos`,
        html: envolver({
          titulo: `Pedido ${p.numero}`,
          preencabezado: `Tu pedido por ${cop(p.total)} quedó registrado.`,
          contenido,
          emisor,
          punto,
          accion: { texto: 'Ver mi pedido', url: `${sitio}/mis-pedidos` },
        }),
      };
    }

    // ── Pago recibido ──────────────────────────────────────────────────
    case 'PAGO_RECIBIDO': {
      const p = pedido!;
      const contenido =
        saludo(destinatario.nombre) +
        titulo(pago?.aCredito ? 'Pedido confirmado a crédito' : 'Recibimos tu pago') +
        parrafo(
          pago?.aCredito
            ? `Tu pedido <strong>${esc(p.numero)}</strong> quedó cargado al cupo de tu empresa.` +
              (pago.vence ? ` La factura vence el <strong>${esc(pago.vence)}</strong>.` : '')
            : `Confirmamos el pago de tu pedido <strong>${esc(p.numero)}</strong> por ` +
              `<strong>${cop(p.total)}</strong>${pago?.medio ? ` mediante ${esc(pago.medio)}` : ''}. ` +
              'Ya pasó a alistamiento.',
        ) +
        tablaPedido(p.lineas, p.total) +
        lineaDeTiempo(p.estado, p.esEnvio);

      return {
        asunto: `Pago confirmado — pedido ${p.numero}`,
        texto: `Confirmamos el pago del pedido ${p.numero} por ${cop(p.total)}.`,
        html: envolver({
          titulo: 'Pago confirmado',
          preencabezado: `Pedido ${p.numero} confirmado por ${cop(p.total)}.`,
          contenido,
          emisor,
          punto,
          accion: { texto: 'Seguir mi pedido', url: `${sitio}/mis-pedidos` },
        }),
      };
    }

    // ── Cambio de estado (trazabilidad) ────────────────────────────────
    case 'PEDIDO_ESTADO': {
      const p = pedido!;
      const info = ESTADOS[p.estado] ?? {
        titulo: 'Tu pedido cambió de estado',
        texto: 'Consulta el detalle en Mis Pedidos.',
      };

      const contenido =
        saludo(destinatario.nombre) +
        titulo(info.titulo) +
        parrafo(`Pedido <strong>${esc(p.numero)}</strong>. ${info.texto}`) +
        lineaDeTiempo(p.estado, p.esEnvio) +
        (p.estado === 'LISTO_PARA_RETIRO' && punto
          ? parrafo('Recuerda llevar tu documento de identidad para reclamarlo.')
          : '');

      return {
        asunto: `${info.titulo} — ${p.numero}`,
        texto: `${info.titulo}. Pedido ${p.numero}. ${info.texto}`,
        html: envolver({
          titulo: info.titulo,
          preencabezado: `${info.titulo} · ${p.numero}`,
          contenido,
          emisor,
          punto: p.esEnvio ? null : punto,
          accion: { texto: 'Ver el seguimiento', url: `${sitio}/mis-pedidos` },
        }),
      };
    }
  }
}
