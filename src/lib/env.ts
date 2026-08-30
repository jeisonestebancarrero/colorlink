import { z } from 'zod';

/**
 * Validación de las variables de entorno expuestas al navegador.
 *
 * SEGURIDAD (MÓDULO 29/41): aquí solo se leen variables con prefijo `VITE_`, que son
 * las únicas que Vite inyecta en el bundle del cliente. La `service_role key` NUNCA
 * debe aparecer en este archivo ni en ningún módulo de `src/`: es exclusiva del
 * servidor (migraciones, seeds y Edge Functions).
 */
const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url('VITE_SUPABASE_URL debe ser una URL válida'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'VITE_SUPABASE_ANON_KEY es obligatoria'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

function loadClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    // No se imprime el valor de ninguna variable, solo qué falta (MÓDULO 43).
    const detalle = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuración de entorno inválida:\n${detalle}\n\n` +
        'Copia .env.example a .env.local y completa los valores con `npm run db:status`.'
    );
  }

  return parsed.data;
}

export const env = loadClientEnv();
