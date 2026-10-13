-- Variante para el proyecto actual: todo vive en el esquema `app`
create schema if not exists app;
set local search_path = app, public, extensions;
-- =====================================================================
-- PLATAFORMA ADMINISTRATIVA UNIFICADA — esquema base (multi-empresa)
-- Reemplaza las 24 tablas sueltas del proyecto actual.
-- Principios:
--   * Cada fila pertenece a una ORGANIZACIÓN (org). Hoy: el grupo de Andrés.
--     Mañana: cada cliente que compre la plataforma es una org nueva.
--   * Dentro de una org hay EMPRESAS (Treme, MEDCO) y CENTROS
--     (Elysium, Bodega Escobedo, Oficina, Plaza Hudson, Socios...).
--   * Nada de nombres escritos a mano: todo se liga por id.
--   * RLS activo en TODAS las tablas desde el día uno.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ORGANIZACIÓN, EMPRESAS, USUARIOS Y ROLES
-- ---------------------------------------------------------------------
create table organizaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  plan        text not null default 'interno',
  creado_en   timestamptz not null default now()
);

create table empresas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  nombre      text not null,              -- "Grupo Inmobiliario Treme"
  nombre_corto text not null,             -- "Treme"
  rfc         text,
  color       text,                       -- para distinguirla en el dashboard
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (org_id, nombre_corto)
);

-- Rol dentro de la org. "empresas" = null => ve todas las empresas.
create type rol_usuario as enum ('dueno','administracion','cobranza','operacion','encargado','lectura');

