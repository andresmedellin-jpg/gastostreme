-- Víctor cobra y revisa la luz de Torre Elysium (11/11/2026), sin ver el mantenimiento.
-- miembros.modulos admite 'luz': la sección de cobranza solo con el concepto luz.
-- Qué conceptos de pago ve/captura cada quien:
--   mantenimiento → sección 'cobranza'; luz → 'cobranza' o 'luz';
--   lo demás (rentas, cartera, ventas) → sin lista de secciones, o con rentas/inicio/patrimonio/obras.
create or replace function app.puede_concepto(p_org uuid, p_concepto text)
returns boolean language sql stable security definer set search_path to 'app', 'public' as $$
  select coalesce((select case
      when m.modulos is null then true
      when p_concepto = 'mantenimiento' then 'cobranza' = any (m.modulos)
      when p_concepto = 'luz' then m.modulos && array['cobranza', 'luz']
      else m.modulos && array['rentas', 'inicio', 'patrimonio', 'obras']
    end
    from miembros m where m.org_id = p_org and m.user_id = auth.uid() and m.activo), false);
$$;
grant execute on function app.puede_concepto(uuid, text) to authenticated;

alter policy pagos_ver on app.pagos
  using (app.puede_ver_empresa(org_id, empresa_id) and app.en_mis_centros(org_id, centro_id) and app.puede_concepto(org_id, concepto::text));
alter policy pagos_crear on app.pagos
  with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id) and app.puede_concepto(org_id, concepto::text));
alter policy pagos_editar on app.pagos
  using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id) and app.puede_concepto(org_id, concepto::text))
  with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id) and app.puede_concepto(org_id, concepto::text));
alter policy pagos_borrar on app.pagos
  using (app.tiene_rol(org_id, array['administracion'::app.rol_usuario, 'cobranza'::app.rol_usuario]) and app.en_mis_centros(org_id, centro_id) and app.puede_concepto(org_id, concepto::text));

-- Las cuotas (padrón) siguen la misma regla
alter policy cuotas_ver on app.cuotas
  using (app.es_miembro(org_id) and app.en_mis_centros(org_id, app.centro_de_unidad(unidad_id)) and app.puede_concepto(org_id, concepto::text));
alter policy cuotas_editar on app.cuotas
  using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, app.centro_de_unidad(unidad_id)) and app.puede_concepto(org_id, concepto::text))
  with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, app.centro_de_unidad(unidad_id)) and app.puede_concepto(org_id, concepto::text));

-- Víctor: su equipo, las bodegas y la luz de Torre Elysium (puede registrar cobros: rol extra cobranza)
update app.miembros
   set roles = array(select distinct unnest(roles || array['cobranza'::app.rol_usuario])),
       modulos = array['personal', 'bodegas', 'luz']
 where usuario = 'victor';
