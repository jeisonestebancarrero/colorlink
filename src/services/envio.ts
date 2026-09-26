/** Espejo de create_order_from_cart: si cambia allá, cambia aquí, o el carrito muestra un total distinto al cobrado. */
export const ENVIO_COP = 25000;
export const ENVIO_GRATIS_DESDE_COP = 500000;

/** Costo del envío a domicilio sobre el total de materiales ya descontado; el retiro en tienda no paga. */
export function costoEnvio(conEnvio: boolean, totalMateriales: number): number {
  return conEnvio && totalMateriales < ENVIO_GRATIS_DESDE_COP ? ENVIO_COP : 0;
}
