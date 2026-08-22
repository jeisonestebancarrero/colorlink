import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProjectProvider, useProjects } from './context/ProjectContext';
import { CartProvider } from './context/CartContext';
import { AppLayout } from './components/layout/AppLayout';
import { Toast } from './components/common/Toast';
import { CartDrawer } from './components/cart/CartDrawer';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { StorePage } from './pages/StorePage';
import { ColorVisualizerPage } from './pages/ColorVisualizerPage';
import { SolutionKitsPage } from './pages/SolutionKitsPage';
import { PaintCalculatorPage } from './pages/PaintCalculatorPage';
import { StoresLocatorPage } from './pages/StoresLocatorPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';

function AppContent() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { activeProjectId } = useProjects();

  // Current page view state
  const [currentPage, setCurrentPage] = useState<string>('landing');
  const [pageParam, setPageParam] = useState<string | undefined>(undefined);

  // If user logs in while on landing/login/register, auto redirect to dashboard
  useEffect(() => {
    if (isAuthenticated && (currentPage === 'login' || currentPage === 'register')) {
      setCurrentPage('dashboard');
    }
  }, [isAuthenticated, currentPage]);

  const handleNavigate = (page: string, param?: string) => {
    setCurrentPage(page);
    setPageParam(param);
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
      <Toast />
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </ProjectProvider>
    </AuthProvider>
  );
}
