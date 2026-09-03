-- ============================================================
-- Poner al día lo ya entregado
-- ============================================================
-- `read_at` acaba de empezar a usarse (20260902100028). Hasta ahora nadie lo
-- escribía, así que los 273 mensajes que ya existían están todos en null y la
-- campana nacería con 68 conversaciones «sin leer».
--
-- Ninguno de esos mensajes tiene evidencia de haber sido leído... ni de lo
-- contrario: sencillamente no se registraba. Arrancar con una cuenta de 68
-- avisos que nadie va a atender enseña a ignorar la campana, y ese hábito no
-- se recupera: el día que llegue un mensaje de verdad, el número ya no dirá
-- nada.
--
-- Así que se marca como leído todo lo ANTERIOR a este cambio. Es el corte
-- habitual al empezar a llevar una cuenta: lo de antes no se puede reconstruir
-- y se da por saldado; lo de aquí en adelante sí es fiable.
--
-- Se marca con la fecha del propio mensaje y no con `now()`: decir que un
-- mensaje de agosto se leyó hoy sería inventar un dato. Con su propia fecha,
-- la columna significa «se da por entregado cuando se escribió», que es lo que
-- de verdad se sabe.

update public.conversation_messages
   set read_at = created_at
 where read_at is null;

comment on column public.conversation_messages.read_at is
  'Cuándo se marcó leído el mensaje. Lo escribe `marcar_conversacion_leida` al '
  'ABRIR el chat. Los mensajes anteriores a 20260902100029 se dieron por '
  'entregados con su propia fecha: hasta entonces no se llevaba la cuenta.';
