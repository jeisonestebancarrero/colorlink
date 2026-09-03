import React, { useCallback, useEffect, useState } from 'react';
import { Store, Check, Loader2, Globe, Lock } from 'lucide-react';
import { sedesService, type SedePermitida } from '../services/sedes';
import { Button } from '../components/common/Button';

/**
 * Sedes permitidas de un usuario interno.
 *
 * Es la configuración que hace que el dominio de sede signifique algo: sin
 * asignar nada, la persona ve las siete sedes, que es el estado actual de
 * todas las cuentas internas.
 *
 * SIN SEDES = TODAS, no "ninguna". Se eligió así porque el otro camino deja el
 * portal inservible el día del despliegue para todo el personal que ya existe.
 * El aviso de "sin restricción" está para que acotar sea una decisión
 * deliberada y no algo que se olvide.
 *
 * El administrador es la excepción: ve todas las sedes aunque se le asigne
 * una, porque nadie puede quedarse sin acceso a una sede por un error de
 * configuración. El panel lo dice en voz alta para no prometer lo que no hace.
 */

interface Props {
  userId: string;
  nombre: string;
  esAdministrador: boolean;
  onGuardado?: () => void;
}

export const SedesDelUsuarioPanel: React.FC<Props> = ({
  userId, nombre, esAdministrador, onGuardado,
}) => {
  const [sedes, setSedes] = useState<SedePermitida[]>([]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [inicial, setInicial] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [todas, asignaciones] = await Promise.all([
        sedesService.todas(),
        sedesService.asignacionesDe([userId]),
      ]);
      setSedes(todas);
      const actuales = new Set(asignaciones.get(userId) ?? []);
      setElegidas(actuales);
      setInicial(actuales);
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e instanceof Error ? e.message : 'No se pudieron cargar las sedes.',
      });
    } finally {
      setCargando(false);
    }
  }, [userId]);

  useEffect(() => { void cargar(); }, [cargar]);

  const alternar = (id: string) => {
    setMensaje(null);
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const hayCambios =
    elegidas.size !== inicial.size ||
    [...elegidas].some((id) => !inicial.has(id));

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      await sedesService.fijar(userId, [...elegidas]);
      setInicial(new Set(elegidas));
      setMensaje({
        tipo: 'ok',
        texto: elegidas.size === 0
          ? `${nombre} vuelve a ver todas las sedes.`
          : `${nombre} queda con ${elegidas.size} ${elegidas.size === 1 ? 'sede' : 'sedes'}.`,
      });
      onGuardado?.();
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e instanceof Error ? e.message : 'No fue posible guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <p className="text-xs text-slate-500 flex items-center gap-2 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando sedes…
      </p>
    );
  }

  const sinRestriccion = elegidas.size === 0;

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-[#004F9F]" /> Sedes permitidas
          </h4>
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5 max-w-md">
            Acota el inventario, las recepciones y los pedidos que esta persona
            puede ver y tocar. Lo hace cumplir la base de datos, no la pantalla.
          </p>
        </div>
        {hayCambios && (
          <Button
            variant="primary" size="sm"
            onClick={() => void guardar()}
            isLoading={guardando}
            className="bg-[#004F9F] text-white text-xs font-bold shrink-0"
          >
            Guardar
          </Button>
        )}
      </header>

      {esAdministrador && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Es <strong>administrador</strong>: seguirá viendo todas las sedes
            aunque aquí se le asignen unas pocas. Nadie puede quedarse sin
            acceso a una sede por un error de configuración.
          </span>
        </p>
      )}

      {sinRestriccion ? (
        <p className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-start gap-2">
          <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Sin restricción:</strong> ve las {sedes.length} sedes. Marca
            las que le correspondan para acotarla; desmarcar todas la devuelve a
            este estado.
          </span>
        </p>
      ) : (
        <p className="text-[11px] text-slate-600">
          Verá únicamente {elegidas.size} de {sedes.length} sedes.
        </p>
      )}

      <ul className="space-y-1.5">
        {sedes.map((s) => {
          const marcada = elegidas.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => alternar(s.id)}
                className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left
                            transition-colors cursor-pointer ${
                  marcada
                    ? 'border-[#004F9F] bg-blue-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${
                    marcada ? 'bg-[#004F9F] border-[#004F9F]' : 'bg-white border-slate-300'
                  }`}
                >
                  {marcada && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800">
                    {s.nombre}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {s.ciudad} · {s.direccion}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {mensaje && (
        <p
          role="alert"
          className={`text-[11px] font-medium rounded-lg p-2.5 border ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {mensaje.texto}
        </p>
      )}
    </div>
  );
};
