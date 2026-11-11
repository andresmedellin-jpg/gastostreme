-- Pedidos de limpieza (11/11/2026): Barby arma la cotización de cada centro escogiendo de un menú de lo que siempre pide
-- y la copia como mensaje (o PDF) para el proveedor. El pago lo sigue capturando Victoria en Gastos.
--   insumos: catálogo (nombre, unidad, medida/nota)        insumo_centro: lo que se pide en cada centro y la cantidad de siempre
--   pedidos_insumos: cada pedido por centro (líneas en jsonb: insumo_id, nombre, unidad, cantidad), estado enviado/recibido
-- Los centros salen de insumo_centro (función pedidos_centros), no de miembros.centros: Barby cobra solo las plazas
-- pero pide limpieza para Elysium y la Oficina también.
create table if not exists app.insumos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  nombre text not null,
  unidad text not null default 'pza',
  medida text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists insumos_nombre_unico on app.insumos (org_id, lower(nombre), coalesce(medida, '')) where activo;
create table if not exists app.insumo_centro (
  org_id uuid not null,
  insumo_id uuid not null references app.insumos(id),
  centro_id uuid not null references app.centros(id),
  cantidad numeric not null default 1,
  orden int not null default 0,
  activo boolean not null default true,
  primary key (insumo_id, centro_id)
);
create table if not exists app.pedidos_insumos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  empresa_id uuid not null references app.empresas(id),
  centro_id uuid not null references app.centros(id),
  fecha date not null default current_date,
  proveedor text,
  estado text not null default 'enviado' check (estado in ('enviado', 'recibido', 'cancelado')),
  lineas jsonb not null default '[]',
  notas text,
  recibido_en date,
  capturado_por text,
  creado_en timestamptz not null default now()
);
create index if not exists pedidos_insumos_centro on app.pedidos_insumos (centro_id, fecha desc);

alter table app.insumos enable row level security;
alter table app.insumo_centro enable row level security;
alter table app.pedidos_insumos enable row level security;
grant select, insert, update on app.insumos, app.insumo_centro, app.pedidos_insumos to authenticated;

-- Quién usa pedidos: dueño/socio/administración siempre; los demás si tienen la sección 'pedidos'
create or replace function app.puede_pedidos(p_org uuid)
returns boolean language sql stable security definer set search_path to 'app', 'public' as $$
  select tiene_rol(p_org, array['administracion']::rol_usuario[])
      or (tiene_rol(p_org, array['cobranza', 'operacion']::rol_usuario[]) and puede_modulo(p_org, 'pedidos')
          and exists (select 1 from miembros m where m.org_id = p_org and m.user_id = auth.uid() and m.modulos is not null));
$$;
grant execute on function app.puede_pedidos(uuid) to authenticated;

create policy insumos_ver on app.insumos for select using (app.puede_pedidos(org_id));
create policy insumos_crear on app.insumos for insert with check (app.puede_pedidos(org_id));
create policy insumos_editar on app.insumos for update using (app.puede_pedidos(org_id)) with check (app.puede_pedidos(org_id));
create policy insumo_centro_ver on app.insumo_centro for select using (app.puede_pedidos(org_id));
create policy insumo_centro_crear on app.insumo_centro for insert with check (app.puede_pedidos(org_id));
create policy insumo_centro_editar on app.insumo_centro for update using (app.puede_pedidos(org_id)) with check (app.puede_pedidos(org_id));
create policy pedidos_insumos_ver on app.pedidos_insumos for select using (app.puede_pedidos(org_id));
create policy pedidos_insumos_crear on app.pedidos_insumos for insert with check (app.puede_pedidos(org_id));
create policy pedidos_insumos_editar on app.pedidos_insumos for update using (app.puede_pedidos(org_id)) with check (app.puede_pedidos(org_id));

-- Centros a los que se les pide limpieza (nombre y empresa), aunque la persona no tenga acceso a su cobranza
create or replace function app.pedidos_centros()
returns table(id uuid, nombre text, empresa_id uuid)
language sql stable security definer set search_path to 'app', 'public' as $$
  select distinct c.id, c.nombre, c.empresa_id from centros c
  where exists (select 1 from insumo_centro ic where ic.centro_id = c.id and ic.activo) and puede_pedidos(c.org_id)
  order by c.nombre;
$$;
grant execute on function app.pedidos_centros() to authenticated;

