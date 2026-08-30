import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * El segundo factor lo impone el SERVIDOR.
 *
 * Esta es la prueba que decide si el doble factor es real o decorativo. Si
 * solo lo comprobara la pantalla de administración, bastaría con llamar a la
 * API con el token de sesión —que el navegador guarda en texto plano— para
 * saltárselo entero. Aquí se ataca exactamente así: con el token de una
 * sesión que NO superó el factor.
 *
 * Al terminar se retira el factor para dejar la cuenta como estaba.
 */

function leerEnvLocal(): Record<string, string> {
  const ruta = resolve(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return {};
  const vars: Record<string, string> = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return vars;
}

const env = leerEnvLocal();
const API = env.VITE_SUPABASE_URL ?? '';
const ANON = env.VITE_SUPABASE_ANON_KEY ?? '';

const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * Cuenta propia y desechable.
 *
 * Antes esta suite registraba un segundo factor sobre `admin@pintuco.demo`,
 * la cuenta que usan las demás pruebas. Mientras ese factor existía, las
 * sesiones de los otros archivos —que no lo habían superado— perdían la
 * condición de administrador y fallaban por permisos, sin ninguna relación
 * aparente con el doble factor. Es exactamente el mismo desconcierto que
 * produce en producción activar 2FA sobre una cuenta compartida.
 */
const ADMIN = { email: `mfa.prueba.${Date.now()}@colorlink.test`, password: 'pintuco2025*' };

/** Código TOTP de 6 dígitos (RFC 6238), para actuar como la app del teléfono. */
function totp(secretoBase32: string): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretoBase32.replace(/=+$/, '').toUpperCase()) {
    const i = alfabeto.indexOf(c);
    if (i < 0) continue;
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );

  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));

  const h = createHmac('sha1', bytes).update(contador).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = h.readUInt32BE(o) & 0x7fffffff;
  return String(n % 1_000_000).padStart(6, '0');
}

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

