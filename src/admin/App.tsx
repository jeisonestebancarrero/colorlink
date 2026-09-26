import React, { useState } from 'react';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext';
import { useRutaUrl, RUTA_TABLERO } from './useRutaUrl';
import { SedeProvider } from './SedeContext';
import { AdminLogin } from './AdminLogin';
import { MfaGate } from './MfaGate';
import { AdminLayout } from './AdminLayout';
import { LauncherPage } from './LauncherPage';
import { PanelPage } from './pages/PanelPage';
import { PedidosPage } from './pages/PedidosPage';
import { ProyectosPage } from './pages/ProyectosPage';
import { PuntosVentaPage } from './pages/PuntosVentaPage';
import { RecepcionesPage } from './pages/RecepcionesPage';
import { CatalogoPage } from './pages/CatalogoPage';
import { ContabilidadPage } from './pages/ContabilidadPage';
import { VisitasPage } from './pages/VisitasPage';
import { DespachoPage } from './pages/DespachoPage';
import { InventarioPage } from './pages/InventarioPage';
import { ConversacionesPage } from './pages/ConversacionesPage';
import { FacturacionPage } from './pages/FacturacionPage';
import { AnaliticaPage } from './pages/AnaliticaPage';
import { TesoreriaPage } from './pages/TesoreriaPage';
import { ClientesPage } from './pages/ClientesPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { PermisosPage } from './pages/PermisosPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { CambiarClaveObligatorio } from '../components/common/CambiarClaveObligatorio';
import { claveTemporalService } from '../services/claveTemporal';
import { MensajesProvider } from '../context/MensajesContext';

/** Enrutado del back-office sin librería de rutas, igual que el portal del cliente. */
// Lo usa el `default` del enrutador para nombrar rutas desconocidas.
const EN_CONSTRUCCION: Record<string, string> = {};

const Contenido: React.FC = () => {
  const { cargando, autenticado, pendienteMFA, email, salir, acceso } = useAdminAuth();

  /** Contraseña provisional; `null` mientras carga. Se consulta tras el MFA: antes `is_staff()` es falso. */
  const [debeCambiarClave, setDebeCambiarClave] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!autenticado || pendienteMFA) return;
    let vigente = true;
    claveTemporalService.debeCambiarla()
      .then((r) => { if (vigente) setDebeCambiarClave(r); })
      .catch(() => { if (vigente) setDebeCambiarClave(false); });
    return () => { vigente = false; };
  }, [autenticado, pendienteMFA]);
  // Ruta en la URL: recargar, «atrás» y enlaces compartidos funcionan.
  const { ruta: rutaUrl, ir: setRuta, abrir, cerrarDetalle } = useRutaUrl();
  const ruta = rutaUrl.modulo;
  const idAbierto = rutaUrl.id;

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#002D5C] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Sesión válida pendiente de segundo factor.
  if (pendienteMFA === 'codigo') return <MfaGate modo="codigo" />;

  if (!autenticado) return <AdminLogin />;

  // Debe registrar el factor antes de trabajar.
  if (pendienteMFA === 'registro') return <MfaGate modo="registro" />;

  // Cambio de contraseña provisional; va después del MFA a propósito.
  if (debeCambiarClave === null) {
    return (
      <div className="min-h-screen bg-[#002D5C] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }
  if (debeCambiarClave) {
    return (
      <CambiarClaveObligatorio
        correo={email}
        onListo={() => setDebeCambiarClave(false)}
        onSalir={() => void salir()}
      />
    );
  }

  // El tablero es la entrada; la campana navega al pedido por número (`/pedidos/ORD-PNT-000106`).
  const abrirPedido = (numero: string) => abrir('/pedidos', numero);

  if (ruta === RUTA_TABLERO) {
    return <LauncherPage onAbrir={setRuta} onAbrirPedido={abrirPedido} />;
  }

  // Un módulo fuera de las vistas del usuario no se abre ni por URL; se muestra un aviso.
  const permitida = acceso.isAdmin || acceso.views.some((v) => v.route === ruta);

  const pantalla = () => {
    if (!permitida) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-8 text-center max-w-lg mx-auto">
          <p className="text-sm font-bold text-slate-800">No tienes acceso a esta aplicación</p>
          <p className="text-sm text-slate-500 font-medium mt-1.5">
            Si la necesitas para tu trabajo, pídele al administrador que te la habilite.
          </p>
          <button
            onClick={() => setRuta(RUTA_TABLERO)}
            className="mt-4 px-4 py-2 rounded-lg bg-[#004F9F] text-white text-xs font-bold cursor-pointer"
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    switch (ruta) {
      case '/panel': return <PanelPage onIr={setRuta} />;
      case '/pedidos':
        return (
          <PedidosPage
            idAbierto={idAbierto}
            onAbrir={(id) => abrir('/pedidos', id)}
            onCerrar={cerrarDetalle}
          />
        );
      case '/despacho':
        return (
          <DespachoPage
            idAbierto={idAbierto}
            onAbrir={(id) => abrir('/despacho', id)}
            onCerrar={cerrarDetalle}
          />
        );
      case '/proyectos': return <ProyectosPage />;
      case '/visitas': return <VisitasPage />;
      case '/inventario': return <InventarioPage />;
      case '/puntos-venta': return <PuntosVentaPage />;
      case '/recepciones': return <RecepcionesPage />;
      case '/catalogo': return <CatalogoPage />;
      case '/contabilidad': return <ContabilidadPage />;
      case '/conversaciones': return <ConversacionesPage />;
      case '/facturacion':
        return (
          <FacturacionPage
            idAbierto={idAbierto}
            onAbrir={(id) => abrir('/facturacion', id)}
            onCerrar={cerrarDetalle}
          />
        );
      case '/analitica': return <AnaliticaPage />;
      case '/tesoreria': return <TesoreriaPage />;
      case '/clientes':
        return (
          <ClientesPage
            idAbierto={idAbierto}
            onAbrir={(id) => abrir('/clientes', id)}
            onCerrar={cerrarDetalle}
          />
        );
      case '/usuarios': return <UsuariosPage />;
      case '/permisos': return <PermisosPage />;
      case '/configuracion': return <ConfiguracionPage />;
      default:
        return (
          <div className="space-y-3">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {EN_CONSTRUCCION[ruta] ?? 'Módulo'}
            </h1>
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-8 text-center">
              <p className="text-sm font-bold text-slate-700">Pantalla en construcción</p>
              <p className="text-sm text-slate-500 font-medium mt-1.5 max-w-lg mx-auto">
                Su base de datos, sus reglas de negocio y sus permisos ya están
                listos. Falta la interfaz.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <AdminLayout rutaActual={ruta} onNavegar={setRuta} onAbrirPedido={abrirPedido}>
      {pantalla()}
    </AdminLayout>
  );
};

/** Conecta el proveedor de mensajes de la tienda a la sesión del portal interno vía `activo`. */
const CampanaConSesion: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { autenticado, pendienteMFA } = useAdminAuth();
  // Antes del MFA `is_staff()` es falso y la consulta vendría vacía.
  return (
    <MensajesProvider activo={autenticado && !pendienteMFA}>{children}</MensajesProvider>
  );
};

export const AdminApp: React.FC = () => (
  <AdminAuthProvider>
    {/* Dentro de la autenticación: las sedes requieren sesión. */}
    <SedeProvider>
      <CampanaConSesion>
        <Contenido />
      </CampanaConSesion>
    </SedeProvider>
  </AdminAuthProvider>
);
