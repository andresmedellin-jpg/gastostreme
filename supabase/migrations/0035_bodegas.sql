-- Bodegas e inventario (11/11/2026). Una bodega pertenece a un centro (Torre Elysium, una obra de MEDCO…).
-- La existencia de cada material = suma de sus movimientos: entrada (+), salida (−), ajuste (± diferencia de un conteo).
-- Una salida "con regreso" es un préstamo (herramienta): queda afuera hasta que se registra su devolución.
create table if not exists app.almacenes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  empresa_id uuid not null references app.empresas(id),
  centro_id uuid not null references app.centros(id),
  nombre text not null,
  notas text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create table if not exists app.materiales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  almacen_id uuid not null references app.almacenes(id),
  nombre text not null,
  unidad text not null default 'pza',
  minimo numeric,
  herramienta boolean not null default false,     -- se presta y se regresa
  notas text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists materiales_nombre_unico on app.materiales (almacen_id, lower(nombre)) where activo;
create table if not exists app.material_movs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  almacen_id uuid not null references app.almacenes(id),
  material_id uuid not null references app.materiales(id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'devolucion')),
  cantidad numeric not null,                       -- positiva; en ajuste puede ser negativa
  quien text,                                      -- quién se lo llevó / quién lo trajo
  motivo text,                                     -- para qué
  destino text,                                    -- dónde se usó (unidad, área, obra)
  regresa boolean not null default false,          -- salida como préstamo
  prestamo_id uuid references app.material_movs(id), -- en una devolución: el préstamo que cierra
  foto text,
  fecha date not null default current_date,
  capturado_por text,
  creado_en timestamptz not null default now()
);
create index if not exists material_movs_material on app.material_movs (material_id, fecha);

create or replace function app.centro_de_almacen(p_almacen uuid)
returns uuid language sql stable security definer set search_path to 'app', 'public' as $$
  select centro_id from almacenes where id = p_almacen;
$$;
create or replace function app.puede_ver_almacen(p_org uuid, p_almacen uuid)
returns boolean language sql stable security definer set search_path to 'app', 'public' as $$
  select exists (select 1 from almacenes a where a.id = p_almacen and a.org_id = p_org
                   and puede_ver_empresa(p_org, a.empresa_id) and en_mis_centros(p_org, a.centro_id));
$$;
grant execute on function app.centro_de_almacen(uuid), app.puede_ver_almacen(uuid, uuid) to authenticated;

alter table app.almacenes enable row level security;
alter table app.materiales enable row level security;
alter table app.material_movs enable row level security;
grant select, insert, update, delete on app.almacenes, app.materiales, app.material_movs to authenticated;

create policy almacenes_ver on app.almacenes for select using (app.puede_ver_empresa(org_id, empresa_id) and app.en_mis_centros(org_id, centro_id));
create policy almacenes_crear on app.almacenes for insert with check (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[])
  and app.puede_ver_empresa(org_id, empresa_id) and app.en_mis_centros(org_id, centro_id));
create policy almacenes_editar on app.almacenes for update using (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]) and app.puede_ver_almacen(org_id, id))
  with check (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]));

create policy materiales_ver on app.materiales for select using (app.puede_ver_almacen(org_id, almacen_id));
create policy materiales_crear on app.materiales for insert with check (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]) and app.puede_ver_almacen(org_id, almacen_id));
create policy materiales_editar on app.materiales for update using (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]) and app.puede_ver_almacen(org_id, almacen_id))
  with check (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]) and app.puede_ver_almacen(org_id, almacen_id));

create policy material_movs_ver on app.material_movs for select using (app.puede_ver_almacen(org_id, almacen_id));
create policy material_movs_crear on app.material_movs for insert with check (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]) and app.puede_ver_almacen(org_id, almacen_id));
-- Corregir un movimiento equivocado: solo administración (queda en la bitácora)
create policy material_movs_borrar on app.material_movs for delete using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]) and app.puede_ver_almacen(org_id, almacen_id));

-- Teléfono de cada unidad, para mandarle el cobro por WhatsApp
alter table app.unidades add column if not exists telefono text;

-- Bodega #1 de Torre Elysium con el inventario que hizo Víctor (foto del 11/11/2026)
insert into app.almacenes (org_id, empresa_id, centro_id, nombre)
select '3247250d-ee7c-45e1-8647-6e94464ea49f', '91eeb467-66fe-4f0a-95f9-81b44709f9af', '1b12910e-24e3-4e04-9fa1-eeedb130c915', 'Bodega #1'
where not exists (select 1 from app.almacenes where centro_id = '1b12910e-24e3-4e04-9fa1-eeedb130c915' and nombre = 'Bodega #1');
with lista(nombre, herramienta, cantidad) as (values
('Cajas chalupa 4x4',false,4),
('Caja para termofusora',false,4),
('Tapas para centro de carga',false,1),
('Gancho para albañil',true,1),
('Extintor de 4.5 kg (vacío)',false,1),
('Extintor de 9.0 kg (vacío)',false,1),
('Llanta para carretilla',false,1),
('Rejillas para campana de 4"',false,14),
('Cajas de rejilla de 4"',false,2),
('Cajas de conector universal',false,5),
('Tee de 2"',false,4),
('Tijeras grandes para Tuboplus',true,1),
('Tapones galvanizados de 1/2"',false,10),
('Conector universal de 1/2"',false,2),
('Cajas de tapa doble para contacto',false,6),
('Codos de medidas varias Tuboplus',false,29),
('Bote de herbicida de 1 litro',false,1),
('Base de medidor 200 amps',false,1),
('Llave española de 1 7/8"',true,1),
('Talache',true,1),
('Transformadores secos',false,3),
('Transformador de 37.5 KVA',false,1),
('Purificador de aire',true,1),
('Cajas de plástico negras',false,12),
('Caja azul de plástico',false,1),
('Caja morada de plástico',false,1),
('Máquinas de soldar',true,6),
('Cuadros de andamio',true,8),
('Carretilla',true,1),
('Codos 90° 1" Tuboplus',false,104),
('Tee 1" Tuboplus',false,17),
('Reducción de campana de 6" a 4"',false,45),
('Codos 90° 4"',false,34),
('Tee 4"',false,33)
), bod as (select id, org_id from app.almacenes where centro_id = '1b12910e-24e3-4e04-9fa1-eeedb130c915' and nombre = 'Bodega #1'),
mats as (
  insert into app.materiales (org_id, almacen_id, nombre, herramienta)
  select bod.org_id, bod.id, l.nombre, l.herramienta from lista l cross join bod
  where not exists (select 1 from app.materiales m where m.almacen_id = bod.id and lower(m.nombre) = lower(l.nombre))
  returning id, org_id, almacen_id, nombre
)
insert into app.material_movs (org_id, almacen_id, material_id, tipo, cantidad, motivo, quien, capturado_por, fecha)
select m.org_id, m.almacen_id, m.id, 'entrada', l.cantidad, 'Inventario inicial', 'Víctor Olazarán', 'Víctor Olazarán', '2026-11-11'
from mats m join lista l on l.nombre = m.nombre;
