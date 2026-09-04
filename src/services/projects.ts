import { supabase } from '../lib/supabase';
import type {
  BudgetSummary,
  ConditionType,
  NotificationItem,
  PreliminaryAnalysis,
  Project,
  ProjectFormData,
  ProjectPhoto,
  ProjectStatus,
  RecommendedProduct,
  TechnicalService,
  TimelineStep,
} from '../types';

/**
 * Servicio de proyectos respaldado por Supabase — FASE 5.
 *
 * Conserva las firmas de la versión simulada para que ProjectContext y las
 * páginas no cambien.
 *
 * SOBRE EL AGREGADO `Project` (riesgo R9 de la auditoría):
 * El tipo del frontend es un objeto profundamente anidado que en SQL son
 * seis tablas. La consulta las trae en una sola llamada con relaciones
 * anidadas y `montarProyecto` las vuelve a ensamblar. Devolver filas planas
 * rompería ProjectDetailPage, que son 842 líneas construidas sobre esa forma.
 */

const BUCKET = 'project-files';
const VIGENCIA_URL_FIRMADA = 60 * 60; // 1 hora

// ============================================================
// ESTADOS
// ============================================================
// La base usa la nomenclatura del MÓDULO 9; el frontend su propia unión.
// La traducción vive aquí y en ningún otro sitio.
type DbStatus =
  | 'PENDIENTE' | 'EN_ANALISIS' | 'EN_PROCESO'
  | 'REQUIERE_INFORMACION' | 'COMPLETADO' | 'CANCELADO';

const DB_A_FRONT: Record<DbStatus, ProjectStatus | null> = {
  PENDIENTE: 'pending',
  EN_ANALISIS: 'analyzing',
  EN_PROCESO: 'in_progress',
  REQUIERE_INFORMACION: 'requires_info',
  COMPLETADO: 'completed',
  // La unión ProjectStatus no contempla la cancelación y ninguna pantalla
  // sabe pintarla. Estos proyectos se excluyen del listado hasta que se
  // añada el valor al tipo y un `case` en Badge.tsx.
  CANCELADO: null,
};

const FRONT_A_DB: Record<ProjectStatus, DbStatus> = {
  pending: 'PENDIENTE',
  analyzing: 'EN_ANALISIS',
  in_progress: 'EN_PROCESO',
  requires_info: 'REQUIERE_INFORMACION',
  completed: 'COMPLETADO',
};

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[projects] ${contexto}:`, error.message);
  return new Error('No fue posible completar la operación sobre el proyecto. Inténtalo nuevamente.');
}

// ============================================================
// CONSULTA
// ============================================================
const PROJECT_SELECT = `
  id, code, name, description, city, address, project_type, area_m2,
  required_date, surface, environment, current_color, selected_color,
  custom_condition, client_notes, status, current_step_progress,
  next_recommended_action, created_at, updated_at,
  project_pathologies ( pathologies ( name ) ),
  project_diagnoses (
    kind, solution_category, attention_level, requires_technical_visit,
    key_considerations, missing_information, ai_summary, technical_summary,
    disclaimer, recommended_products, budget_summary, created_at
  ),
  project_timeline_steps ( step_number, title, description, status, step_date, responsible ),
  project_files ( id, storage_path, file_name, size_bytes, description, is_primary, created_at, file_type ),
  technical_assistance (
    status, description, contact_phone, preferred_date, scheduled_date,
    specialist_name, specialist_title, requested_at
  )
