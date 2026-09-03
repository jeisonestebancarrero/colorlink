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

/**
 * Enrutado del back-office.
 *
 * Igual que el portal del cliente, la navegación es estado local: mantener
 * las dos aplicaciones con el mismo enfoque evita introducir una librería de
 * rutas solo aquí.
 *
 * Las pantallas aún no construidas se declaran como tales en vez de dejar un
 * menú que lleva a la nada.
 */
// Ya no queda ninguna pantalla por construir. La constante se conserva
// porque el `default` del enrutador la usa para nombrar una ruta desconocida.
const EN_CONSTRUCCION: Record<string, string> = {};

const Contenido: React.FC = () => {
  const { cargando, autenticado, pendienteMFA, email, salir } = useAdminAuth();

  /**
   * ¿Entró con una contraseña provisional?
   *
   * `null` mientras se averigua: pintar el portal y quitarlo medio segundo
   * después sería peor que esperar. Se consulta solo con sesión iniciada y
   * con el segundo factor ya superado, porque antes de eso `is_staff()` es
   * falso y la consulta no devolvería nada útil.
   */
  const [debeCambiarClave, setDebeCambiarClave] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!autenticado || pendienteMFA) return;
    let vigente = true;
    claveTemporalService.debeCambiarla()
      .then((r) => { if (vigente) setDebeCambiarClave(r); })
      .catch(() => { if (vigente) setDebeCambiarClave(false); });
    return () => { vigente = false; };
  }, [autenticado, pendienteMFA]);
  // La ruta vive en la URL: recargar ya no devuelve al tablero, «atrás»
  // funciona y un enlace a un pedido se puede compartir.
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

  // La contraseña ya está validada, pero falta el segundo factor: la sesión
  // existe y por eso no se muestra el formulario de ingreso otra vez.
  if (pendienteMFA === 'codigo') return <MfaGate modo="codigo" />;

  if (!autenticado) return <AdminLogin />;

  // Personal interno que todavía no ha registrado su aplicación de códigos:
  // entra, pero no trabaja hasta activarla.
  if (pendienteMFA === 'registro') return <MfaGate modo="registro" />;

  // Contraseña provisional puesta por un administrador: se cambia antes de
  // entrar. Va DESPUÉS del segundo factor a propósito —primero se demuestra
  // quién es, después se le deja tocar su cuenta—.
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

  // El tablero es la puerta de entrada, como en un ERP: se elige aplicación
  // y solo entonces aparece la navegación lateral de ese módulo.
  // La campana lleva al pedido por su NÚMERO, que es la ruta que ya existe
  // (`/pedidos/ORD-PNT-000106`) y donde vive el hilo de conversación.
  const abrirPedido = (numero: string) => abrir('/pedidos', numero);

  if (ruta === RUTA_TABLERO) {
    return <LauncherPage onAbrir={setRuta} onAbrirPedido={abrirPedido} />;
  }

  const pantalla = () => {
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

/**
 * Enchufa la campana de mensajes a la sesión del PORTAL.
 *
 * El proveedor es el mismo que usa la tienda; recibe `activo` por propiedad
 * porque cada aplicación tiene su propio contexto de sesión.
 */
const CampanaConSesion: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { autenticado, pendienteMFA } = useAdminAuth();
  // Sin el segundo factor superado `is_staff()` es falso en el servidor, así
  // que consultar antes devolvería vacío y encendería la campana en cero.
  return (
    <MensajesProvider activo={autenticado && !pendienteMFA}>{children}</MensajesProvider>
  );
};

export const AdminApp: React.FC = () => (
  <AdminAuthProvider>
    {/* Dentro del de autenticación: las sedes permitidas se resuelven con la
        sesión ya establecida. */}
    <SedeProvider>
      <CampanaConSesion>
        <Contenido />
      </CampanaConSesion>
    </SedeProvider>
  </AdminAuthProvider>
);
