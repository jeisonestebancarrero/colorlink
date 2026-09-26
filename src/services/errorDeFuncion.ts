/**
 * Extrae el mensaje real de un error de `functions.invoke`: el cuerpo puede estar ya
 * leído, así que se clona y, si falla, se lee como texto. Compartido por tienda y portal.
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
