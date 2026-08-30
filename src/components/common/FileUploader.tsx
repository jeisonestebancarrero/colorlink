import React, { useState, useRef } from 'react';
import { ProjectPhoto } from '../../types';
import { UploadCloud, Image as ImageIcon, Trash2, CheckCircle2, Plus, Sparkles } from 'lucide-react';
import { Button } from './Button';

interface FileUploaderProps {
  photos: ProjectPhoto[];
  onChange: (photos: ProjectPhoto[]) => void;
}

const PRESET_DEMO_PHOTOS: Array<{ name: string; url: string; size: string; description: string }> = [
  {
    name: 'Fachada_Concreto_Fisuras_Principal.jpg',
    url: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&q=80&w=800',
    size: '2.4 MB',
    description: 'Fachada principal con fisuración visible en junta de vaciado',
  },
  {
    name: 'Detalle_Muro_Humedad_Lateral.jpg',
    url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&q=80&w=800',
    size: '3.1 MB',
    description: 'Manchas de humedad por filtración superficial',
  },
  {
    name: 'Acceso_Panoramica_General.jpg',
    url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=80&w=800',
    size: '1.8 MB',
    description: 'Vista general del plano de fachada residencial',
  },
];

export const FileUploader: React.FC<FileUploaderProps> = ({ photos, onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newPhotos: ProjectPhoto[] = Array.from(files).map((file, idx) => {
      const url = URL.createObjectURL(file);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return {
        id: `local-photo-${Date.now()}-${idx}`,
        url,
        name: file.name,
        size: `${sizeMb} MB`,
        uploadDate: 'Hoy',
        isPrimary: photos.length === 0 && idx === 0,
        // FASE 5: se conserva el archivo original. Antes solo se guardaba la
        // URL `blob:` de la línea anterior, que deja de existir al recargar
        // la página: por eso las fotos nunca llegaban a persistirse (R6).
        // La vista previa sigue usando esa URL; el archivo solo se emplea
        // al guardar el proyecto para subirlo a Supabase Storage.
        file,
      };
    });

    onChange([...photos, ...newPhotos]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDelete = (id: string) => {
    const updated = photos.filter((p) => p.id !== id);
    if (updated.length > 0 && !updated.some((p) => p.isPrimary)) {
      updated[0].isPrimary = true;
    }
    onChange(updated);
  };

  const handleSetPrimary = (id: string) => {
    onChange(
      photos.map((p) => ({
        ...p,
        isPrimary: p.id === id,
      }))
    );
  };

  const handleAddPreset = (preset: typeof PRESET_DEMO_PHOTOS[0]) => {
    const exists = photos.some((p) => p.name === preset.name);
    if (exists) return;

    const newPhoto: ProjectPhoto = {
      id: `preset-${Date.now()}`,
      url: preset.url,
      name: preset.name,
      size: preset.size,
      uploadDate: 'Ahora',
      isPrimary: photos.length === 0,
    };
    onChange([...photos, newPhoto]);
  };

  return (
    <div className="space-y-4 text-left">
      {/* Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-blue-500 bg-blue-50/60 scale-[1.01]'
            : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-800">
          Arrastra y suelta las fotografías aquí o <span className="text-blue-600 underline">haz clic para explorar</span>
        </h4>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Las fotografías nos ayudan a comprender mejor tu necesidad y calibrar el diagnóstico del sustrato. (JPG, PNG, WEBP)
        </p>
      </div>

      {/* Quick demo presets for presentation */}
      <div className="bg-slate-100/70 p-3.5 rounded-lg border border-slate-200">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>Fotografías de muestra para demostración rápida:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_DEMO_PHOTOS.map((preset) => {
            const isAdded = photos.some((p) => p.name === preset.name);
            return (
              <button
                key={preset.name}
                type="button"
                disabled={isAdded}
                onClick={() => handleAddPreset(preset)}
                className={`text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-colors ${
                  isAdded
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default opacity-80'
                    : 'bg-white hover:bg-blue-50 text-slate-700 border-slate-200 hover:border-blue-300 cursor-pointer'
                }`}
              >
                {isAdded ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                )}
                <span>{preset.name.replace('.jpg', '')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Photo Gallery / Previews */}
      {photos.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Fotografías adjuntas ({photos.length})
            </p>
            <span className="text-xs text-slate-500">
              Haz clic en la estrella para definir la foto principal
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className={`relative group rounded-lg overflow-hidden border transition-all ${
                  photo.isPrimary
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="aspect-4/3 relative overflow-hidden bg-slate-100">
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {photo.isPrimary && (
                    <span className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
                      Foto Principal
                    </span>
                  )}
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {!photo.isPrimary && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(photo.id)}
                        className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-md text-xs font-medium transition-colors shadow-xs"
                        title="Marcar como foto principal"
                      >
                        Principal
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(photo.id)}
                      className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors shadow-xs"
                      title="Eliminar foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-2.5">
                  <p className="text-xs font-medium text-slate-800 truncate" title={photo.name}>
                    {photo.name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{photo.size}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
