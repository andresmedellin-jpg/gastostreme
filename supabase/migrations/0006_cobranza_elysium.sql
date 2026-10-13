-- Resumen de lo aplicado el 13/oct/2026 para Cobranza Elysium (ver historial de migraciones en Supabase):
-- respaldo_catalogo_cobranza_elysium: 272 pagos que vivían en el código de cobranzaelysium/index.html,
--   guardados tal cual en respaldo_20261012.catalogo_cobranza.
-- app_pagos_catalogo_cobranza_elysium: 256 de ellos (los que la base no tenía) pasan a app.pagos,
--   legacy_id 'catalogo:<tipo>:<local>:<mes>'. Sin fecha o con fecha a futuro -> día 1 del mes, con nota.
-- app_cobranza_ajustes:
set local search_path = app, public;
update cuotas c set activo = false
from unidades u where u.id = c.unidad_id and u.exento and c.concepto = 'mantenimiento';
alter table cuotas add column if not exists en_padron boolean not null default true;
update cuotas c set en_padron = false
from unidades u
where u.id = c.unidad_id and c.concepto = 'mantenimiento'
  and u.identificador in ('*904','*905','16A','16B','16C')
  and not exists (select 1 from pagos p where p.unidad_id = u.id and p.concepto = 'mantenimiento');
update unidades set identificador = replace(identificador, ' Y ', ' y ') where identificador like '% Y %';
alter policy pagos_borrar on pagos using (tiene_rol(org_id, array['administracion','cobranza']::rol_usuario[]));
-- app_unir_oficinas_904_905: pagos y cuota de luz de *904/*905 pasan a 904/905; las unidades viejas quedan inactivas.
