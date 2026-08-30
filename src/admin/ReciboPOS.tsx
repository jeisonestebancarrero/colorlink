import React, { useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatearCOP } from '../services/backoffice';
import { Button } from '../components/common/Button';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';

/**
 * Recibo POS imprimible.
 *
 * No es facturación electrónica DIAN: no lleva CUFE ni XML UBL. Es el
 * documento que se entrega al cliente en tienda, con los datos del emisor,
 * los del comprador y el IVA desglosado por tarifa.
 *
 * Todos los datos salen de la factura ya emitida, no del pedido: la factura
 * congeló el NIT, la dirección y los precios del día en que se emitió, y ese
 * es exactamente el documento que debe reimprimirse mañana.
 *
 * El ancho de 80 mm es el del rollo térmico estándar de punto de venta.
 */

interface Factura {
  invoice_number: string;
  issued_at: string;
  issuer_name: string;
  issuer_nit: string | null;
  issuer_address: string | null;
  issuer_city: string | null;
  issuer_phone: string | null;
  issuer_regime: string | null;
  customer_name: string;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  subtotal_cop: string | number;
  discount_cop: string | number;
  taxable_base_cop: string | number;
  tax_cop: string | number;
  shipping_cop: string | number;
  total_cop: string | number;
  payment_method: string | null;
  footer: string | null;
  invoice_items: Array<{
    description: string;
    code: string | null;
    presentation: string | null;
    quantity: string | number;
    unit_price_cop: string | number;
    tax_rate: string | number;
    tax_cop: string | number;
    total_cop: string | number;
  }>;
}

