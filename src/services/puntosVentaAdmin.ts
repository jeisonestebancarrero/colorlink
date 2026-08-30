import { supabase } from '../lib/supabase';

/**
 * Puntos de venta — administración.
 *
 * No hay nada que "sincronizar" con la tienda del cliente: los dos portales
 * leen LA MISMA tabla `pickup_locations`. Lo que se guarde aquí es lo que el
 * cliente ve en Puntos de Retiro. El único desfase es el cache de catálogo
 * del navegador del cliente, que dura cinco minutos.
 */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[puntos-venta] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/FORBIDDEN/.test(m)) return new Error('Solo administración puede gestionar puntos de venta.');
  if (/CAMPOS_OBLIGATORIOS/.test(m)) {
    return new Error('El nombre, la ciudad y la dirección son obligatorios.');
  }
  if (/REF_DUPLICADA/.test(m)) {
    return new Error('Ya existe un punto de venta con ese identificador. Escribe otro.');
  }
  if (/COORDENADA_FUERA_DE_RANGO/.test(m)) {
    return new Error(
      'Esas coordenadas no caen en Colombia. Revisa que no estén invertidas la latitud y la longitud.',
    );
  }
  if (/NOT_FOUND/.test(m)) return new Error('Ese punto de venta ya no existe.');
  if (/exceeded the maximum allowed size|Payload too large/i.test(m)) {
    return new Error('La imagen pesa más de 5 MB. Usa una más liviana.');
  }
  if (/mime type|not allowed/i.test(m)) {
    return new Error('Formato no admitido. Usa JPG, PNG, WebP o AVIF.');
  }
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

export interface PuntoVenta {
  id: string;
  referencia: string | null;
  nombre: string;
  ciudad: string;
  direccion: string;
  telefono: string | null;
  horario: string | null;
  imagenUrl: string | null;
  tieneEstudioColor: boolean;
  tieneAsesorTecnico: boolean;
  tieneRetiroExpress: boolean;
  horasAlistamiento: number;
  latitud: number | null;
  longitud: number | null;
  activo: boolean;
}

const SELECT = `
  id, external_ref, name, city, address, phone, hours, image_url,
  has_color_studio, has_tech_advisor, has_express_pickup,
  stock_readiness_hours, latitude, longitude, status
`;

interface Fila {
  id: string;
  external_ref: string | null;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  hours: string | null;
  image_url: string | null;
  has_color_studio: boolean;
  has_tech_advisor: boolean;
  has_express_pickup: boolean;
  stock_readiness_hours: number;
  latitude: number | string | null;
  longitude: number | string | null;
  status: string;
}

const aNumero = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const puntoVentaService = {
  /** Todos, incluidos los inactivos: el personal debe poder reactivarlos. */
  async listar(): Promise<PuntoVenta[]> {
    const { data, error } = await supabase
      .from('pickup_locations')
      .select(SELECT)
      .order('city')
      .order('name');
    if (error) throw errorLegible('listar', error);

    return ((data ?? []) as unknown as Fila[]).map((f) => ({
      id: f.id,
      referencia: f.external_ref,
      nombre: f.name,
      ciudad: f.city,
      direccion: f.address,
      telefono: f.phone,
      horario: f.hours,
      imagenUrl: f.image_url,
      tieneEstudioColor: f.has_color_studio,
      tieneAsesorTecnico: f.has_tech_advisor,
      tieneRetiroExpress: f.has_express_pickup,
      horasAlistamiento: f.stock_readiness_hours,
      latitud: aNumero(f.latitude),
      longitud: aNumero(f.longitude),
      activo: f.status === 'ACTIVO',
    }));
  },

  async guardar(punto: Partial<PuntoVenta> & { nombre: string; ciudad: string; direccion: string }): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_pickup_location', {
      _datos: {
        id: punto.id ?? null,
        external_ref: punto.referencia ?? null,
        name: punto.nombre,
        city: punto.ciudad,
        address: punto.direccion,
        phone: punto.telefono ?? null,
        hours: punto.horario ?? null,
        image_url: punto.imagenUrl ?? null,
        has_color_studio: punto.tieneEstudioColor ?? false,
        has_tech_advisor: punto.tieneAsesorTecnico ?? false,
        has_express_pickup: punto.tieneRetiroExpress ?? false,
        stock_readiness_hours: punto.horasAlistamiento ?? 24,
        latitude: punto.latitud ?? null,
        longitude: punto.longitud ?? null,
        status: punto.activo === false ? 'INACTIVO' : 'ACTIVO',
      },
    });
    if (error) throw errorLegible('guardar', error);
    return String(data);
  },

  /**
   * Sube la foto de una tienda y devuelve su URL pública.
   *
   * El nombre lleva una marca de tiempo a propósito: si se reutilizara el
   * mismo nombre, los navegadores y las CDN seguirían mostrando la imagen
   * vieja durante horas y parecería que el cambio no se guardó.
   */
  async subirFoto(archivo: File, referencia: string): Promise<string> {
    const extension = (archivo.name.split('.').pop() ?? 'jpg').toLowerCase();
    const ruta = `${referencia || 'tienda'}-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from('tiendas')
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (error) throw errorLegible('subirFoto', error);

    const { data } = supabase.storage.from('tiendas').getPublicUrl(ruta);
    return data.publicUrl;
  },
};