function cab(token: string) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const rpc = (ruta: string, token: string) =>
  fetch(`${API}/rest/v1/rpc/${ruta}`, { method: 'POST', headers: cab(token), body: '{}' }).then((r) =>
    r.json(),
  );

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Doble factor · lo exige el servidor', () => {
  let sesionPassword = '';
  let sesionConFactor = '';
  let factorId = '';
  let idPropio = '';

  beforeAll(async () => {
    // Se crea la cuenta y se le da rol de administrador con la clave de
    // servicio, que solo existe en .env.local y nunca en el bundle.
    const creada = await fetch(`${API}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN.email,
        password: ADMIN.password,
        email_confirm: true,
        user_metadata: { first_name: 'Prueba', last_name: 'Doble Factor' },
      }),
    }).then((r) => r.json());
    idPropio = creada.id ?? '';

    await fetch(`${API}/rest/v1/user_roles`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: idPropio, role: 'ADMINISTRADOR' }),
    });

    const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN),
    });
    sesionPassword = (await r.json()).access_token ?? '';

    const inscripcion = await fetch(`${API}/auth/v1/factors`, {
      method: 'POST',
      headers: cab(sesionPassword),
      body: JSON.stringify({
        friendly_name: `prueba-${Date.now()}`,
        factor_type: 'totp',
        issuer: 'ColorLink',
      }),
    }).then((r) => r.json());

    factorId = inscripcion.id ?? '';
    const secreto = inscripcion.totp?.secret ?? '';

    const reto = await fetch(`${API}/auth/v1/factors/${factorId}/challenge`, {
      method: 'POST',
      headers: cab(sesionPassword),
      body: '{}',
    }).then((r) => r.json());

    const verificado = await fetch(`${API}/auth/v1/factors/${factorId}/verify`, {
      method: 'POST',
      headers: cab(sesionPassword),
      body: JSON.stringify({ challenge_id: reto.id, code: totp(secreto) }),
    }).then((r) => r.json());

    sesionConFactor = verificado.access_token ?? '';
  });

  afterAll(async () => {
    if (factorId && sesionConFactor) {
      await fetch(`${API}/auth/v1/factors/${factorId}`, {
        method: 'DELETE',
        headers: cab(sesionConFactor),
      });
    }
    // La cuenta desechable se borra: dejarla viva la convertiría en un
    // administrador de más con una contraseña conocida.
    if (idPropio && SERVICE) {
      await fetch(`${API}/auth/v1/admin/users/${idPropio}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
  });

  it('el registro del factor produce una sesión de nivel superior', () => {
    expect(sesionPassword).not.toBe('');
    expect(sesionConFactor).not.toBe('');
    expect(sesionConFactor).not.toBe(sesionPassword);
  });

  it('la sesión que NO superó el factor pierde la condición de administrador', async () => {
    expect(await rpc('is_admin', sesionPassword)).toBe(false);
  });

  it('la sesión que NO superó el factor pierde la condición de personal interno', async () => {
    expect(await rpc('is_staff', sesionPassword)).toBe(false);
  });

  it('la sesión que NO superó el factor solo se ve a sí misma', async () => {
    // Se usa `profiles` y no `orders` porque la semilla no trae pedidos: una
    // lista vacía habría dado por buena la prueba aunque el doble factor no
    // hiciera nada. Aquí sí hay filas, así que la diferencia es medible.
    const perfiles = await fetch(`${API}/rest/v1/profiles?select=id`, {
      headers: cab(sesionPassword),
    }).then((r) => r.json());
    expect(perfiles).toHaveLength(1);
  });

  it('la sesión que NO superó el factor no puede emitir facturas', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/issue_pos_invoice`, {
      method: 'POST',
      headers: cab(sesionPassword),
      body: JSON.stringify({ _order_id: '00000000-0000-0000-0000-000000000000' }),
    });
    // Se corta por permisos, no por "pedido no encontrado": ni siquiera llega
    // a mirar el pedido.
    const cuerpo = await r.json();
    expect(r.ok).toBe(false);
    expect(JSON.stringify(cuerpo)).toMatch(/FORBIDDEN|permiso/i);
  });

  it('la sesión que SÍ superó el factor conserva todo el acceso', async () => {
    expect(await rpc('is_admin', sesionConFactor)).toBe(true);
    expect(await rpc('is_staff', sesionConFactor)).toBe(true);

    const perfiles = await fetch(`${API}/rest/v1/profiles?select=id`, {
      headers: cab(sesionConFactor),
    }).then((r) => r.json());
    expect(perfiles.length).toBeGreaterThan(1);
  });

  it('no se exime a una cuenta que ya tiene el factor activo, ni siquiera la propia', async () => {
    // Es el candado que de verdad importa: eximir no desactiva el factor, así
    // que permitirlo dejaría la exigencia en «no» mientras la persona sigue
    // teniendo que usar la app. El camino correcto es reiniciar primero.
    const r = await fetch(`${API}/rest/v1/rpc/set_mfa_requerido`, {
      method: 'POST',
      headers: cab(sesionConFactor),
      body: JSON.stringify({ _user_id: idPropio, _requerido: false }),
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/ALREADY_ENROLLED/);
  });

  it('se puede eximir a otra persona y volver a exigírselo', async () => {
    const [tecnico] = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.tecnico@pintuco.demo`,
      { headers: cab(sesionConFactor) },
    ).then((r) => r.json());

    const estado = async () =>
      fetch(`${API}/rest/v1/rpc/estado_mfa_usuario`, {
        method: 'POST',
        headers: cab(sesionConFactor),
        body: JSON.stringify({ _user_id: tecnico.id }),
      }).then((r) => r.json());

    // Por defecto el personal interno lo necesita.
    expect(await estado()).toMatchObject({ requerido: true, es_interno: true });

    const eximir = await fetch(`${API}/rest/v1/rpc/set_mfa_requerido`, {
      method: 'POST',
      headers: cab(sesionConFactor),
      body: JSON.stringify({ _user_id: tecnico.id, _requerido: false }),
    });
    expect(eximir.ok).toBe(true);
    expect(await estado()).toMatchObject({ requerido: false });

    // Se deja como estaba para no alterar la semilla.
    await fetch(`${API}/rest/v1/rpc/set_mfa_requerido`, {
      method: 'POST',
      headers: cab(sesionConFactor),
      body: JSON.stringify({ _user_id: tecnico.id, _requerido: true }),
    });
    expect(await estado()).toMatchObject({ requerido: true });
  });

  it('un administrador SIN factor sí puede quitarse la exigencia', async () => {
    // Antes esto estaba prohibido y dejaba al administrador del sistema sin
    // forma de desactivarse la exigencia salvo pidiéndoselo a otro. El
    // candado no protegía nada: quien no tiene factor no está protegido por
    // él, y quien lo tiene queda bloqueado por la otra regla.
    const [tecnico] = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.tecnico@pintuco.demo`,
      { headers: cab(sesionConFactor) },
    ).then((r) => r.json());

    const quitar = await fetch(`${API}/rest/v1/rpc/set_mfa_requerido`, {
      method: 'POST',
      headers: cab(sesionConFactor),
      body: JSON.stringify({ _user_id: tecnico.id, _requerido: false }),
    });
    expect(quitar.ok).toBe(true);

    // Se deja como estaba.
    await fetch(`${API}/rest/v1/rpc/set_mfa_requerido`, {
      method: 'POST',
      headers: cab(sesionConFactor),
      body: JSON.stringify({ _user_id: tecnico.id, _requerido: true }),
    });
  });

  it('un usuario normal no puede tocar la exigencia de nadie', async () => {
    const cliente = await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'carlos.mendoza@constructorahorizonte.com',
        password: 'pintuco2025*',
      }),
    })
      .then((r) => r.json())
      .then((j) => j.access_token ?? '');

    const r = await fetch(`${API}/rest/v1/rpc/set_mfa_requerido`, {
      method: 'POST',
      headers: cab(cliente),
      body: JSON.stringify({
        _user_id: '00000000-0000-0000-0000-000000000000',
        _requerido: false,
      }),
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('la interfaz sabe qué pedir en cada caso', async () => {
    const conFactor = await rpc('mi_estado_mfa', sesionConFactor);
    expect(conFactor).toMatchObject({ configurado: true, obligatorio: true, nivel_sesion: 'aal2' });

    const sinSuperar = await rpc('mi_estado_mfa', sesionPassword);
    expect(sinSuperar).toMatchObject({ configurado: true, nivel_sesion: 'aal1' });
  });
});
