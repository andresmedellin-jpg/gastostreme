-- Aplicado como app_usuarios_y_permisos (13/oct/2026)
set local search_path = app, public;

-- Una persona puede tener más de un rol (Victoria: cobranza + captura de gastos)
alter table miembros add column if not exists roles rol_usuario[] not null default '{}';
alter table miembros add column if not exists debe_cambiar_password boolean not null default false;

create or replace function tiene_rol(p_org uuid, p_roles rol_usuario[])
returns boolean language sql stable security definer set search_path = app, public as $$
  select exists (select 1 from miembros
                 where org_id = p_org and user_id = auth.uid() and activo
                   and (rol = any (p_roles || array['dueno'::rol_usuario])
                        or roles && (p_roles || array['dueno'::rol_usuario])));
$$;

-- Gastos: solo dueño, administración y captura (el encargado y cobranza no los ven)
alter policy gastos_ver on gastos
  using (tiene_rol(org_id, array['administracion','operacion']::rol_usuario[])
         and puede_ver_empresa(org_id, empresa_id) and puede_ver_centro(org_id, centro_id));
alter policy gastos_crear on gastos
  with check (tiene_rol(org_id, array['administracion','operacion']::rol_usuario[])
              and puede_ver_empresa(org_id, empresa_id) and puede_ver_centro(org_id, centro_id));
alter policy gastos_editar on gastos
  using (tiene_rol(org_id, array['administracion','operacion']::rol_usuario[]))
  with check (tiene_rol(org_id, array['administracion','operacion']::rol_usuario[])
              and puede_ver_empresa(org_id, empresa_id) and puede_ver_centro(org_id, centro_id));

create or replace function marcar_password_cambiado()
returns void language sql security definer set search_path = app, public as $$
  update miembros set debe_cambiar_password = false where user_id = auth.uid();
$$;
revoke all on function marcar_password_cambiado() from public, anon;
grant execute on function marcar_password_cambiado() to authenticated;

create or replace function usuarios_lista()
returns table (user_id uuid, nombre text, usuario text, correo text, rol rol_usuario, roles rol_usuario[],
               empresas uuid[], activo boolean, debe_cambiar_password boolean, ultimo_acceso timestamptz, creado_en timestamptz)
language sql stable security definer set search_path = app, public as $$
  select m.user_id, m.nombre, m.usuario, u.email, m.rol, m.roles, m.empresas, m.activo, m.debe_cambiar_password,
         u.last_sign_in_at, m.creado_en
  from miembros m join auth.users u on u.id = m.user_id
  where tiene_rol(m.org_id, array[]::rol_usuario[])
  order by m.activo desc, m.nombre;
$$;
revoke all on function usuarios_lista() from public, anon;
grant execute on function usuarios_lista() to authenticated;