-- Catálogo y menú de cada centro, tal como Barby los pide hoy
with cat(nombre, unidad, medida) as (values
  ('papel higiénico', 'paq', null), ('jabón líquido para trastes Axion', 'pza', null), ('esponja para lavar trastes', 'pza', null),
  ('Lysol', 'pza', null), ('bolsas chicas', 'rollo', null), ('Sanitas', 'caja', null), ('cloro', 'gal', null),
  ('toalla en rollo para secarse las manos', 'pza', null), ('servilletas', 'paq', null), ('tenedores grandes', 'paq', null),
  ('cucharas grandes', 'paq', null), ('Fabuloso de 10 L', 'pza', null), ('cepillo para baño con base', 'pza', null),
  ('jabón para manos', 'gal', null), ('bolsa mediana', 'kg', '.70 x .90 cm'), ('bolsa grande', 'kg', '.90 x 1.20 cm'),
  ('limpiavidrios', 'pza', null), ('espuma Ber Shine', 'pza', null), ('trapos de microfibra c/3 pzas', 'pza', null),
  ('aromas', 'pza', null), ('trapeador de microfibra trenzado', 'pza', null), ('jabón en polvo', 'pza', null),
  ('servilletas azules para limpiar', 'pza', null), ('recogedor de lámina', 'pza', null), ('escoba industrial', 'pza', null),
  ('Windex', 'pza', null)
), org as (select org_id from app.centros where nombre = 'Torre Elysium')
insert into app.insumos (org_id, nombre, unidad, medida)
select org.org_id, cat.nombre, cat.unidad, cat.medida from cat, org
where not exists (select 1 from app.insumos i where lower(i.nombre) = lower(cat.nombre) and coalesce(i.medida, '') = coalesce(cat.medida, ''));

with menu(centro, insumo, cantidad, orden) as (values
  ('Torre Elysium', 'papel higiénico', 1, 1), ('Torre Elysium', 'jabón líquido para trastes Axion', 1, 2), ('Torre Elysium', 'esponja para lavar trastes', 1, 3),
  ('Torre Elysium', 'Lysol', 2, 4), ('Torre Elysium', 'bolsas chicas', 2, 5), ('Torre Elysium', 'Sanitas', 1, 6), ('Torre Elysium', 'cloro', 1, 7),
  ('Torre Elysium', 'toalla en rollo para secarse las manos', 2, 8), ('Torre Elysium', 'servilletas', 1, 9), ('Torre Elysium', 'tenedores grandes', 2, 10),
  ('Torre Elysium', 'cucharas grandes', 1, 11), ('Torre Elysium', 'Fabuloso de 10 L', 1, 12), ('Torre Elysium', 'cepillo para baño con base', 1, 13),
  ('Torre Elysium', 'jabón para manos', 1, 14), ('Torre Elysium', 'bolsa mediana', 3, 15),
  ('Plaza GM 202', 'papel higiénico', 1, 1), ('Plaza GM 202', 'Fabuloso de 10 L', 2, 2), ('Plaza GM 202', 'cloro', 2, 3), ('Plaza GM 202', 'limpiavidrios', 2, 4),
  ('Plaza GM 202', 'espuma Ber Shine', 2, 5), ('Plaza GM 202', 'trapos de microfibra c/3 pzas', 2, 6), ('Plaza GM 202', 'aromas', 5, 7),
  ('Plaza GM 202', 'trapeador de microfibra trenzado', 2, 8), ('Plaza GM 202', 'jabón en polvo', 1, 9), ('Plaza GM 202', 'servilletas azules para limpiar', 2, 10),
  ('Plaza GM 202', 'recogedor de lámina', 1, 11), ('Plaza GM 202', 'bolsa mediana', 6, 12),
  ('Plaza Hudson', 'Fabuloso de 10 L', 1, 1), ('Plaza Hudson', 'trapeador de microfibra trenzado', 1, 2), ('Plaza Hudson', 'escoba industrial', 1, 3),
  ('Plaza Hudson', 'bolsa grande', 3, 4), ('Plaza Hudson', 'trapos de microfibra c/3 pzas', 1, 5), ('Plaza Hudson', 'Windex', 1, 6),
  ('Oficina', 'Fabuloso de 10 L', 1, 1), ('Oficina', 'trapeador de microfibra trenzado', 1, 2), ('Oficina', 'escoba industrial', 1, 3),
  ('Oficina', 'bolsa grande', 3, 4), ('Oficina', 'trapos de microfibra c/3 pzas', 1, 5), ('Oficina', 'Windex', 1, 6),
  ('Oficina', 'jabón líquido para trastes Axion', 1, 7)
)
insert into app.insumo_centro (org_id, insumo_id, centro_id, cantidad, orden)
select c.org_id, i.id, c.id, menu.cantidad, menu.orden
from menu join app.centros c on c.nombre = menu.centro and c.activo
join app.insumos i on lower(i.nombre) = lower(menu.insumo) and i.activo
on conflict (insumo_id, centro_id) do nothing;

-- Barby: además de su cobranza, los pedidos de limpieza
update app.miembros set modulos = array(select distinct unnest(modulos || array['pedidos'])) where usuario = 'barby' and modulos is not null;
