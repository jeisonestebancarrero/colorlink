/**
 * Plantillas de correo de ColorLink.
 *
 * POR QUÉ EL HTML VIVE AQUÍ Y NO EN LA BASE:
 * el correo tiene su propio HTML —tablas, estilos en línea, nada de flexbox ni
 * de hojas externas— porque Outlook y Gmail descartan casi todo lo demás.
 * Mantenerlo en TypeScript permite componerlo con funciones y probarlo; en SQL
 * habría terminado siendo una concatenación imposible de leer.
 *
 * DECISIONES DE DISEÑO:
 *  · Ancho fijo de 600 px y tabla externa: es lo único que se ve igual en
 *    Gmail, Outlook y el correo del iPhone.
 *  · Estilos en línea. Las hojas de estilo se eliminan en varios clientes.
 *  · El logo va como imagen remota SI hay una URL configurada, y siempre
 *    acompañado de un texto con la marca: la mitad de los clientes bloquean
 *    imágenes por defecto y un correo sin encabezado legible parece spam.
 *  · Los datos de contacto son los del PUNTO DE VENTA del pedido, no los de la
 *    empresa: quien recibe el correo quiere llamar a la tienda donde va a
 *    recoger, no a una línea nacional.
 */

import { LOGO_CID } from './logo.ts';

export const MARCA = {
  azul: '#004F9F',
  azulOscuro: '#003B77',
  amarillo: '#FFB81C',
  rojo: '#C8102E',
  texto: '#1E293B',
  suave: '#64748B',
  borde: '#E2E8F0',
  fondo: '#F1F5F9',
};

export interface Emisor {
  nombre: string;
  nit?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  email?: string | null;
  web?: string | null;
  logo?: string | null;
}

export interface Punto {
  nombre: string;
  direccion?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  horario?: string | null;
}

export const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(Number(n) || 0);

/** Escapa el texto que viene de la base: un nombre con `<` rompería el HTML. */
export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const boton = (texto: string, url: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr><td style="background:${MARCA.azul};border-radius:10px;">
      <a href="${esc(url)}" style="display:inline-block;padding:13px 26px;color:#ffffff;
         font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;
         text-decoration:none;">${esc(texto)}</a>
    </td></tr>
  </table>`;

const bloqueContacto = (punto?: Punto | null) => {
  if (!punto) return '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="margin:24px 0 8px;border:1px solid ${MARCA.borde};border-radius:12px;
                background:${MARCA.fondo};">
    <tr><td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;
                color:${MARCA.suave};font-weight:bold;">Tu punto de retiro</p>
      <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:${MARCA.texto};">
        ${esc(punto.nombre)}</p>
      ${punto.direccion ? `<p style="margin:0 0 3px;font-size:13px;color:${MARCA.suave};">
        ${esc(punto.direccion)}${punto.ciudad ? `, ${esc(punto.ciudad)}` : ''}</p>` : ''}
      ${punto.telefono ? `<p style="margin:0 0 3px;font-size:13px;color:${MARCA.suave};">
        Tel. ${esc(punto.telefono)}</p>` : ''}
      ${punto.horario ? `<p style="margin:0;font-size:13px;color:${MARCA.suave};">
        ${esc(punto.horario)}</p>` : ''}
    </td></tr>
  </table>`;
};

