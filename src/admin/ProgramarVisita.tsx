import React, { useEffect, useState } from 'react';
import { CalendarClock, Clock, MapPin, UserCog } from 'lucide-react';
import { visitaService } from '../services/proyectosBackoffice';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { useSedes } from './SedeContext';

/** Programar visita. Asignar técnico también lo asigna al proyecto: RLS solo le muestra sus proyectos. */
export const ProgramarVisita: React.FC<{
  projectId: string;
  direccionSugerida?: string | null;
  solicitudes?: Array<{ id: string; tipo: string; estado: string }>;
  onCerrar: () => void;
  onProgramada: () => void;
}> = ({ projectId, direccionSugerida, solicitudes = [], onCerrar, onProgramada }) => {
  const { permitidas } = useSedes();
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [direccion, setDireccion] = useState(direccionSugerida ?? '');
  const [assistanceId, setAssistanceId] = useState('');
  /** Vacío: el servidor la deduce por la ciudad del proyecto; si no hay tienda allí, queda visible para todas. */
  const [locationId, setLocationId] = useState('');
  const [tecnicos, setTecnicos] = useState<Array<{ id: string; nombre: string; rol: string }>>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    visitaService
      .tecnicos()
      .then(setTecnicos)
      // Distingue un error de carga de una lista vacía.
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'No fue posible cargar el personal técnico.'),
      );
  }, []);

  // Solo se pueden atar solicitudes que siguen abiertas.
  const abiertas = solicitudes.filter((s) => ['SOLICITADO', 'PROGRAMADO'].includes(s.estado));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fecha) {
      setError('La visita necesita una fecha.');
      return;
    }
    setGuardando(true);
    try {
      await visitaService.programar({
        projectId,
        fecha,
        hora: hora || undefined,
        tecnicoId: tecnicoId || undefined,
        direccion: direccion.trim() || undefined,
        assistanceId: assistanceId || undefined,
        locationId: locationId || null,
      });
      onProgramada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible programar la visita.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onCerrar}
      title="Programar visita técnica"
      subtitle="El cliente recibe una notificación con la fecha"
      maxWidth="md"
    >
      <form onSubmit={guardar} className="space-y-4 text-left">
        {error && (
          <div
            role="alert"
            className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            leftIcon={<CalendarClock className="w-4 h-4" />}
          />
          <Input
            label="Hora aproximada"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            placeholder="Ej. 9:00 a. m."
            leftIcon={<Clock className="w-4 h-4" />}
          />
        </div>

        <Select
          label="Quién va a la obra"
          options={[
            {
              value: '',
              label: tecnicos.length === 0 ? 'Sin personal técnico registrado' : 'Definir después',
            },
            ...tecnicos.map((t) => ({
              value: t.id,
              label: `${t.nombre} · ${t.rol === 'TECNICO' ? 'Técnico' : 'Asesor'}`,
            })),
          ]}
          value={tecnicoId}
          onChange={(e) => setTecnicoId(e.target.value)}
        />
        <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
          Quien quede aquí también se asigna al proyecto: sin eso no podría abrir la obra a la que
          lo envías.
        </p>

        {/* Solo sedes permitidas; sin sede la visita aparece en todas las agendas. */}
        <Select
          label="Sede que atiende"
          options={[
            { value: '', label: 'Deducir por la ciudad de la obra' },
            ...permitidas.map((sd) => ({
              value: sd.id,
              label: `${sd.nombre} · ${sd.ciudad}`,
            })),
          ]}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        />
        <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
          Si lo dejas en «deducir», se usa la tienda de la ciudad del proyecto.
          Cuando la obra está en una ciudad sin tienda, la visita queda sin sede
          y la ven todas: no se le asigna «la más cercana» porque eso sería
          inventar el dato.
        </p>

        <Input
          label="Dirección de la visita"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          placeholder="Dirección de la obra"
          leftIcon={<MapPin className="w-4 h-4" />}
        />

        {abiertas.length > 0 && (
          <Select
            label="Atiende una solicitud de acompañamiento"
            options={[
              { value: '', label: 'Ninguna' },
              ...abiertas.map((s) => ({
                value: s.id,
                label: s.tipo.replace(/_/g, ' '),
              })),
            ]}
            value={assistanceId}
            onChange={(e) => setAssistanceId(e.target.value)}
          />
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="pintuco"
            isLoading={guardando}
            leftIcon={<UserCog className="w-4 h-4" />}
          >
            Programar visita
          </Button>
        </div>
      </form>
    </Modal>
  );
};
