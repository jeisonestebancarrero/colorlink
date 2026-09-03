import React, { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Building2, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { avatarService } from '../../services/avatares';

/**
 * Cambiar la foto de perfil o el logo de la empresa.
 *
 * La imagen se muestra en la cabecera y en los hilos de conversación, así que
 * al cambiarla se refresca el contexto de sesión: si solo se guardara en la
 * base, la persona vería su foto vieja hasta recargar y creería que no se
 * guardó.
 */

interface Props {
  /** 'perfil' = foto de la persona; 'empresa' = logo, y exige companyId. */
  tipo: 'perfil' | 'empresa';
  urlActual: string | null | undefined;
  nombre: string;
  companyId?: string;
  /** Si es false, se muestra la imagen sin ofrecer cambiarla. */
  puedeEditar?: boolean;
  onCambio?: (url: string | null) => void;
}

export const CambiarFoto: React.FC<Props> = ({
  tipo, urlActual, nombre, companyId, puedeEditar = true, onCambio,
}) => {
  const { updateProfile } = useAuth();
  const { showToast } = useProjects();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  // Se pinta la URL nueva de inmediato, sin esperar a que el contexto se
  // recargue: el cambio de una foto tiene que verse al instante.
  const [urlLocal, setUrlLocal] = useState<string | null | undefined>(urlActual);

  const url = urlLocal ?? urlActual;

  const iniciales = nombre
    .split(' ').filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      let nueva: string;
      if (tipo === 'empresa') {
        if (!companyId) throw new Error('Tu cuenta no está asociada a una empresa.');
        nueva = await avatarService.cambiarLogoDeEmpresa(companyId, archivo);
      } else {
        nueva = await avatarService.cambiarFotoDePerfil(archivo);
        // Sin esto la cabecera seguiría mostrando la foto anterior.
        await updateProfile({ avatar: nueva }).catch(() => undefined);
      }
      setUrlLocal(nueva);
      onCambio?.(nueva);
      showToast(tipo === 'empresa' ? 'Logo actualizado' : 'Foto actualizada', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No fue posible subir la imagen', 'error');
    } finally {
      setSubiendo(false);
      // Se limpia para que volver a elegir el MISMO archivo dispare el evento.
      if (entrada.current) entrada.current.value = '';
    }
  };

  const quitar = async () => {
    setSubiendo(true);
    try {
      await avatarService.quitarFotoDePerfil();
      await updateProfile({ avatar: undefined }).catch(() => undefined);
      setUrlLocal(null);
      onCambio?.(null);
      showToast('Se quitó tu foto de perfil', 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No fue posible quitar la imagen', 'error');
    } finally {
      setSubiendo(false);
    }
  };

  const Marcador = tipo === 'empresa' ? Building2 : User;

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-blue-50 border border-slate-200 flex items-center justify-center">
          {url ? (
            <img src={url} alt={nombre} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-extrabold text-[#004F9F] flex flex-col items-center gap-0.5">
              <Marcador className="w-5 h-5 text-[#004F9F]/60" />
              {iniciales}
            </span>
          )}
        </div>

        {puedeEditar && (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={subiendo}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#004F9F] text-white
                       flex items-center justify-center shadow-md hover:bg-[#003B77]
                       disabled:opacity-60 transition-colors cursor-pointer"
            aria-label={tipo === 'empresa' ? 'Cambiar logo' : 'Cambiar foto'}
          >
            {subiendo
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Camera className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {puedeEditar && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-800">
            {tipo === 'empresa' ? 'Logo de la empresa' : 'Tu foto de perfil'}
          </p>
          <p className="text-[11px] text-slate-500 leading-snug max-w-[15rem]">
            JPG, PNG o WEBP, hasta 2 MB.
          </p>
          {url && tipo === 'perfil' && (
            <button
              type="button"
              onClick={() => void quitar()}
              disabled={subiendo}
              className="text-[11px] font-semibold text-rose-600 hover:underline
                         flex items-center gap-1 disabled:opacity-60 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Quitar foto
            </button>
          )}
        </div>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => void elegir(e.target.files?.[0])}
      />
    </div>
  );
};
