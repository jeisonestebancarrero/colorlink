/**
 * CORS común a todas las funciones. Toda cabecera que envíe el cliente (p. ej.
 * x-application-name) debe estar aquí o el preflight bloquea la llamada; curl no lo reproduce.
 */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;
