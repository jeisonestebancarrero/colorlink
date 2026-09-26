/**
 * Webhook de Wompi: único punto que confirma pagos; el navegador nunca lo hace.
 * Firma: sha256(valores de signature.properties + timestamp + secreto) == signature.checksum, o 401.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Lee una ruta como 'transaction.status' dentro del objeto del evento. */
function leerRuta(objeto: Record<string, unknown>, ruta: string): string {
  let actual: unknown = objeto;
  for (const parte of ruta.split('.')) {
    if (actual === null || typeof actual !== 'object') return '';
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual === null || actual === undefined ? '' : String(actual);
}

async function sha256(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const secreto = Deno.env.get('WOMPI_EVENTS_SECRET');
  if (!secreto) {
    console.error('[wompi] falta WOMPI_EVENTS_SECRET');
    return json({ error: 'Webhook sin configurar' }, 500);
  }

  let evento: Record<string, unknown>;
  try {
    evento = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const firma = evento.signature as { properties?: string[]; checksum?: string } | undefined;
  const datos = evento.data as Record<string, unknown> | undefined;

  if (!firma?.checksum || !firma.properties || !datos) {
    return json({ error: 'Evento sin firma' }, 400);
  }

  // El orden lo fija signature.properties del evento.
  const cadena =
    firma.properties.map((p) => leerRuta(datos, p)).join('') +
    String(evento.timestamp ?? '') +
    secreto;

  const calculado = await sha256(cadena);
  if (calculado.toLowerCase() !== firma.checksum.toLowerCase()) {
    console.warn('[wompi] firma inválida');
    return json({ error: 'Firma inválida' }, 401);
  }

  const transaccion = (datos.transaction ?? {}) as Record<string, unknown>;
  const referencia = String(transaccion.reference ?? '');
  const estado = String(transaccion.status ?? '');

  if (!referencia) return json({ error: 'Evento sin referencia' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data, error } = await supabase.rpc('confirmar_pago', {
    _referencia: referencia,
    _estado: estado,
    _transaccion: String(transaccion.id ?? ''),
    _motivo: String(transaccion.status_message ?? '') || null,
  });

  if (error) {
    console.error('[wompi] confirmar_pago:', error.message);
    // 500 a propósito para que Wompi reintente.
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, resultado: data });
});
