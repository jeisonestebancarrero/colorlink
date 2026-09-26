/**
 * Normalización de documento, NIT y teléfono en formularios. La base también limpia
 * con disparadores; esto corrige al escribir y rechaza formas imposibles, sin
 * validar contra registros oficiales.
 */

/** `TIPOS_DOCUMENTO` en auth.ts es la fuente. */
type Tipo = 'CC' | 'CE' | 'PASAPORTE' | 'PEP' | string;

/** Solo el pasaporte es alfanumérico; se limita la longitud para evitar pegados largos. */
export const normalizarDocumento = (tipo: Tipo, valor: string): string =>
  tipo === 'PASAPORTE'
    ? valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    : valor.replace(/\D/g, '').slice(0, 15);

/** Cédula: 6 a 10 dígitos; CE y PEP con más holgura porque su formato ha variado. */
export const errorDocumento = (tipo: Tipo, valor: string): string | null => {
  const limpio = normalizarDocumento(tipo, valor);

  if (!limpio) return 'El número de documento es obligatorio';

  if (tipo === 'PASAPORTE') {
    return limpio.length < 5
      ? 'El pasaporte debe tener al menos 5 caracteres'
      : null;
  }

  if (limpio.length < 6) return 'El documento debe tener al menos 6 dígitos';
  if (tipo === 'CC' && limpio.length > 10) {
    return 'Una cédula de ciudadanía no pasa de 10 dígitos';
  }
  return null;
};

/** Dígito de verificación del NIT (fórmula DIAN) para avisar de errores de tecleo. */
export const digitoVerificacionNit = (base: string): number | null => {
  const numeros = base.replace(/\D/g, '');
  if (!numeros) return null;

  // Pesos DIAN, aplicados de derecha a izquierda.
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const suma = [...numeros]
    .reverse()
    .reduce((acc, digito, i) => acc + Number(digito) * pesos[i], 0);

  const resto = suma % 11;
  return resto > 1 ? 11 - resto : resto;
};

/** NIT como lo guarda la base: sin puntos y con el guion del dígito de verificación. */
export const normalizarNit = (valor: string): string => {
  const [base, ...resto] = valor.replace(/[^\d-]/g, '').split('-');
  const cuerpo = base.slice(0, 10);
  const dv = resto.join('').replace(/\D/g, '').slice(0, 1);
  return dv ? `${cuerpo}-${dv}` : cuerpo;
};

export const errorNit = (valor: string): string | null => {
  const limpio = normalizarNit(valor);
  const [base, dv] = limpio.split('-');

  if (!base) return 'El NIT es obligatorio';
  if (base.length < 8) return 'El NIT debe tener al menos 8 dígitos';

  // Sin dígito de verificación se acepta: algunos documentos no lo traen.
  if (dv === undefined || dv === '') return null;

  const esperado = digitoVerificacionNit(base);
  return esperado !== null && Number(dv) !== esperado
    ? `El dígito de verificación no corresponde: para ${base} debería ser ${esperado}`
    : null;
};

/** Teléfono para E.164: conserva el `+` inicial y quita espacios, guiones y paréntesis. */
export const normalizarTelefono = (valor: string): string => {
  const masInicial = valor.trimStart().startsWith('+');
  const digitos = valor.replace(/\D/g, '').slice(0, 15);
  return masInicial ? `+${digitos}` : digitos;
};

export const errorTelefono = (valor: string): string | null => {
  const digitos = normalizarTelefono(valor).replace(/\D/g, '');
  if (!digitos) return 'El teléfono es obligatorio';
  // Un celular colombiano son 10 dígitos; un fijo con indicativo, 8 o 10.
  if (digitos.length < 7) return 'El teléfono está incompleto';
  return null;
};
