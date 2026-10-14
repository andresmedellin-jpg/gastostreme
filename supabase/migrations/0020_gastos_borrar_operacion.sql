-- Quien captura gastos (operación) puede borrar los que él mismo capturó (errores de dedo).
-- Administración sigue pudiendo borrar cualquiera. Todo queda en la bitácora.
alter policy gastos_borrar on app.gastos using (
  app.tiene_rol(org_id, array['administracion']::app.rol_usuario[])
  or (app.tiene_rol(org_id, array['operacion']::app.rol_usuario[])
      and capturado_por = (select m.nombre from app.miembros m
                           where m.user_id = auth.uid() and m.org_id = gastos.org_id limit 1))
);