create table miembros (
  org_id      uuid not null references organizaciones(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         rol_usuario not null default 'lectura',
  empresas    uuid[],                     -- null = todas
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Centros: donde se gasta / cobra / trabaja. Unifica "obra", "desarrollo",
-- "local" (de Centro de Control) y el texto libre de gastos.
create type tipo_centro as enum ('condominio','plaza','bodega','obra','oficina','propiedad','socio','personal','otro');

create table centros (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  empresa_id  uuid not null references empresas(id),
  nombre      text not null,              -- "Torre Elysium", "Bodega Escobedo"
  tipo        tipo_centro not null,
  ciudad      text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (org_id, nombre)
);

-- ---------------------------------------------------------------------
-- Funciones de seguridad (usadas por las políticas RLS)
-- ---------------------------------------------------------------------
create or replace function es_miembro(p_org uuid)
returns boolean language sql stable security definer set search_path = app, public as $$
  select exists (select 1 from miembros
                 where org_id = p_org and user_id = auth.uid() and activo);
$$;

create or replace function tiene_rol(p_org uuid, p_roles rol_usuario[])
returns boolean language sql stable security definer set search_path = app, public as $$
  select exists (select 1 from miembros
                 where org_id = p_org and user_id = auth.uid() and activo
                   and rol = any (p_roles || array['dueno'::rol_usuario]));
$$;

create or replace function puede_ver_empresa(p_org uuid, p_empresa uuid)
returns boolean language sql stable security definer set search_path = app, public as $$
  select exists (select 1 from miembros
                 where org_id = p_org and user_id = auth.uid() and activo
                   and (empresas is null or p_empresa = any (empresas)));
$$;

-- ---------------------------------------------------------------------
-- 2. INMUEBLES Y COBRANZA
--    Une: locales, rentas, adeudos_manual, pagos, pagos_rentas,
--         ventas_medco, pagos_medco, cartera_vencida(+abonos)
-- ---------------------------------------------------------------------
create type tipo_unidad as enum ('local','depto','oficina','bodega','casa','terreno','otro');

create table unidades (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  centro_id     uuid not null references centros(id),
  identificador text not null,            -- "L-12", "Depto 804"
  tipo          tipo_unidad not null default 'local',
  ocupante      text,                     -- condómino / inquilino actual
  superficie_m2 numeric,
  exento        boolean not null default false,
  notas         text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  unique (centro_id, identificador)
);

-- Cargos recurrentes por unidad (cuota de mantenimiento, luz CFE, etc.)
create type concepto_cobro as enum ('renta','mantenimiento','luz','agua','venta','cartera','otro');

create table cuotas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  unidad_id   uuid not null references unidades(id) on delete cascade,
  concepto    concepto_cobro not null,
  monto       numeric(14,2) not null default 0,
  moneda      text not null default 'MXN' check (moneda in ('MXN','USD')),
  activo      boolean not null default true,
  actualizado_en timestamptz not null default now(),
  unique (unidad_id, concepto)
);

-- Contratos de arrendamiento
create table contratos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  unidad_id     uuid references unidades(id),
  centro_id     uuid not null references centros(id),
  arrendatario  text not null,
  monto         numeric(14,2) not null default 0,
  moneda        text not null default 'MXN' check (moneda in ('MXN','USD')),
  dia_pago      int check (dia_pago between 1 and 31),
  fecha_inicio  date,
  fecha_fin     date,
  ajuste_inpc   boolean not null default false,
  telefono      text,
  email         text,
  notas         text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

-- Cuentas por cobrar no recurrentes: ventas MEDCO, cartera vencida,
-- adeudos de arranque (lo que antes era adeudos_manual).
create type tipo_cxc as enum ('venta','cartera_vencida','adeudo_inicial','otro');

create table cuentas_por_cobrar (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  empresa_id     uuid not null references empresas(id),
  centro_id      uuid references centros(id),
  contrato_id    uuid references contratos(id),
  unidad_id      uuid references unidades(id),
  tipo           tipo_cxc not null,
  cliente        text not null,
  referencia     text,
  monto_original numeric(14,2) not null,
  moneda         text not null default 'MXN' check (moneda in ('MXN','USD')),
  fecha_origen   date,
  notas          text,
  creado_en      timestamptz not null default now()
);

-- UNA sola tabla de pagos recibidos. Se liga a lo que esté pagando.
create table pagos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  empresa_id    uuid not null references empresas(id),
  centro_id     uuid references centros(id),
  unidad_id     uuid references unidades(id),
  contrato_id   uuid references contratos(id),
  cxc_id        uuid references cuentas_por_cobrar(id),
  concepto      concepto_cobro not null,
  periodo       date,                     -- primer día del mes que se paga
  monto         numeric(14,2) not null,
  moneda        text not null default 'MXN' check (moneda in ('MXN','USD')),
  forma_pago    text,
  fecha         date not null default current_date,
  folio         text,
  comprobante_path text,
  notas         text,
  es_ajuste     boolean not null default false,  -- descuentos / notas de crédito
  creado_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now()
);
create index on pagos (org_id, fecha);
create index on pagos (unidad_id, periodo);
create index on pagos (contrato_id, periodo);

-- ---------------------------------------------------------------------
-- 3. GASTOS E INGRESOS  (une gastos + egresos)
-- ---------------------------------------------------------------------
create table gastos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  empresa_id    uuid not null references empresas(id),
  centro_id     uuid not null references centros(id),
  fecha         date not null,
  monto         numeric(14,2) not null,
  moneda        text not null default 'MXN' check (moneda in ('MXN','USD')),
  concepto      text not null,
  proveedor     text,
  categoria     text not null default 'General',
  forma_pago    text default 'Transferencia',
  comprobante_path text,
  -- listos para captura automática de CFDI
  cfdi_uuid     text unique,
  rfc_emisor    text,
  notas         text,
  creado_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now()
);
create index on gastos (org_id, fecha);
create index on gastos (centro_id, fecha);

create table ingresos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  empresa_id    uuid not null references empresas(id),
  centro_id     uuid references centros(id),
  fecha         date not null,
  monto         numeric(14,2) not null,
  moneda        text not null default 'MXN' check (moneda in ('MXN','USD')),
  concepto      text not null,
  cliente       text,
  categoria     text,
  forma_pago    text,
  notas         text,
  creado_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now()
);

create table tipo_cambio (
  org_id      uuid not null references organizaciones(id) on delete cascade,
  fecha       date not null,
  usd_mxn     numeric(10,4) not null,
  primary key (org_id, fecha)
);

