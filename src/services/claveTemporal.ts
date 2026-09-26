import { supabase } from '../lib/supabase';

/**
 * Contraseña provisional: la marca la pone el servidor al crear o reiniciar un acceso.
 * Es un flujo, no una frontera de seguridad: esa sigue siendo `is_staff()`.
 */

/** Mínimo de Supabase, repetido para avisar antes de enviar. */
export const LARGO_MINIMO_CLAVE = 8;

export const claveTemporalService = {
  /** Si la contraseña actual la puso otra persona. */
  async debeCambiarla(): Promise<boolean> {
    const { data, error } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();
    // Ante un fallo de red no se bloquea la entrada.
    if (error || !data) return false;
    return (data as { must_change_password: boolean }).must_change_password === true;
  },

  /** Orden obligatorio: primero se cambia la contraseña y solo después se retira la marca. */
  async cambiar(nueva: string): Promise<void> {
    const limpia = nueva.trim();
    if (limpia.length < LARGO_MINIMO_CLAVE) {
      throw new Error(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
    }

    const { error } = await supabase.auth.updateUser({ password: limpia });
    if (error) {
      console.error('[clave-temporal] cambiar:', error.message);
      if (/should be different|same as the old/i.test(error.message)) {
        throw new Error('La nueva contraseña tiene que ser distinta de la provisional.');
      }
      if (/at least|length/i.test(error.message)) {
        throw new Error(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
      }
      throw new Error('No fue posible cambiar la contraseña. Inténtalo nuevamente.');
    }

    const { error: errorMarca } = await supabase.rpc('confirmar_cambio_de_clave');
    if (errorMarca) {
      // La contraseña ya cambió; solo falló retirar la marca, así que no se bloquea a la persona.
      console.error('[clave-temporal] retirar marca:', errorMarca.message);
    }
  },
};
