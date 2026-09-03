import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, Check } from 'lucide-react';

/**
 * Exportar a CSV o a PDF lo que la pantalla está mostrando.
 *
 * PRINCIPIO: se exporta EXACTAMENTE lo que se ve. Si el filtro dice «facturas
 * de 2025 de Medellín», el archivo trae eso y nada más. Un botón que exportara
 * todo el histórico ignorando los filtros produce archivos que nadie pidió y
 * que además revelan sedes que quien exporta no está mirando.
 *
 * Y como las filas vienen de la pantalla, ya pasaron por RLS: no hay forma de
 * exportar una fila que la persona no podía ver.
 *
 * CSV en lugar de XLSX: un .xlsx exige una librería de medio megabyte para
 * escribir un formato que Excel abre igual desde un CSV. Se usa punto y coma y
 * BOM UTF-8, que es lo que Excel en español espera; con coma parte las cifras
 * en columnas equivocadas y sin BOM se rompen los acentos.
 *
 * El PDF se arma con `window.print()` sobre un iframe aislado, la misma
 * técnica que la cotización del cliente: imprimir la página entera saca la
 * barra de navegación y los filtros.
 */

export interface ColumnaExport<T> {
  /** Encabezado tal como debe salir en el archivo. */
  titulo: string;
  /** Valor de la celda. Devolver texto ya formateado. */
  valor: (fila: T) => string | number | null | undefined;
  /** Alinea a la derecha en el PDF. Para cifras. */
  numerica?: boolean;
}

interface Props<T> {
  /** Filas visibles en la pantalla, con sus filtros ya aplicados. */
  filas: readonly T[];
  columnas: Array<ColumnaExport<T>>;
  /** Nombre del archivo, sin extensión. Se le añade la fecha. */
  nombre: string;
  /** Título del documento impreso. */
  titulo: string;
  /**
   * Descripción de los filtros activos, p. ej. «2025 · Medellín · Emitidas».
   * Va impresa en el PDF: un listado sin decir qué filtro tenía es un listado
   * que nadie puede volver a reproducir.
   */
  filtros?: string;
}

const cel = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

/** Escapa una celda para CSV: comillas dobles y separador dentro del texto. */
function csvCelda(v: string): string {
  if (/[";\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function hoy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function escaparHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function ExportarBoton<T>({
  filas, columnas, nombre, titulo, filtros,
}: Props<T>): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState<'csv' | 'pdf' | null>(null);
  const [listo, setListo] = useState(false);

  const vacio = filas.length === 0;

  const descargarCsv = () => {
    setTrabajando('csv');
    try {
      const lineas = [
        columnas.map((c) => csvCelda(c.titulo)).join(';'),
        ...filas.map((f) => columnas.map((c) => csvCelda(cel(c.valor(f)))).join(';')),
      ];
      // BOM al principio: sin él Excel en Windows lee los acentos como basura.
      const blob = new Blob(['﻿' + lineas.join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nombre}-${hoy()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Liberar el objeto: sin esto el blob se queda en memoria toda la sesión.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setListo(true);
      setTimeout(() => setListo(false), 2000);
    } finally {
      setTrabajando(null);
      setAbierto(false);
    }
  };

  const imprimirPdf = () => {
    setTrabajando('pdf');
    try {
      const filasHtml = filas.map((f) => (
        '<tr>' + columnas.map((c) =>
          `<td class="${c.numerica ? 'num' : ''}">${escaparHtml(cel(c.valor(f)))}</td>`
        ).join('') + '</tr>'
      )).join('');

      const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escaparHtml(titulo)}</title>
<style>
  @page { margin: 12mm; size: A4 landscape; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #0f172a; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2mm; }
  .meta { font-size: 8pt; color: #64748b; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  th { background: #f1f5f9; text-align: left; padding: 2mm; border-bottom: 1px solid #cbd5e1;
       font-size: 7pt; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 1.6mm 2mm; border-bottom: 1px solid #e2e8f0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  /* Que el encabezado se repita en cada página: una tabla de 200 filas sin
     encabezado a partir de la segunda hoja es ilegible. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>${escaparHtml(titulo)}</h1>
<div class="meta">
  ${filas.length} ${filas.length === 1 ? 'registro' : 'registros'}
  ${filtros ? ' · ' + escaparHtml(filtros) : ''}
  · Generado el ${new Date().toLocaleString('es-CO')}
</div>
<table>
  <thead><tr>${columnas.map((c) =>
    `<th class="${c.numerica ? 'num' : ''}">${escaparHtml(c.titulo)}</th>`).join('')}</tr></thead>
  <tbody>${filasHtml}</tbody>
</table>
</body></html>`;

      // Iframe aislado: `window.print()` sobre la página imprimiría la barra
      // de navegación, los filtros y el menú. Ya pasó con la cotización.
      const marco = document.createElement('iframe');
      marco.style.position = 'fixed';
      marco.style.right = '0';
      marco.style.bottom = '0';
      marco.style.width = '0';
      marco.style.height = '0';
      marco.style.border = '0';
      document.body.appendChild(marco);

      const cw = marco.contentWindow;
      if (!cw) throw new Error('No fue posible preparar el documento.');
      cw.document.open();
      cw.document.write(doc);
      cw.document.close();

      const lanzar = () => {
        cw.focus();
        cw.print();
        // Se retira después de imprimir; quitarlo antes cancela el diálogo.
        setTimeout(() => marco.remove(), 1000);
      };
      if (cw.document.readyState === 'complete') lanzar();
      else marco.onload = lanzar;
    } finally {
      setTrabajando(null);
      setAbierto(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={vacio}
        title={vacio ? 'No hay nada que exportar con los filtros actuales' : 'Exportar lo que se ve'}
        /* Sólido y en azul Pintuco, no un contorno pálido: la primera versión
           era un botón blanco entre otros botones blancos y no se distinguía
           de los filtros. Exportar es una acción, no un filtro más. */
        className="px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2
                   shadow-2xs transition-all cursor-pointer
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
                   bg-[#004F9F] text-white hover:bg-[#003B77] active:scale-[0.98]"
      >
        {listo
          ? <Check className="w-4 h-4 text-emerald-300" />
          : <Download className="w-4 h-4" />}
        {listo ? 'Descargado' : 'Exportar'}
        {!vacio && !listo && (
          <span className="text-blue-200 font-extrabold">{filas.length}</span>
        )}
      </button>

      {abierto && !vacio && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-60 bg-white rounded-lg shadow-2xl
                          border border-slate-200 overflow-hidden">
            <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500
                          border-b border-slate-100">
              {filas.length} {filas.length === 1 ? 'registro' : 'registros'}
              {filtros ? ` · ${filtros}` : ''}
            </p>

            <button
              onClick={descargarCsv}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50
                         transition-colors cursor-pointer"
            >
              {trabajando === 'csv'
                ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin mt-0.5 shrink-0" />
                : <FileSpreadsheet className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />}
              <span>
                <span className="block text-xs font-bold text-slate-800">Excel / CSV</span>
                <span className="block text-[10px] text-slate-500 leading-snug">
                  Para calcular o cruzar con otra información
                </span>
              </span>
            </button>

            <button
              onClick={imprimirPdf}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50
                         transition-colors cursor-pointer border-t border-slate-100"
            >
              {trabajando === 'pdf'
                ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin mt-0.5 shrink-0" />
                : <FileText className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />}
              <span>
                <span className="block text-xs font-bold text-slate-800">PDF</span>
                <span className="block text-[10px] text-slate-500 leading-snug">
                  Para imprimir o enviar. Elige «Guardar como PDF».
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
