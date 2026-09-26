-- Publica en supabase_realtime las tablas que se siguen en vivo; sin esto la
-- suscripción no falla pero nunca recibe eventos. Realtime respeta RLS.

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.shipments;
alter publication supabase_realtime add table public.conversation_messages;
alter publication supabase_realtime add table public.notifications;

-- REPLICA IDENTITY FULL: los UPDATE llegan con los valores anteriores.
alter table public.orders                replica identity full;
alter table public.shipments             replica identity full;
alter table public.conversation_messages replica identity full;
alter table public.notifications         replica identity full;
