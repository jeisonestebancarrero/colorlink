/**
 * Normalización de documentos, NIT y teléfono en los formularios
 * ============================================================
 * La base ya limpia estos datos con disparadores —documentos sin puntos,
 * teléfonos en E.164— y eso es lo que garantiza que el dato guardado esté
 * bien venga de donde venga. Pero limpiar en el servidor no impide que el
 * formulario ACEPTE basura: hasta ahora el número de documento solo exigía
 * cinco caracteres, así que `abc-%$#` pasaba la validación, viajaba a la
 * base y allí se convertía en `abc` —un documento que no existe— sin que
 * nadie se enterara.
 *
 * Por eso esto vive aquí y no reemplaza nada de lo que hace la base: se
 * corrige mientras la persona escribe, para que vea lo que va a quedar
 * guardado, y se rechaza lo que no puede ser un documento colombiano.
 *
 * NO se valida contra ningún registro oficial: que un número tenga la forma
 * correcta no significa que exista. Solo se descarta lo imposible.
 */

/** Tipos que ofrece el registro. `TIPOS_DOCUMENTO` en auth.ts es la fuente. */
type Tipo = 'CC' | 'CE' | 'PASAPORTE' | 'PEP' | string;

/**
 * Deja el documento como debe quedar mientras se escribe.
 *
 * El pasaporte es el único alfanumérico —los colombianos son dos letras y
 * seis dígitos, y los extranjeros varían—; el resto son solo números. Se
 * recorta la longitud porque un campo sin tope deja pegar un texto entero.
 */
export const normalizarDocumento = (tipo: Tipo, valor: string): string =>
  tipo === 'PASAPORTE'
    ? valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    : valor.replace(/\D/g, '').slice(0, 15);

/**
 * Qué decirle a la persona si el documento no puede ser real.
 *
 * Las cédulas colombianas tienen entre 6 y 10 dígitos: las de nacidos antes
 * de los sesenta son cortas, y las que emite hoy la Registraduría llegan a
 * diez. Cédulas de extranjería y PEP se dejan más holgadas porque su formato
 * ha cambiado varias veces.
 */
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

/**
 * Dígito de verificación del NIT, según la fórmula de la DIAN.
 *
 * Se calcula para poder AVISAR cuando el NIT escrito no cuadra. Es la única
 * comprobación que se puede hacer sin consultar al RUT, y atrapa el error
 * más común: un dígito cambiado al teclear.
 */
export const digitoVerificacionNit = (base: string): number | null => {
  const numeros = base.replace(/\D/g, '');
  if (!numeros) return null;

  // Los pesos los fija la DIAN y el orden es de derecha a izquierda.
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const suma = [...numeros]
    .reverse()
    .reduce((acc, digito, i) => acc + Number(digito) * pesos[i], 0);

  const resto = suma % 11;
  return resto > 1 ? 11 - resto : resto;
};

/**
 * Deja el NIT como lo guarda la base: sin puntos y conservando el guion del
 * dígito de verificación, que es parte del número y no un adorno.
 */
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

  // Sin dígito de verificación se acepta: hay documentos donde no aparece, y
  // exigirlo dejaría fuera a quien lo copia de una factura que no lo trae.
  if (dv === undefined || dv === '') return null;

  const esperado = digitoVerificacionNit(base);
  return esperado !== null && Number(dv) !== esperado
    ? `El dígito de verificación no corresponde: para ${base} debería ser ${esperado}`
    : null;
};

/**
 * Teléfono colombiano tal como lo espera la base, que lo guarda en E.164.
 *
 * Se conserva el `+` inicial si la persona lo escribe —hay clientes con
 * número de otro país— pero se quitan espacios, guiones y paréntesis, que es
 * lo que la gente teclea al copiar de una tarjeta.
 */
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
