/**
 * La fecha del calendario donde está la persona, en formato AAAA-MM-DD.
 *
 * `toISOString()` da la fecha en UTC: en Colombia, desde las 7 p. m. ya es
 * «mañana», y el Panel saludaba con la fecha del día siguiente, el egreso
 * proponía mañana y la entrega estimada se contaba desde un día de más.
 */
export function fechaLocal(d: Date = new Date()): string {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${dia}`;
}
