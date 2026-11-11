-- Banco: estados de cuenta subidos cada mes y su cruce con lo capturado (conciliación).
-- Solo dueño, socio y administración. Nada se crea ni se borra solo: el cruce se aprueba a mano.

create table if not exists app.cuentas_banco (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id),
  empresa_id uuid not null references app.empresas(id),
  banco text not null,                     -- BBVA, Banregio…
  nombre text not null,                    -- "Maestra PyME"
  terminacion text not null,               -- últimos 4 dígitos (no se guarda el número completo)
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (org_id, banco, terminacion)
);

create table if not exists app.banco_movs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id),
  cuenta_id uuid not null references app.cuentas_banco(id),
  empresa_id uuid not null references app.empresas(id),
  fecha date not null,
  fecha_liq date,
  codigo text,
  descripcion text not null,
  detalle text,                            -- referencia / concepto que escribió quien pagó
  quien text,                              -- ordenante del SPEI
  tipo text not null check (tipo in ('abono', 'cargo')),
  monto numeric(14, 2) not null check (monto > 0),
  huella text not null,                    -- evita duplicados al volver a subir el mismo mes
  estado text not null default 'pendiente' check (estado in ('pendiente', 'conciliado', 'ignorado')),
  motivo text,                             -- por qué se ignora (traspaso, comisión…) o nota
  revisado_por text,
  revisado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (cuenta_id, huella)
);
create index if not exists banco_movs_fecha on app.banco_movs (cuenta_id, fecha);

-- Un movimiento del banco puede cubrir varios registros (p. ej. mantenimiento + luz);
-- cada registro se liga a un solo movimiento.
create table if not exists app.banco_ligas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id),
  mov_id uuid not null references app.banco_movs(id),
  -- sin llave foránea a propósito: si alguien elimina un pago, la liga queda huérfana y la pantalla la ignora
  pago_id uuid,
  ingreso_id uuid,
  gasto_id uuid,
  activo boolean not null default true,    -- deshacer una liga = activo false (no se borra)
  creado_en timestamptz not null default now(),
  check (num_nonnulls(pago_id, ingreso_id, gasto_id) = 1)
);
create index if not exists banco_ligas_mov on app.banco_ligas (mov_id);
create unique index if not exists banco_ligas_pago on app.banco_ligas (pago_id) where activo and pago_id is not null;
create unique index if not exists banco_ligas_ingreso on app.banco_ligas (ingreso_id) where activo and ingreso_id is not null;
create unique index if not exists banco_ligas_gasto on app.banco_ligas (gasto_id) where activo and gasto_id is not null;

alter table app.cuentas_banco enable row level security;
alter table app.banco_movs enable row level security;
alter table app.banco_ligas enable row level security;

create policy cuentas_banco_todo on app.cuentas_banco for all
  using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]) and app.puede_ver_empresa(org_id, empresa_id))
  with check (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]) and app.puede_ver_empresa(org_id, empresa_id));
create policy banco_movs_todo on app.banco_movs for all
  using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]) and app.puede_ver_empresa(org_id, empresa_id))
  with check (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]) and app.puede_ver_empresa(org_id, empresa_id));
create policy banco_ligas_todo on app.banco_ligas for all
  using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]));

grant select, insert, update on app.cuentas_banco, app.banco_movs, app.banco_ligas to authenticated;
