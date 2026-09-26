import { defineConfig } from 'vitest/config';

/** Separada de vite.config.ts: las pruebas son de lógica y base, sin DOM ni plugins de React. */
export default defineConfig({
  test: {
    environment: 'node',
    /** En serie: las pruebas de integración comparten la base y el carrito único del cliente demo. */
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/lib/**', 'src/services/**', 'src/schemas/**'],
    },
  },
});
