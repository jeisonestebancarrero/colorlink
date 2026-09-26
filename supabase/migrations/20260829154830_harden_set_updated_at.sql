-- Fija search_path en set_updated_at, la única función de public que no lo tenía.

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
