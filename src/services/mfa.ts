import { supabase } from '../lib/supabase';

/**
 * Segundo factor de autenticación (TOTP).
 *
 * Se apoya en el MFA nativo de Supabase Auth: el secreto lo genera y guarda
 * el servidor, y aquí nunca se almacena nada. La aplicación solo muestra el
 * código QR y transporta los 6 dígitos.
 *
 * Lo importante está en la base de datos: `is_admin`, `is_staff` y
 * `has_permission` devuelven false si la cuenta tiene un factor verificado y
 * la sesión no lo superó. Sin eso el segundo factor sería decorativo —
 * bastaría con llamar a la API saltándose esta pantalla.
 *
 * Se eligió TOTP y no SMS: el SMS cuesta por mensaje, depende de la cobertura
 * en obra y se puede interceptar cambiando la SIM.
 */

export interface EstadoMFA {
  /** La cuenta ya tiene una aplicación de códigos registrada. */
  configurado: boolean;
  /** 'aal1' = solo contraseña; 'aal2' = ya superó el segundo factor. */
  nivelSesion: 'aal1' | 'aal2';
  /** El rol obliga a tenerlo (todo el personal interno). */
  obligatorio: boolean;
}

export interface InscripcionMFA {
  factorId: string;
  /** Imagen SVG lista para pintar; la genera el servidor. */
  qr: string;
  /** Para teclear a mano cuando la cámara no coopera. */
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
  /** Qué hay que pedirle a esta persona: nada, registrar el factor, o el código. */
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

  /**
   * Empieza el registro: devuelve el QR y el secreto.
   *
   * Antes limpia los factores a medio registrar. Se acumulan cuando alguien
   * abre esta pantalla y la cierra sin terminar, y al llegar al tope de 10 el
   * registro empieza a fallar sin motivo aparente.
   */
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

  /** Confirma el registro con el primer código. Deja la sesión en aal2. */
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

  /** Sube la sesión a aal2 en un inicio de sesión posterior. */
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

  /**
   * Retira el segundo factor de la PROPIA cuenta.
   *
   * Exige una sesión aal2, es decir, haber superado el factor que se va a
   * quitar: si no, quien robara una contraseña podría desactivar el segundo
   * factor y quedarse con la cuenta.
   */
  async retirar(): Promise<void> {
    const { data: lista, error: errorLista } = await supabase.auth.mfa.listFactors();
    if (errorLista) throw mensajeLegible(errorLista.message, 'listFactors');

    for (const f of lista.all) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw mensajeLegible(error.message, 'unenroll');
    }
  },
};
