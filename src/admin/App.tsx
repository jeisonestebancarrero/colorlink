import React, { useState } from 'react';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext';
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
import { UsuariosPage } from './pages/UsuariosPage';
import { PermisosPage } from './pages/PermisosPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';

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
  const { cargando, autenticado, pendienteMFA } = useAdminAuth();
  const [ruta, setRuta] = useState('/');

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

  // El tablero es la puerta de entrada, como en un ERP: se elige aplicación
  // y solo entonces aparece la navegación lateral de ese módulo.
  if (ruta === '/') return <LauncherPage onAbrir={setRuta} />;

  const pantalla = () => {
    switch (ruta) {
      case '/panel': return <PanelPage onIr={setRuta} />;
      case '/pedidos': return <PedidosPage />;
      case '/despacho': return <DespachoPage />;
      case '/proyectos': return <ProyectosPage />;
      case '/visitas': return <VisitasPage />;
      case '/inventario': return <InventarioPage />;
      case '/puntos-venta': return <PuntosVentaPage />;
      case '/recepciones': return <RecepcionesPage />;
      case '/catalogo': return <CatalogoPage />;
      case '/contabilidad': return <ContabilidadPage />;
      case '/conversaciones': return <ConversacionesPage />;
      case '/facturacion': return <FacturacionPage />;
      case '/analitica': return <AnaliticaPage />;
      case '/tesoreria': return <TesoreriaPage />;
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
    <AdminLayout rutaActual={ruta} onNavegar={setRuta}>
      {pantalla()}
    </AdminLayout>
  );
};

export const AdminApp: React.FC = () => (
  <AdminAuthProvider>
    <Contenido />
  </AdminAuthProvider>
);
