import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRutaTienda } from './hooks/useRutaTienda';
import { ProjectProvider, useProjects } from './context/ProjectContext';
import { CartProvider } from './context/CartContext';
import { MensajesProvider } from './context/MensajesContext';
import { AppLayout } from './components/layout/AppLayout';
import { Toast } from './components/common/Toast';
import { CartDrawer } from './components/cart/CartDrawer';
import { Asistente } from './components/chat/Asistente';
import { CompleteProfileModal } from './components/common/CompleteProfileModal';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { MisPedidosPage } from './pages/MisPedidosPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { StorePage } from './pages/StorePage';
import { ColorVisualizerPage } from './pages/ColorVisualizerPage';
import { SolutionKitsPage } from './pages/SolutionKitsPage';
import { PaintCalculatorPage } from './pages/PaintCalculatorPage';
import { StoresLocatorPage } from './pages/StoresLocatorPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { CambiarClaveObligatorio } from './components/common/CambiarClaveObligatorio';
import { claveTemporalService } from './services/claveTemporal';

/**
 * FASE 2 — Páginas accesibles sin sesión iniciada.
 * Cualquier otra vista exige autenticación. Esta app no usa librería de
 * enrutado (la navegación es estado local), así que la protección de rutas
 * se aplica aquí, en el mismo punto donde se decide qué renderizar.
 *
 * La tienda, la carta de color y el localizador de tiendas son públicos: son
 * catálogo comercial y las políticas RLS ya permiten leerlos sin sesión. Así
 * un visitante puede mirar productos antes de decidir registrarse, y el botón
 * "Volver a la tienda" del login lleva a algún sitio útil.
 * Lo privado (proyectos, carrito, pedidos, perfil) sigue exigiendo sesión.
 */
