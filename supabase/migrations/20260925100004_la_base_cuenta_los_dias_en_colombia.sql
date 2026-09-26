-- ============================================================================
-- La base cuenta los días en hora de Colombia
-- ============================================================================
-- La base corría en UTC. `current_date` —que fecha los movimientos de
-- tesorería, los comprobantes contables y las fechas por defecto— cambiaba de
-- día a las 7 p. m. de Colombia: un pago de las 8 p. m. del 25 quedaba fechado
-- el 26, y el cierre del día no coincidía con la caja.
--
-- Solo cambia cómo se interpreta «hoy». Las marcas de tiempo (`timestamptz`)
-- se guardan igual, en instantes absolutos, y se siguen mostrando en la hora
-- del navegador.
-- ============================================================================

alter database postgres set timezone to 'America/Bogota';
