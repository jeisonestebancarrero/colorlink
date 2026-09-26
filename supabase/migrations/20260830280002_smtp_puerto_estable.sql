-- Gmail por el 465 (TLS implícito): STARTTLS en el 587 falla en Deno fuera del
-- catch y deja los correos en PENDIENTE.
update public.app_settings
   set smtp_port = 465,
       smtp_secure = true
 where smtp_host ilike '%gmail%' and smtp_port = 587;

comment on column public.app_settings.smtp_port is
  'Puerto SMTP. Con Gmail usar 465 (TLS directo): el 587 rompe el runtime de las Edge Functions.';