-- ---------------------------------------------------------------------
-- 4. PERSONAL, ASISTENCIA Y NÓMINA
--    Une: empleados + nomina_data(JSON) + registros + asistencia_diaria
--         + horario_personal + incidencias
-- ---------------------------------------------------------------------
create table empleados (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizaciones(id) on delete cascade,
  empresa_id      uuid not null references empresas(id),
  centro_id       uuid references centros(id),
  nombre          text not null,
  puesto          text,
  departamento    text,
  salario_semanal numeric(12,2) not null default 0,
  dias_semana     int not null default 6,
  hora_entrada    time default '08:00',
  hora_salida     time default '17:00',
  tolerancia_min  int not null default 10,
  dias_laborales  text not null default 'LUN,MAR,MIE,JUE,VIE,SAB',
  pin_hash        text,                   -- para el checador (nunca el PIN en claro)
  fecha_ingreso   date,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

-- Cada checada de entrada/salida (bitácora cruda)
create table checadas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  empleado_id  uuid not null references empleados(id),
  centro_id    uuid references centros(id),
  tipo         text not null check (tipo in ('entrada','salida')),
  momento      timestamptz not null default now(),
  foto_path    text,
  registrado_por text,
  creado_en    timestamptz not null default now()
);
create index on checadas (empleado_id, momento);

-- Resumen diario (una fila por empleado por día) — base del descuento en nómina
create table asistencia (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organizaciones(id) on delete cascade,
  empleado_id             uuid not null references empleados(id),
  fecha                   date not null,
  estado                  text not null default 'presente'
                          check (estado in ('presente','retardo','falta','permiso','vacaciones','incapacidad','descanso')),
  minutos_tarde           int not null default 0,
  minutos_salida_temprano int not null default 0,
  monto_descuento         numeric(12,2) not null default 0,
  notas                   text,
  registrado_por          text,
  creado_en               timestamptz not null default now(),
  unique (empleado_id, fecha)
);

create table incidencias (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  empleado_id  uuid references empleados(id),
  tipo         text,
  texto        text,
  momento      timestamptz not null default now(),
  creado_por   uuid default auth.uid()
);

create table prestamos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  empleado_id  uuid not null references empleados(id),
  monto        numeric(12,2) not null,
  abono_semanal numeric(12,2) not null default 0,
  fecha        date not null default current_date,
  notas        text,
  liquidado    boolean not null default false
);

create table vacaciones (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  empleado_id  uuid not null references empleados(id),
  fecha_inicio date not null,
  fecha_fin    date not null,
  dias         int not null,
  notas        text
);

-- Raya semanal: un periodo (viernes) y una línea por empleado
create table nomina_periodos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  empresa_id   uuid not null references empresas(id),
  fecha_inicio date not null,
  fecha_pago   date not null,             -- el viernes
  estado       text not null default 'borrador' check (estado in ('borrador','cerrada','pagada')),
  creado_en    timestamptz not null default now(),
  unique (empresa_id, fecha_pago)
);

create table nomina_lineas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizaciones(id) on delete cascade,
  periodo_id      uuid not null references nomina_periodos(id) on delete cascade,
  empleado_id     uuid not null references empleados(id),
  centro_id       uuid references centros(id),
  dias_trabajados numeric(4,1) not null default 0,
  sueldo          numeric(12,2) not null default 0,
  extras          numeric(12,2) not null default 0,
  descuentos      numeric(12,2) not null default 0,
  abono_prestamo  numeric(12,2) not null default 0,
  total           numeric(12,2) generated always as (sueldo + extras - descuentos - abono_prestamo) stored,
  forma_pago      text,
  notas           text,
  unique (periodo_id, empleado_id)
);

-- ---------------------------------------------------------------------
-- 5. TAREAS OPERATIVAS (plantilla_tareas + control_tareas)
-- ---------------------------------------------------------------------
create table tareas_plantilla (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  centro_id    uuid not null references centros(id),
  empleado_id  uuid references empleados(id),
  puesto       text,
  tarea        text not null,
  categoria    text,
  frecuencia   text not null default 'diaria' check (frecuencia in ('diaria','semanal','mensual')),
  dia_semana   text,
  activo       boolean not null default true
);

