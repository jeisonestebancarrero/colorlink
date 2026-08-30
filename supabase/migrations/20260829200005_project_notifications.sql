-- ============================================================
-- FASE 13 — Notificaciones emitidas por el servidor
-- ============================================================
-- La notificación de creación de proyecto se emitía desde el navegador y
-- se guardaba en localStorage: se perdía al cambiar de dispositivo y podía
-- fabricarse a voluntad. Ahora la emite la propia transacción que crea el
-- proyecto, dentro de create_project.
-- ============================================================

create or replace function public.notificar_proyecto_creado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (
    user_id, project_id, type, title, message, action_required, action_label
  ) values (
    new.user_id,
    new.id,
    'info',
    'Diagnóstico preliminar generado',
    'Tu proyecto "' || new.name || '" fue creado exitosamente. Se ha calculado la estimación preliminar de materiales para ' ||
      coalesce(new.area_m2::text, '0') || ' m².',
    true,
    'Ver diagnóstico'
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (new.user_id, 'PROJECT_CREATED', 'projects', new.id,
          jsonb_build_object('code', new.code, 'area_m2', new.area_m2));

  return new;
end;
$$;

create trigger projects_notificar_creacion
  after insert on public.projects
  for each row execute function public.notificar_proyecto_creado();

-- Aviso al solicitar acompañamiento técnico (MÓDULO 24).
create or replace function public.notificar_asesoria_solicitada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_nombre text;
begin
  select p.name into v_nombre from public.projects p where p.id = new.project_id;

  insert into public.notifications (
    user_id, project_id, type, title, message
  ) values (
    new.user_id, new.project_id, 'success',
    'Acompañamiento técnico solicitado',
    'Hemos recibido tu solicitud para "' || coalesce(v_nombre, 'tu proyecto') ||
      '". Un especialista Pintuco se comunicará contigo.'
  );
  return new;
end;
$$;

create trigger technical_assistance_notificar
  after insert on public.technical_assistance
  for each row execute function public.notificar_asesoria_solicitada();
