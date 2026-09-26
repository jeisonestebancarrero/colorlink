import { z } from 'zod';

/**
 * Variables de entorno del navegador; solo `VITE_*`, que Vite incrusta en el bundle.
 * La service_role key no debe aparecer nunca en `src/`.
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
    // Se informa qué falta, nunca el valor.
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
