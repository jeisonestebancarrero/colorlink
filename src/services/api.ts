/**
 * FASE 2 — La autenticación dejó de ser simulada.
 *
 * `authService` vive ahora en ./auth respaldado por Supabase Auth. Se
 * reexporta desde aquí para que AuthContext y las páginas conserven su
 * import original (`from '../services/api'`) sin ningún cambio.
 *
 * Ver más abajo el estado de los demás servicios.
 */
export { authService } from './auth';
export type { AccessInfo } from './auth';

/**
 * FASE 5 — Los proyectos dejaron de ser simulados.
 *
 * `projectService` vive ahora en ./projects respaldado por Supabase
 * (tablas projects, project_surfaces, project_pathologies,
 * project_diagnoses, project_timeline_steps y project_files, más el bucket
 * project-files de Storage). Se reexporta desde aquí para que
 * ProjectContext conserve su import original.
 *
 * `notificationService` sigue en localStorage hasta la FASE 13 (MÓDULO 24).
 */
export { projectService } from './projects';


/**
 * FASE 13 — Las notificaciones dejaron de ser locales.
 *
 * `notificationService` vive ahora en ./commerce sobre la tabla
 * `notifications`. Las emite el servidor (triggers de creación de proyecto,
 * de asesoría y de pedido), no el navegador: así llegan igual desde
 * cualquier dispositivo y nadie puede fabricarse avisos.
 */
export { notificationService } from './commerce';

/**
 * FASE 4 — `catalogService` retirado.
 *
 * Su única función (getSolutions sobre el array SOLUTIONS_CATALOG) quedó
 * reemplazada por `solutionService.getCatalog()` en services/catalog.ts,
 * que lee de Supabase y está cubierto por pruebas de fidelidad.
 * Ya no lo consumía ningún componente; mantenerlo habría dejado una segunda
 * fuente de verdad para las soluciones (MÓDULO 52).
 */
