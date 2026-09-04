-- ============================================================
-- Datos de la empresa para la DEMOSTRACIÓN, marcados como tales
-- ============================================================
-- Hasta hoy los datos del emisor de la factura iban vacíos a propósito: un NIT
-- es un identificador ante la DIAN y no se inventa. Se llenan ahora porque el
-- sistema se va a mostrar y una factura con la mitad de los campos en blanco
-- no deja ver el producto.
--
-- La regla con la que se llenan, y por la que hay que pasar sí o sí:
--
--   · EL NIT ES IMPOSIBLE DE CONFUNDIR CON UNO REAL. `900.000.000-0` no lo
--     tiene ninguna empresa: es la forma canónica de decir «esto es de
--     mentira». Un NIT plausible en una factura que alguien fotografíe deja
--     de ser una demostración y pasa a ser un documento que aparenta ser
--     legítimo, y peor: podría coincidir con el de una empresa real y
--     atribuirle facturas ajenas.
--   · LA RAZÓN SOCIAL LO DICE. «(DEMOSTRACIÓN)» sale impreso en el recibo,
--     así que la propia factura se delata sin que nadie tenga que explicarlo.
--   · EL PIE DE PÁGINA LO REPITE, porque el encabezado se recorta al
--     fotografiar y el pie no.
--
-- Cuando Pintuco entregue sus datos reales, esto se reemplaza desde
-- Configuración → Empresa. No hace falta tocar código.
-- ============================================================

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
