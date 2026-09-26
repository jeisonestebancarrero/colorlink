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
 * Páginas accesibles sin sesión. No hay router: la protección de rutas se aplica
 * aquí. Catálogo y simuladores son públicos porque RLS ya permite leerlos sin sesión.
 */
const PUBLIC_PAGES = [
  'landing', 'login', 'register',
  'store', 'colors', 'stores', 'solutions', 'calculator',
];

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  /** Contraseña provisional asignada por el personal: debe cambiarse antes de seguir. `null` mientras se consulta. */
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

  // La página vive en la URL: recargar conserva la vista y los enlaces se pueden compartir.
  const {
    pagina: currentPage, param: pageParam, navegar, reemplazar,
  } = useRutaTienda();

  // Con sesión, login/registro/landing redirigen al dashboard; la landing trae su
  // propia cabecera y duplicaría la de AppLayout.
  useEffect(() => {
    if (
      isAuthenticated &&
      (currentPage === 'login' || currentPage === 'register' || currentPage === 'landing')
    ) {
      reemplazar('dashboard');
    }
  }, [isAuthenticated, currentPage, reemplazar]);

  /** Sin sesión (logout, token expirado u otra pestaña) vuelve a la landing. */
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !PUBLIC_PAGES.includes(currentPage)) {
      reemplazar('landing');
    }
  }, [isLoading, isAuthenticated, currentPage, reemplazar]);

  const handleNavigate = (page: string, param?: string) => {
    navegar(page, param);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  // La contraseña provisional se cambia antes de cualquier vista privada, incluido el carrito.
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

  // Guardia de render: sin sesión no se pinta ninguna vista privada.
  if (!isAuthenticated && !PUBLIC_PAGES.includes(currentPage)) {
    return (
      <>
        <LandingPage onNavigate={handleNavigate} />
        <Toast />
      </>
    );
  }

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
        // El número viaja en la URL para que la campana abra la conversación exacta.
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
      {/* Responde consultando el sistema; si no sabe, escala al hilo del pedido. */}
      <Asistente onNavigate={handleNavigate} />
      {/* Pide los datos que Google no entrega, una sola vez. */}
      <CompleteProfileModal />
      <Toast />
    </AppLayout>
  );
}

/** Conecta la campana (proveedor compartido entre apps) a la sesión de la tienda. */
const CampanaConSesion: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return <MensajesProvider activo={isAuthenticated}>{children}</MensajesProvider>;
};

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <CartProvider>
          {/* La campana depende del inicio y cierre de sesión. */}
          <CampanaConSesion>
            <AppContent />
          </CampanaConSesion>
        </CartProvider>
      </ProjectProvider>
    </AuthProvider>
  );
}