create table tareas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  centro_id    uuid not null references centros(id),
  plantilla_id uuid references tareas_plantilla(id),
  empleado_id  uuid references empleados(id),
  fecha        date not null default current_date,
  tipo         text not null default 'tarea' check (tipo in ('tarea','hallazgo')),
  tarea        text not null,
  categoria    text,
  estado       text not null default 'pendiente',
  severidad    text,
  foto_path    text,
  notas        text,
  resuelto_en  timestamptz,
  registrado_por text,
  creado_en    timestamptz not null default now()
);
create index on tareas (centro_id, fecha);

-- ---------------------------------------------------------------------
-- 6. PATRIMONIO
-- ---------------------------------------------------------------------
create table activos (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizaciones(id) on delete cascade,
  empresa_id             uuid not null references empresas(id),
  centro_id              uuid references centros(id),
  unidad_id              uuid references unidades(id),
  codigo                 text,
  entidad_legal          text,
  tipo_unidad            text,
  identificador          text,
  direccion              text,
  ciudad                 text,
  superficie_m2          numeric,
  clave_catastral        text,
  fecha_adquisicion      date,
  costo_adquisicion      numeric(16,2),
  valor_comercial        numeric(16,2),
  fecha_valuacion        date,
  moneda                 text not null default 'MXN' check (moneda in ('MXN','USD')),
  uso_actual             text,
  renta_mercado_estimada numeric(14,2),
  notas                  text,
  creado_en              timestamptz not null default now()
);

create table pasivos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizaciones(id) on delete cascade,
  empresa_id        uuid not null references empresas(id),
  activo_id         uuid references activos(id),
  acreedor          text,
  tipo_pasivo       text,
  saldo_actual      numeric(16,2),
  fecha_saldo       date,
  moneda            text not null default 'MXN' check (moneda in ('MXN','USD')),
  tasa_interes      numeric(7,4),
  pago_mensual      numeric(14,2),
  fecha_inicio      date,
  fecha_vencimiento date,
  garantia          text,
  notas             text,
  creado_en         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. BITÁCORA DE CAMBIOS (para que nunca vuelvas a reconstruir de memoria)
-- ---------------------------------------------------------------------
create table bitacora (
  id         bigint generated always as identity primary key,
  org_id     uuid,
  tabla      text not null,
  fila_id    uuid,
  accion     text not null,
  antes      jsonb,
  despues    jsonb,
  user_id    uuid default auth.uid(),
  momento    timestamptz not null default now()
);

