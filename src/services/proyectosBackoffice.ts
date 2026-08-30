import { supabase } from '../lib/supabase';
export { formatearFecha, hoyISO } from './backoffice';

/**
 * Proyectos y visitas técnicas del back-office.
 *
 * Ninguna decisión de permisos vive aquí: las políticas RLS filtran las filas
 * y las funciones del servidor validan cada acción. Este archivo consulta y
 * presenta.
 *
 * Un detalle que condiciona todo el módulo: lo que ve cada persona depende de
 * su rol. Administración y quien tenga el permiso `projects.read` ven todos
 * los proyectos; un técnico ve únicamente aquellos a los que está asignado.
 * No es una limitación de esta pantalla, es la regla del negocio: el técnico
 * de Barranquilla no tiene por qué leer la obra de Medellín.
 */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[proyectos] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permisos para esta operación.');
  if (/NOT_STAFF/.test(m)) {
    return new Error('Solo se puede asignar personal interno a un proyecto.');
  }
  if (/RESULT_REQUIRED/.test(m)) {
    return new Error('Para cerrar la visita hay que registrar qué se encontró en la obra.');
  }
  if (/BAD_DATE/.test(m)) return new Error('La visita necesita una fecha.');
  if (/BAD_STATUS|BAD_ROLE/.test(m)) return new Error('Ese valor no es válido.');
  if (/NOT_FOUND/.test(m)) return new Error('El elemento indicado ya no existe.');
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

// ============================================================
// PROYECTOS
// ============================================================
export const ESTADOS_PROYECTO = [
  'PENDIENTE', 'EN_ANALISIS', 'EN_PROCESO', 'REQUIERE_INFORMACION',
  'COMPLETADO', 'CANCELADO',
] as const;

export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];

export const ETIQUETA_PROYECTO: Record<EstadoProyecto, string> = {
  PENDIENTE: 'Pendiente',
  EN_ANALISIS: 'En análisis',
  EN_PROCESO: 'En proceso',
  REQUIERE_INFORMACION: 'Requiere información',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
};

export const COLOR_PROYECTO: Record<EstadoProyecto, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-700 border-slate-200',
  EN_ANALISIS: 'bg-blue-50 text-blue-700 border-blue-200',
  EN_PROCESO: 'bg-amber-50 text-amber-700 border-amber-200',
  REQUIERE_INFORMACION: 'bg-orange-50 text-orange-700 border-orange-200',
  COMPLETADO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELADO: 'bg-rose-50 text-rose-700 border-rose-200',
};

export interface ProyectoLista {
  id: string;
  codigo: string;
  nombre: string;
  ciudad: string;
  tipo: string;
  areaM2: number | null;
  estado: EstadoProyecto;
  progreso: number;
  cliente: string;
  empresa: string | null;
  creado: string;
  requeridoPara: string | null;
  asignados: Array<{ id: string; nombre: string; rol: string }>;
  visitasPendientes: number;
}

interface FilaProyecto {
  id: string;
  code: string;
  name: string;
  city: string | null;
  project_type: string | null;
  area_m2: number | string | null;
  status: EstadoProyecto;
  current_step_progress: number | null;
  created_at: string;
  required_date: string | null;
  next_recommended_action: string | null;
  description: string | null;
  address: string | null;
  client_notes: string | null;
  surface: string | null;
  environment: string | null;
  profiles: { first_name: string; last_name: string; email: string | null; phone: string | null } | null;
  companies: { name: string } | null;
  project_assignments: Array<{
    assignment_role: string;
    profiles: { id: string; first_name: string; last_name: string } | null;
  }> | null;
  technical_visits: Array<{ id: string; status: string }> | null;
}

const SELECT_PROYECTO = `
  id, code, name, city, project_type, area_m2, status, current_step_progress,
  created_at, required_date, next_recommended_action, description, address,
  client_notes, surface, environment,
  profiles:user_id ( first_name, last_name, email, phone ),
  companies:company_id ( name ),
  project_assignments ( assignment_role, profiles:user_id ( id, first_name, last_name ) ),
  technical_visits ( id, status )
`;

