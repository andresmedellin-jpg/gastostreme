-- Aplicado como app_login_usuario_y_privacidad (13/oct/2026)
set local search_path = app, public;

-- 1. Entrar con usuario en vez de correo
alter table miembros add column if not exists usuario text;
create unique index if not exists miembros_usuario_unico on miembros (lower(usuario)) where usuario is not null;
update miembros m set usuario = 'andres'
from auth.users u where u.id = m.user_id and u.email = 'andres.medellin@medco.mx' and m.usuario is null;

create or replace function correo_para_login(p_usuario text)
returns text language sql stable security definer set search_path = app, public as $$
  select u.email from miembros m join auth.users u on u.id = m.user_id
  where lower(m.usuario) = lower(trim(p_usuario)) and m.activo
  limit 1;
$$;
revoke all on function correo_para_login(text) from public;
grant usage on schema app to anon;
grant execute on function correo_para_login(text) to anon, authenticated;

-- 2. Casa y Socios: solo dueño y administración
insert into centros (org_id, empresa_id, nombre, tipo)
select e.org_id, e.id, 'Socios - Andrés', 'socio' from empresas e where e.nombre_corto = 'Treme'
on conflict (org_id, nombre) do nothing;

create or replace function puede_ver_centro(p_org uuid, p_centro uuid)
returns boolean language sql stable security definer set search_path = app, public as $$
  select p_centro is null
      or not exists (select 1 from centros c where c.id = p_centro and c.tipo in ('socio','personal'))
      or tiene_rol(p_org, array['administracion']::rol_usuario[]);
$$;
grant execute on function puede_ver_centro(uuid, uuid) to authenticated;

alter policy gastos_ver on gastos
  using (puede_ver_empresa(org_id, empresa_id) and puede_ver_centro(org_id, centro_id));
alter policy centros_ver on centros
  using (puede_ver_empresa(org_id, empresa_id) and puede_ver_centro(org_id, id));
alter policy empleados_ver on empleados
  using (puede_ver_empresa(org_id, empresa_id) and puede_ver_centro(org_id, centro_id));

-- 3. Índices en todas las llaves foráneas del esquema app
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text tbl, a.attname col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'app'::regnamespace and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index on %s (%I)', r.tbl, r.col);
  end loop;
end $$;
