-- Da por leídos los mensajes anteriores a read_at para que la campana no arranque con
-- avisos históricos. Se usa la fecha del mensaje, no now(), para no inventar el dato.

update public.conversation_messages
   set read_at = created_at
 where read_at is null;

comment on column public.conversation_messages.read_at is
  'Cuándo se marcó leído el mensaje. Lo escribe `marcar_conversacion_leida` al '
  'ABRIR el chat. Los mensajes anteriores a 20260902100029 se dieron por '
  'entregados con su propia fecha: hasta entonces no se llevaba la cuenta.';