function aProyecto(f: FilaProyecto): ProyectoLista {
  const area = f.area_m2 === null ? null : Number(f.area_m2);
  return {
    id: f.id,
    codigo: f.code,
    nombre: f.name,
    ciudad: f.city ?? '—',
    tipo: f.project_type ?? '—',
    areaM2: Number.isFinite(area) ? area : null,
    estado: f.status,
    progreso: f.current_step_progress ?? 0,
    cliente: f.profiles
      ? `${f.profiles.first_name} ${f.profiles.last_name}`.trim()
      : 'Cliente retirado',
    empresa: f.companies?.name ?? null,
    creado: f.created_at,
    requeridoPara: f.required_date,
    asignados: (f.project_assignments ?? [])
      .filter((a) => a.profiles)
      .map((a) => ({
        id: a.profiles!.id,
        nombre: `${a.profiles!.first_name} ${a.profiles!.last_name}`.trim(),
        rol: a.assignment_role,
      })),
    // "Pendiente" es todo lo que aún exige que alguien vaya a la obra.
    visitasPendientes: (f.technical_visits ?? []).filter((v) =>
      ['PROGRAMADA', 'CONFIRMADA', 'EN_CURSO', 'REPROGRAMADA'].includes(v.status),
    ).length,
  };
}

export interface ProyectoDetalle extends ProyectoLista {
  descripcion: string | null;
  direccion: string | null;
  notasCliente: string | null;
  superficie: string | null;
  ambiente: string | null;
  proximaAccion: string | null;
  correoCliente: string | null;
  telefonoCliente: string | null;
  diagnosticos: Array<{
    id: string;
    tipo: string;
    nivel: string | null;
    requiereVisita: boolean;
    resumen: string | null;
    resumenTecnico: string | null;
    creado: string;
  }>;
  patologias: Array<{ nombre: string; severidad: string | null }>;
  cronologia: Array<{
    numero: number;
    titulo: string;
    descripcion: string | null;
    estado: string;
    fecha: string | null;
    responsable: string | null;
  }>;
  visitas: VisitaLista[];
  solicitudes: Array<{
    id: string;
    tipo: string;
    estado: string;
    descripcion: string | null;
    solicitada: string;
    programada: string | null;
  }>;
}

export const proyectoService = {
  async listar(): Promise<ProyectoLista[]> {
    const { data, error } = await supabase
      .from('projects')
      .select(SELECT_PROYECTO)
      .order('created_at', { ascending: false });

    if (error) throw errorLegible('listar', error);
    return ((data ?? []) as unknown as FilaProyecto[]).map(aProyecto);
  },

  async detalle(id: string): Promise<ProyectoDetalle> {
    const [{ data, error }, diagnosticos, patologias, cronologia, visitas, solicitudes] =
      await Promise.all([
        supabase.from('projects').select(SELECT_PROYECTO).eq('id', id).maybeSingle(),
        supabase
          .from('project_diagnoses')
          .select('id, kind, attention_level, requires_technical_visit, ai_summary, technical_summary, created_at')
          .eq('project_id', id)
          .order('created_at', { ascending: false }),
        // El nombre de la patología vive en el catálogo `pathologies`, no en
        // la tabla del proyecto: aquí solo se guarda la referencia.
        supabase
          .from('project_pathologies')
          .select('severity, observations, pathologies:pathology_id ( name )')
          .eq('project_id', id),
        supabase
          .from('project_timeline_steps')
          .select('step_number, title, description, status, step_date, responsible')
          .eq('project_id', id)
          .order('step_number'),
        visitaService.listar(id),
        supabase
          .from('technical_assistance')
          .select('id, kind, status, description, requested_at, scheduled_date')
          .eq('project_id', id)
          .order('requested_at', { ascending: false }),
      ]);

    if (error) throw errorLegible('detalle', error);
    if (!data) throw new Error('El proyecto ya no existe.');

    const f = data as unknown as FilaProyecto;
    const base = aProyecto(f);

    return {
      ...base,
      descripcion: f.description,
      direccion: f.address,
      notasCliente: f.client_notes,
      superficie: f.surface,
      ambiente: f.environment,
      proximaAccion: f.next_recommended_action,
      correoCliente: f.profiles?.email ?? null,
      telefonoCliente: f.profiles?.phone ?? null,
      // Al crear el proyecto se abre un diagnóstico PRELIMINAR vacío, que se
      // llena cuando el cliente pasa por el diagnosticador. Mostrarlo sin
      // contenido pinta una tarjeta hueca que parece un fallo, así que se
      // marca como vacío y la pantalla decide.
      diagnosticos: (diagnosticos.data ?? []).map((d: Record<string, unknown>) => ({
        id: String(d.id),
        tipo: String(d.kind ?? ''),
        nivel: (d.attention_level as string) ?? null,
        requiereVisita: Boolean(d.requires_technical_visit),
        resumen: (d.ai_summary as string) ?? null,
        resumenTecnico: (d.technical_summary as string) ?? null,
        creado: String(d.created_at),
      })),
      patologias: (patologias.data ?? [])
        .map((p: Record<string, unknown>) => ({
          nombre: (p.pathologies as { name?: string } | null)?.name ?? '',
          severidad: (p.severity as string) ?? null,
        }))
        .filter((p) => p.nombre !== ''),
      cronologia: (cronologia.data ?? []).map((c: Record<string, unknown>) => ({
        numero: Number(c.step_number ?? 0),
        titulo: String(c.title ?? ''),
        descripcion: (c.description as string) ?? null,
        estado: String(c.status ?? ''),
        fecha: (c.step_date as string) ?? null,
        responsable: (c.responsible as string) ?? null,
      })),
      visitas,
      solicitudes: (solicitudes.data ?? []).map((s: Record<string, unknown>) => ({
        id: String(s.id),
        tipo: String(s.kind ?? ''),
        estado: String(s.status ?? ''),
        descripcion: (s.description as string) ?? null,
        solicitada: String(s.requested_at),
        programada: (s.scheduled_date as string) ?? null,
      })),
    };
  },

  async cambiarEstado(id: string, estado: EstadoProyecto, nota?: string): Promise<void> {
    const { error } = await supabase.rpc('set_project_status', {
      _project_id: id,
      _estado: estado,
      _nota: nota ?? null,
    });
    if (error) throw errorLegible('cambiarEstado', error);
  },

  async asignar(projectId: string, userId: string, rol: 'TECNICO' | 'ASESOR'): Promise<void> {
    const { error } = await supabase.rpc('assign_to_project', {
      _project_id: projectId,
      _user_id: userId,
      _rol: rol,
    });
    if (error) throw errorLegible('asignar', error);
  },

  async retirarAsignacion(projectId: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('unassign_from_project', {
      _project_id: projectId,
      _user_id: userId,
    });
    if (error) throw errorLegible('retirarAsignacion', error);
  },
};

