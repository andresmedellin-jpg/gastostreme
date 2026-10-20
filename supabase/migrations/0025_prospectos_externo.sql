-- Prospectos importados de otro sistema (formularios de Meta): guardar su id para no importarlos dos veces.
alter table app.prospectos add column if not exists externo_id text check (length(externo_id) <= 120);
comment on column app.prospectos.externo_id is 'Id del contacto en el sistema de origen (p. ej. "meta:<lead id>"), para no duplicar al importar';
create unique index if not exists prospectos_externo_uk on app.prospectos (org_id, externo_id) where externo_id is not null;
