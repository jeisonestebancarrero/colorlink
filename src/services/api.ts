/** Punto de reexportación que conserva los imports históricos desde '../services/api'. */
export { authService } from './auth';
export type { AccessInfo } from './auth';

export { projectService } from './projects';


/** Las notificaciones las emite el servidor con triggers; el navegador no puede fabricarlas. */
export { notificationService } from './commerce';

