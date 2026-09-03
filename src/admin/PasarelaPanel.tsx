import React, { useEffect, useState } from 'react';
import {
  CreditCard, AlertTriangle, CheckCircle2, ShieldCheck, KeyRound,
  FlaskConical, Radio, ExternalLink,
} from 'lucide-react';
import { pasarelaService, type EstadoPasarela } from '../services/pasarelaAdmin';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * Pasarela de pagos.
 *
 * Estas dos funciones (`estado_pasarela`, `configurar_pasarela`) llevaban
 * tiempo en la base sin pantalla. Cargar las llaves de Wompi o apagar el modo
 * prueba obligaba a entrar a la base a mano, que es justo lo que no puede
 * hacer quien administra el negocio el día del despliegue.
 *
 * LOS SECRETOS NO SE MUESTRAN. `estado_pasarela` solo informa si están puestos:
 * devolverlos los filtraría a cualquiera que abra la consola del navegador. Es
 * el mismo trato que la contraseña del correo saliente — campo vacío significa
 * «conserva la que hay», no «bórrala».
 *
 * El punto delicado es el MODO PRUEBA: aprueba el cobro sin cobrar. Sirve para
 * ensayar el flujo completo, y es exactamente lo que está activo hoy. Si sale a
 * producción así, los pedidos se confirman y el dinero nunca llega, sin que
 * ningún error lo delate. De ahí que el aviso sea del tamaño que es.
 */

const AYUDA_WOMPI = 'https://docs.wompi.co/docs/colombia/inicio-rapido/';

export const PasarelaPanel: React.FC = () => {
  const [estado, setEstado] = useState<EstadoPasarela | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [activa, setActiva] = useState(false);
  const [prueba, setPrueba] = useState(true);
  const [llavePublica, setLlavePublica] = useState('');
  const [integridad, setIntegridad] = useState('');
  const [eventos, setEventos] = useState('');
  /** Segunda confirmación para pasar a cobrar de verdad. */
  const [confirmaReal, setConfirmaReal] = useState(false);

  const aplicar = (e: EstadoPasarela) => {
    setEstado(e);
    setActiva(e.activa);
    setPrueba(e.prueba);
    setLlavePublica(e.llavePublica ?? '');
    setIntegridad('');
    setEventos('');
    setConfirmaReal(false);
  };

  useEffect(() => {
    (async () => {
      try {
        aplicar(await pasarelaService.estado());
      } catch (err) {
        setAviso({
          tipo: 'error',
          texto: err instanceof Error ? err.message : 'No fue posible leer la configuración.',
        });
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  /** Va a empezar a cobrar de verdad en este guardado. */
  const pasaARealAhora = estado !== null && estado.prueba && !prueba && activa;

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAviso(null);

    if (pasaARealAhora && !confirmaReal) {
      return setAviso({
        tipo: 'error',
        texto: 'Marca la confirmación: a partir de ese momento se le cobra de verdad al cliente.',
      });
    }

    setGuardando(true);
    try {
      aplicar(await pasarelaService.guardar({
        activa, prueba,
        llavePublica,
        secretoIntegridad: integridad,
        secretoEventos: eventos,
      }));
      setAviso({ tipo: 'ok', texto: 'Configuración de la pasarela guardada.' });
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  const marca = (ok: boolean, si: string, no: string) => (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
      ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
         : 'bg-amber-50 text-amber-800 border-amber-200'
    }`}>
      {ok ? si : no}
    </span>
  );

  return (
    <form
      onSubmit={guardar}
      className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5"
    >
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 flex-wrap">
        <CreditCard className="w-4 h-4 text-[#004F9F]" />
        <h2 className="text-base font-extrabold text-slate-900">Pasarela de pagos</h2>
        {marca(!!estado?.activa, 'Activa', 'Apagada')}
        {estado?.prueba
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
              <FlaskConical className="w-3 h-3" /> Modo prueba
            </span>
          : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
              <Radio className="w-3 h-3" /> Cobro real
            </span>}
      </div>

      {aviso && (
        <div className={`p-3.5 rounded-lg text-xs font-medium border flex items-start gap-2 ${
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

      {/* El estado que más importa entender, dicho sin rodeos. */}
      {estado?.prueba && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-start gap-2">
          <FlaskConical className="w-4 h-4 shrink-0 mt-px" />
          <span>
            <strong>En modo prueba el cobro se aprueba sin cobrar.</strong> El pedido queda
            pagado en el sistema y el dinero no entra. Sirve para ensayar todo el
            recorrido; si el sistema sale a producción así, nada avisa del error.
          </span>
        </div>
      )}

      {/* ---- Interruptores ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#004F9F] cursor-pointer"
          />
          <span>
            <span className="block text-xs font-bold text-slate-800">Aceptar pagos en línea</span>
            <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
              Apagada, el cliente no ve el botón de pagar y el pedido queda pendiente
              de pago por otro medio.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={prueba}
            onChange={(e) => setPrueba(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-600 cursor-pointer"
          />
          <span>
            <span className="block text-xs font-bold text-slate-800">Modo prueba</span>
            <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
              Aprueba sin cobrar. Desmárcalo únicamente cuando las llaves de
              producción de Wompi estén cargadas.
            </span>
          </span>
        </label>
      </div>

      {/* ---- Llaves ---- */}
      <div className="pt-4 border-t border-slate-100 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800">Llaves de Wompi</h3>
          <a
            href={AYUDA_WOMPI} target="_blank" rel="noopener noreferrer"
            className="text-[11px] font-semibold text-[#004F9F] hover:underline flex items-center gap-1"
          >
            Dónde encontrarlas <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 font-medium flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-px text-slate-400" />
          <span>
            Los dos secretos <strong>no se muestran de vuelta</strong>, ni aquí ni en
            ninguna consulta: solo si están puestos. Deja el campo vacío para conservar
            el que ya está guardado.
          </span>
        </div>

        <Input
          label="Llave pública"
          value={llavePublica}
          onChange={(e) => setLlavePublica(e.target.value)}
          placeholder="pub_prod_… o pub_test_…"
          helperText="Viaja al navegador por diseño; no es un secreto."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Secreto de integridad"
            type="password"
            value={integridad}
            onChange={(e) => setIntegridad(e.target.value)}
            placeholder={estado?.tieneIntegridad
              ? 'Guardado — déjalo vacío para conservarlo'
              : 'prod_integrity_…'}
            helperText={estado?.tieneIntegridad ? 'Configurado' : 'Sin configurar'}
          />
          <Input
            label="Secreto de eventos"
            type="password"
            value={eventos}
            onChange={(e) => setEventos(e.target.value)}
            placeholder={estado?.tieneEventos
              ? 'Guardado — déjalo vacío para conservarlo'
              : 'prod_events_…'}
            helperText={estado?.tieneEventos
              ? 'Configurado'
              : 'Sin él no se puede verificar la notificación de pago'}
          />
        </div>
      </div>

      {/* Segunda confirmación: es el cambio con consecuencias sobre dinero real. */}
      {pasaARealAhora && (
        <label className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-300 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmaReal}
            onChange={(e) => setConfirmaReal(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-rose-600 cursor-pointer"
          />
          <span className="text-xs text-rose-900 font-semibold leading-snug">
            Entiendo que al guardar se empieza a <strong>cobrar de verdad</strong> a
            quien compre, con las llaves cargadas arriba.
          </span>
        </label>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" variant="pintuco" isLoading={guardando}>
          Guardar pasarela
        </Button>
      </div>
    </form>
  );
};