/** Envoltura común: encabezado de marca, contenido y pie legal. */
export function envolver(opciones: {
  titulo: string;
  preencabezado: string;
  contenido: string;
  emisor: Emisor;
  punto?: Punto | null;
  accion?: { texto: string; url: string };
}): string {
  const { titulo, preencabezado, contenido, emisor, punto, accion } = opciones;

  const documento = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <!-- Sin esto, Gmail y Outlook en modo oscuro INVIERTEN los colores: el azul
       Pintuco se vuelve lavanda y el texto oscuro se vuelve claro sobre fondo
       claro. Declarar que el correo solo tiene versión clara evita el
       repintado automático. -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    /* Outlook móvil marca los elementos que va a repintar con estos
       atributos; se le devuelven los colores de la marca. */
    [data-ogsc] .marca-fondo { background:${MARCA.azul} !important; }
    [data-ogsc] .marca-texto { color:${MARCA.texto} !important; }
    [data-ogsc] .marca-suave { color:${MARCA.suave} !important; }
    [data-ogsc] .marca-blanco { color:#ffffff !important; }
  </style>
  <title>${esc(titulo)}</title>
</head>
<body bgcolor="${MARCA.fondo}" style="margin:0;padding:0;background:${MARCA.fondo};">
  <!-- El preencabezado es lo que la bandeja muestra junto al asunto. Sin él,
       Gmail muestra el primer texto que encuentre, que suele ser el menú. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${esc(preencabezado)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         bgcolor="${MARCA.fondo}" style="background:${MARCA.fondo};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             bgcolor="#ffffff"
             style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;
                    overflow:hidden;border:1px solid ${MARCA.borde};">

        <!-- Encabezado -->
        <tr><td class="marca-fondo" bgcolor="${MARCA.azul}" style="background:${MARCA.azul};padding:20px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:Arial,Helvetica,sans-serif;" align="left">
              <img src="cid:${LOGO_CID}" alt="${esc(emisor.nombre)}" width="150" height="84"
                   style="display:block;width:150px;height:auto;border:0;border-radius:8px;margin-bottom:10px;">
              <span class="marca-blanco" style="color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:-0.3px;">COLOR<span style="color:${MARCA.amarillo};">LINK</span></span>
              <span style="color:#BFD6EE;font-size:12px;display:block;margin-top:2px;">${esc(emisor.nombre)}</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="height:4px;background:${MARCA.amarillo};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Contenido -->
        <tr><td style="padding:30px 26px 8px;font-family:Arial,Helvetica,sans-serif;
                       color:${MARCA.texto};">
          ${contenido}
          ${accion ? boton(accion.texto, accion.url) : ''}
          ${bloqueContacto(punto)}
        </td></tr>

        <!-- Pie -->
        <tr><td style="padding:20px 26px 26px;border-top:1px solid ${MARCA.borde};
                       font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 6px;font-size:12px;color:${MARCA.suave};line-height:1.6;">
            <strong style="color:${MARCA.texto};">${esc(emisor.nombre)}</strong>
            ${emisor.nit ? ` · NIT ${esc(emisor.nit)}` : ''}<br>
            ${emisor.direccion ? `${esc(emisor.direccion)}` : ''}${emisor.ciudad ? `, ${esc(emisor.ciudad)}` : ''}<br>
            ${emisor.telefono ? `${esc(emisor.telefono)}` : ''}${emisor.email ? ` · ${esc(emisor.email)}` : ''}
          </p>
          <p style="margin:10px 0 0;font-size:11px;color:#94A3B8;line-height:1.6;">
            Recibes este mensaje porque tienes una cuenta en ColorLink. Este correo se genera
            automáticamente; para cualquier gestión responde a ${esc(emisor.email ?? 'nuestro correo')}
            o comunícate con tu punto de venta.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Se colapsa el espacio entre etiquetas ANTES de enviar.
  //
  // El correo se codifica en quoted-printable, que parte las líneas largas y
  // codifica el espacio final como `=20`. Con el HTML indentado, esos `=20`
  // terminaban impresos dentro del mensaje —se veían sueltos junto al logo y
  // encima de la tabla—. Sin saltos ni sangría no hay nada que codificar.
  return documento
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

// ── Piezas reutilizables del contenido ──────────────────────────────────
export const saludo = (nombre: string) =>
  `<p class="marca-texto" style="margin:0 0 14px;font-size:16px;color:${MARCA.texto};">Hola <strong>${esc(nombre)}</strong>,</p>`;

export const titulo = (t: string) =>
  `<h1 class="marca-texto" style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${MARCA.texto};">${esc(t)}</h1>`;

export const parrafo = (t: string) =>
  `<p class="marca-suave" style="margin:0 0 14px;font-size:14px;line-height:1.7;color:${MARCA.suave};">${t}</p>`;

/** Tabla del detalle del pedido, con total destacado. */
export function tablaPedido(
  lineas: Array<{ producto: string; presentacion?: string | null; color?: string | null; cantidad: number; total: number }>,
  total: number,
): string {
  const filas = lineas
    .map(
      (l) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${MARCA.borde};font-size:13px;">
          <strong style="color:${MARCA.texto};">${esc(l.producto)}</strong><br>
          <span style="color:${MARCA.suave};font-size:12px;">
            ${esc(l.presentacion ?? '')}${l.color ? ` · Color ${esc(l.color)}` : ''}
          </span>
        </td>
        <td align="center" style="padding:10px 8px;border-bottom:1px solid ${MARCA.borde};
                                  font-size:13px;color:${MARCA.suave};">${l.cantidad}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${MARCA.borde};
                                 font-size:13px;font-weight:bold;color:${MARCA.texto};">
          ${cop(l.total)}</td>
      </tr>`,
    )
    .join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="margin:18px 0;font-family:Arial,Helvetica,sans-serif;">
    <tr>
      <th align="left" style="padding-bottom:8px;font-size:11px;letter-spacing:1px;
          text-transform:uppercase;color:${MARCA.suave};border-bottom:2px solid ${MARCA.azul};">Producto</th>
      <th align="center" style="padding-bottom:8px;font-size:11px;letter-spacing:1px;
          text-transform:uppercase;color:${MARCA.suave};border-bottom:2px solid ${MARCA.azul};">Cant.</th>
      <th align="right" style="padding-bottom:8px;font-size:11px;letter-spacing:1px;
          text-transform:uppercase;color:${MARCA.suave};border-bottom:2px solid ${MARCA.azul};">Valor</th>
    </tr>
    ${filas}
    <tr>
      <td colspan="2" style="padding:14px 0 0;font-size:14px;font-weight:bold;color:${MARCA.texto};">
        Total</td>
      <td align="right" style="padding:14px 0 0;font-size:20px;font-weight:bold;color:${MARCA.azul};">
        ${cop(total)}</td>
    </tr>
  </table>`;
}

/**
 * Línea de tiempo del pedido.
 *
 * Se pintan todos los pasos, no solo el actual: el cliente quiere saber
 * cuánto falta, y un correo que solo dice "PREPARANDO" no responde eso.
 */
const PASOS = [
  ['PENDIENTE', 'Pedido recibido'],
  ['CONFIRMADO', 'Pago confirmado'],
  ['PREPARANDO', 'Alistando en tienda'],
  ['LISTO_PARA_RETIRO', 'Listo para retirar'],
  ['ENTREGADO', 'Entregado'],
] as const;

const PASOS_ENVIO = [
  ['PENDIENTE', 'Pedido recibido'],
  ['CONFIRMADO', 'Pago confirmado'],
  ['PREPARANDO', 'Alistando en bodega'],
  ['ENVIADO', 'En camino'],
  ['ENTREGADO', 'Entregado'],
] as const;

export function lineaDeTiempo(estado: string, esEnvio: boolean): string {
  const pasos = esEnvio ? PASOS_ENVIO : PASOS;
  const actual = pasos.findIndex(([clave]) => clave === estado);

  const filas = pasos
    .map(([, texto], i) => {
      const hecho = actual >= 0 && i <= actual;
      const esActual = i === actual;
      return `
      <tr>
        <td width="26" valign="top" style="padding:6px 0;">
          <div style="width:12px;height:12px;border-radius:50%;
                      background:${hecho ? MARCA.azul : '#ffffff'};
                      border:2px solid ${hecho ? MARCA.azul : MARCA.borde};"></div>
        </td>
        <td style="padding:5px 0;font-size:13px;
                   color:${esActual ? MARCA.texto : hecho ? MARCA.suave : '#A9B4C2'};
                   font-weight:${esActual ? 'bold' : 'normal'};">
          ${esc(texto)}${esActual ? ' — vas aquí' : ''}
        </td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0"
                 style="margin:16px 0;font-family:Arial,Helvetica,sans-serif;">${filas}</table>`;
}
