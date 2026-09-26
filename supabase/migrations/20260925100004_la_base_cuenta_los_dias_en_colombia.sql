-- Zona horaria de la base a Colombia: con UTC, current_date cambiaba de día a las 7 p. m.
-- y fechaba mal tesorería y comprobantes. Los timestamptz no cambian.

alter database postgres set timezone to 'America/Bogota';
