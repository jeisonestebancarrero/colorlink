-- ============================================================
-- Una persona, un rol por proyecto
-- ============================================================
-- La clave primaria era (project_id, user_id, assignment_role), de modo que
-- la misma persona podía quedar asignada dos veces a la misma obra: una como
-- TECNICO y otra como ASESOR. Cambiarle el rol no lo cambiaba, lo duplicaba,
-- y en la pantalla del proyecto aparecía dos veces.
--
-- Nadie atiende una obra con dos sombreros a la vez, así que se declara lo
-- que ya era la intención: una asignación por persona y proyecto.
delete from public.project_assignments a
 using public.project_assignments b
 where a.project_id = b.project_id
   and a.user_id = b.user_id
   and a.assignment_role <> b.assignment_role
   and a.assigned_at < b.assigned_at;

alter table public.project_assignments
  add constraint project_assignments_una_por_persona
  unique (project_id, user_id);
