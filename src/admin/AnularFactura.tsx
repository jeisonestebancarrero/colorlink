import React, { useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2 } from 'lucide-react';
import { facturaService, type FacturaLista, formatearCOP } from '../services/backoffice';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';

/**
 * Anular una factura.
 *
 * Se pide el motivo por escrito, y no es burocracia: una factura anulada sin
 * explicación es lo primero que pregunta una auditoría, y meses después nadie
 * recuerda por qué. La base rechaza un motivo de una palabra suelta.
 *
 * Se advierte de lo que pasa DESPUÉS, porque anular no es deshacer:
 *   · El número de factura NO se reutiliza. La numeración tiene que ser
 *     continua; una factura anulada sigue existiendo, marcada.
 *   · El asiento contable se REVERSA con un asiento contrario, no se borra.
 *   · El inventario no se mueve. La salida física la manda el pedido, así que
 *     si además hay que devolver la mercancía, se hace desde ahí.
 */
export const AnularFactura: React.FC<{
  factura: FacturaLista;
  onCerrar: () => void;
  onAnulada: () => void;
}> = ({ factura, onCerrar, onAnulada }) => {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<{ numero: string; asientoRevertido: boolean } | null>(null);

  /** El mismo mínimo que exige la base, para avisar antes de enviar. */
  const MINIMO = 10;
  const corto = motivo.trim().length > 0 && motivo.trim().length < MINIMO;
  const listo = motivo.trim().length >= MINIMO;

  const anular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || ocupado) return;
    setOcupado(true);
    setError('');
    try {
      setHecho(await facturaService.anular(factura.id, motivo.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible anular la factura.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={hecho ? onAnulada : onCerrar}
      title={hecho ? 'Factura anulada' : `Anular ${factura.numero}`}
      subtitle={hecho ? undefined : 'Esta acción queda registrada y no se deshace'}
      maxWidth="md"
    >
      {hecho ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-px" />
            <div className="text-sm text-emerald-900">
              <p className="font-bold">{hecho.numero} quedó anulada.</p>
              <p className="text-xs mt-1">
                {hecho.asientoRevertido
                  ? 'Se generó el asiento contrario en contabilidad.'
                  : 'No tenía asiento contable que reversar.'}
              </p>
            </div>
          </div>
          <Button variant="pintuco" className="w-full" onClick={onAnulada}>Entendido</Button>
        </div>
      ) : (
        <form onSubmit={anular} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <p className="flex justify-between"><span className="text-slate-500">Cliente</span>
              <span className="font-bold text-slate-800">{factura.cliente}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Pedido</span>
              <span className="font-semibold text-slate-700">{factura.pedido}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Total</span>
              <span className="font-extrabold text-slate-900">{formatearCOP(factura.total)}</span></p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-px" />
            <ul className="text-[11px] text-amber-900 font-medium leading-snug space-y-1">
              <li>El número <strong>{factura.numero}</strong> no se reutiliza: la numeración
                tiene que ser continua.</li>
              <li>El asiento contable se reversa con un asiento contrario; no se borra.</li>
              <li>El inventario no se mueve. Si hay que devolver mercancía, se hace
                desde el pedido.</li>
            </ul>
          </div>

          {error && (
            <p role="alert" className="p-3 rounded-lg text-xs font-medium bg-rose-50
                                       border border-rose-200 text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}
            </p>
          )}

          <label className="block">
            <span className="text-xs font-bold text-slate-700">Motivo de la anulación</span>
            <textarea
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value)}
              rows={3}
              autoFocus
              placeholder="Ej.: se facturó al cliente equivocado por error de digitación"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none
                         focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
            />
            <span className={`text-[11px] ${corto ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
              {corto
                ? `Explica qué pasó: al menos ${MINIMO} caracteres.`
                : 'Queda guardado con tu nombre y la fecha.'}
            </span>
          </label>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" variant="danger" isLoading={ocupado} disabled={!listo}
              leftIcon={<Ban className="w-4 h-4" />}>
              Anular factura
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
