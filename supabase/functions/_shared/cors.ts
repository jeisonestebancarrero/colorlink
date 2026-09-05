/**
 * Cabeceras CORS compartidas por todas las funciones.
 *
 * Vivían copiadas en cada una, y por eso pasó lo que pasó: el cliente del
 * navegador añade `x-application-name` a TODAS sus peticiones, esa cabecera no
 * estaba en la lista de permitidas, y el navegador bloqueaba la llamada en la
 * comprobación previa —antes de enviarla—. Ninguna función llegaba a
 * ejecutarse.
 *
 * El síntoma era desconcertante: la misma petición hecha a mano respondía 200,
 * y desde la aplicación fallaba siempre. Con `curl` no se reproduce nunca,
 * porque fuera de un navegador no hay comprobación previa. Se cayeron con
 * esto la llamada de voz, el correo de prueba, el alta de personal interno y
 * los restablecimientos de contraseña; todos mostrando mensajes genéricos que
 * no apuntaban a ninguna parte.
 *
 * Ahora hay una sola lista. Si mañana el cliente manda otra cabecera propia,
 * se agrega aquí y las seis funciones quedan al día.
 */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;
