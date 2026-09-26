/** Fecha local AAAA-MM-DD. `toISOString()` usa UTC y en Colombia da el día siguiente desde las 7 p. m. */
export function fechaLocal(d: Date = new Date()): string {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${dia}`;
}
