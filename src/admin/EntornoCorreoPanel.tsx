import React, { useEffect, useState } from 'react';
import { Cable, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { configService, type EstadoEntornoCorreo } from '../services/admin';
import { env } from '../lib/env';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * El cableado del correo, que es distinto del SMTP.
 *
 * El SMTP es el buzón por el que sale el mensaje. Esto es lo que hace que la
 * base de datos LLEGUE hasta ese buzón: a qué dirección llama, con qué llave,
 * y a dónde apuntan los enlaces que van dentro del correo.
 *
 * Existe porque al desplegar a un servidor nuevo esto quedaba en blanco y el
 * correo moría en silencio: `enviar_correo` descartaba los mensajes con
 * «falta configurar la URL de las funciones» y quedaban en el registro como
 * OMITIDO. Sin pantalla, la única salida era entrar a la base de datos.
 *
 * La URL de las funciones se propone sola a partir del Supabase que esta misma
 * aplicación está usando: escribirla a mano es una fuente de erratas y no hay
 * ninguna razón para pedirla.
 */
export const EntornoCorreoPanel: React.FC = () => {
  const [estado, setEstado] = useState<EstadoEntornoCorreo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [form, setForm] = useState({
    functionsUrl: '',
    serviceKey: '',
    siteUrl: '',
    emailsEnabled: true,
    allowlist: '',
  });

  const sugerida = `${env.VITE_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1`;

  const pintar = (e: EstadoEntornoCorreo) => {
    setEstado(e);
    setForm((f) => ({
      ...f,
      functionsUrl: e.functions_url ?? sugerida,
      siteUrl: e.site_url ?? '',
      emailsEnabled: e.emails_enabled,
      allowlist: (e.allowlist ?? []).join(', '),
      serviceKey: '',
    }));
  };

  useEffect(() => {
    configService
      .entornoCorreo()
      .then(pintar)
      .catch((e) => setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error' }))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAviso(null);
    setGuardando(true);
    try {
      const lista = form.allowlist
        .split(/[,\n;]/)
        .map((x) => x.trim())
        .filter(Boolean);

      pintar(
        await configService.guardarEntornoCorreo({
          functionsUrl: form.functionsUrl.trim() || undefined,
          serviceKey: form.serviceKey.trim() || undefined,
          siteUrl: form.siteUrl.trim() || undefined,
          emailsEnabled: form.emailsEnabled,
          allowlist: lista,
        }),
      );
      setAviso({ tipo: 'ok', texto: 'Entorno de correo guardado.' });
    } catch (err) {
      setAviso({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'No fue posible guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return null;

  const listo = Boolean(estado?.functions_url) && Boolean(estado?.tiene_llave);

  return (
    <form onSubmit={guardar} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Cable className="w-5 h-5 text-[#004F9F]" />
        <h2 className="text-lg font-bold text-slate-800">Entorno de correo</h2>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
            listo
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          {listo ? 'Conectado' : 'Sin conectar'}
        </span>
      </div>

      {!listo && (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 font-medium leading-relaxed">
            Mientras esto esté sin conectar, <strong>ningún correo sale</strong>: los
            mensajes se descartan antes de llegar al servidor de correo y quedan
            registrados como OMITIDO. Configurar el correo saliente por sí solo no
            basta.
          </p>
        </div>
      )}

      {aviso && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg text-xs font-medium ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {aviso.tipo === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          {aviso.texto}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <Input
            label="URL de las funciones"
            value={form.functionsUrl}
            onChange={(e) => setForm({ ...form, functionsUrl: e.target.value })}
            placeholder={sugerida}
          />
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            La dirección a la que la base llama para enviar.{' '}
            {form.functionsUrl.trim() !== sugerida && (
              <button
                type="button"
                onClick={() => setForm({ ...form, functionsUrl: sugerida })}
                className="font-semibold text-[#004F9F] hover:underline"
              >
                Usar la de este servidor
              </button>
            )}
          </p>
        </div>

        <div>
          <Input
            label="URL pública de la tienda"
            value={form.siteUrl}
            onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
            placeholder="https://tu-tienda.com"
          />
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            A dónde llevan los enlaces <em>dentro</em> del correo («ver mi pedido»).
            Si queda mal, apuntan al computador del cliente.
          </p>
        </div>
      </div>

      <div>
        <Input
          label="Llave de servicio"
          type="password"
          value={form.serviceKey}
          onChange={(e) => setForm({ ...form, serviceKey: e.target.value })}
          leftIcon={<KeyRound className="w-4 h-4" />}
          placeholder={
            estado?.tiene_llave ? 'Guardada — déjala vacía para conservarla' : 'service_role de Supabase'
          }
        />
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          Está en Supabase → Project Settings → API Keys. No se vuelve a mostrar
          después de guardarla.
        </p>
      </div>

      <div>
        <Input
          label="Solo enviar a estos correos"
          value={form.allowlist}
          onChange={(e) => setForm({ ...form, allowlist: e.target.value })}
          placeholder="Vacío = enviar a todos"
        />
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          Red de seguridad para pruebas: separados por coma. <strong>Déjalo vacío
          en producción</strong> o los clientes no recibirán nada.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
        <input
          type="checkbox"
          checked={form.emailsEnabled}
          onChange={(e) => setForm({ ...form, emailsEnabled: e.target.checked })}
          className="rounded border-slate-300"
        />
        Enviar correos automáticos
      </label>

      <div className="flex justify-end">
        <Button type="submit" variant="pintuco" isLoading={guardando}>
          Guardar entorno
        </Button>
      </div>
    </form>
  );
};
