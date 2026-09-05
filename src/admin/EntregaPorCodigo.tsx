import React, { useState } from 'react';
import { QrCode, CheckCircle2, AlertTriangle } from 'lucide-react';
import { despachoService } from '../services/backoffice';
import { Button } from '../components/common/Button';

/**
 * Entregar un pedido de retiro en tienda verificando su código.
 *
 * El código se le daba al cliente, viajaba en el correo y se imprimía en la
 * ficha… y no se comprobaba en ninguna parte: el pedido se daba por entregado
 * pulsando un botón. Es decir, el código era decorativo y cualquiera podía
 * llevarse la mercancía diciendo un número de pedido.
 *
 * Aquí se invierte el orden: se escribe lo que trae el cliente y el sistema
 * decide. Quien atiende no elige el pedido, y por eso no puede equivocarse de
 * pedido.
 *
 * Va en Despacho porque es donde está quien entrega, no en la ficha del pedido:
 * en el mostrador nadie busca primero el pedido en una lista, tiene al cliente
 * enfrente con un código en la mano.
 */
export const EntregaPorCodigo: React.FC<{ onEntregado?: () => void }> = ({ onEntregado }) => {
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<
    { ok: true; numero: string; recibe: string | null } | { ok: false; texto: string } | null
  >(null);

  const entregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    setResultado(null);
    setOcupado(true);
    try {
      const r = await despachoService.entregarPorCodigo(codigo);
      setResultado({ ok: true, numero: r.numero, recibe: r.recibe });
      setCodigo('');
      onEntregado?.();
    } catch (err) {
      setResultado({ ok: false, texto: err instanceof Error ? err.message : 'No fue posible entregar.' });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form onSubmit={entregar} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
      <div className="flex items-center gap-2 mb-1">
        <QrCode className="w-5 h-5 text-[#004F9F]" />
        <h2 className="text-base font-bold text-slate-800">Entregar retiro en tienda</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        Escribe el código que trae el cliente. Si corresponde a un pedido listo
        en esta sede, se marca como entregado.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={codigo}
          onChange={(ev) => setCodigo(ev.target.value.toUpperCase())}
          placeholder="DAC825"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 px-4 py-3 rounded-xl border border-slate-300 bg-white text-lg font-mono font-bold
                     tracking-[0.25em] uppercase text-slate-900 placeholder:text-slate-300
                     placeholder:tracking-normal placeholder:font-sans placeholder:text-sm
                     focus:outline-none focus:ring-2 focus:ring-[#004F9F]/25 focus:border-[#004F9F]"
        />
        <Button type="submit" variant="pintuco" isLoading={ocupado} disabled={!codigo.trim()}>
          Entregar
        </Button>
      </div>

      {resultado && (
        <div
          className={`mt-3 flex items-start gap-2 p-3 rounded-lg text-xs font-medium ${
            resultado.ok
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {resultado.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          {resultado.ok ? (
            <span>
              Entregado <strong>{resultado.numero}</strong>
              {resultado.recibe ? <> — recibió <strong>{resultado.recibe}</strong>.</> : '.'}{' '}
              Verifica el documento antes de despedir al cliente.
            </span>
          ) : (
            <span>{resultado.texto}</span>
          )}
        </div>
      )}
    </form>
  );
};
