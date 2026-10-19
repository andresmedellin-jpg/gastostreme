-- Tablas de los módulos Inventario y Cotizaciones (opcionales). NO están aplicadas en la base de Treme/MEDCO:
-- se aplican al instalar la plataforma para un cliente que las use (hoy solo existen en el demo, ?demo).
set local search_path = app, public;

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id),
  empresa_id uuid references empresas(id),
  clave text not null, descripcion text not null, categoria text, marca text, medida text, clase text,
  unidad text not null default 'pza', costo numeric(14,2) not null default 0, precio numeric(14,2) not null default 0,
  minimo numeric not null default 0, ubicacion text, activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (org_id, clave)
);

create table if not exists inventario_movs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id),
  producto_id uuid not null references productos(id),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad numeric not null, costo_unitario numeric(14,2),
  centro_id uuid references centros(id), referencia text, notas text, capturado_por text,
  creado_en timestamptz not null default now()
);

create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id),
  empresa_id uuid references empresas(id),
  folio text not null, fecha date not null default current_date, vigencia_dias int not null default 15,
  estado text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aceptada', 'rechazada')),
  cliente text not null, contacto text, correo text, titulo text,
  partidas jsonb not null default '[]',   -- [{producto_id, clave, descripcion, unidad, cantidad, precio}]
  condiciones text, total numeric(14,2), centro_id uuid references centros(id), capturado_por text,
  creado_en timestamptz not null default now(),
  unique (org_id, folio)
);

alter table productos enable row level security;
alter table inventario_movs enable row level security;
alter table cotizaciones enable row level security;

create policy productos_ver on productos for select using (app.es_miembro(org_id));
create policy productos_editar on productos for all using (app.tiene_rol(org_id, array['administracion','operacion']::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, array['administracion','operacion']::app.rol_usuario[]));
create policy movs_ver on inventario_movs for select using (app.es_miembro(org_id));
create policy movs_crear on inventario_movs for insert with check (app.tiene_rol(org_id, array['administracion','operacion']::app.rol_usuario[]));
create policy cot_ver on cotizaciones for select using (app.tiene_rol(org_id, array['administracion','cobranza']::app.rol_usuario[]));
create policy cot_editar on cotizaciones for all using (app.tiene_rol(org_id, array['administracion','cobranza']::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, array['administracion','cobranza']::app.rol_usuario[]));

grant select, insert, update, delete on productos, inventario_movs, cotizaciones to authenticated;
