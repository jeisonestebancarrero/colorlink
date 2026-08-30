-- ============================================================
-- Gmail por el puerto 465
-- ============================================================
-- El 587 negocia STARTTLS sobre una conexión ya abierta, y esa negociación
-- falla dentro del runtime de Deno: la librería lanza "invalid cmd" fuera del
-- bucle de eventos y se lleva por delante la función completa, sin que el
-- bloque catch alcance a registrar nada. El síntoma era un correo que se
-- quedaba en PENDIENTE para siempre.
--
-- Con el 465 la conexión ya nace cifrada, no hay negociación intermedia y el
-- envío es estable. Gmail admite los dos puertos, así que no se pierde nada.
update public.app_settings
   set smtp_port = 465,
       smtp_secure = true
 where smtp_host ilike '%gmail%' and smtp_port = 587;

comment on column public.app_settings.smtp_port is
  'Puerto SMTP. Con Gmail usar 465 (TLS directo): el 587 rompe el runtime de las Edge Functions.';
