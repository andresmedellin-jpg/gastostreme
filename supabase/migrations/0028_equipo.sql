-- Equipo: el personal usa su celular (checar con foto, rondín por puntos QR, pendientes, paquetes, reportes,
-- entrega de turno) y el administrador ve "Hoy", turnos y nómina. Igual que en Unaria.

alter table app.miembros add column if not exists empleado_id uuid references app.empleados(id) on delete set null;
alter table app.asistencia add column if not exists foto_entrada text, add column if not exists foto_salida text;
alter table app.empleados add column if not exists telefono text;

create table if not exists app.turnos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  empleado_id uuid not null references app.empleados(id) on delete cascade,
  fecha date not null, hora_inicio time, hora_fin time,
  descanso boolean not null default false, lugar text, notas text,
  creado_en timestamptz not null default now(), unique (empleado_id, fecha));
create table if not exists app.puntos_rondin (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  nombre text not null, orden int not null default 0, activo boolean not null default true,
  creado_en timestamptz not null default now());
create table if not exists app.rondin_marcas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  empleado_id uuid references app.empleados(id) on delete set null,
  punto_id uuid not null references app.puntos_rondin(id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Monterrey')::date,
  ronda int not null default 1, hora timestamptz not null default now(), foto_path text, nota text);
create table if not exists app.solicitudes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  unidad_id uuid references app.unidades(id) on delete set null,
  unidad_txt text, reporta text, telefono text, descripcion text not null, categoria text,
  origen text not null default 'oficina',
  estado text not null default 'abierta' check (estado in ('abierta','asignada','resuelta')),
  asignado_a uuid references app.empleados(id) on delete set null,
  foto_path text, foto_cierre text, nota_cierre text, registrado_por text,
  creado_en timestamptz not null default now(), asignado_en timestamptz, resuelto_en timestamptz);
create table if not exists app.paquetes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  unidad_id uuid references app.unidades(id) on delete set null,
  descripcion text, paqueteria text, foto_path text,
  recibido_por text, recibido_en timestamptz not null default now(),
  entregado_a text, entregado_en timestamptz, entregado_por text);
create table if not exists app.bitacora_turno (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  empleado_id uuid references app.empleados(id) on delete set null,
  recibe_id uuid references app.empleados(id) on delete set null,
  nota text, creado_en timestamptz not null default now());
create index if not exists turnos_centro_fecha on app.turnos (centro_id, fecha);
create index if not exists rondin_marcas_centro_fecha on app.rondin_marcas (centro_id, fecha);
create index if not exists solicitudes_centro_estado on app.solicitudes (centro_id, estado);
create index if not exists paquetes_centro on app.paquetes (centro_id, entregado_en);
create index if not exists bitacora_turno_centro on app.bitacora_turno (centro_id, creado_en);

do $$ declare t text; begin
  foreach t in array array['turnos','puntos_rondin','rondin_marcas','solicitudes','paquetes','bitacora_turno'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('grant select, insert, update on app.%I to authenticated', t);
    execute format('create policy %I on app.%I for select using (app.es_miembro(org_id))', t||'_ver', t);
  end loop;
  foreach t in array array['rondin_marcas','solicitudes','paquetes','bitacora_turno'] loop
    execute format('create policy %I on app.%I for insert with check (app.tiene_rol(org_id, %L::app.rol_usuario[]))', t||'_crear', t, '{administracion,cobranza,encargado,equipo}');
    execute format('create policy %I on app.%I for update using (app.tiene_rol(org_id, %L::app.rol_usuario[])) with check (app.tiene_rol(org_id, %L::app.rol_usuario[]))', t||'_editar', t, '{administracion,cobranza,encargado,equipo}', '{administracion,cobranza,encargado,equipo}');
  end loop;
  foreach t in array array['turnos','puntos_rondin'] loop
    execute format('create policy %I on app.%I for insert with check (app.tiene_rol(org_id, %L::app.rol_usuario[]))', t||'_crear', t, '{administracion,encargado}');
    execute format('create policy %I on app.%I for update using (app.tiene_rol(org_id, %L::app.rol_usuario[])) with check (app.tiene_rol(org_id, %L::app.rol_usuario[]))', t||'_editar', t, '{administracion,encargado}', '{administracion,encargado}');
  end loop;
end $$;

-- El personal marca sus tareas del día
alter policy tareas_crear on app.tareas with check (app.tiene_rol(org_id, '{administracion,operacion,encargado,equipo}'::app.rol_usuario[]));
alter policy tareas_editar on app.tareas using (app.tiene_rol(org_id, '{administracion,operacion,encargado,equipo}'::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, '{administracion,operacion,encargado,equipo}'::app.rol_usuario[]));
