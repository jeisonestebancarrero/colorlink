import { describe, it, expect } from 'vitest';
import {
  normalizarDocumento,
  errorDocumento,
  normalizarNit,
  errorNit,
  digitoVerificacionNit,
  normalizarTelefono,
  errorTelefono,
} from './documento';

describe('normalizarDocumento', () => {
  it('quita puntos y letras de una cédula', () => {
    expect(normalizarDocumento('CC', '1.020.304.050')).toBe('1020304050');
    expect(normalizarDocumento('CC', 'abc-%$#123456')).toBe('123456');
  });

  it('conserva letras en el pasaporte y las pasa a mayúsculas', () => {
    expect(normalizarDocumento('PASAPORTE', 'ab 123456')).toBe('AB123456');
  });

  it('no deja pegar un texto entero', () => {
    expect(normalizarDocumento('CC', '9'.repeat(40))).toHaveLength(15);
  });
});

describe('errorDocumento', () => {
  it('rechaza lo que solo tiene basura', () => {
    // Era el fallo real: `abc-%$#` pasaba la validación de 5 caracteres y
    // llegaba a la base, donde el disparador lo dejaba en nada.
    expect(errorDocumento('CC', 'abc-%$#')).toBeTruthy();
  });

  it('rechaza una cédula demasiado larga', () => {
    expect(errorDocumento('CC', '123456789012')).toBeTruthy();
  });

  it('acepta una cédula normal', () => {
    expect(errorDocumento('CC', '1.020.304.050')).toBeNull();
  });
});

describe('NIT', () => {
  it('lo deja sin puntos y con el guion del dígito de verificación', () => {
    expect(normalizarNit('900.123.456-7')).toBe('900123456-7');
  });

  it('calcula el dígito de verificación de la DIAN', () => {
    // NIT reales, comprobables contra el RUT: Ecopetrol y Banco de Bogotá.
    expect(digitoVerificacionNit('899999068')).toBe(1);
    expect(digitoVerificacionNit('860002964')).toBe(4);
  });

  it('avisa cuando el dígito de verificación no corresponde', () => {
    expect(errorNit('899999068-3')).toContain('dígito de verificación');
  });

  it('acepta un NIT sin dígito de verificación', () => {
    expect(errorNit('900123456')).toBeNull();
  });
});

describe('teléfono', () => {
  it('quita espacios, guiones y paréntesis', () => {
    expect(normalizarTelefono('+57 (312) 000-0000')).toBe('+573120000000');
  });

  it('rechaza un número incompleto', () => {
    expect(errorTelefono('312')).toBeTruthy();
  });
});
