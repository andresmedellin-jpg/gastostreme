-- Prima vacacional solo para quien la recibe (Víctor, Bárbara, Victoria y Liz al 14/10/2026)
set local search_path = app, public;
alter table empleados add column if not exists prima_vacacional boolean not null default false;
