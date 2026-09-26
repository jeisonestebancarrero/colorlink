import barranquilla from '../../assets/brand/barranquilla.jpeg';
import calle74 from '../../assets/brand/call74.jpeg';
import calle134 from '../../assets/brand/calle134.jpg';
import poblado from '../../assets/brand/poblado.jpeg';
import bucaramanga from '../../assets/brand/bucaramanga.jpg';
import cali from '../../assets/brand/cali.jpeg';
import guayabal from '../../assets/brand/guayabal.jpg';
import fondoMarca from '../../assets/brand/fondo.png';

/**
 * Imágenes de respaldo por `external_ref` (estable tras un reseed). Algunas son la ciudad, no la fachada:
 * se rotulan con la ciudad. `pickup_locations.image_url`, subida desde el portal, tiene prioridad.
 */
const POR_TIENDA: Record<string, string> = {
  'store-barranquilla-prado': barranquilla,
  'store-bog-74': calle74,
  'store-bog-norte': calle134,
  'store-med-poblado': poblado,
  'store-bucaramanga-cabecera': bucaramanga,
  'store-cali-pasoancho': cali,
  'store-med-guayabal': guayabal,
};

/** Fondo de marca para las tiendas que todavía no tienen imagen propia. */
export const FONDO_MARCA = fondoMarca;

/** Imagen de un punto de venta; `esFoto` indica si admite recorte (el fondo de marca no). */
export function imagenPunto(
  referencia: string | null | undefined,
  urlRemota?: string | null,
): { src: string; esFoto: boolean } {
  if (urlRemota && urlRemota.trim() !== '') return { src: urlRemota, esFoto: true };
  const local = referencia ? POR_TIENDA[referencia] : undefined;
  return local ? { src: local, esFoto: true } : { src: fondoMarca, esFoto: false };
}

/** Indica si la tienda tiene imagen propia. */
export function tieneFoto(referencia: string | null | undefined, urlRemota?: string | null): boolean {
  return Boolean((urlRemota && urlRemota.trim() !== '') || (referencia && POR_TIENDA[referencia]));
}
