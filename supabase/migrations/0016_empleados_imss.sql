-- Empleados asegurados en el IMSS (registro patronal de MEDCO Y39-27810-10-5).
-- Sirve para repartir IMSS / Infonavit / ISN entre las obras y edificios donde trabaja cada asegurado.
set local search_path = app, public;
alter table empleados add column if not exists imss boolean not null default false;
alter table empleados add column if not exists nss text;
alter table empleados add column if not exists nombre_imss text;
alter table empleados add column if not exists alta_imss date;