`;

interface FilaProyecto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  city: string | null;
  address: string | null;
  project_type: Project['projectType'];
  area_m2: string | number | null;
  required_date: string | null;
  surface: string | null;
  environment: Project['environment'] | null;
  current_color: string | null;
  selected_color: Project['selectedColor'] | null;
  custom_condition: string | null;
  client_notes: string | null;
  status: DbStatus;
  current_step_progress: number | null;
  next_recommended_action: Project['nextRecommendedAction'] | null;
  created_at: string;
  updated_at: string;
  project_pathologies: Array<{ pathologies: { name: string } | null }> | null;
  project_diagnoses: Array<{
    kind: string;
    solution_category: string | null;
    attention_level: PreliminaryAnalysis['attentionLevel'] | null;
    requires_technical_visit: boolean;
    key_considerations: string[] | null;
    missing_information: string[] | null;
    ai_summary: string | null;
    technical_summary: string | null;
    disclaimer: string | null;
    recommended_products: RecommendedProduct[] | null;
    budget_summary: BudgetSummary | null;
    created_at: string;
  }> | null;
  project_timeline_steps: Array<{
    step_number: number;
    title: string;
    description: string | null;
    status: TimelineStep['status'];
    step_date: string | null;
    responsible: string | null;
  }> | null;
  project_files: Array<{
    id: string;
    storage_path: string;
    file_name: string;
    size_bytes: number | null;
    description: string | null;
    is_primary: boolean;
    created_at: string;
    file_type: string;
  }> | null;
  technical_assistance: Array<{
    status: string;
    description: string | null;
    contact_phone: string | null;
    preferred_date: string | null;
    scheduled_date: string | null;
    specialist_name: string | null;
    specialist_title: string | null;
    requested_at: string;
  }> | null;
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatearTamano = (bytes: number | null): string =>
  bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '';

/**
 * Genera URLs firmadas para las fotos. El bucket es privado: no existen
 * enlaces públicos permanentes a imágenes de obra.
 */
async function firmarFotos(
  archivos: FilaProyecto['project_files']
): Promise<ProjectPhoto[]> {
  const fotos = (archivos ?? []).filter((f) => f.file_type === 'PROJECT_PHOTO');
  if (fotos.length === 0) return [];

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(fotos.map((f) => f.storage_path), VIGENCIA_URL_FIRMADA);

  const urls = new Map<string, string>();
  if (error) {
    console.warn('[projects] no se pudieron firmar las fotos:', error.message);
  } else {
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) urls.set(item.path, item.signedUrl);
    }
  }

  return fotos.map((f) => ({
    id: f.id,
    url: urls.get(f.storage_path) ?? '',
    name: f.file_name,
    size: formatearTamano(f.size_bytes),
    uploadDate: new Date(f.created_at).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
    isPrimary: f.is_primary,
    storagePath: f.storage_path,
    description: f.description ?? undefined,
  }));
}

const ANALISIS_VACIO: PreliminaryAnalysis = {
  solutionCategory: '',
  detectedConditions: [],
  attentionLevel: 'Media',
  requiresTechnicalVisit: false,
  keyConsiderations: [],
  missingInformation: [],
  aiSummary: '',
  disclaimer: '',
};

const SERVICIO_TECNICO_VACIO: TechnicalService = { requested: false, status: 'none' };

/** Estados de la tabla -> unión TechnicalService['status'] del frontend. */
const ESTADO_ASESORIA: Record<string, TechnicalService['status']> = {
  SOLICITADO: 'solicitado',
  PROGRAMADO: 'programado',
  EN_VISITA: 'en_visita',
  INFORME_EMITIDO: 'informe_emitido',
  CANCELADO: 'none',
};

function montarServicioTecnico(
  filas: FilaProyecto['technical_assistance']
): TechnicalService {
  // Se toma la solicitud más reciente que siga viva.
  const viva = (filas ?? [])
    .filter((a) => a.status !== 'CANCELADO')
    .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())[0];

  if (!viva) return SERVICIO_TECNICO_VACIO;

  return {
    requested: true,
    status: ESTADO_ASESORIA[viva.status] ?? 'solicitado',
    requestedAt: new Date(viva.requested_at).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
    scheduledDate: viva.scheduled_date ?? viva.preferred_date ?? undefined,
    specialistName: viva.specialist_name ?? 'Por asignar (Asesor Técnico Pintuco)',
    specialistTitle: viva.specialist_title ?? undefined,
    notes: viva.description ?? undefined,
    contactPhone: viva.contact_phone ?? undefined,
  };
}

async function montarProyecto(fila: FilaProyecto): Promise<Project> {
  const condiciones = (fila.project_pathologies ?? [])
    .map((pp) => pp.pathologies?.name)
    .filter((n): n is string => Boolean(n)) as ConditionType[];

  // Se toma el diagnóstico más reciente.
  const diagnosticos = [...(fila.project_diagnoses ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const d = diagnosticos[0];

  const timeline: TimelineStep[] = [...(fila.project_timeline_steps ?? [])]
    .sort((a, b) => a.step_number - b.step_number)
    .map((t) => ({
      id: t.step_number,
      stepNumber: t.step_number,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      date: t.step_date ?? undefined,
      responsible: t.responsible ?? undefined,
    }));

  return {
    id: fila.id,
    code: fila.code,
    name: fila.name,
    city: fila.city ?? '',
    projectType: fila.project_type,
    areaM2: num(fila.area_m2),
    requiredDate: fila.required_date ?? '',
    description: fila.description ?? '',
    surface: (fila.surface ?? 'Otra') as Project['surface'],
    environment: (fila.environment ?? 'Otro') as Project['environment'],
    currentColor: fila.current_color ?? undefined,
    selectedColor: fila.selected_color ?? undefined,
    conditions: condiciones,
    customCondition: fila.custom_condition ?? undefined,
    photos: await firmarFotos(fila.project_files),
    status: DB_A_FRONT[fila.status] ?? 'pending',
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
    currentStepProgress: fila.current_step_progress ?? undefined,
    nextRecommendedAction: fila.next_recommended_action ?? undefined,
    preliminaryAnalysis: d
      ? {
          solutionCategory: d.solution_category ?? '',
          detectedConditions: condiciones,
          attentionLevel: d.attention_level ?? 'Media',
          requiresTechnicalVisit: d.requires_technical_visit,
          keyConsiderations: d.key_considerations ?? [],
          missingInformation: d.missing_information ?? [],
          aiSummary: d.ai_summary ?? '',
          technicalSummary: d.technical_summary ?? undefined,
          disclaimer: d.disclaimer ?? '',
        }
      : ANALISIS_VACIO,
    recommendedProducts: d?.recommended_products ?? [],
    budgetSummary: d?.budget_summary ?? undefined,
    timeline,
    technicalService: montarServicioTecnico(fila.technical_assistance),
    clientNotes: fila.client_notes ?? undefined,
  };
}

// ============================================================
// SUBIDA DE FOTOS
// ============================================================
/**
 * Sube las fotos de un proyecto a Storage y registra sus metadatos.
 *
 * Se ejecuta DESPUÉS de crear el proyecto porque la ruta incluye su id, que
 * es lo que usan las políticas del bucket para decidir el permiso.
 * Un fallo aquí no invalida el proyecto: se registra y se continúa, porque
 * perder el proyecto entero por una foto sería peor que quedarse sin ella.
 */
async function subirFotos(projectId: string, fotos: ProjectPhoto[]): Promise<void> {
  const conArchivo = fotos.filter((f) => f.file instanceof File);
  if (conArchivo.length === 0) return;

  const { data: sesion } = await supabase.auth.getSession();
  const userId = sesion.session?.user?.id ?? null;

  for (const foto of conArchivo) {
    const archivo = foto.file as File;
    const extension = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const ruta = `${projectId}/${crypto.randomUUID()}.${extension}`;

    const { error: errorSubida } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

    if (errorSubida) {
      console.error('[projects] fallo al subir foto:', errorSubida.message);
      continue;
    }

    const { error: errorFila } = await supabase.from('project_files').insert({
      project_id: projectId,
      file_type: 'PROJECT_PHOTO',
      storage_path: ruta,
      file_name: archivo.name,
      mime_type: archivo.type,
      size_bytes: archivo.size,
      is_primary: foto.isPrimary ?? false,
      uploaded_by: userId,
    });

    if (errorFila) {
      // El binario quedó subido pero sin metadatos: se elimina para no
      // dejar huérfanos en el bucket.
      console.error('[projects] fallo al registrar la foto:', errorFila.message);
      await supabase.storage.from(BUCKET).remove([ruta]);
    }
  }
}

// ============================================================
// SERVICIO
// ============================================================
export const projectService = {
  async getProjects(filters?: { status?: ProjectStatus; search?: string }): Promise<Project[]> {
    let consulta = supabase
      .from('projects')
      .select(PROJECT_SELECT)
      // Los cancelados se excluyen: el frontend no sabe representarlos.
      .neq('status', 'CANCELADO')
      .order('created_at', { ascending: false });

    if (filters?.status) consulta = consulta.eq('status', FRONT_A_DB[filters.status]);

    if (filters?.search?.trim()) {
      const q = filters.search.trim().replace(/[%,()]/g, '');
      consulta = consulta.or(
        `name.ilike.%${q}%,city.ilike.%${q}%,code.ilike.%${q}%,surface.ilike.%${q}%`
      );
    }

    const { data, error } = await consulta;
    if (error) throw errorLegible('getProjects', error);

    return Promise.all(((data ?? []) as unknown as FilaProyecto[]).map(montarProyecto));
  },

  async getProjectById(id: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw errorLegible('getProjectById', error);
    return data ? montarProyecto(data as unknown as FilaProyecto) : null;
  },

  /**
   * Crea un proyecto completo.
   *
   * La escritura en las cinco tablas ocurre dentro de la función
   * public.create_project: o se crea todo, o nada.
   *
   * EL DIAGNÓSTICO YA NO SE MANDA. Lo calcula `diagnosticar_proyecto` en la
   * base (20260904100004) contra el catálogo real. Antes lo armaba el
   * navegador con códigos y precios escritos a mano —ninguno existía en
   * `products`— y el servidor guardaba lo que le llegara, así que cualquiera
   * podía fijarse su propio nivel de atención y su presupuesto desde la
   * consola. Aquí solo viajan los datos que el cliente sí escribió.
   */
  async createProject(formData: ProjectFormData): Promise<Project> {
    const payload = {
      name: formData.name,
      description: formData.description,
      city: formData.city,
      project_type: formData.projectType,
      area_m2: formData.areaM2 === '' ? null : String(formData.areaM2),
      required_date: formData.requiredDate || '20 días',
      surface: formData.surface,
      environment: formData.environment,
      current_color: formData.currentColor || 'No especificado',
      custom_condition: formData.customCondition ?? null,
      conditions: formData.conditions,
      selected_color: {
        name: 'Blanco Nieve',
        code: 'PNT-101',
        hex: '#F8FAFC',
        family: 'Blancos & Neutros Pintuco',
      },
      next_recommended_action: {
        title: 'Revisar diagnóstico técnico y presupuesto preliminar',
        description:
          'Se generó la estimación de materiales y productos sugeridos. Puedes solicitar visita técnica especializada.',
        actionLabel: 'Ver expediente completo',
        actionType: 'validate_solution',
      },
    };

    const { data: nuevoId, error } = await supabase.rpc('create_project', { _payload: payload });
    if (error) throw errorLegible('createProject', error);

    const projectId = nuevoId as string;

    // Las fotos van después: su ruta necesita el id del proyecto.
    await subirFotos(projectId, formData.photos);

    const creado = await this.getProjectById(projectId);
    if (!creado) throw new Error('El proyecto se creó pero no fue posible recuperarlo.');

    // La notificación la emite el trigger projects_notificar_creacion
    // dentro de la misma transacción que crea el proyecto (FASE 13).

    return creado;
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.city !== undefined) patch.city = updates.city;
    if (updates.clientNotes !== undefined) patch.client_notes = updates.clientNotes;
    if (updates.currentStepProgress !== undefined)
      patch.current_step_progress = updates.currentStepProgress;
    if (updates.nextRecommendedAction !== undefined)
      patch.next_recommended_action = updates.nextRecommendedAction;
    if (updates.selectedColor !== undefined) patch.selected_color = updates.selectedColor;
    if (updates.status !== undefined) {
      patch.status = FRONT_A_DB[updates.status];
      // La restricción de la tabla exige fecha de cierre al completar.
      if (updates.status === 'completed') patch.completed_at = new Date().toISOString();
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('projects').update(patch).eq('id', id);
      if (error) throw errorLegible('updateProject', error);
    }

    const actualizado = await this.getProjectById(id);
    if (!actualizado) throw new Error('No fue posible cargar el proyecto actualizado.');
    return actualizado;
  },

  /**
   * Solicita acompañamiento técnico (MÓDULO 21/22).
   *
   * La solicitud y el avance del paso 6 de la cronología ocurren dentro de
   * public.request_technical_assistance, en una sola transacción. La función
   * además evita duplicados: pulsar el botón dos veces actualiza la solicitud
   * abierta en lugar de generar dos visitas.
   */
  async requestTechnicalAssistance(
    projectId: string,
    details: { notes?: string; contactPhone?: string; preferredDate?: string }
  ): Promise<Project> {
    const { error } = await supabase.rpc('request_technical_assistance', {
      _project_id: projectId,
      _notes: details.notes ?? null,
      _contact_phone: details.contactPhone ?? null,
      _preferred_date: details.preferredDate ?? null,
    });
    if (error) throw errorLegible('requestTechnicalAssistance', error);

    const actualizado = await this.getProjectById(projectId);
    if (!actualizado) throw new Error('Proyecto no encontrado.');
    return actualizado;
  },
};

/** Se reexporta el tipo para quien lo necesite en fases posteriores. */
export type { NotificationItem };
