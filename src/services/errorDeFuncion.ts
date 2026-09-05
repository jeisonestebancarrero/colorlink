/**
 * El mensaje que una función de servidor devolvió de verdad.
 *
 * `supabase.functions.invoke` entrega el error con la respuesta HTTP dentro,
 * pero su cuerpo puede haber sido leído ya: `.json()` entonces revienta y
 * quien lo llama se queda con un texto genérico. Es un defecto silencioso y
 * caro —hoy costó dos diagnósticos equivocados—: un «Destinatario y asunto son
 * obligatorios» o un «la llave del proveedor no sirve», perfectamente claros,
 * llegaban a la pantalla convertidos en «no fue posible» y no había por dónde
 * seguir sin abrir la consola del navegador.
 *
 * Se clona antes de leer, y si aun así no se puede, se intenta como texto.
 *
 * Vive aparte porque lo necesitan la tienda y el portal, que se empaquetan por
 * separado: tenerlo en el servicio de administración obligaría a la tienda a
 * arrastrar ese módulo entero.
 */
export async function mensajeDeLaFuncion(error: unknown, generico: string): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (!ctx || typeof ctx.clone !== 'function') {
    return error instanceof Error && error.message ? error.message : generico;
  }
  try {
    const cuerpo = await ctx.clone().json();
    if (cuerpo?.error?.message) return cuerpo.error.message as string;
    if (cuerpo?.message) return cuerpo.message as string;
  } catch {
    try {
      const texto = (await ctx.clone().text()).trim();
      if (texto) return texto.slice(0, 300);
    } catch {
      /* se cae al genérico */
    }
  }
  return generico;
}
