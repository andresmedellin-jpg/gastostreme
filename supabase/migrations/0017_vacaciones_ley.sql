-- Vacaciones según la LFT (reforma 2023): cada registro se liga al año de servicio (periodo) que cubre,
-- y puede ser días disfrutados o vacaciones pagadas (con monto y prima vacacional).
set local search_path = app, public;
alter table vacaciones add column if not exists periodo int;          -- 1 = primer año cumplido, 2 = segundo, …
alter table vacaciones add column if not exists tipo text not null default 'disfrutadas';
alter table vacaciones add column if not exists monto numeric(12,2);  -- lo pagado por los días
alter table vacaciones add column if not exists prima numeric(12,2);  -- prima vacacional pagada (25 % mínimo)
alter table vacaciones add column if not exists creado_en timestamptz not null default now();
alter table vacaciones add constraint vacaciones_tipo_chk check (tipo in ('disfrutadas', 'pagadas'));
