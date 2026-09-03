import { supabase } from '../lib/supabase';

/**
 * Contraseña provisional: saber si hay que cambiarla, y cambiarla.
 *
 * La marca la pone el servidor al crear una cuenta o al reiniciar un acceso en
 * modo temporal. Antes no existía: el comentario de `admin-create-user` decía
 * «se pide cambiarla» pero nada la pedía, así que la contraseña que un
 * administrador dictaba por teléfono seguía sirviendo meses después.
 *
 * Vale la pena ser claro sobre el alcance: esto es un FLUJO, no una frontera
 * de seguridad. Lo que impide usar el portal interno sin segundo factor sigue
 * siendo `is_staff()` en el servidor, que no depende de esta marca.
 */

/** Mínimo que exige Supabase. Se repite aquí para avisar antes de enviar. */
export const LARGO_MINIMO_CLAVE = 8;

export const claveTemporalService = {
  /** ¿Esta cuenta tiene una contraseña puesta por otra persona? */
  async debeCambiarla(): Promise<boolean> {
    const { data, error } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();
    // Ante un fallo de red no se bloquea la entrada: sería dejar fuera a todo
    // el mundo por un problema que no tiene que ver con su contraseña.
    if (error || !data) return false;
    return (data as { must_change_password: boolean }).must_change_password === true;
  },

  /**
   * Cambia la contraseña y retira la marca.
   *
   * El orden importa: primero se cambia de verdad y solo entonces se retira la
   * marca. Al revés, un fallo al cambiarla dejaría la cuenta sin obligación y
   * con la contraseña provisional todavía puesta.
   */
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
      // La contraseña YA cambió; solo quedó la marca. Se avisa en consola y se
      // deja pasar: repetir el cambio no arreglaría nada y bloquear a la
      // persona después de haber acertado sería lo peor de los dos mundos.
      console.error('[clave-temporal] retirar marca:', errorMarca.message);
    }
  },
};
