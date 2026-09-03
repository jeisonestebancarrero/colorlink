import React, { useEffect, useState } from 'react';
import {
  Bot, AlertTriangle, CheckCircle2, KeyRound, ExternalLink, ShieldCheck, Sparkles,
} from 'lucide-react';
import { asistenteService, type EstadoAsistente } from '../services/pasarelaAdmin';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * Asistente de la tienda: con reglas o con un modelo de lenguaje.
 *
 * Lo que hay que dejar claro en pantalla, porque cuesta dinero real:
 *
 *   · **ChatGPT Plus no sirve.** Plus es la suscripción para usar el chat en
 *     el navegador; no da acceso a la API. Hace falta una llave de
 *     `platform.openai.com`, que se factura aparte y por uso. Es la confusión
 *     más común y descubrirla después de montar todo es una pérdida de tiempo.
 *   · **Se paga por consulta.** No es una tarifa plana. Por eso se puede
 *     apagar sin desmontar nada.
 *   · **Sin IA el asistente sigue funcionando.** Responde con reglas: consulta
 *     pedidos, catálogo y tiendas. La IA mejora la redacción y entiende
 *     preguntas escritas de cualquier forma; no es de lo que depende.
 */

const AYUDA_LLAVE = 'https://platform.openai.com/api-keys';

/** Modelos habituales, del más barato al más capaz. */
const MODELOS = [
  { id: 'gpt-4o-mini', nota: 'El más barato. Suficiente para responder con datos dados.' },
  { id: 'gpt-4o', nota: 'Entiende mejor preguntas enredadas. Cuesta bastante más.' },
  { id: 'gpt-4.1-mini', nota: 'Equilibrio entre costo y comprensión.' },
];

export const AsistentePanel: React.FC = () => {
  const [estado, setEstado] = useState<EstadoAsistente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [activa, setActiva] = useState(false);
  const [modelo, setModelo] = useState('gpt-4o-mini');
  const [llave, setLlave] = useState('');

  const aplicar = (e: EstadoAsistente) => {
    setEstado(e);
    setActiva(e.activa);
    setModelo(e.modelo || 'gpt-4o-mini');
    setLlave('');
  };

  useEffect(() => {
    asistenteService.estado()
      .then(aplicar)
      .catch((e) => setAviso({
        tipo: 'error',
        texto: e instanceof Error ? e.message : 'No fue posible leer la configuración.',
      }))
      .finally(() => setCargando(false));
  }, []);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAviso(null);
    setGuardando(true);
    try {
      aplicar(await asistenteService.guardar({ activa, modelo, llave }));
      setAviso({ tipo: 'ok', texto: 'Configuración del asistente guardada.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No fue posible guardar.' });
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

  return (
    <form onSubmit={guardar} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 flex-wrap">
        <Bot className="w-4 h-4 text-[#004F9F]" />
        <h2 className="text-base font-extrabold text-slate-900">Asistente de la tienda</h2>
        {estado?.activa
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Con IA
            </span>
          : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Con reglas
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

      {/* El malentendido que hay que evitar de entrada. */}
      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-px" />
        <div className="text-xs text-amber-900 font-medium leading-snug space-y-1">
          <p>
            <strong>Una suscripción a ChatGPT Plus no sirve aquí.</strong> Plus es para
            usar el chat en el navegador; no da acceso a la API.
          </p>
          <p>
            Hace falta una llave de <code className="font-mono">platform.openai.com</code>,
            que se factura <strong>aparte y por consulta</strong>. Es una cuenta distinta
            de la de Plus.
          </p>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-px text-slate-400" />
        <span>
          Sin IA el asistente <strong>sigue funcionando</strong>: responde consultando
          pedidos, catálogo y tiendas, y pasa a una persona cuando no sabe. La IA
          mejora la redacción y entiende preguntas escritas de cualquier forma.
          El modelo nunca inventa cifras: solo redacta con los datos que el sistema
          le entrega.
        </span>
      </div>

      <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
        <input
          type="checkbox"
          checked={activa}
          onChange={(e) => setActiva(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#004F9F] cursor-pointer"
        />
        <span>
          <span className="block text-xs font-bold text-slate-800">Redactar con IA</span>
          <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
            Se cobra por consulta. Si el proveedor falla o se queda sin cupo, el
            asistente vuelve solo a las reglas sin mostrarle un error al cliente.
          </span>
        </span>
      </label>

      <div className="pt-4 border-t border-slate-100 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800">Llave del proveedor</h3>
          <a
            href={AYUDA_LLAVE} target="_blank" rel="noopener noreferrer"
            className="text-[11px] font-semibold text-[#004F9F] hover:underline flex items-center gap-1"
          >
            Crear una llave <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <Input
          label="Llave de API"
          type="password"
          value={llave}
          onChange={(e) => setLlave(e.target.value)}
          placeholder={estado?.tieneLlave
            ? 'Guardada — déjala vacía para conservarla'
            : 'sk-…'}
          helperText={estado?.tieneLlave
            ? `Configurada${estado.configuradaEn
                ? ' el ' + new Date(estado.configuradaEn).toLocaleDateString('es-CO')
                : ''}. No se puede volver a leer.`
            : 'Se guarda en el servidor y nunca viaja al navegador.'}
        />

        <label className="block text-xs font-bold text-slate-700">
          Modelo
          <select
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal
                       focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
          >
            {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
          </select>
          <span className="text-[11px] text-slate-400 font-normal">
            {MODELOS.find((m) => m.id === modelo)?.nota
              ?? 'Se puede cambiar sin desplegar: los modelos cambian seguido.'}
          </span>
        </label>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" variant="pintuco" isLoading={guardando}>
          Guardar asistente
        </Button>
      </div>
    </form>
  );
};
