import { describe, it, expect } from 'vitest';
import { inicialesDe } from './AvatarCliente';

/** Las iniciales identifican al cliente en la cuadrícula; deben distinguir empresas parecidas. */
describe('Iniciales de un cliente', () => {
  it('descarta la forma jurídica, que no identifica a nadie', () => {
    // Sin descartar la palabra común, ambas darían las mismas letras.
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
    // Un perfil recién creado puede no tener nombre.
    expect(inicialesDe('')).toBe('?');
    expect(inicialesDe('   ')).toBe('?');
    expect(inicialesDe('S.A.S.')).toBe('?');
  });
});
