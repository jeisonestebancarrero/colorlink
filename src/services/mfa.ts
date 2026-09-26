import { supabase } from '../lib/supabase';

/**
 * MFA TOTP sobre Supabase Auth; el secreto lo guarda el servidor. La protección real
 * está en `is_admin`/`is_staff`/`has_permission`, que exigen aal2 si hay factor.
 */

export interface EstadoMFA {
  /** Ya tiene una aplicación de códigos registrada. */
  configurado: boolean;
  /** 'aal1' = solo contraseña; 'aal2' = superó el segundo factor. */
  nivelSesion: 'aal1' | 'aal2';
  /** El rol lo exige (personal interno). */
  obligatorio: boolean;
}

export interface InscripcionMFA {
  factorId: string;
  /** SVG generado por el servidor. */
  qr: string;
  /** Para teclearlo a mano si falla la cámara. */
  secreto: string;
}

function mensajeLegible(raw: string, contexto: string): Error {
  console.error(`[mfa] ${contexto}:`, raw);
  if (/invalid.*(code|totp)|verification failed|invalid_code/i.test(raw)) {
    return new Error('El código no es correcto. Revisa que sea el que muestra tu aplicación ahora mismo.');
  }
  if (/expired/i.test(raw)) {
    return new Error('El código venció. Escribe el que muestre tu aplicación en este momento.');
  }
  if (/rate limit|too many/i.test(raw)) {
    return new Error('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
  }
  if (/not enabled|unsupported/i.test(raw)) {
    return new Error('La verificación en dos pasos no está habilitada en el servidor.');
  }
  return new Error('No fue posible completar la verificación. Inténtalo de nuevo.');
}

export const mfaService = {
  /** Qué pedir: nada, registrar el factor o el código. */
  async estado(): Promise<EstadoMFA> {
    const { data, error } = await supabase.rpc('mi_estado_mfa');
    if (error) throw mensajeLegible(error.message, 'estado');
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      configurado: Boolean(d.configurado),
      nivelSesion: d.nivel_sesion === 'aal2' ? 'aal2' : 'aal1',
      obligatorio: Boolean(d.obligatorio),
    };
  },

  /** Limpia antes los factores sin terminar: al llegar al tope de 10 el registro falla. */
  async inscribir(): Promise<InscripcionMFA> {
    const { data: lista } = await supabase.auth.mfa.listFactors();
    for (const f of lista?.all ?? []) {
      if (f.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `ColorLink · ${new Date().toLocaleDateString('es-CO')}`,
      issuer: 'ColorLink Pintuco',
    });
    if (error) throw mensajeLegible(error.message, 'inscribir');

    return {
      factorId: data.id,
      qr: data.totp.qr_code,
      secreto: data.totp.secret,
    };
  },

  /** Confirma con el primer código; deja la sesión en aal2. */
  async confirmarInscripcion(factorId: string, codigo: string): Promise<void> {
    const limpio = codigo.replace(/\D/g, '');
    if (limpio.length !== 6) throw new Error('El código son 6 dígitos.');

    const { data: reto, error: errorReto } = await supabase.auth.mfa.challenge({ factorId });
    if (errorReto) throw mensajeLegible(errorReto.message, 'challenge');

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: reto.id,
      code: limpio,
    });
    if (error) throw mensajeLegible(error.message, 'verify');
  },

  /** Sube la sesión a aal2 en inicios posteriores. */
  async verificarCodigo(codigo: string): Promise<void> {
    const limpio = codigo.replace(/\D/g, '');
    if (limpio.length !== 6) throw new Error('El código son 6 dígitos.');

    const { data: lista, error: errorLista } = await supabase.auth.mfa.listFactors();
    if (errorLista) throw mensajeLegible(errorLista.message, 'listFactors');

    const factor = lista.totp.find((f) => f.status === 'verified') ?? lista.totp[0];
    if (!factor) {
      throw new Error('Esta cuenta no tiene una aplicación de códigos registrada.');
    }

    const { data: reto, error: errorReto } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (errorReto) throw mensajeLegible(errorReto.message, 'challenge');

    const { error } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: reto.id,
      code: limpio,
    });
    if (error) throw mensajeLegible(error.message, 'verify');
  },

  /** Exige aal2: con solo la contraseña robada no se puede retirar el factor. */
  async retirar(): Promise<void> {
    const { data: lista, error: errorLista } = await supabase.auth.mfa.listFactors();
    if (errorLista) throw mensajeLegible(errorLista.message, 'listFactors');

    for (const f of lista.all) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw mensajeLegible(error.message, 'unenroll');
    }
  },
};
