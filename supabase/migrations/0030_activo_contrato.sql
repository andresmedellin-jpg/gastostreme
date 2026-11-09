-- Patrimonio ↔ Rentas: cada inmueble se liga a los contratos que lo rentan.
-- La renta de un inmueble sale del contrato (Rentas), así las dos pantallas siempre dicen lo mismo.
-- Un contrato puede cubrir varios locales (Chepos GYM: 10) y un local puede tener varios contratos (Local 25 Ellion: 2).
create table if not exists app.activo_contrato (
  org_id      uuid not null references app.organizaciones(id),
  activo_id   uuid not null references app.activos(id) on delete cascade,
  contrato_id uuid not null references app.contratos(id) on delete cascade,
  creado_en   timestamptz not null default now(),
  primary key (activo_id, contrato_id)
);
create index if not exists activo_contrato_contrato on app.activo_contrato (contrato_id);

alter table app.activo_contrato enable row level security;
-- Mismos permisos que Patrimonio (activos)
create policy activo_contrato_ver    on app.activo_contrato for select using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
create policy activo_contrato_crear  on app.activo_contrato for insert with check (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
create policy activo_contrato_borrar on app.activo_contrato for delete using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
grant select, insert, delete on app.activo_contrato to authenticated;

-- Enlaces iniciales: solo los que coinciden sin duda (misma plaza y misma unidad o mismo monto)
insert into app.activo_contrato (org_id, activo_id, contrato_id)
select a.org_id, a.id, k.id
from app.activos a join app.contratos k on k.org_id = a.org_id
join (values
  ('TRM-001','Chao Italia'), ('TRM-002','Alpha Gym'), ('TRM-002','Joyeria'), ('TRM-003','Bmetrics Rehabilitacion'),
  ('TRM-004','Rehabilitacion Fisica'), ('TRM-005','Rehabilitacion Fisica'),
  ('TRM-006','Restaurante Japones'), ('TRM-007','Restaurante Japones'),
  ('TRM-008','Carniceria — Suite Q'), ('TRM-009','Miros D’Luxe  — Suite O'),
  ('TRM-013','Local 21'), ('TRM-023','Oficina 801 Gerardo (bodega)'), ('TRM-024','Oficina 806 Despacho'),
  ('TRM-025','Depto 1201 Andres, Gerardo y Raul'), ('TRM-026','Depto 1202 Guillermo'), ('TRM-027','Depto 1401 Gerardo'),
  ('TRM-028','Chepos GYM'), ('TRM-029','Chepos GYM'), ('TRM-030','Chepos GYM'), ('TRM-031','Chepos GYM'), ('TRM-032','Chepos GYM'),
  ('TRM-033','Chepos GYM'), ('TRM-034','Chepos GYM'), ('TRM-035','Chepos GYM'), ('TRM-036','Chepos GYM'), ('TRM-037','Chepos GYM'),
  ('TRM-038','MMA'), ('TRM-039','MMA'), ('TRM-040','Local 51 empresa'),
  ('TRM-041','Monte de Basan'), ('TRM-042','Monte de Basan'), ('TRM-043','Monte de Basan'),
  ('TRM-044','Salon de Fiestas'), ('TRM-045','Salon de Fiestas')
) v(codigo, arrendatario) on v.codigo = a.codigo and v.arrendatario = k.arrendatario
where k.centro_id = a.centro_id
on conflict do nothing;
