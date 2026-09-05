import React, { useEffect, useState } from 'react';
import { Building2, Mail, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { configService, type DatosEmpresa, type EstadoSmtp } from '../../services/admin';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { EntornoCorreoPanel } from '../EntornoCorreoPanel';
import { PasarelaPanel } from '../PasarelaPanel';
import { AsistentePanel } from '../AsistentePanel';
import { IconoModulo } from '../IconosDeModulo';

/**
 * Configuración de la empresa, del correo saliente y de la pasarela de pagos.
 *
 * Los datos de empresa son los que se imprimen en la factura POS.
 * La contraseña SMTP nunca se lee de vuelta: la base revoca el SELECT sobre
 * esa columna, así que el campo llega siempre vacío y dejarlo así conserva
 * la que ya estuviera guardada.
 */
export const ConfiguracionPage: React.FC = () => {
  const [empresa, setEmpresa] = useState<DatosEmpresa | null>(null);
  const [smtp, setSmtp] = useState<EstadoSmtp | null>(null);
  const [cargando, setCargando] = useState(true);

  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [guardandoSmtp, setGuardandoSmtp] = useState(false);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [formSmtp, setFormSmtp] = useState({
    host: '', port: 465, secure: true, user: '', password: '',
    fromName: '', fromEmail: '', destinoPrueba: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const [e, s] = await Promise.all([configService.empresa(), configService.estadoSmtp()]);
        setEmpresa(e);
        setSmtp(s);
        setFormSmtp((f) => ({
          ...f,
          host: s.host ?? 'smtp.gmail.com',
          port: s.port ?? 465,
          user: s.user ?? '',
          fromEmail: s.from_email ?? '',
        }));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const guardarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresa) return;
    setGuardandoEmpresa(true);
    setAviso(null);
    try {
      await configService.guardarEmpresa(empresa);
      setAviso({ tipo: 'ok', texto: 'Datos de la empresa guardados.' });
    } catch (err) {
      setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'No fue posible guardar.' });
    } finally {
      setGuardandoEmpresa(false);
    }
  };

  const guardarSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoSmtp(true);
    setAviso(null);
    try {
      await configService.guardarSmtp(formSmtp);
      setSmtp(await configService.estadoSmtp());
      setFormSmtp((f) => ({ ...f, password: '' }));
      setAviso({ tipo: 'ok', texto: 'Servidor de correo guardado.' });
    } catch (err) {
      setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'No fue posible guardar.' });
    } finally {
      setGuardandoSmtp(false);
    }
  };

  const probar = async () => {
    if (!formSmtp.destinoPrueba.trim()) {
      return setAviso({ tipo: 'error', texto: 'Indica un correo de destino para la prueba.' });
    }
    setProbando(true);
    setAviso(null);
    try {
      await configService.enviarPrueba(formSmtp.destinoPrueba.trim());
      setAviso({ tipo: 'ok', texto: `Correo de prueba enviado a ${formSmtp.destinoPrueba}.` });
    } catch (err) {
      setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'No fue posible enviar.' });
    } finally {
      setProbando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-12 h-12 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const campo = (k: keyof DatosEmpresa, etiqueta: string) => (
    <Input
      label={etiqueta}
      value={(empresa?.[k] as string) ?? ''}
      onChange={(ev) => setEmpresa((s) => (s ? { ...s, [k]: ev.target.value } : s))}
    />
  );

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="Settings" /> Configuración
          </h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Datos de la empresa, correo saliente, pasarela de pagos y asistente.
        </p>
      </div>

      {aviso && (
        <div className={`p-3.5 rounded-lg text-xs font-medium border flex items-center gap-2 ${
          aviso.tipo === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {aviso.texto}
        </div>
      )}

      {/* ---- Empresa ---- */}
      <form onSubmit={guardarEmpresa} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Building2 className="w-4 h-4 text-[#004F9F]" />
          <h2 className="text-base font-extrabold text-slate-900">Datos de la empresa</h2>
          <span className="text-[11px] text-slate-400 font-medium">— se imprimen en la factura</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campo('company_name', 'Nombre comercial')}
          {campo('company_legal_name', 'Razón social')}
          {campo('company_nit', 'NIT')}
          {campo('tax_regime', 'Régimen tributario')}
          {campo('company_address', 'Dirección')}
          {campo('company_city', 'Ciudad')}
          {campo('company_phone', 'Teléfono')}
          {campo('company_email', 'Correo de contacto')}
          {campo('logo_url', 'URL del logotipo')}
          {campo('invoice_prefix', 'Prefijo de factura')}
          <Input
            label="IVA por defecto (%)"
            type="number"
            value={String(empresa?.default_tax_rate ?? 19)}
            onChange={(ev) => setEmpresa((s) => (s ? { ...s, default_tax_rate: Number(ev.target.value) } : s))}
          />
          {campo('invoice_footer', 'Pie de la factura')}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="submit" variant="pintuco" isLoading={guardandoEmpresa}>Guardar empresa</Button>
        </div>
      </form>

      {/* ---- Correo ---- */}
      <form onSubmit={guardarSmtp} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Mail className="w-4 h-4 text-[#004F9F]" />
          <h2 className="text-base font-extrabold text-slate-900">Correo saliente</h2>
          {smtp?.configured ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Configurado
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Sin configurar
            </span>
          )}
        </div>

        <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 font-medium">
          Para Gmail necesitas una <strong>contraseña de aplicación</strong>, no la de tu
          cuenta: activa la verificación en dos pasos y genera una en
          Google → Seguridad → Contraseñas de aplicaciones. Servidor
          <code className="mx-1 font-mono">smtp.gmail.com</code>, puerto <code className="font-mono">465</code>.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Servidor SMTP" value={formSmtp.host}
            onChange={(e) => setFormSmtp({ ...formSmtp, host: e.target.value })} placeholder="smtp.gmail.com" required />
          <Input label="Puerto" type="number" value={String(formSmtp.port)}
            onChange={(e) => setFormSmtp({ ...formSmtp, port: Number(e.target.value) })} required />
          <Input label="Usuario" value={formSmtp.user}
            onChange={(e) => setFormSmtp({ ...formSmtp, user: e.target.value })} placeholder="cuenta@gmail.com" />
          <Input label="Contraseña de aplicación" type="password" value={formSmtp.password}
            onChange={(e) => setFormSmtp({ ...formSmtp, password: e.target.value })}
            placeholder={smtp?.configured ? 'Guardada — déjala vacía para conservarla' : '16 caracteres'} />
          <Input label="Nombre del remitente" value={formSmtp.fromName}
            onChange={(e) => setFormSmtp({ ...formSmtp, fromName: e.target.value })} placeholder="ColorLink Pintuco" />
          <Input label="Correo del remitente" type="email" value={formSmtp.fromEmail}
            onChange={(e) => setFormSmtp({ ...formSmtp, fromEmail: e.target.value })} placeholder="no-reply@pintuco.com" />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="submit" variant="pintuco" isLoading={guardandoSmtp}>Guardar correo</Button>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Probar el envío</h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <Input label="Enviar prueba a" type="email" value={formSmtp.destinoPrueba}
                onChange={(e) => setFormSmtp({ ...formSmtp, destinoPrueba: e.target.value })}
                placeholder="tu.correo@ejemplo.com" />
            </div>
            <Button type="button" variant="outline" onClick={probar} isLoading={probando}
              leftIcon={<Send className="w-4 h-4" />}>
              Enviar prueba
            </Button>
          </div>
        </div>
      </form>

      {/* El cableado va DESPUÉS del buzón, que es el orden en que se entiende:
          primero por dónde sale el correo, después qué hace que la base llegue
          hasta ahí. Sin esto último no sale ni uno, por bien configurado que
          esté el SMTP. */}
      <EntornoCorreoPanel />

      {/* ---- Pasarela de pagos ---- */}
      <PasarelaPanel />

      {/* ---- Asistente de la tienda ---- */}
      <AsistentePanel />
    </div>
  );
};
