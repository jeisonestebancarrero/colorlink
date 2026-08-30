-- ============================================================
-- FASE 2 · 07 — Endurecimiento de public.set_updated_at()
-- ============================================================
-- La verificación del esquema detectó que esta función trigger era la única
-- del esquema `public` sin `search_path` fijado. El riesgo real es bajo (es
-- SECURITY INVOKER y no consulta ninguna tabla), pero se corrige para que
-- TODA función siga la misma regla y la verificación quede limpia.
--
-- MÓDULO 3: no se reescribe la migración original ya aplicada; la corrección
-- viaja en una migración incremental nueva.
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger de mantenimiento de updated_at. search_path bloqueado y now() calificado.';
