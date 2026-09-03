import { describe, it, expect } from 'vitest';
import { inicialesDe } from './AvatarCliente';

/**
 * Iniciales del avatar de un cliente.
 *
 * Importa porque hoy casi nadie tiene foto: las iniciales son lo que se ve en
 * la vista de tarjetas, sesenta veces seguidas. Si dos clientes distintos dan
 * las mismas letras, la cuadrícula deja de servir para reconocerlos.
 */
describe('Iniciales de un cliente', () => {
  it('descarta la forma jurídica, que no identifica a nadie', () => {
    // Sin descartarla, estas dos empresas distintas darían las mismas letras.
    expect(inicialesDe('CONSTRUCTORA HORIZONTE S.A.S.')).toBe('CH');
    expect(inicialesDe('COMERCIALIZADORA ANDINA LTDA')).toBe('CA');
  });

  it('usa nombre y apellido de una persona', () => {
    expect(inicialesDe('DIEGO RAMÍREZ')).toBe('DR');
    expect(inicialesDe('María Fernanda Gómez')).toBe('MF');
  });

  it('salta las palabras de enlace', () => {
    // «DE», «LA» y «Y» no distinguen: PINTURAS DE LA COSTA no puede dar «PD».
    expect(inicialesDe('PINTURAS DE LA COSTA')).toBe('PC');
    expect(inicialesDe('ACABADOS Y MUROS S.A.S.')).toBe('AM');
  });

  it('con una sola palabra usa sus dos primeras letras', () => {
    expect(inicialesDe('HORIZONTE')).toBe('HO');
  });

  it('un nombre vacío no rompe la tarjeta', () => {
    // Un perfil recién creado puede no tener nombre todavía.
    expect(inicialesDe('')).toBe('?');
    expect(inicialesDe('   ')).toBe('?');
    expect(inicialesDe('S.A.S.')).toBe('?');
  });
});