create or replace function registrar_cambio() returns trigger
language plpgsql security definer set search_path = app, public as $$
begin
  insert into bitacora (org_id, tabla, fila_id, accion, antes, despues)
  values (coalesce(new.org_id, old.org_id), tg_table_name,
          coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 8. RLS EN TODAS LAS TABLAS
-- Lectura: cualquier miembro activo de la org (respetando su empresa).
-- Escritura: según rol.
-- ---------------------------------------------------------------------
alter table organizaciones enable row level security;
create policy org_ver on organizaciones for select using (es_miembro(id));

alter table miembros enable row level security;
create policy miembros_ver on miembros for select using (es_miembro(org_id));
create policy miembros_admin on miembros for all
  using (tiene_rol(org_id, array[]::rol_usuario[]))
  with check (tiene_rol(org_id, array[]::rol_usuario[]));

alter table bitacora enable row level security;
create policy bitacora_ver on bitacora for select using (tiene_rol(org_id, array['administracion']::rol_usuario[]));

do $$
declare
  t record;
begin
  -- tabla, roles que pueden escribir, ¿tiene empresa_id?
  for t in select * from (values
    ('empresas',           '{administracion}',                    false),
    ('centros',            '{administracion}',                    true),
    ('unidades',           '{administracion,cobranza}',           false),
    ('cuotas',             '{administracion,cobranza}',           false),
    ('contratos',          '{administracion,cobranza}',           false),
    ('cuentas_por_cobrar', '{administracion,cobranza}',           true),
    ('pagos',              '{administracion,cobranza}',           true),
    ('gastos',             '{administracion,operacion,encargado}',true),
    ('ingresos',           '{administracion,cobranza}',           true),
    ('tipo_cambio',        '{administracion}',                    false),
    ('empleados',          '{administracion}',                    true),
    ('checadas',           '{administracion,encargado,operacion}',false),
    ('asistencia',         '{administracion,encargado}',          false),
    ('incidencias',        '{administracion,encargado,operacion}',false),
    ('prestamos',          '{administracion}',                    false),
    ('vacaciones',         '{administracion}',                    false),
    ('nomina_periodos',    '{administracion}',                    true),
    ('nomina_lineas',      '{administracion}',                    false),
    ('tareas_plantilla',   '{administracion,operacion}',          false),
    ('tareas',             '{administracion,operacion,encargado}',false),
    ('activos',            '{administracion}',                    true),
    ('pasivos',            '{administracion}',                    true)
  ) as x(tabla, roles, con_empresa)
  loop
    execute format('alter table %I enable row level security', t.tabla);

    if t.tabla = 'empresas' then
      execute format($p$create policy %I on %I for select
        using (puede_ver_empresa(org_id, id))$p$, t.tabla||'_ver', t.tabla);
    elsif t.con_empresa then
      execute format($p$create policy %I on %I for select
        using (puede_ver_empresa(org_id, empresa_id))$p$, t.tabla||'_ver', t.tabla);
    else
      execute format($p$create policy %I on %I for select
        using (es_miembro(org_id))$p$, t.tabla||'_ver', t.tabla);
    end if;

    execute format($p$create policy %I on %I for insert
      with check (tiene_rol(org_id, %L::rol_usuario[]))$p$, t.tabla||'_crear', t.tabla, t.roles);
    execute format($p$create policy %I on %I for update
      using (tiene_rol(org_id, %L::rol_usuario[]))
      with check (tiene_rol(org_id, %L::rol_usuario[]))$p$, t.tabla||'_editar', t.tabla, t.roles, t.roles);
    -- borrar: solo administración / dueño
    execute format($p$create policy %I on %I for delete
      using (tiene_rol(org_id, array['administracion']::rol_usuario[]))$p$, t.tabla||'_borrar', t.tabla);

    -- bitácora en todo lo que tenga dinero o personas
    execute format('create trigger %I after insert or update or delete on %I
      for each row execute function registrar_cambio()', t.tabla||'_bitacora', t.tabla);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. VISTAS ÚTILES
-- ---------------------------------------------------------------------
-- Saldo por cuenta por cobrar (ventas MEDCO, cartera vencida…)
create view v_saldos_cxc with (security_invoker = true) as
select c.*,
       coalesce(sum(p.monto), 0)                    as pagado,
       c.monto_original - coalesce(sum(p.monto), 0) as saldo
from cuentas_por_cobrar c
left join pagos p on p.cxc_id = c.id
group by c.id;

-- Gasto mensual por centro (base del Centro de Control y reportes)
create view v_gasto_mensual with (security_invoker = true) as
select g.org_id, g.empresa_id, g.centro_id, ce.nombre as centro,
       date_trunc('month', g.fecha)::date as mes,
       g.categoria, sum(g.monto) as total, count(*) as movimientos
from gastos g join centros ce on ce.id = g.centro_id
group by 1,2,3,4,5,6;

-- Permisos: solo usuarios con login; RLS decide qué filas
revoke all on schema app from anon, public;
grant usage on schema app to authenticated, service_role;
grant select, insert, update, delete on all tables in schema app to authenticated;
grant all on all tables in schema app to service_role;
grant usage, select on all sequences in schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
revoke all on app.bitacora from authenticated;
grant select on app.bitacora to authenticated;
alter default privileges in schema app grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema app grant all on tables to service_role;