const n = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const ReciboPOS: React.FC<{ facturaId: string; onCerrar: () => void }> = ({
  facturaId,
  onCerrar,
}) => {
  const [factura, setFactura] = useState<Factura | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase
        .from('invoices')
        .select(
          'invoice_number, issued_at, issuer_name, issuer_nit, issuer_address, issuer_city, ' +
            'issuer_phone, issuer_regime, customer_name, customer_document, customer_email, ' +
            'customer_phone, customer_address, customer_city, subtotal_cop, discount_cop, ' +
            'taxable_base_cop, tax_cop, shipping_cop, total_cop, payment_method, footer, ' +
            'invoice_items ( description, code, presentation, quantity, unit_price_cop, tax_rate, tax_cop, total_cop )'
        )
        .eq('id', facturaId)
        .maybeSingle();
      if (e || !data) {
        setError('No fue posible cargar la factura.');
        return;
      }
      setFactura(data as unknown as Factura);
    })();
  }, [facturaId]);

  // Agrupación del IVA por tarifa: la ley exige desglosarlo así cuando hay
  // productos con tarifas distintas en el mismo documento.
  const porTarifa = new Map<number, { base: number; iva: number }>();
  for (const it of factura?.invoice_items ?? []) {
    const t = n(it.tax_rate);
    const actual = porTarifa.get(t) ?? { base: 0, iva: 0 };
    porTarifa.set(t, {
      base: actual.base + (n(it.total_cop) - n(it.tax_cop)),
      iva: actual.iva + n(it.tax_cop),
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-6 recibo-overlay">
      {/* Al imprimir solo debe salir el recibo, no la aplicación entera. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .recibo-overlay, .recibo-overlay * { visibility: visible !important; }
          .recibo-overlay { position: absolute !important; inset: 0 !important;
            background: #fff !important; padding: 0 !important; display: block !important; }
          .recibo-acciones { display: none !important; }
          .recibo-hoja { box-shadow: none !important; border: none !important;
            width: 80mm !important; margin: 0 auto !important; }
        }
      `}</style>

      <div className="w-full max-w-[420px] my-6">
        <div className="recibo-acciones flex justify-between items-center mb-3">
          <Button variant="ghost" size="sm" onClick={onCerrar} leftIcon={<X className="w-3.5 h-3.5" />}>
            Cerrar
          </Button>
          <Button variant="pintuco" size="sm" onClick={() => window.print()}
            leftIcon={<Printer className="w-3.5 h-3.5" />}>
            Imprimir
          </Button>
        </div>

        <div className="recibo-hoja bg-white rounded-lg shadow-2xl p-6 font-mono text-[11px] text-slate-900 leading-relaxed">
          {error && <p className="text-center text-rose-600 py-8">{error}</p>}
          {!factura && !error && <p className="text-center text-slate-400 py-8">Cargando…</p>}

          {factura && (
            <>
              {/* Encabezado con el logotipo oficial */}
              <div className="text-center pb-3 border-b border-dashed border-slate-300">
                <img src={logoPintuco} alt="Pintuco" className="h-12 w-auto mx-auto mb-2 rounded" />
                <p className="font-bold text-sm tracking-tight">{factura.issuer_name}</p>
                {factura.issuer_nit && <p>NIT {factura.issuer_nit}</p>}
                {factura.issuer_address && <p>{factura.issuer_address}</p>}
                {factura.issuer_city && <p>{factura.issuer_city}</p>}
                {factura.issuer_phone && <p>Tel. {factura.issuer_phone}</p>}
                {factura.issuer_regime && <p className="mt-1 text-[10px]">{factura.issuer_regime}</p>}
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 text-center">
                <p className="font-bold tracking-wide">DOCUMENTO EQUIVALENTE POS</p>
                <p className="text-sm font-bold">{factura.invoice_number}</p>
                <p className="text-[10px]">
                  {new Date(factura.issued_at).toLocaleString('es-CO', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300">
                <p className="font-bold">CLIENTE</p>
                <p>{factura.customer_name}</p>
                {factura.customer_document && <p>NIT/CC {factura.customer_document}</p>}
                {factura.customer_phone && <p>Tel. {factura.customer_phone}</p>}
                {factura.customer_address && <p>{factura.customer_address}</p>}
                {factura.customer_city && <p>{factura.customer_city}</p>}
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-2">
                {factura.invoice_items.map((it, i) => (
                  <div key={i}>
                    <p className="font-bold">{it.description}</p>
                    {(it.presentation || it.code) && (
                      <p className="text-[10px] text-slate-500">
                        {[it.presentation, it.code].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <div className="flex justify-between">
                      <span>{n(it.quantity)} × {formatearCOP(n(it.unit_price_cop))}</span>
                      <span className="font-bold tabular-nums">{formatearCOP(n(it.total_cop))}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">IVA {n(it.tax_rate)}% incluido</p>
                  </div>
                ))}
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-0.5">
                <div className="flex justify-between">
                  <span>Base gravable</span>
                  <span className="tabular-nums">{formatearCOP(n(factura.taxable_base_cop))}</span>
                </div>
                {[...porTarifa.entries()].sort((a, b) => a[0] - b[0]).map(([tarifa, v]) => (
                  <div key={tarifa} className="flex justify-between">
                    <span>IVA {tarifa}%</span>
                    <span className="tabular-nums">{formatearCOP(v.iva)}</span>
                  </div>
                ))}
                {n(factura.discount_cop) > 0 && (
                  <div className="flex justify-between">
                    <span>Descuento</span>
                    <span className="tabular-nums">−{formatearCOP(n(factura.discount_cop))}</span>
                  </div>
                )}
                {n(factura.shipping_cop) > 0 && (
                  <div className="flex justify-between">
                    <span>Envío</span>
                    <span className="tabular-nums">{formatearCOP(n(factura.shipping_cop))}</span>
                  </div>
                )}
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300">
                <div className="flex justify-between text-sm font-bold">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{formatearCOP(n(factura.total_cop))}</span>
                </div>
                {factura.payment_method && (
                  <p className="text-[10px] mt-1">Forma de pago: {factura.payment_method}</p>
                )}
              </div>

              <div className="pt-3 text-center text-[10px] text-slate-600 space-y-1">
                {factura.footer && <p>{factura.footer}</p>}
                <p>
                  Cambios y devoluciones dentro de los 5 días hábiles
                  presentando este documento, según la Ley 1480 de 2011.
                </p>
                <p className="text-slate-400">Documento generado por ColorLink</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
