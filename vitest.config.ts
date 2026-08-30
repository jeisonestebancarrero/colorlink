import { defineConfig } from 'vitest/config';

/**
 * Configuración de pruebas independiente de `vite.config.ts`.
 *
 * Se mantiene separada a propósito: `vite.config.ts` es configuración del
 * frontend existente y no debe modificarse. Las pruebas de esta fase cubren
 * lógica pura de negocio (motor de cálculo, validaciones, transiciones de
 * estado), por lo que no necesitan el entorno DOM ni los plugins de React.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/lib/**', 'src/services/**', 'src/schemas/**'],
    },
  },
});