// ============================================================
// VISITAS TÉCNICAS
// ============================================================
export const ESTADOS_VISITA = [
  'PROGRAMADA', 'CONFIRMADA', 'EN_CURSO', 'REALIZADA', 'CANCELADA', 'REPROGRAMADA',
] as const;

export type EstadoVisita = (typeof ESTADOS_VISITA)[number];

export const ETIQUETA_VISITA: Record<EstadoVisita, string> = {
  PROGRAMADA: 'Programada',
  CONFIRMADA: 'Confirmada',
  EN_CURSO: 'En curso',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
  REPROGRAMADA: 'Reprogramada',
};

export const COLOR_VISITA: Record<EstadoVisita, string> = {
  PROGRAMADA: 'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMADA: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  EN_CURSO: 'bg-amber-50 text-amber-700 border-amber-200',
  REALIZADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELADA: 'bg-rose-50 text-rose-700 border-rose-200',
  REPROGRAMADA: 'bg-slate-100 text-slate-700 border-slate-200',
};

/**
 * Qué se puede hacer con una visita según cómo esté.
 *
 * Es una COPIA de lo que valida el servidor, usada solo para no ofrecer
 * botones que van a ser rechazados. La verdad sigue estando en la base.
 */
export const TRANSICIONES_VISITA: Record<EstadoVisita, EstadoVisita[]> = {
  PROGRAMADA: ['CONFIRMADA', 'EN_CURSO', 'REPROGRAMADA', 'CANCELADA'],
  CONFIRMADA: ['EN_CURSO', 'REPROGRAMADA', 'CANCELADA'],
  EN_CURSO: ['REALIZADA', 'CANCELADA'],
  REPROGRAMADA: ['CONFIRMADA', 'EN_CURSO', 'CANCELADA'],
  REALIZADA: [],
  CANCELADA: [],
};

export interface VisitaLista {
  id: string;
  projectId: string;
  proyecto: string;
  codigoProyecto: string;
  cliente: string;
  ciudad: string;
  direccion: string | null;
  fecha: string | null;
  hora: string | null;
  estado: EstadoVisita;
  tecnico: string | null;
  tecnicoId: string | null;
  resultado: string | null;
  observaciones: string | null;
  assistanceId: string | null;
}

