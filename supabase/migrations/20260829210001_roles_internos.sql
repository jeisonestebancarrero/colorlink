-- Roles internos. Solo ADD VALUE: un valor nuevo de enum no puede usarse en la
-- misma transacción que lo crea.

alter type public.app_role add value if not exists 'BODEGA';
alter type public.app_role add value if not exists 'DESPACHO';
alter type public.app_role add value if not exists 'FACTURACION';
alter type public.app_role add value if not exists 'TESORERIA';
alter type public.app_role add value if not exists 'CONTABILIDAD';
alter type public.app_role add value if not exists 'SERVICIO_CLIENTE';
alter type public.app_role add value if not exists 'MARKETING';
alter type public.app_role add value if not exists 'GERENCIA';
