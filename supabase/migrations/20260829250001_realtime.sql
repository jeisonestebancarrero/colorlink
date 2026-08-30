-- ============================================================
-- Realtime: publicar las tablas que se siguen en vivo
-- ============================================================
-- Supabase Realtime NO emite cambios de una tabla por el simple hecho de que
-- exista: hay que añadirla a la publicación `supabase_realtime`. Sin este
-- paso, `postgres_changes` se suscribe sin error y nunca recibe nada — que
-- es exactamente lo que ocurría: el seguimiento del cliente mostraba
-- "en vivo" y no se movía.
--
-- Se publican solo las tablas cuyo cambio debe verse al instante. Publicar
-- todo sería enviar tráfico innecesario a cada navegador conectado.
--
-- IMPORTANTE: Realtime respeta RLS. Cada quien recibe únicamente los cambios
-- de las filas que ya tenía permitido leer; publicar la tabla no expone
-- pedidos ajenos.
-- ============================================================

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.shipments;
alter publication supabase_realtime add table public.conversation_messages;
alter publication supabase_realtime add table public.notifications;

-- REPLICA IDENTITY FULL hace que el evento incluya también los valores
-- ANTERIORES de la fila. Sin esto, un UPDATE llega sin el estado previo y no
-- se puede saber qué cambió.
alter table public.orders                replica identity full;
alter table public.shipments             replica identity full;
alter table public.conversation_messages replica identity full;
alter table public.notifications         replica identity full;