interface FilaVisita {
  id: string;
  project_id: string;
  assistance_id: string | null;
  technician_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  address: string | null;
  status: EstadoVisita;
  result: string | null;
  observations: string | null;
  projects: {
    name: string;
    code: string;
    city: string | null;
    profiles: { first_name: string; last_name: string } | null;
  } | null;
  profiles: { first_name: string; last_name: string } | null;
}

const SELECT_VISITA = `
  id, project_id, assistance_id, technician_id, scheduled_date, scheduled_time,
  address, status, result, observations,
  projects:project_id ( name, code, city, profiles:user_id ( first_name, last_name ) ),
  profiles:technician_id ( first_name, last_name )
`;

function aVisita(f: FilaVisita): VisitaLista {
  return {
    id: f.id,
    projectId: f.project_id,
    proyecto: f.projects?.name ?? '—',
    codigoProyecto: f.projects?.code ?? '—',
    cliente: f.projects?.profiles
      ? `${f.projects.profiles.first_name} ${f.projects.profiles.last_name}`.trim()
      : '—',
    ciudad: f.projects?.city ?? '—',
    direccion: f.address,
    fecha: f.scheduled_date,
    hora: f.scheduled_time,
    estado: f.status,
    tecnico: f.profiles ? `${f.profiles.first_name} ${f.profiles.last_name}`.trim() : null,
    tecnicoId: f.technician_id,
    resultado: f.result,
    observaciones: f.observations,
    assistanceId: f.assistance_id,
  };
}

export const visitaService = {
  async listar(projectId?: string): Promise<VisitaLista[]> {
    let q = supabase.from('technical_visits').select(SELECT_VISITA);
    if (projectId) q = q.eq('project_id', projectId);

    // Sin fecha primero: una visita sin programar es justo la que hay que
    // atender, y enterrarla al final de la lista es como no tenerla.
    const { data, error } = await q
      .order('scheduled_date', { ascending: true, nullsFirst: true })
      .order('scheduled_time', { ascending: true, nullsFirst: true });

    if (error) throw errorLegible('listarVisitas', error);
    return ((data ?? []) as unknown as FilaVisita[]).map(aVisita);
  },

  async programar(datos: {
    projectId: string;
    fecha: string;
    hora?: string;
    tecnicoId?: string;
    direccion?: string;
    assistanceId?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('schedule_technical_visit', {
      _project_id: datos.projectId,
      _fecha: datos.fecha,
      _hora: datos.hora ?? null,
      _technician_id: datos.tecnicoId ?? null,
      _direccion: datos.direccion ?? null,
      _assistance_id: datos.assistanceId ?? null,
    });
    if (error) throw errorLegible('programar', error);
    return String(data);
  },

  async actualizar(datos: {
    visitId: string;
    estado: EstadoVisita;
    resultado?: string;
    observaciones?: string;
    fecha?: string;
    hora?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('update_technical_visit', {
      _visit_id: datos.visitId,
      _estado: datos.estado,
      _resultado: datos.resultado ?? null,
      _observaciones: datos.observaciones ?? null,
      _fecha: datos.fecha ?? null,
      _hora: datos.hora ?? null,
    });
    if (error) throw errorLegible('actualizarVisita', error);
  },

  /** Personal que puede ir a una obra. */
  async tecnicos(): Promise<Array<{ id: string; nombre: string; rol: string }>> {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, role, profiles:user_id ( first_name, last_name )')
      .in('role', ['TECNICO', 'ASESOR']);

    // El error se propaga a propósito. Antes se atrapaba y la pantalla
    // mostraba un desplegable vacío, que se lee como "no hay técnicos" cuando
    // en realidad la consulta había fallado.
    if (error) throw errorLegible('tecnicos', error);

    const vistos = new Set<string>();
    const lista: Array<{ id: string; nombre: string; rol: string }> = [];
    for (const r of (data ?? []) as unknown as Array<{
      user_id: string;
      role: string;
      profiles: { first_name: string; last_name: string } | null;
    }>) {
      if (!r.profiles || vistos.has(r.user_id)) continue;
      vistos.add(r.user_id);
      lista.push({
        id: r.user_id,
        nombre: `${r.profiles.first_name} ${r.profiles.last_name}`.trim(),
        rol: r.role,
      });
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },
};
