-- Ajustes a la estructura antes de migrar los datos (aplicado como app_ajustes_migracion)
set local search_path = app, public;

alter table tareas drop constraint tareas_tipo_check;
alter table tareas add constraint tareas_tipo_check check (tipo in ('tarea','rondin','incidencia','hallazgo'));

alter table activos alter column fecha_valuacion type text using fecha_valuacion::text;
alter table activos add column inquilino text, add column ingreso_mensual numeric(14,2), add column fecha_vencimiento_contrato date;
alter table pasivos add column activo_ref text;

-- Rastreo: de qué registro viejo viene cada fila y quién lo capturó
alter table gastos      add column legacy_id text, add column capturado_por text;
alter table pagos       add column legacy_id text, add column capturado_por text;
alter table ingresos    add column legacy_id text, add column capturado_por text;
alter table tareas      add column legacy_id text;
alter table checadas    add column legacy_id text;
alter table empleados   add column legacy_id text;
alter table contratos   add column legacy_id text;
alter table cuentas_por_cobrar add column legacy_id text;
alter table activos     add column legacy_id text;
alter table pasivos     add column legacy_id text;
alter table unidades    add column legacy_id text;
