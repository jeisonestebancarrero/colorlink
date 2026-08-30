import { describe, it, expect } from 'vitest';

/**
 * Prueba de humo de la FASE 1: confirma que el runner está operativo.
 * Las pruebas reales de negocio llegan en la FASE 7 (motor de cálculo).
 */
describe('infraestructura de pruebas', () => {
  it('vitest ejecuta correctamente', () => {
    expect(1 + 1).toBe(2);
  });
});
