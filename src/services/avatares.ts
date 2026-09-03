import { supabase } from '../lib/supabase';

/**
 * Foto de perfil de la persona y logo de la empresa.
 *
 * `profiles.avatar_url` existía desde el principio, pero solo la llenaba
 * Google al entrar con su proveedor: quien se registraba con correo no tenía
 * forma de poner una foto, y una empresa tampoco su logo.
 *
 * La ruta SIEMPRE empieza por el id del usuario (`<uid>/archivo.jpg`), porque
 * la política del bucket comprueba justamente eso: sin esa carpeta, cualquier
 * cliente autenticado podría sobrescribir la foto de otro. Y lleva marca de
 * tiempo, porque reutilizar el nombre haría que el navegador siguiera
 * mostrando la foto vieja y pareciera que no se guardó.
 */

const BUCKET = 'avatares';

/** Igual al límite del bucket (2 MB). Se comprueba antes de subir para dar un
 *  mensaje claro en lugar del error crudo del servidor. */
export const TAMANO_MAXIMO = 2 * 1024 * 1024;

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

function validar(archivo: File): void {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    throw new Error('La imagen debe ser JPG, PNG, WEBP o AVIF.');
  }
  if (archivo.size > TAMANO_MAXIMO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    throw new Error(`La imagen pesa ${mb} MB y el máximo es 2 MB. Usa una más liviana.`);
  }
}

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[avatares] ${contexto}:`, mensaje);
  if (/exceeded the maximum allowed size|Payload too large/i.test(mensaje)) {
    return new Error('La imagen supera el máximo de 2 MB.');
  }
  if (/mime type|not supported/i.test(mensaje)) {
    return new Error('Ese formato de imagen no se acepta. Usa JPG, PNG o WEBP.');
  }
  if (/row-level security|Unauthorized|denied/i.test(mensaje)) {
    return new Error('No tienes permiso para cambiar esta imagen.');
  }
  return new Error('No fue posible subir la imagen. Inténtalo nuevamente.');
}

async function subir(archivo: File, prefijo: string): Promise<string> {
  validar(archivo);

  const { data: sesion } = await supabase.auth.getSession();
  const userId = sesion.session?.user?.id;
  if (!userId) throw new Error('Inicia sesión para cambiar la imagen.');

  const extension = (archivo.name.split('.').pop() ?? 'jpg').toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'jpg';
  // La carpeta es el id del usuario: es lo que valida la política del bucket.
  const ruta = `${userId}/${prefijo}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) throw fallo('subir', error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

export const avatarService = {
  /** Sube la foto de la persona y la deja guardada en su perfil. */
  async cambiarFotoDePerfil(archivo: File): Promise<string> {
    const url = await subir(archivo, 'perfil');

    const { data: sesion } = await supabase.auth.getSession();
    const userId = sesion.session?.user?.id as string;

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw fallo('cambiarFotoDePerfil', error.message);

    return url;
  },

  /**
   * Sube el logo de la empresa.
   *
   * Solo lo consigue el OWNER o el ADMIN: la política de `companies` es la que
   * decide, no esta función.
   */
  async cambiarLogoDeEmpresa(companyId: string, archivo: File): Promise<string> {
    const url = await subir(archivo, 'logo-empresa');

    const { error } = await supabase
      .from('companies')
      .update({ logo_url: url, updated_at: new Date().toISOString() })
      .eq('id', companyId);
    if (error) throw fallo('cambiarLogoDeEmpresa', error.message);

    return url;
  },

  /** Logo guardado de la empresa, para mostrarlo antes de cambiarlo. */
  async obtenerLogoDeEmpresa(companyId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('companies').select('logo_url').eq('id', companyId).maybeSingle();
    if (error) {
      console.warn('[avatares] obtenerLogoDeEmpresa:', error.message);
      return null;
    }
    return (data as { logo_url: string | null } | null)?.logo_url ?? null;
  },

  /** Quita la foto del perfil. El archivo se deja: no cuesta nada y evita
   *  romper un correo antiguo que la tenga incrustada por URL. */
  async quitarFotoDePerfil(): Promise<void> {
    const { data: sesion } = await supabase.auth.getSession();
    const userId = sesion.session?.user?.id;
    if (!userId) throw new Error('Inicia sesión para quitar la imagen.');

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw fallo('quitarFotoDePerfil', error.message);
  },
};
