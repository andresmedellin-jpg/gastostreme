-- Parte fija de un contrato que corresponde a un inmueble (p. ej. Lote de Autos: $18,000 del Local 20; los otros $22,000 son del
-- estacionamiento del edificio, que no es un inmueble del patrimonio). Vacío = la renta se reparte según el valor de los inmuebles.
alter table app.activo_contrato add column if not exists monto numeric;
create policy activo_contrato_editar on app.activo_contrato for update
  using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[])) with check (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
grant update on app.activo_contrato to authenticated;

update app.activo_contrato ac set monto = 18000
from app.activos a, app.contratos k
where ac.activo_id = a.id and ac.contrato_id = k.id and a.codigo = 'TRM-012' and k.arrendatario = 'Lote de Autos Gabriel';
