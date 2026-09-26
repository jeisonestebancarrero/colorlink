-- Datos de emisor para la demostración, marcados como ficticios: NIT 900.000.000-0
-- (no asignable) y «(DEMOSTRACIÓN)» en razón social y pie. Se reemplazan desde
-- Configuración → Empresa.

update public.app_settings set
  company_legal_name = 'PINTUCO COLOMBIA S.A.S. (DEMOSTRACIÓN)',
  company_nit        = '900.000.000-0',
  company_address    = 'Calle 0 # 0 - 0, Zona de Demostración',
  company_city       = 'Medellín',
  company_phone      = '(604) 000 0000',
  company_email      = coalesce(nullif(company_email, ''), 'demo@colorlink.test'),
  company_website    = 'colorlink.demo',
  invoice_footer     = 'DOCUMENTO DE DEMOSTRACIÓN — sin validez fiscal. '
                       'Datos del emisor de ejemplo. Gracias por su compra.';

comment on column public.app_settings.company_nit is
  'NIT del emisor. Hoy contiene 900.000.000-0, un valor IMPOSIBLE de confundir '
  'con uno real, puesto a propósito para la demostración. Reemplazar por el NIT '
  'real de Pintuco antes de emitir un solo documento con validez.';
