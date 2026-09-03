import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, CheckCircle2 } from 'lucide-react';
import { tesoreriaService, formatearCOP, type CuentaSaldo } from '../services/backoffice';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * Registrar una salida de dinero.
 *
 * Tesorería solo sabía cobrar: pagar un flete, un proveedor o un servicio se
 * anotaba fuera del sistema, y la caja del sistema decía más dinero del que
 * había.
 *
 * LA CONTRAPARTIDA ES OBLIGATORIA y no tiene valor por defecto. Un egreso no
 * dice por sí solo qué se pagó —un gasto de servicios, un abono a un
 * proveedor, una compra— y poner una cuenta fija metería todos los pagos en el
 * mismo renglón: el estado de resultados diría cualquier cosa. Es la misma
 * razón por la que el disparador contable deja pasar los egresos en lugar de
 * inventarles la contrapartida.
 */
export const RegistrarEgreso: React.FC<{
  cuentas: CuentaSaldo[];
  onCerrar: () => void;
  onRegistrado: () => void;
}> = ({ cuentas, onCerrar, onRegistrado }) => {
  const [contrapartidas, setContrapartidas] = useState<
    Array<{ codigo: string; nombre: string; clase: string }>
  >([]);
  const [form, setForm] = useState({
    cuenta: cuentas[0]?.id ?? '',
    monto: '',
    concepto: '',
    contrapartida: '',
    referencia: '',
    fecha: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<{
    saldoDespues: number; quedaEnNegativo: boolean; contrapartida: string;
  } | null>(null);

  useEffect(() => {
    tesoreriaService.cuentasParaEgreso()
      .then(setContrapartidas)
      .catch(() => setContrapartidas([]));
  }, []);

  const monto = Number(form.monto);
  const cuentaElegida = cuentas.find((c) => c.id === form.cuenta);
  const listo = form.cuenta !== '' && Number.isFinite(monto) && monto > 0
    && form.concepto.trim() !== '' && form.contrapartida !== '';

  /* Aviso ANTES de guardar: un egreso que deja la caja en negativo casi
     siempre es un cero de más al digitar. No se bloquea —una cuenta puede
     quedar en descubierto de verdad— pero se avisa. */
  const saldoPrevisto = (cuentaElegida?.saldo ?? 0) - (Number.isFinite(monto) ? monto : 0);
  const dejaNegativo = listo && saldoPrevisto < 0;

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || ocupado) return;
    setOcupado(true);
    setError('');
    try {
      setHecho(await tesoreriaService.registrarEgreso({
        cuentaId: form.cuenta,
        monto,
        concepto: form.concepto.trim(),
        contrapartida: form.contrapartida,
        referencia: form.referencia.trim() || undefined,
        fecha: form.fecha || undefined,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el egreso.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={hecho ? onRegistrado : onCerrar}
      title={hecho ? 'Egreso registrado' : 'Registrar egreso'}
      subtitle={hecho ? undefined : 'Una salida de dinero de caja o de un banco'}
      maxWidth="lg"
    >
      {hecho ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-px" />
            <div className="text-sm text-emerald-900">
              <p className="font-bold">Quedó registrado y asentado.</p>
              <p className="text-xs mt-1">Contrapartida: {hecho.contrapartida}</p>
              <p className="text-xs">Saldo de la cuenta: {formatearCOP(hecho.saldoDespues)}</p>
            </div>
          </div>
          {hecho.quedaEnNegativo && (
            <p className="p-3 rounded-lg text-xs font-medium bg-amber-50 border border-amber-200 text-amber-900">
              La cuenta quedó en negativo. Si no era lo esperado, revisa el valor.
            </p>
          )}
          <Button variant="pintuco" className="w-full" onClick={onRegistrado}>Entendido</Button>
        </div>
      ) : (
        <form onSubmit={registrar} className="space-y-4">
          {error && (
            <p role="alert" className="p-3 rounded-lg text-xs font-medium bg-rose-50
                                       border border-rose-200 text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-700">
              De qué cuenta sale
              <select
                value={form.cuenta}
                onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal
                           focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {formatearCOP(c.saldo)}
                  </option>
                ))}
              </select>
            </label>

            <Input
              label="Valor"
              type="number" min={1} step={100}
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              helperText={Number.isFinite(monto) && monto > 0 ? formatearCOP(monto) : undefined}
            />
          </div>

          <Input
            label="Concepto"
            value={form.concepto}
            onChange={(e) => setForm({ ...form, concepto: e.target.value })}
            placeholder="Ej.: flete de entrega Barranquilla"
          />

          <label className="block text-xs font-bold text-slate-700">
            Contra qué cuenta contable
            <select
              value={form.contrapartida}
              onChange={(e) => setForm({ ...form, contrapartida: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal
                         focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
            >
              <option value="">Elige la cuenta…</option>
              {contrapartidas.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400 font-normal">
              Qué se pagó: un gasto, un abono a proveedor, una compra. Caja y bancos
              no aparecen: mover dinero entre ellos es un traslado, no un egreso.
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Fecha"
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            />
            <Input
              label="Referencia (opcional)"
              value={form.referencia}
              onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              placeholder="N.º de comprobante o transferencia"
            />
          </div>

          {dejaNegativo && (
            <p className="p-3 rounded-lg text-xs font-medium bg-amber-50 border border-amber-200
                          text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              Con este egreso la cuenta queda en {formatearCOP(saldoPrevisto)}. Se puede
              guardar, pero revisa que el valor esté bien.
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" variant="pintuco" isLoading={ocupado} disabled={!listo}
              leftIcon={<ArrowDownCircle className="w-4 h-4" />}>
              Registrar egreso
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
