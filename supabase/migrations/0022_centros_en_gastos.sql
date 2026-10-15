-- Centros que aparecen en los menús de Gastos. Las plazas que solo tienen rentas (sin gastos) se ocultan ahí,
-- pero siguen en Rentas, Patrimonio, etc.
alter table app.centros add column if not exists en_gastos boolean not null default true;
comment on column app.centros.en_gastos is 'Aparece en los menús de Gastos. Plazas solo de rentas = false.';
update app.centros set en_gastos = false
 where nombre in ('Calzada San Pedro','Plaza Barton Creek','Plaza Ellion','Plaza Platino','Por asignar','Plazas (general)');
