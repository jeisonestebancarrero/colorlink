import barranquilla from '../../assets/brand/barranquilla.jpeg';
import calle74 from '../../assets/brand/call74.jpeg';
import calle134 from '../../assets/brand/calle134.jpg';
import poblado from '../../assets/brand/poblado.jpeg';
import bucaramanga from '../../assets/brand/bucaramanga.jpg';
import cali from '../../assets/brand/cali.jpeg';
import guayabal from '../../assets/brand/guayabal.jpg';
import fondoMarca from '../../assets/brand/fondo.png';

/**
 * Imágenes de los puntos de venta.
 *
 * ATENCIÓN, y conviene tenerlo presente antes de reutilizarlas: las imágenes
 * NO son todas del mismo tipo.
 * Algunas son la fachada real de una Tienda Pintuco y otras son la ciudad o
 * el sector —la Ventana al Mundo en Barranquilla, el skyline de El Poblado—.
 * Sirven como imagen de ubicación, que es como se usan aquí: acompañan al
 * nombre y la dirección, que son los que identifican la tienda. Por eso la
 * etiqueta que va encima dice la CIUDAD y nunca «así se ve la tienda»: quien
 * llegara buscando una fachada que no es la suya no la encontraría.
 *
 * Se indexan por `external_ref` ('store-med-poblado') y no por el UUID: ese
 * identificador es estable y legible, y sobrevive a un reseed de la base.
 *
 * Estas imágenes son solo el punto de partida. Una tienda creada desde el
 * portal interno no puede tener archivo aquí —no existía al compilar—, así
 * que la vía normal para poner o cambiar una foto es Administración → Puntos
 * de venta, que sube el archivo y llena `pickup_locations.image_url`. Esa
 * columna tiene prioridad sobre todo lo de este archivo.
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

/**
 * Imagen de un punto de venta.
 *
 * `esFoto` distingue una fotografía real del fondo de marca: la primera se
 * puede recortar a lo ancho como una cabecera, el segundo es un logotipo y
 * recortarlo lo estropea.
 */
export function imagenPunto(
  referencia: string | null | undefined,
  urlRemota?: string | null,
): { src: string; esFoto: boolean } {
  if (urlRemota && urlRemota.trim() !== '') return { src: urlRemota, esFoto: true };
  const local = referencia ? POR_TIENDA[referencia] : undefined;
  return local ? { src: local, esFoto: true } : { src: fondoMarca, esFoto: false };
}

/** ¿Hay imagen propia para esta tienda? Útil para decidir el diseño. */
export function tieneFoto(referencia: string | null | undefined, urlRemota?: string | null): boolean {
  return Boolean((urlRemota && urlRemota.trim() !== '') || (referencia && POR_TIENDA[referencia]));
}