const PUBLIC_PAGES = [
  'landing', 'login', 'register',
  // Catálogo y simuladores: se pueden usar sin cuenta. Sus políticas RLS ya
  // permiten leer sin sesión, y el menú superior los ofrece siempre — si no
  // fueran públicos, pulsarlos devolvería al visitante a la landing sin
  // explicación, que es justo lo que ocurría.
  'store', 'colors', 'stores', 'solutions', 'calculator',
];

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  /**
   * ¿Le pusieron una contraseña provisional?
   *
   * Pasa cuando el personal le reinicia el acceso en modo temporal. Esa
   * contraseña se entrega por teléfono o por chat, así que tiene que cambiarla
   * antes de seguir; si no, sigue siendo válida en manos de cualquiera que
   * haya visto el mensaje.
   *
   * `null` mientras se averigua, para no pintar la tienda y quitarla medio
   * segundo después.
   */
  const [debeCambiarClave, setDebeCambiarClave] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!isAuthenticated) { setDebeCambiarClave(null); return; }
    let vigente = true;
    claveTemporalService.debeCambiarla()
      .then((r) => { if (vigente) setDebeCambiarClave(r); })
      .catch(() => { if (vigente) setDebeCambiarClave(false); });
    return () => { vigente = false; };
  }, [isAuthenticated]);
  const { activeProjectId } = useProjects();

  // Current page view state
  // La página vive en la URL: recargar ya no devuelve a la landing, «atrás»
  // funciona y el enlace de un pedido se puede compartir.
  const {
    pagina: currentPage, param: pageParam, navegar, reemplazar,
  } = useRutaTienda();

  // If user logs in while on landing/login/register, auto redirect to dashboard
  //
  // 'landing' se incluye porque la landing es una página COMPLETA, con su
  // propia cabecera. Al renderizarla dentro de AppLayout se veían dos barras
  // superpuestas. Quien ya tiene sesión no necesita la página de captación.
  useEffect(() => {
    if (
      isAuthenticated &&
      (currentPage === 'login' || currentPage === 'register' || currentPage === 'landing')
    ) {
      reemplazar('dashboard');
    }
  }, [isAuthenticated, currentPage, reemplazar]);

  /**
   * FASE 2 — Protección de rutas (MÓDULO 1).
   * Al cerrar sesión, expirar el token o cerrar sesión desde otra pestaña,
   * devuelve al usuario a la landing en lugar de dejar una vista privada
   * renderizada sin datos.
   */
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !PUBLIC_PAGES.includes(currentPage)) {
      reemplazar('landing');
    }
  }, [isLoading, isAuthenticated, currentPage, reemplazar]);

  const handleNavigate = (page: string, param?: string) => {
    navegar(page, param);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If auth is loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-blue-200">
            Cargando ColorLink Pintuco...
          </p>
        </div>
      </div>
    );
  }

  // Contraseña provisional: se cambia antes de poder usar la tienda. Va antes
  // que cualquier vista privada, incluido el carrito.
  if (isAuthenticated && debeCambiarClave) {
    return (
      <>
        <CambiarClaveObligatorio
          correo={user?.email ?? null}
          onListo={() => setDebeCambiarClave(false)}
          onSalir={() => void logout()}
        />
        <Toast />
      </>
    );
  }

  // Guardia de render: si no hay sesión, ninguna vista privada llega a pintarse.
  if (!isAuthenticated && !PUBLIC_PAGES.includes(currentPage)) {
    return (
      <>
        <LandingPage onNavigate={handleNavigate} />
        <Toast />
      </>
    );
  }

  // Standalone landing / login / register pages
  if (currentPage === 'landing' && !isAuthenticated) {
    return (
      <>
        <LandingPage onNavigate={handleNavigate} />
        <Toast />
      </>
    );
  }

  if (currentPage === 'login') {
    return (
      <>
        <LoginPage onNavigate={handleNavigate} />
        <Toast />
      </>
    );
  }

  if (currentPage === 'register') {
    return (
      <>
        <RegisterPage onNavigate={handleNavigate} />
        <Toast />
      </>
    );
  }

  // Application views
  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'landing':
        return <LandingPage onNavigate={handleNavigate} />;
      case 'dashboard':
        return <DashboardPage onNavigate={handleNavigate} />;
      case 'store':
        return <StorePage onNavigate={handleNavigate} initialSearch={pageParam} />;
      case 'colors':
        return <ColorVisualizerPage onNavigate={handleNavigate} />;
      case 'solutions':
        return <SolutionKitsPage onNavigate={handleNavigate} />;
      case 'calculator':
        return <PaintCalculatorPage onNavigate={handleNavigate} />;
      case 'stores':
        return <StoresLocatorPage onNavigate={handleNavigate} />;
      case 'create-project':
        return <CreateProjectPage onNavigate={handleNavigate} />;
      case 'projects':
        return (
          <ProjectsListPage
            onNavigate={handleNavigate}
            initialFilter={pageParam}
          />
        );
      case 'project-detail':
        return (
          <ProjectDetailPage
            projectId={pageParam || activeProjectId || ''}
            onNavigate={handleNavigate}
          />
        );
      case 'orders':
        // El número del pedido viaja en la URL (`/mis-pedidos/ORD-PNT-000106`)
        // para que la campana pueda abrir la conversación exacta y para que el
        // enlace se pueda compartir, igual que en el portal interno.
        return <MisPedidosPage onNavigate={handleNavigate} numeroAbierto={pageParam} />;
      case 'notifications':
        return <NotificationsPage onNavigate={handleNavigate} />;
      case 'profile':
        return <ProfilePage onNavigate={handleNavigate} />;
      default:
        return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <AppLayout currentPage={currentPage} onNavigate={handleNavigate}>
      {renderCurrentPage()}
      <CartDrawer onNavigate={handleNavigate} />
      {/* Asistente automático: responde consultando el sistema y, cuando no
          sabe, pasa la conversación al equipo por el hilo del pedido. */}
      <Asistente onNavigate={handleNavigate} />
      {/* Pide los datos que Google no entrega, una sola vez. */}
      <CompleteProfileModal />
      <Toast />
    </AppLayout>
  );
}

/**
 * Enchufa la campana de mensajes a la sesión de la TIENDA.
 *
 * El proveedor es neutro —lo comparten las dos aplicaciones— y recibe `activo`
 * por propiedad; este envoltorio es el que sabe de qué contexto de sesión sale
 * ese dato aquí.
 */
const CampanaConSesion: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return <MensajesProvider activo={isAuthenticated}>{children}</MensajesProvider>;
};

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <CartProvider>
          {/* La campana solo tiene sentido con sesión, y necesita saber
              cuándo se inicia y cuándo se cierra. */}
          <CampanaConSesion>
            <AppContent />
          </CampanaConSesion>
        </CartProvider>
      </ProjectProvider>
    </AuthProvider>
  );
}
