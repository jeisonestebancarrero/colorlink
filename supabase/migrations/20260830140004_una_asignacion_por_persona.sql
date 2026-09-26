-- Una asignación por persona y proyecto: la PK incluía el rol y cambiarlo duplicaba
-- la fila. Se conserva la más reciente.
delete from public.project_assignments a
 using public.project_assignments b
 where a.project_id = b.project_id
   and a.user_id = b.user_id
   and a.assignment_role <> b.assignment_role
   and a.assigned_at < b.assigned_at;

alter table public.project_assignments
  add constraint project_assignments_una_por_persona
  unique (project_id, user_id);
