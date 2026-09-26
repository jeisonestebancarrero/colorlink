import { supabase } from '../lib/supabase';

/**
 * Foto de perfil y logo de empresa. La ruta empieza por el uid porque la política
 * del bucket lo exige, y lleva marca de tiempo para evitar la caché.
 */

const BUCKET = 'avatares';

/** Igual al límite del bucket (2 MB); se valida antes para dar un mensaje claro. */
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
  // La carpeta es el uid: lo valida la política del bucket.
  const ruta = `${userId}/${prefijo}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) throw fallo('subir', error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

export const avatarService = {
  /** Sube la foto y la guarda en el perfil. */
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

  /** Solo OWNER o ADMIN; lo decide la política de `companies`. */
  async cambiarLogoDeEmpresa(companyId: string, archivo: File): Promise<string> {
    const url = await subir(archivo, 'logo-empresa');

    const { error } = await supabase
      .from('companies')
      .update({ logo_url: url, updated_at: new Date().toISOString() })
      .eq('id', companyId);
    if (error) throw fallo('cambiarLogoDeEmpresa', error.message);

    return url;
  },

  /** Logo actual de la empresa. */
  async obtenerLogoDeEmpresa(companyId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('companies').select('logo_url').eq('id', companyId).maybeSingle();
    if (error) {
      console.warn('[avatares] obtenerLogoDeEmpresa:', error.message);
      return null;
    }
    return (data as { logo_url: string | null } | null)?.logo_url ?? null;
  },

  /** El archivo se conserva para no romper correos antiguos que lo enlazan. */
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
