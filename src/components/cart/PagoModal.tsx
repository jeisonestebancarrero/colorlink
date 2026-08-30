import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, CreditCard, Landmark, Loader2, Lock, X,
} from 'lucide-react';
import {
  pagoService, MEDIOS_PAGO, type CondicionesPago, type IntencionPago,
} from '../../services/pagos';

/**
 * Pago del pedido.
 *
 * Se abre apenas el pedido queda creado, porque el pedido todavía no es una
 * venta: hasta que el cobro no se confirma, nadie alista nada. El servidor lo
 * hace cumplir —un pedido sin cobro no puede pasar de PENDIENTE—, así que esta
 * pantalla no es una formalidad que se pueda saltar cerrando la ventana.
 *
 * Dos caminos, según quién compra:
 *   · Particular o empresa de contado → paga ahora por la pasarela.
 *   · Empresa con crédito aprobado → confirma contra su cupo y paga después.
 */
export const PagoModal: React.FC<{
  orderId: string;
  orderNumber: string;
  total: number;
  onListo: (pagado: boolean) => void;
  onCerrar: () => void;
}> = ({ orderId, orderNumber, total, onListo, onCerrar }) => {
  const [condiciones, setCondiciones] = useState<CondicionesPago | null>(null);
  const [config, setConfig] = useState<{ activa: boolean; prueba: boolean } | null>(null);
  const [medio, setMedio] = useState<string>('PSE');
  const [aCredito, setACredito] = useState(false);
  const [intencion, setIntencion] = useState<IntencionPago | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState<'PAGADO' | 'CREDITO' | null>(null);

  const cop = (n: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(n);

  useEffect(() => {
    (async () => {
      try {
        const [c, k] = await Promise.all([
          pagoService.condiciones(),
          pagoService.configuracion(),
        ]);
        setCondiciones(c);
        setConfig(k);
        // El crédito viene marcado por defecto cuando existe y alcanza: es la
        // forma en que estas empresas compran habitualmente.
        if (c.aCredito && (c.disponible ?? 0) >= total) setACredito(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No fue posible cargar las opciones de pago.');
      } finally {
        setCargando(false);
      }
    })();
  }, [total]);

  const pagar = async () => {
    setProcesando(true);
    setError('');
    try {
      const i = await pagoService.iniciar(orderId, aCredito ? 'CREDITO' : medio);
      setIntencion(i);

      if (i.modo === 'CREDITO') {
        setListo('CREDITO');
        onListo(true);
        return;
      }

      if (i.modo === 'WOMPI' && i.llavePublica && i.firma) {
        // Con credenciales reales se entrega el control a Wompi. La vuelta la
        // da el webhook, no el navegador.
        const form = document.createElement('form');
        form.method = 'GET';
        form.action = 'https://checkout.wompi.co/p/';
        const campos: Record<string, string> = {
          'public-key': i.llavePublica,
          currency: i.moneda ?? 'COP',
          'amount-in-cents': String(i.centavos ?? 0),
          reference: i.referencia ?? '',
          'signature:integrity': i.firma,
          'redirect-url': `${window.location.origin}/mis-pedidos`,
        };
        for (const [k, v] of Object.entries(campos)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }

      // Modo prueba: sin credenciales, se aprueba localmente para poder
      // recorrer el flujo completo hasta la contabilidad.
      const r = await pagoService.simular(orderId, true);
      if (r === 'PAGADO') {
        setListo('PAGADO');
        onListo(true);
      } else {
        setError('El pago fue rechazado. Intenta con otro medio.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible procesar el pago.');
    } finally {
      setProcesando(false);
    }
  };

  const puedeCredito = condiciones?.aCredito && (condiciones.disponible ?? 0) >= total;

  return (
    <div className="fixed inset-0 z-70 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 my-8">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-[#004F9F]/10 text-[#004F9F] flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                {listo ? 'Pedido confirmado' : 'Pagar pedido'}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">{orderNumber}</p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total a pagar
            </span>
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{cop(total)}</span>
          </div>

          {cargando ? (
            <p className="text-sm text-slate-400 text-center py-8">Cargando opciones…</p>
          ) : listo === 'PAGADO' ? (
            <div className="text-center py-6 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">Recibimos tu pago</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tu pedido pasó a alistamiento. Puedes seguir su avance en Mis Pedidos.
              </p>
            </div>
          ) : listo === 'CREDITO' ? (
            <div className="text-center py-6 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">Pedido a crédito confirmado</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Queda cargado al cupo de {condiciones?.empresa}. La factura vence el{' '}
                <strong>{intencion?.vence}</strong>.
              </p>
            </div>
          ) : (
            <>
              {condiciones?.aCredito && (
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    aCredito ? 'border-[#004F9F] bg-[#004F9F]/5' : 'border-slate-200 hover:bg-slate-50'
                  } ${!puedeCredito ? 'opacity-60' : ''}`}
                >
                  <input
                    type="radio"
                    name="forma-pago"
                    checked={aCredito}
                    disabled={!puedeCredito}
                    onChange={() => setACredito(true)}
                    className="mt-0.5 text-[#004F9F] focus:ring-[#004F9F]"
                  />
                  <span className="text-xs leading-relaxed flex-1">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      Pagar a crédito ({condiciones.dias} días)
                    </span>
                    <span className="text-slate-500 block mt-0.5">
                      Cupo de {condiciones.empresa}: {cop(condiciones.disponible ?? 0)} disponibles
                      de {cop(condiciones.cupo ?? 0)}.
                    </span>
                    {!puedeCredito && (
                      <span className="text-rose-600 font-semibold block mt-1">
                        El pedido supera el cupo disponible. Debes pagarlo ahora.
                      </span>
                    )}
                  </span>
                </label>
              )}

              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                  !aCredito ? 'border-[#004F9F] bg-[#004F9F]/5' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="forma-pago"
                  checked={!aCredito}
                  onChange={() => setACredito(false)}
                  className="mt-0.5 text-[#004F9F] focus:ring-[#004F9F]"
                />
                <span className="text-xs leading-relaxed flex-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Pagar ahora
                  </span>
                  <span className="text-slate-500 block mt-0.5">
                    {condiciones?.aCredito
                      ? 'Sin afectar el cupo de la empresa.'
                      : 'Tu pedido entra a alistamiento apenas se confirme el pago.'}
                  </span>
                </span>
              </label>

              {!aCredito && (
                <div className="pl-2 space-y-1.5">
                  <label
                    htmlFor="medio-pago"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    Medio de pago
                  </label>
                  <select
                    id="medio-pago"
                    value={medio}
                    onChange={(e) => setMedio(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20"
                  >
                    {MEDIOS_PAGO.map((m) => (
                      <option key={m.valor} value={m.valor}>{m.texto}</option>
                    ))}
                  </select>
                </div>
              )}

              {config?.prueba && !aCredito && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 font-medium leading-relaxed flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>
                    <strong>Modo de prueba.</strong> No se cobra dinero real: el pago se aprueba
                    para poder recorrer el flujo. Al conectar las llaves de Wompi hay que apagarlo
                    en Configuración.
                  </span>
                </p>
              )}

              {error && (
                <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 font-medium">
                  {error}
                </p>
              )}

              <button
                onClick={pagar}
                disabled={procesando}
                className="w-full bg-[#004F9F] hover:bg-[#003B77] disabled:opacity-60 text-white font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
              >
                {procesando ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
                ) : aCredito ? (
                  <><Building2 className="w-4 h-4" /> Confirmar a crédito</>
                ) : (
                  <><Landmark className="w-4 h-4" /> Pagar {cop(total)}</>
                )}
              </button>

              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                Si cierras esta ventana el pedido queda guardado sin pagar y no se alista. Puedes
                retomarlo desde Mis Pedidos.
              </p>
            </>
          )}

          {listo && (
            <button
              onClick={onCerrar}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl py-3 transition-colors"
            >
              Entendido
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
