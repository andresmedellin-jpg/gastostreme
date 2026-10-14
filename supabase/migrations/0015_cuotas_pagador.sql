-- Quién paga cada concepto (el dueño paga mantenimiento, el inquilino la luz). Sale en "Recibí de" del recibo.
set local search_path = app, public;
alter table cuotas add column if not exists pagador text;
