-- Acceso por persona (11/11/2026)
-- miembros.centros: edificios que ve la persona (null = todos los de sus empresas). Ej. Liz = Torre Elysium; Barby = Hudson y GM 202.
-- miembros.modulos: secciones que ve (null = las de su rol). Ej. Victoria = gastos y rentas (ya no cobranza de Elysium).
alter table app.miembros add column if not exists centros uuid[];
alter table app.miembros add column if not exists modulos text[];

-- ¿El centro está dentro de los edificios de quien consulta? (sin lista = todos)
create or replace function app.en_mis_centros(p_org uuid, p_centro uuid)
returns boolean language sql stable security definer set search_path to 'app', 'public' as $$
  select coalesce((select m.centros is null or p_centro = any (m.centros)
                   from miembros m where m.org_id = p_org and m.user_id = auth.uid() and m.activo), false);
$$;

-- ¿Quien consulta tiene esa sección? (sin lista = la decide su rol)
create or replace function app.puede_modulo(p_org uuid, p_modulo text)
returns boolean language sql stable security definer set search_path to 'app', 'public' as $$
  select coalesce((select m.modulos is null or p_modulo = any (m.modulos)
                   from miembros m where m.org_id = p_org and m.user_id = auth.uid() and m.activo), false);
$$;

-- Centros: solo los suyos
alter policy centros_ver on app.centros
  using (app.puede_ver_empresa(org_id, empresa_id) and app.puede_ver_centro(org_id, id) and app.en_mis_centros(org_id, id));

-- Unidades y cuotas: solo las de sus edificios
alter policy unidades_ver on app.unidades using (app.es_miembro(org_id) and app.en_mis_centros(org_id, centro_id));
alter policy unidades_crear on app.unidades with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id));
alter policy unidades_editar on app.unidades
  using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id))
  with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id));

create or replace function app.centro_de_unidad(p_unidad uuid)
returns uuid language sql stable security definer set search_path to 'app', 'public' as $$
  select centro_id from unidades where id = p_unidad;
$$;
alter policy cuotas_ver on app.cuotas using (app.es_miembro(org_id) and app.en_mis_centros(org_id, app.centro_de_unidad(unidad_id)));
alter policy cuotas_crear on app.cuotas with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, app.centro_de_unidad(unidad_id)));
alter policy cuotas_editar on app.cuotas
  using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, app.centro_de_unidad(unidad_id)))
  with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, app.centro_de_unidad(unidad_id)));

-- Pagos: solo de sus edificios; mantenimiento y luz solo quien tiene la sección de cobranza
alter policy pagos_ver on app.pagos
  using (app.puede_ver_empresa(org_id, empresa_id) and app.en_mis_centros(org_id, centro_id)
         and (concepto not in ('mantenimiento', 'luz') or app.puede_modulo(org_id, 'cobranza')));
alter policy pagos_crear on app.pagos
  with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id)
              and (concepto not in ('mantenimiento', 'luz') or app.puede_modulo(org_id, 'cobranza')));
alter policy pagos_editar on app.pagos
  using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id)
         and (concepto not in ('mantenimiento', 'luz') or app.puede_modulo(org_id, 'cobranza')))
  with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]) and app.en_mis_centros(org_id, centro_id)
              and (concepto not in ('mantenimiento', 'luz') or app.puede_modulo(org_id, 'cobranza')));
alter policy pagos_borrar on app.pagos
  using (app.tiene_rol(org_id, array['administracion'::app.rol_usuario, 'cobranza'::app.rol_usuario]) and app.en_mis_centros(org_id, centro_id)
         and (concepto not in ('mantenimiento', 'luz') or app.puede_modulo(org_id, 'cobranza')));

-- Edificios y secciones de cada usuario (para la pantalla de Usuarios; solo el dueño o socio)
create or replace function app.usuarios_accesos()
returns table(user_id uuid, centros uuid[], modulos text[])
language sql stable security definer set search_path to 'app', 'public' as $$
  select m.user_id, m.centros, m.modulos from miembros m where tiene_rol(m.org_id, array[]::rol_usuario[]);
$$;
grant execute on function app.usuarios_accesos() to authenticated;
grant execute on function app.en_mis_centros(uuid, uuid), app.puede_modulo(uuid, text), app.centro_de_unidad(uuid) to authenticated;

-- Victoria ya no lleva la cobranza de Torre Elysium (ahora es de Liz): ve gastos y rentas
update app.miembros set modulos = array['gastos', 'rentas'] where usuario = 'victoria';
