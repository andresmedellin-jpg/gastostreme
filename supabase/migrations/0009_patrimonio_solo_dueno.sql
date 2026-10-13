-- Patrimonio (activos y pasivos) solo lo ve y edita el dueño
alter policy activos_ver on app.activos using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
alter policy pasivos_ver on app.pasivos using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
alter policy activos_crear on app.activos with check (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
alter policy activos_editar on app.activos using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[])) with check (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
alter policy activos_borrar on app.activos using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
alter policy pasivos_crear on app.pasivos with check (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
alter policy pasivos_editar on app.pasivos using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[])) with check (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
alter policy pasivos_borrar on app.pasivos using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
