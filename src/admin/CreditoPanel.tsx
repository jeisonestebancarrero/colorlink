import React, { useEffect, useState } from 'react';
import {
  Landmark, AlertTriangle, CheckCircle2, Loader2, CalendarClock, Wallet,
} from 'lucide-react';
import { pasarelaService, type CreditoEmpresa } from '../services/pasarelaAdmin';
import { accesoService } from '../services/admin';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * Cupo de crédito de una empresa.
 *
 * `fijar_credito_empresa` estaba en la base sin pantalla, así que aprobarle
 * crédito a una constructora había que hacerlo entrando a la base. En un
 * negocio de materiales eso pasa todas las semanas, y es una decisión
 * comercial, no técnica.
 *
 * Lo que la base exige y aquí se explica antes de que lo rechace:
 *   · el plazo va entre 1 y 180 días;
 *   · un crédito sin cupo no sirve de nada, así que el cupo tiene que ser > 0;
 *   · solo un administrador puede cambiarlo, y queda en la bitácora
 *     (`audit_logs`, acción `COMPANY_CREDIT`).
 *
 * Se muestra además EL SALDO PENDIENTE. Aprobar un cupo por debajo de lo que
 * la empresa ya debe le bloquea los pedidos sin que nadie entienda por qué:
 * quien aprueba tiene que ver las dos cifras juntas.
 */

interface Props {
  companyId: string;
  /** Para no volver a pedir el nombre a la base: lo tiene la pantalla padre. */
  nombre?: string;
}

const pesos = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const CreditoPanel: React.FC<Props> = ({ companyId }) => {
  const [datos, setDatos] = useState<CreditoEmpresa | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [aCredito, setACredito] = useState(false);
  const [dias, setDias] = useState('30');
  const [cupo, setCupo] = useState('0');

  const aplicar = (d: CreditoEmpresa) => {
    setDatos(d);
    setACredito(d.aCredito);
    // Si nunca tuvo crédito, 30 días es el valor por defecto de la base.
    setDias(String(d.dias > 0 ? d.dias : 30));
    setCupo(String(d.cupo > 0 ? d.cupo : ''));
  };

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    (async () => {
      try {
        const [d, acceso] = await Promise.all([
          pasarelaService.credito(companyId),
          accesoService.miAcceso(),
        ]);
        if (!vigente) return;
        setEsAdmin(acceso.isAdmin);
        if (d) aplicar(d);
      } catch (err) {
        if (vigente) {
          setAviso({
            tipo: 'error',
            texto: err instanceof Error ? err.message : 'No fue posible leer la condición de pago.',
          });
        }
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [companyId]);

  const nDias = Number(dias);
  const nCupo = Number(cupo);
  const saldo = datos?.saldo ?? 0;

  /** Validación local, con el mismo criterio que la base. */
  const problema = (): string | null => {
    if (!aCredito) return null;
    if (!Number.isFinite(nDias) || nDias < 1 || nDias > 180) {
      return 'El plazo debe estar entre 1 y 180 días.';
    }
    if (!Number.isFinite(nCupo) || nCupo <= 0) {
      return 'Un crédito sin cupo no sirve de nada: pon el monto aprobado.';
    }
    return null;
  };

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const mal = problema();
    if (mal) return setAviso({ tipo: 'error', texto: mal });

    setAviso(null);
    setGuardando(true);
    try {
      // Con crédito apagado la base ignora plazo y cupo; se manda lo que hay
      // para no borrar la última condición aprobada.
      await pasarelaService.fijarCredito(
        companyId,
        aCredito,
        aCredito ? nDias : (datos?.dias || 30),
        aCredito ? nCupo : (datos?.cupo || 0),
      );
      const d = await pasarelaService.credito(companyId);
      if (d) aplicar(d);
      setAviso({
        tipo: 'ok',
        texto: aCredito
          ? `Crédito aprobado: ${pesos(nCupo)} a ${nDias} días.`
          : 'Esta empresa queda en pago de contado.',
      });
    } catch (err) {
      setAviso({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'No fue posible guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Condición de pago…
        </p>
      </section>
    );
  }

  const cupoQuedaCorto = aCredito && nCupo > 0 && saldo > nCupo;
  const disponible = Math.max(0, (datos?.cupo ?? 0) - saldo);

  return (
    <form
      onSubmit={guardar}
      className="bg-white border border-slate-200 rounded-xl p-4 space-y-4"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Landmark className="w-4 h-4 text-[#004F9F]" />
        <h3 className="text-sm font-bold text-slate-900">Condición de pago</h3>
        {datos?.aCredito
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
              Crédito · {datos.dias} días
            </span>
          : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Contado
            </span>}
      </div>

      {/* Las dos cifras que hay que ver juntas para decidir. */}
      {datos?.aCredito && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cupo aprobado</p>
            <p className="text-sm font-extrabold text-slate-900 mt-0.5">{pesos(datos.cupo)}</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Debe hoy</p>
            <p className={`text-sm font-extrabold mt-0.5 ${saldo > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {pesos(saldo)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Disponible</p>
            <p className={`text-sm font-extrabold mt-0.5 ${disponible === 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {pesos(disponible)}
            </p>
          </div>
        </div>
      )}

      {aviso && (
        <div className={`p-3 rounded-lg text-xs font-medium border flex items-start gap-2 ${
          aviso.tipo === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {aviso.tipo === 'ok'
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
          {aviso.texto}
        </div>
      )}

      {!esAdmin ? (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
          Solo un administrador puede cambiar la condición de pago de un cliente.
        </p>
      ) : (
        <>
          <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={aCredito}
              onChange={(e) => setACredito(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#004F9F] cursor-pointer"
            />
            <span>
              <span className="block text-xs font-bold text-slate-800">Vender a crédito</span>
              <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
                Apagado, esta empresa paga de contado y sus pedidos no avanzan
                sin pago.
              </span>
            </span>
          </label>

          {aCredito && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Plazo en días"
                type="number" min={1} max={180}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                leftIcon={<CalendarClock className="w-4 h-4" />}
                helperText="Entre 1 y 180. Lo habitual son 30."
              />
              <Input
                label="Cupo aprobado (COP)"
                type="number" min={1} step={1000}
                value={cupo}
                onChange={(e) => setCupo(e.target.value)}
                leftIcon={<Wallet className="w-4 h-4" />}
                helperText={nCupo > 0 ? pesos(nCupo) : 'Tiene que ser mayor que cero.'}
              />
            </div>
          )}

          {cupoQuedaCorto && (
            <div className="p-3 rounded-lg text-xs font-medium border bg-amber-50 border-amber-200 text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span>
                Esta empresa ya debe <strong>{pesos(saldo)}</strong>, más que el cupo
                que vas a aprobar. Se puede guardar, pero sus pedidos quedarán
                bloqueados hasta que abone.
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="pintuco" size="sm" isLoading={guardando}>
              Guardar condición de pago
            </Button>
          </div>
        </>
      )}
    </form>
  );
};
