import { describe, it, expect } from 'vitest';

/** Prueba de humo: confirma que el runner funciona. */
describe('infraestructura de pruebas', () => {
  it('vitest ejecuta correctamente', () => {
    expect(1 + 1).toBe(2);
  });
});
