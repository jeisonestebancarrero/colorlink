import React, { useEffect, useRef, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  desglosarIvaIncluido, formatearImporteImpuesto, TARIFA_IVA_POR_DEFECTO,
} from '../../services/impuestos';
import { useAuth } from '../../context/AuthContext';
import type { CartItem } from '../../types';
import logoPintuco from '../../assets/pintuco-logo.jpeg';

/**
 * Cotización formal.
 *
 * Antes el botón llamaba a `window.print()` sobre la tienda entera: salía la
 * barra de navegación, el catálogo y el carrito flotando, y nada de lo que una
 * cotización necesita. Un comprador de obra la usa para pedir aprobación
 * interna, así que tiene que traer emisor con NIT, destinatario, número,
 * fecha, vigencia, detalle con IVA discriminado y condiciones.
 *
 * No crea un pedido ni reserva inventario: es un documento de oferta. Por eso
 * lleva la vigencia impresa —los precios de la pintura se mueven— y dice
 * explícitamente que no es una factura, para que nadie la contabilice.
 */
interface Emisor {
  nombre: string;
  nit: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  email: string;
  regimen: string;
  iva: number;
}

const DIAS_VIGENCIA = 15;

export const CotizacionFormal: React.FC<{
  items: CartItem[];
  subtotal: number;
  descuento: number;
  total: number;
  onCerrar: () => void;
}> = ({ items, subtotal, descuento, total, onCerrar }) => {
  const { user } = useAuth();
  const [emisor, setEmisor] = useState<Emisor | null>(null);
  const documento = useRef<HTMLDivElement>(null);

  /**
   * Imprime la cotización dentro de un iframe aislado.
   *
   * Llamar a `window.print()` sobre la página no funciona: la cotización vive
   * dentro de la aplicación, entre contenedores con `position: fixed`,
   * `overflow` y utilidades de Tailwind, y el navegador terminaba sacando una
   * hoja en blanco. Ocultar el resto con CSS tampoco alcanzó por lo mismo.
   *
   * Copiando el nodo a un documento vacío no queda nada del diseño de la
   * tienda que pueda interferir, y lo que se ve en pantalla es exactamente lo
   * que sale impreso.
   */
  const imprimir = () => {
    const nodo = documento.current;
    if (!nodo) return;

    const marco = window.document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    window.document.body.appendChild(marco);

    const doc = marco.contentDocument;
    if (!doc) {
      marco.remove();
      return;
    }

    // Se llevan las hojas de estilo de la aplicación para conservar la
    // tipografía y los colores; el HTML clonado ya no tiene los contenedores
    // que rompían la impresión.
    const estilos = [...window.document.querySelectorAll('link[rel="stylesheet"], style')]
      .map((n) => n.outerHTML)
      .join('');

    doc.open();
    doc.write(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
        `<title>Cotización</title>${estilos}` +
        '<style>@page{margin:14mm}body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>' +
        `</head><body>${nodo.innerHTML}</body></html>`,
    );
    doc.close();

    // Se espera a que carguen tipografías e imágenes: imprimir antes deja el
    // logotipo en blanco.
    const lanzar = () => {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
      // Se retira después, no en el acto: quitarlo de inmediato cancela el
      // diálogo de impresión en algunos navegadores.
      window.setTimeout(() => marco.remove(), 60000);
    };

    if (marco.contentWindow?.document.readyState === 'complete') lanzar();
    else marco.onload = lanzar;
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('company_name, company_nit, company_address, company_city, company_phone, company_email, tax_regime, default_tax_rate')
        .limit(1)
        .maybeSingle();
      const d = data as Record<string, unknown> | null;
      setEmisor({
        nombre: String(d?.company_name ?? 'Pintuco'),
        nit: String(d?.company_nit ?? ''),
        direccion: String(d?.company_address ?? ''),
        ciudad: String(d?.company_city ?? ''),
        telefono: String(d?.company_phone ?? ''),
        email: String(d?.company_email ?? ''),
        regimen: String(d?.tax_regime ?? ''),
        iva: Number(d?.default_tax_rate ?? 19),
      });
    })();
  }, []);

  const cop = (n: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(n);

  const hoy = new Date();
  const vence = new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000);
  const fecha = (d: Date) =>
    d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

  // Número legible y estable para el día, para que el comprador pueda citarlo.
  const numero = `COT-${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(
    hoy.getDate(),
  ).padStart(2, '0')}-${String(Math.floor(hoy.getTime() / 1000) % 10000).padStart(4, '0')}`;

  // Los precios de góndola ya incluyen IVA: la base se despeja hacia atrás.
  // El cálculo vive en services/impuestos para que el carrito y este documento
  // no puedan discrepar: antes estaba escrito solo aquí.
  const { base: baseTotal, iva: ivaTotal, tarifa } = desglosarIvaIncluido(
    total,
    emisor?.iva ?? TARIFA_IVA_POR_DEFECTO
  );

  return (
    <div className="fixed inset-0 z-70 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">


      <div className="min-h-full flex items-start justify-center p-4">
        <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl my-6">
          <div className="no-imprimir flex items-center justify-between px-6 py-3 border-b border-slate-200">
            <span className="text-sm font-bold text-slate-700">Vista previa de la cotización</span>
            <div className="flex items-center gap-2">
              <button
                onClick={imprimir}
                className="inline-flex items-center gap-1.5 bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold px-3.5 py-2 rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir o guardar en PDF
              </button>
              <button
                onClick={onCerrar}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 p-1.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div ref={documento} className="p-8 text-slate-800">
            {/* Encabezado */}
            <div className="flex flex-wrap justify-between gap-6 pb-5 border-b-2 border-[#004F9F]">
              <div className="flex items-start gap-3">
                <img
                  src={logoPintuco}
                  alt="Pintuco"
                  className="w-24 h-auto rounded-md shrink-0"
                />
                <div>
                  <p className="text-lg font-extrabold text-[#004F9F] leading-tight">
                    {emisor?.nombre ?? 'Pintuco'}
                  </p>
                  {/* Cada dato se imprime solo si existe: una cotización con
                      "NIT" seguido de nada, o un punto suelto entre teléfono y
                      correo, se lee como un documento a medio hacer. */}
                  <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                    {emisor?.nit && <>NIT {emisor.nit}<br /></>}
                    {emisor?.direccion && (
                      <>
                        {emisor.direccion}
                        {emisor.ciudad ? `, ${emisor.ciudad}` : ''}
                        <br />
                      </>
                    )}
                    {!emisor?.direccion && emisor?.ciudad && <>{emisor.ciudad}<br /></>}
                    {[emisor?.telefono, emisor?.email].filter(Boolean).join(' · ')}
                    {(emisor?.telefono || emisor?.email) && <br />}
                    {emisor?.regimen}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Cotización
                </p>
                <p className="text-xl font-extrabold tabular-nums">{numero}</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Fecha: {fecha(hoy)}
                  <br />
                  <strong>Válida hasta: {fecha(vence)}</strong>
                </p>
              </div>
            </div>

            {!emisor?.nit && (
              <p className="no-imprimir mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-medium leading-relaxed">
                Faltan los datos fiscales de la empresa (NIT, dirección, teléfono y correo).
                Cárgalos en el portal interno, en <strong>Configuración → Datos de la empresa</strong>:
                sin NIT la cotización no sirve para trámites.
              </p>
            )}

            {/* Destinatario */}
            <div className="py-4 border-b border-slate-200">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Dirigida a
              </p>
              <p className="text-sm font-bold">
                {user?.company || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Cliente'}
              </p>
              <p className="text-[11px] text-slate-600">
                {user?.email}
                {user?.phone ? ` · ${user.phone}` : ''}
              </p>
            </div>

            {/* Detalle */}
            <table className="w-full text-[11px] mt-4">
              <thead>
                <tr className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="text-left px-2 py-2 font-bold">Descripción</th>
                  <th className="text-center px-2 py-2 font-bold">Cant.</th>
                  <th className="text-right px-2 py-2 font-bold">Vr. unitario</th>
                  <th className="text-right px-2 py-2 font-bold">Vr. total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2">
                      <span className="font-bold block">{it.productName}</span>
                      <span className="text-slate-500">
                        {it.presentation}
                        {it.colorName ? ` · Color ${it.colorName}` : ''}
                      </span>
                    </td>
                    <td className="text-center px-2 py-2 tabular-nums">{it.quantity}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{cop(it.unitPrice)}</td>
                    <td className="text-right px-2 py-2 tabular-nums font-semibold">
                      {cop(it.unitPrice * it.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totales */}
            <div className="flex justify-end mt-4">
              <table className="text-[11px] w-72">
                <tbody>
                  <tr>
                    <td className="py-1 text-slate-600">Subtotal</td>
                    <td className="py-1 text-right tabular-nums">{cop(subtotal)}</td>
                  </tr>
                  {descuento > 0 && (
                    <tr>
                      <td className="py-1 text-slate-600">Descuento</td>
                      <td className="py-1 text-right tabular-nums text-emerald-700">
                        −{cop(descuento)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-1 text-slate-600">Base gravable</td>
                    <td className="py-1 text-right tabular-nums">{formatearImporteImpuesto(baseTotal)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">IVA {tarifa} %</td>
                    <td className="py-1 text-right tabular-nums">{formatearImporteImpuesto(ivaTotal)}</td>
                  </tr>
                  <tr className="border-t-2 border-slate-800">
                    <td className="py-2 font-extrabold">TOTAL</td>
                    <td className="py-2 text-right font-extrabold text-base tabular-nums">
                      {cop(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Condiciones */}
            <div className="mt-6 pt-4 border-t border-slate-200 text-[10px] text-slate-600 leading-relaxed space-y-1">
              <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                Condiciones
              </p>
              <p>
                1. Los precios están expresados en pesos colombianos e incluyen IVA a la tarifa
                vigente.
              </p>
              <p>
                2. Esta cotización tiene una vigencia de {DIAS_VIGENCIA} días calendario. Pasada esa
                fecha los precios deben confirmarse nuevamente.
              </p>
              <p>
                3. La disponibilidad se confirma al momento del pedido; esta cotización no reserva
                inventario.
              </p>
              <p>
                4. Los colores preparados sobre pedido no admiten devolución, según la práctica del
                sector.
              </p>
              <p>
                5. Forma de pago: de contado, salvo que exista cupo de crédito aprobado para el
                cliente.
              </p>
              <p className="pt-2 font-semibold text-slate-700">
                Este documento es una oferta comercial y no constituye factura de venta.
              </p>
            </div>

            <div className="mt-8 flex justify-between gap-8 text-[10px] text-slate-600">
              <div className="flex-1 border-t border-slate-400 pt-1">
                Elaborada por {emisor?.nombre}
              </div>
              <div className="flex-1 border-t border-slate-400 pt-1">
                Aceptada por el cliente (nombre, cargo y fecha)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
