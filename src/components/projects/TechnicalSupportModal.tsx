import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { ShieldCheck, Calendar, Phone, Clock, UserCheck } from 'lucide-react';

interface TechnicalSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export const TechnicalSupportModal: React.FC<TechnicalSupportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
}) => {
  const { user } = useAuth();
  const { requestTechnicalAssistance } = useProjects();

  const [phone, setPhone] = useState(user?.phone || '');
  const [preferredDate, setPreferredDate] = useState('Próximos 3 a 5 días hábiles');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await requestTechnicalAssistance(projectId, {
        contactPhone: phone,
        preferredDate,
        notes,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Solicitar Acompañamiento Técnico Pintuco"
      subtitle={`Proyecto: ${projectName}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div className="bg-blue-50/70 border border-blue-100 p-3.5 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900 leading-relaxed">
            <strong className="block font-semibold mb-0.5">
              Asesoría Técnica en Terreno y Laboratorio Pintuco
            </strong>
            Un especialista técnico validará en sitio las condiciones de humedad, perfil de rugosidad, pruebas de adherencia y memoria de cálculo de rendimiento.
          </div>
        </div>

        <Input
          label="Teléfono de contacto en obra"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+57 (300) 000-0000"
          required
          leftIcon={<Phone className="w-4 h-4" />}
        />

        <Input
          label="Fecha o plazo deseado para la visita"
          value={preferredDate}
          onChange={(e) => setPreferredDate(e.target.value)}
          placeholder="Ej. Martes 25 de Febrero en la mañana"
          required
          leftIcon={<Calendar className="w-4 h-4" />}
        />

        <Textarea
          label="Observaciones o requerimientos específicos"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Indica accesibilidad al lugar, altura de fachada, si disponen de andamios o si requieren prueba de humedad profunda..."
        />

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="pintuco"
            isLoading={isSubmitting}
            leftIcon={<UserCheck className="w-4 h-4" />}
          >
            Confirmar solicitud de acompañamiento
          </Button>
        </div>
      </form>
    </Modal>
  );
};
