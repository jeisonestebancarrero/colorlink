import React, { useState } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Toast } from '../common/Toast';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string, param?: string) => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  currentPage,
  onNavigate,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Fondo de la marca: óvalos difusos con los colores de Pintuco.
          ÓVALOS Y NO LÍNEAS porque un patrón de líneas compite con las filas
          de una tabla y con las tarjetas de producto; una mancha sin borde no
          se confunde con nada.
          CÓMO SE CALIBRÓ: se probó pintando este mismo div de rojo sólido.
          El mecanismo era correcto desde el principio —el div cubre todo el
          fondo y las tarjetas son semitransparentes, así que el color se ve
          incluso a través de ellas—; lo que fallaba eran los valores. Se pasó
          por 3 %, 9 % y 20 % sin que se percibiera nada, porque los centros de
          las manchas quedaban fuera de pantalla o detrás de la barra de
          navegación, que es opaca.
          Ahora los centros están DENTRO del área visible y por debajo de la
          barra, con intensidades que se ven sin ensuciar el texto.
          `fixed` para que no se desplace con el catálogo: manchas subiendo y
          bajando detrás de las fotos distraen más de lo que aportan. */}
      <div
        aria-hidden
        className="pointer-events-none select-none fixed inset-0 z-0"
        style={{
          backgroundImage: [
            'radial-gradient(30rem 30rem at 4% 46%, rgba(0,79,159,0.30), transparent 72%)',
            'radial-gradient(26rem 26rem at 97% 34%, rgba(2,132,199,0.26), transparent 72%)',
            'radial-gradient(28rem 26rem at 88% 90%, rgba(217,119,6,0.20), transparent 72%)',
            'radial-gradient(24rem 24rem at 8% 95%, rgba(0,45,92,0.22), transparent 72%)',
          ].join(', '),
        }}
      />

      {/* Off-canvas mobile & tablet navigation drawer */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Top Navigation Header */}
      <Navbar
        currentPage={currentPage}
        onNavigate={onNavigate}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Corporate Pintuco Footer */}
      <footer className="bg-[#002244] text-white border-t border-blue-900/60 mt-16">
        {/* Main Footer Links */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-md">
                  P
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xl font-black tracking-tight text-white">
                      COLOR<span className="text-yellow-400">LINK</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded">
                      PINTUCO
                    </span>
                  </div>
                  <p className="text-xs text-blue-200 font-medium">
                    Ecosistema Digital Inteligente
                  </p>
                </div>
              </div>
              <p className="text-xs text-blue-200/90 leading-relaxed">
                La plataforma oficial de Pintuco para comprar pinturas, simular colores en tiempo real, calcular metrajes exactos y especificar sistemas técnicos con respaldo de fábrica.
              </p>
              <div className="text-xs text-blue-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Centro de Servicios Digitales Activo</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-400">
                Acciones Principales
              </h4>
              <ul className="space-y-2 text-xs text-blue-100">
                <li>
                  <button
                    onClick={() => onNavigate('store')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Comprar Pinturas y Esmaltes
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('colors')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Carta de Colores & Visualizador 2025
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('calculator')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Calculadora de Galones y Metraje
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('solutions')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Kits de Solución por Patología
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('projects')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Gestión de Obras y Proyectos B2B
                  </button>
                </li>
              </ul>
            </div>

            {/* Lines of Product */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-400">
                Líneas Especializadas
              </h4>
              <ul className="space-y-2 text-xs text-blue-100">
                <li>
                  <button
                    onClick={() => onNavigate('store', 'Fachadas & Exteriores')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Fachadas y Protección Exterior (Koraza)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('store', 'Vinilos & Interiores')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Vinilos Lavables de Interior (Viniltex)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('store', 'Impermeabilizantes')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Impermeabilizantes de Techos (Aquablock)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('store', 'Esmaltes & Metales')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Anticorrosivos y Esmaltes (Pintulux)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('store', 'Maderas & Barnices')}
                    className="hover:text-yellow-400 transition-colors text-left cursor-pointer"
                  >
                    • Maderas y Barnices UV (Madetec)
                  </button>
                </li>
              </ul>
            </div>

            {/* Support & Stores */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-400">
                Atención y Retiro en Tienda
              </h4>
              <div className="space-y-2 text-xs text-blue-100">
                <p>
                  <strong className="text-white">Línea de Asesoría Técnica:</strong>
                  <br />
                  (01 8000) 111-247 / (604) 384 8484
                </p>
                <p>
                  <strong className="text-white">Retiro Express:</strong>
                  <br />
                  Compra online y retira gratis en 2 horas en tiendas Pintuco autorizadas.
                </p>
                <button
                  onClick={() => onNavigate('stores')}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold bg-yellow-400 text-slate-950 px-3 py-1.5 rounded-md hover:bg-yellow-300 transition-colors cursor-pointer"
                >
                  Buscar Tienda Pintuco Cercana
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-blue-900/80 bg-[#00172e] py-4 px-4 sm:px-6 lg:px-8 text-xs text-blue-300 flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
          <p>© {new Date().getFullYear()} Pintuco Colombia S.A.S. • ColorLink Ecosistema Digital.</p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Garantía de Calidad Certificada</span>
            <span>•</span>
            <span>Términos y Condiciones</span>
            <span>•</span>
            <span>Política de Privacidad</span>
          </div>
        </div>
      </footer>

      {/* Global Toast */}
      <Toast />
    </div>
  );
};

