-- ============================================================
-- BACK-OFFICE · 01 — Roles internos
-- ============================================================
-- Solo añade valores al enum. PostgreSQL permite ALTER TYPE ... ADD VALUE
-- dentro de una transacción, pero NO usar el valor nuevo en esa misma
-- transacción: por eso esta migración no hace nada más.
-- ============================================================

alter type public.app_role add value if not exists 'BODEGA';
alter type public.app_role add value if not exists 'DESPACHO';
alter type public.app_role add value if not exists 'FACTURACION';
alter type public.app_role add value if not exists 'TESORERIA';
alter type public.app_role add value if not exists 'CONTABILIDAD';
alter type public.app_role add value if not exists 'SERVICIO_CLIENTE';
alter type public.app_role add value if not exists 'MARKETING';
alter type public.app_role add value if not exists 'GERENCIA';
