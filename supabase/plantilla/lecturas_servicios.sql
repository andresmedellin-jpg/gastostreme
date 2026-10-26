-- Lecturas de luz, gas y agua por departamento (módulo "Lecturas"). Para el edificio que paga un solo recibo
-- a CFE / gas / Agua y Drenaje y le cobra a cada unidad lo que consumió según su submedidor.
-- NO está aplicada en la base de Treme/MEDCO: se aplica al instalar la plataforma para un cliente que la use.
set local search_path = app, public;

-- Un medidor por unidad y servicio. El QR de la placa lleva "MED:<id>".
create table if not exists medidores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id),
  centro_id uuid not null references centros(id),
  unidad_id uuid not null references unidades(id),
  servicio text not null check (servicio in ('luz', 'gas', 'agua')),
  serie text,                                  -- número de serie de fábrica
  zona text,                                   -- dónde está: "Cuarto de medidores (sótano)"
  orden int not null default 0,                -- orden físico dentro de la zona
  lectura_inicial numeric not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (unidad_id, servicio)
);

-- Una lectura por medidor y mes. estado: ok (normal) | revisar (consumo raro) | aprobada (la revisó el encargado)
create table if not exists lecturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id),
  centro_id uuid not null references centros(id),
  medidor_id uuid not null references medidores(id),
  periodo date not null,                       -- primer día del mes
  lectura numeric not null,
  fecha date not null default current_date,
  foto_path text,
  estado text not null default 'ok' check (estado in ('ok', 'revisar', 'aprobada')),
  nota text,
  capturado_por text,
  creado_en timestamptz not null default now(),
  unique (medidor_id, periodo)
);

-- Lo que cobró la compañía al edificio en el mes (para el cuadre)
create table if not exists recibos_servicio (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id),
  centro_id uuid not null references centros(id),
  servicio text not null check (servicio in ('luz', 'gas', 'agua')),
  periodo date not null,
  compania text, consumo numeric, monto numeric(14,2),
  unique (centro_id, servicio, periodo)
);

-- Cómo se cobra cada servicio: tarifa fija por unidad de consumo, o repartir el recibo real según el consumo
create table if not exists tarifas_servicio (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id),
  centro_id uuid not null references centros(id),
  servicio text not null check (servicio in ('luz', 'gas', 'agua')),
  modo text not null default 'tarifa' check (modo in ('tarifa', 'prorrateo')),
  precio numeric(12,4) not null default 0,     -- por kWh o m³ (modo tarifa)
  cargo_fijo numeric(12,2) not null default 0,
  unique (centro_id, servicio)
);

alter table medidores enable row level security;
alter table lecturas enable row level security;
alter table recibos_servicio enable row level security;
alter table tarifas_servicio enable row level security;

create policy medidores_ver on medidores for select using (app.es_miembro(org_id) and app.puede_ver_centro(org_id, centro_id));
create policy medidores_editar on medidores for all using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]));
create policy lecturas_ver on lecturas for select using (app.es_miembro(org_id) and app.puede_ver_centro(org_id, centro_id));
-- El que hace el recorrido (operación / encargado) captura y corrige; administración aprueba
create policy lecturas_capturar on lecturas for insert with check (app.tiene_rol(org_id, array['administracion','operacion','encargado']::app.rol_usuario[]));
create policy lecturas_corregir on lecturas for update using (app.tiene_rol(org_id, array['administracion','operacion','encargado']::app.rol_usuario[]));
create policy recibos_servicio_ver on recibos_servicio for select using (app.tiene_rol(org_id, array['administracion','cobranza']::app.rol_usuario[]));
create policy recibos_servicio_editar on recibos_servicio for all using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]));
create policy tarifas_ver on tarifas_servicio for select using (app.es_miembro(org_id));
create policy tarifas_editar on tarifas_servicio for all using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]));

grant select, insert, update on medidores, lecturas, recibos_servicio, tarifas_servicio to authenticated;
