-- OPERIA · estructura completa de la base para un cliente nuevo (sin datos).
-- Sacada de la base de Treme/MEDCO el 26/10/2026 (esquema app: tablas, funciones, permisos y seguridad por filas)
-- más los módulos opcionales (inventario, cotizaciones, lecturas de luz/gas/agua).
-- Uso: en un proyecto NUEVO de Supabase, correr este archivo completo en el editor SQL. Después:
--   1) Settings → API → "Exposed schemas": agregar  app
--   2) Correr supabase/plantilla/alta_cliente.sql con los datos del cliente.
--   3) Desplegar la función supabase/functions/usuarios (alta de usuarios).
set check_function_bodies = off;
create extension if not exists pgcrypto;
create schema if not exists app;
set search_path = app, public;

-- ===== tipos =====
create type app.concepto_cobro as enum ('renta', 'mantenimiento', 'luz', 'agua', 'venta', 'cartera', 'otro');
create type app.rol_usuario as enum ('dueno', 'administracion', 'cobranza', 'operacion', 'encargado', 'lectura', 'socio');
create type app.tipo_centro as enum ('condominio', 'plaza', 'bodega', 'obra', 'oficina', 'propiedad', 'socio', 'personal', 'otro');
create type app.tipo_cxc as enum ('venta', 'cartera_vencida', 'adeudo_inicial', 'otro');
create type app.tipo_unidad as enum ('local', 'depto', 'oficina', 'bodega', 'casa', 'terreno', 'otro', 'loft');

-- ===== tablas =====
create table app.activos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  centro_id uuid,
  unidad_id uuid,
  codigo text,
  entidad_legal text,
  tipo_unidad text,
  identificador text,
  direccion text,
  ciudad text,
  superficie_m2 numeric,
  clave_catastral text,
  fecha_adquisicion date,
  costo_adquisicion numeric(16,2),
  valor_comercial numeric(16,2),
  fecha_valuacion text,
  moneda text default 'MXN'::text not null,
  uso_actual text,
  renta_mercado_estimada numeric(14,2),
  notas text,
  creado_en timestamp with time zone default now() not null,
  inquilino text,
  ingreso_mensual numeric(14,2),
  fecha_vencimiento_contrato date,
  legacy_id text,
  constraint activos_pkey PRIMARY KEY (id),
  constraint activos_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.asistencia (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empleado_id uuid not null,
  fecha date not null,
  estado text default 'presente'::text not null,
  minutos_tarde integer default 0 not null,
  minutos_salida_temprano integer default 0 not null,
  monto_descuento numeric(12,2) default 0 not null,
  notas text,
  registrado_por text,
  creado_en timestamp with time zone default now() not null,
  hora_entrada timestamp with time zone,
  hora_salida timestamp with time zone,
  horas_descontadas numeric(6,2) default 0 not null,
  constraint asistencia_empleado_id_fecha_key UNIQUE (empleado_id, fecha),
  constraint asistencia_pkey PRIMARY KEY (id),
  constraint asistencia_estado_check CHECK ((estado = ANY (ARRAY['presente'::text, 'retardo'::text, 'falta'::text, 'permiso'::text, 'vacaciones'::text, 'incapacidad'::text, 'descanso'::text])))
);

create table app.bitacora (
  id bigint generated always as identity not null,
  org_id uuid,
  tabla text not null,
  fila_id uuid,
  accion text not null,
  antes jsonb,
  despues jsonb,
  user_id uuid default auth.uid(),
  momento timestamp with time zone default now() not null,
  constraint bitacora_pkey PRIMARY KEY (id)
);

create table app.centros (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  nombre text not null,
  tipo app.tipo_centro not null,
  ciudad text,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  en_gastos boolean default true not null,
  constraint centros_org_id_nombre_key UNIQUE (org_id, nombre),
  constraint centros_pkey PRIMARY KEY (id)
);

create table app.checadas (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empleado_id uuid not null,
  centro_id uuid,
  tipo text not null,
  momento timestamp with time zone default now() not null,
  foto_path text,
  registrado_por text,
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  constraint checadas_pkey PRIMARY KEY (id),
  constraint checadas_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text])))
);

create table app.contratos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  unidad_id uuid,
  centro_id uuid not null,
  arrendatario text not null,
  monto numeric(14,2) default 0 not null,
  moneda text default 'MXN'::text not null,
  dia_pago integer,
  fecha_inicio date,
  fecha_fin date,
  ajuste_inpc boolean default false not null,
  telefono text,
  email text,
  notas text,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  constraint contratos_pkey PRIMARY KEY (id),
  constraint contratos_dia_pago_check CHECK (((dia_pago >= 1) AND (dia_pago <= 31))),
  constraint contratos_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.cuentas_por_cobrar (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  centro_id uuid,
  contrato_id uuid,
  unidad_id uuid,
  tipo app.tipo_cxc not null,
  cliente text not null,
  referencia text,
  monto_original numeric(14,2) not null,
  moneda text default 'MXN'::text not null,
  fecha_origen date,
  notas text,
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  meses integer,
  constraint cuentas_por_cobrar_pkey PRIMARY KEY (id),
  constraint cuentas_por_cobrar_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.cuotas (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  unidad_id uuid not null,
  concepto app.concepto_cobro not null,
  monto numeric(14,2) default 0 not null,
  moneda text default 'MXN'::text not null,
  activo boolean default true not null,
  actualizado_en timestamp with time zone default now() not null,
  en_padron boolean default true not null,
  pagador text,
  constraint cuotas_unidad_id_concepto_key UNIQUE (unidad_id, concepto),
  constraint cuotas_pkey PRIMARY KEY (id),
  constraint cuotas_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.empleados (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  centro_id uuid,
  nombre text not null,
  puesto text,
  departamento text,
  salario_semanal numeric(12,2) default 0 not null,
  dias_semana integer default 6 not null,
  hora_entrada time without time zone default '08:00:00'::time without time zone,
  hora_salida time without time zone default '17:00:00'::time without time zone,
  tolerancia_min integer default 10 not null,
  dias_laborales text default 'LUN,MAR,MIE,JUE,VIE,SAB'::text not null,
  pin_hash text,
  fecha_ingreso date,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  imss boolean default false not null,
  nss text,
  nombre_imss text,
  alta_imss date,
  prima_vacacional boolean default false not null,
  constraint empleados_pkey PRIMARY KEY (id)
);

create table app.empresas (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  nombre text not null,
  nombre_corto text not null,
  rfc text,
  color text,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  constraint empresas_org_id_nombre_corto_key UNIQUE (org_id, nombre_corto),
  constraint empresas_pkey PRIMARY KEY (id)
);

create table app.gastos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  centro_id uuid not null,
  fecha date not null,
  monto numeric(14,2) not null,
  moneda text default 'MXN'::text not null,
  concepto text not null,
  proveedor text,
  categoria text default 'Otros'::text not null,
  forma_pago text default 'Transferencia'::text,
  comprobante_path text,
  cfdi_uuid text,
  rfc_emisor text,
  notas text,
  creado_por uuid default auth.uid(),
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  capturado_por text,
  estado text default 'pagado'::text not null,
  fecha_vencimiento date,
  fecha_pago date,
  constraint gastos_cfdi_uuid_key UNIQUE (cfdi_uuid),
  constraint gastos_pkey PRIMARY KEY (id),
  constraint gastos_estado_valido CHECK ((estado = ANY (ARRAY['pagado'::text, 'por_pagar'::text]))),
  constraint gastos_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.incidencias (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empleado_id uuid,
  tipo text,
  texto text,
  momento timestamp with time zone default now() not null,
  creado_por uuid default auth.uid(),
  constraint incidencias_pkey PRIMARY KEY (id)
);

create table app.ingresos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  centro_id uuid,
  fecha date not null,
  monto numeric(14,2) not null,
  moneda text default 'MXN'::text not null,
  concepto text not null,
  cliente text,
  categoria text,
  forma_pago text,
  notas text,
  creado_por uuid default auth.uid(),
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  capturado_por text,
  constraint ingresos_pkey PRIMARY KEY (id),
  constraint ingresos_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.inversion_publicidad (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid,
  semana date not null,
  plataforma text not null,
  monto numeric not null,
  notas text,
  creado_en timestamp with time zone default now() not null,
  constraint inversion_publicidad_org_id_semana_plataforma_key UNIQUE (org_id, semana, plataforma),
  constraint inversion_publicidad_pkey PRIMARY KEY (id),
  constraint inversion_publicidad_monto_check CHECK ((monto >= (0)::numeric)),
  constraint inversion_publicidad_notas_check CHECK ((length(notas) <= 300)),
  constraint inversion_publicidad_plataforma_check CHECK ((plataforma = ANY (ARRAY['google'::text, 'meta'::text])))
);

create table app.miembros (
  org_id uuid not null,
  user_id uuid not null,
  nombre text not null,
  rol app.rol_usuario default 'lectura'::app.rol_usuario not null,
  empresas uuid[],
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  usuario text,
  roles app.rol_usuario[] default '{}'::app.rol_usuario[] not null,
  debe_cambiar_password boolean default false not null,
  constraint miembros_pkey PRIMARY KEY (org_id, user_id)
);

create table app.nomina_lineas (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  periodo_id uuid not null,
  empleado_id uuid not null,
  centro_id uuid,
  dias_trabajados numeric(4,1) default 0 not null,
  sueldo numeric(12,2) default 0 not null,
  extras numeric(12,2) default 0 not null,
  descuentos numeric(12,2) default 0 not null,
  abono_prestamo numeric(12,2) default 0 not null,
  total numeric(12,2) generated always as ((((sueldo + extras) - descuentos) - abono_prestamo)) stored,
  forma_pago text,
  notas text,
  fecha date,
  gasto_id uuid,
  constraint nomina_lineas_periodo_id_empleado_id_key UNIQUE (periodo_id, empleado_id),
  constraint nomina_lineas_pkey PRIMARY KEY (id)
);

create table app.nomina_periodos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  fecha_inicio date not null,
  fecha_pago date not null,
  estado text default 'borrador'::text not null,
  creado_en timestamp with time zone default now() not null,
  constraint nomina_periodos_empresa_id_fecha_pago_key UNIQUE (empresa_id, fecha_pago),
  constraint nomina_periodos_pkey PRIMARY KEY (id),
  constraint nomina_periodos_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'cerrada'::text, 'pagada'::text])))
);

create table app.organizaciones (
  id uuid default gen_random_uuid() not null,
  nombre text not null,
  plan text default 'interno'::text not null,
  creado_en timestamp with time zone default now() not null,
  constraint organizaciones_pkey PRIMARY KEY (id)
);

create table app.pagos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  centro_id uuid,
  unidad_id uuid,
  contrato_id uuid,
  cxc_id uuid,
  concepto app.concepto_cobro not null,
  periodo date,
  monto numeric(14,2) not null,
  moneda text default 'MXN'::text not null,
  forma_pago text,
  fecha date default CURRENT_DATE not null,
  folio text,
  comprobante_path text,
  notas text,
  es_ajuste boolean default false not null,
  creado_por uuid default auth.uid(),
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  capturado_por text,
  constraint pagos_pkey PRIMARY KEY (id),
  constraint pagos_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.pasivos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid not null,
  activo_id uuid,
  acreedor text,
  tipo_pasivo text,
  saldo_actual numeric(16,2),
  fecha_saldo date,
  moneda text default 'MXN'::text not null,
  tasa_interes numeric(7,4),
  pago_mensual numeric(14,2),
  fecha_inicio date,
  fecha_vencimiento date,
  garantia text,
  notas text,
  creado_en timestamp with time zone default now() not null,
  activo_ref text,
  legacy_id text,
  constraint pasivos_pkey PRIMARY KEY (id),
  constraint pasivos_moneda_check CHECK ((moneda = ANY (ARRAY['MXN'::text, 'USD'::text])))
);

create table app.prestamo_abonos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  prestamo_id uuid not null,
  monto numeric(12,2) not null,
  fecha date default CURRENT_DATE not null,
  notas text,
  creado_en timestamp with time zone default now() not null,
  constraint prestamo_abonos_pkey PRIMARY KEY (id),
  constraint prestamo_abonos_monto_check CHECK ((monto > (0)::numeric))
);

create table app.prestamos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empleado_id uuid not null,
  monto numeric(12,2) not null,
  abono_semanal numeric(12,2) default 0 not null,
  fecha date default CURRENT_DATE not null,
  notas text,
  liquidado boolean default false not null,
  constraint prestamos_pkey PRIMARY KEY (id)
);

create table app.prospectos (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empresa_id uuid,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  nombre text not null,
  empresa text,
  whatsapp text,
  correo text,
  tipo_obra text,
  m2 numeric,
  tiene_terreno text,
  cuando text,
  ubicacion text,
  mensaje text,
  origen text default 'web'::text not null,
  campana text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  gclid text,
  fbclid text,
  pagina text,
  estado text default 'nuevo'::text not null,
  motivo text,
  monto numeric,
  primera_respuesta timestamp with time zone,
  atendido_por uuid,
  notas text,
  calificado_en timestamp with time zone,
  externo_id text,
  constraint prospectos_pkey PRIMARY KEY (id),
  constraint prospectos_campana_check CHECK ((length(campana) <= 160)),
  constraint prospectos_correo_check CHECK ((length(correo) <= 160)),
  constraint prospectos_cuando_check CHECK ((cuando = ANY (ARRAY['ya'::text, '3_meses'::text, '6_meses'::text, 'explorando'::text]))),
  constraint prospectos_empresa_check CHECK ((length(empresa) <= 120)),
  constraint prospectos_estado_check CHECK ((estado = ANY (ARRAY['nuevo'::text, 'calificado'::text, 'no_calificado'::text, 'cotizado'::text, 'ganado'::text, 'perdido'::text]))),
  constraint prospectos_externo_id_check CHECK ((length(externo_id) <= 120)),
  constraint prospectos_fbclid_check CHECK ((length(fbclid) <= 255)),
  constraint prospectos_gclid_check CHECK ((length(gclid) <= 255)),
  constraint prospectos_m2_check CHECK (((m2 IS NULL) OR (m2 >= (0)::numeric))),
  constraint prospectos_mensaje_check CHECK ((length(mensaje) <= 2000)),
  constraint prospectos_monto_check CHECK (((monto IS NULL) OR (monto >= (0)::numeric))),
  constraint prospectos_motivo_check CHECK ((length(motivo) <= 300)),
  constraint prospectos_nombre_check CHECK (((length(nombre) >= 1) AND (length(nombre) <= 120))),
  constraint prospectos_notas_check CHECK ((length(notas) <= 4000)),
  constraint prospectos_origen_check CHECK ((origen = ANY (ARRAY['google'::text, 'instagram'::text, 'facebook'::text, 'web'::text, 'whatsapp'::text, 'recomendacion'::text, 'otro'::text]))),
  constraint prospectos_pagina_check CHECK ((length(pagina) <= 300)),
  constraint prospectos_tiene_terreno_check CHECK ((tiene_terreno = ANY (ARRAY['si'::text, 'no'::text, 'buscando'::text]))),
  constraint prospectos_tipo_obra_check CHECK ((length(tipo_obra) <= 60)),
  constraint prospectos_ubicacion_check CHECK ((length(ubicacion) <= 120)),
  constraint prospectos_utm_campaign_check CHECK ((length(utm_campaign) <= 160)),
  constraint prospectos_utm_medium_check CHECK ((length(utm_medium) <= 120)),
  constraint prospectos_utm_source_check CHECK ((length(utm_source) <= 120)),
  constraint prospectos_utm_term_check CHECK ((length(utm_term) <= 160)),
  constraint prospectos_whatsapp_check CHECK ((length(whatsapp) <= 30))
);

create table app.tareas (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  centro_id uuid not null,
  plantilla_id uuid,
  empleado_id uuid,
  fecha date default CURRENT_DATE not null,
  tipo text default 'tarea'::text not null,
  tarea text not null,
  categoria text,
  estado text default 'pendiente'::text not null,
  severidad text,
  foto_path text,
  notas text,
  resuelto_en timestamp with time zone,
  registrado_por text,
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  hora_registro timestamp with time zone,
  constraint tareas_pkey PRIMARY KEY (id),
  constraint tareas_tipo_check CHECK ((tipo = ANY (ARRAY['tarea'::text, 'rondin'::text, 'incidencia'::text, 'hallazgo'::text])))
);

create table app.tareas_plantilla (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  centro_id uuid not null,
  empleado_id uuid,
  puesto text,
  tarea text not null,
  categoria text,
  frecuencia text default 'diaria'::text not null,
  dia_semana text,
  activo boolean default true not null,
  constraint tareas_plantilla_pkey PRIMARY KEY (id),
  constraint tareas_plantilla_frecuencia_check CHECK ((frecuencia = ANY (ARRAY['diaria'::text, 'semanal'::text, 'mensual'::text])))
);

create table app.tipo_cambio (
  org_id uuid not null,
  fecha date not null,
  usd_mxn numeric(10,4) not null,
  constraint tipo_cambio_pkey PRIMARY KEY (org_id, fecha)
);

create table app.unidades (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  centro_id uuid not null,
  identificador text not null,
  tipo app.tipo_unidad default 'local'::app.tipo_unidad not null,
  ocupante text,
  superficie_m2 numeric,
  exento boolean default false not null,
  notas text,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  legacy_id text,
  constraint unidades_centro_id_identificador_key UNIQUE (centro_id, identificador),
  constraint unidades_pkey PRIMARY KEY (id)
);

create table app.vacaciones (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  empleado_id uuid not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  dias integer not null,
  notas text,
  periodo integer,
  tipo text default 'disfrutadas'::text not null,
  monto numeric(12,2),
  prima numeric(12,2),
  creado_en timestamp with time zone default now() not null,
  constraint vacaciones_pkey PRIMARY KEY (id),
  constraint vacaciones_tipo_chk CHECK ((tipo = ANY (ARRAY['disfrutadas'::text, 'pagadas'::text])))
);

-- ===== relaciones =====
alter table app.activos add constraint activos_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.activos add constraint activos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.activos add constraint activos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.activos add constraint activos_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES app.unidades(id);
alter table app.asistencia add constraint asistencia_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.asistencia add constraint asistencia_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.centros add constraint centros_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.centros add constraint centros_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.checadas add constraint checadas_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.checadas add constraint checadas_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.checadas add constraint checadas_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.contratos add constraint contratos_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.contratos add constraint contratos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.contratos add constraint contratos_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES app.unidades(id);
alter table app.cuentas_por_cobrar add constraint cuentas_por_cobrar_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.cuentas_por_cobrar add constraint cuentas_por_cobrar_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES app.contratos(id);
alter table app.cuentas_por_cobrar add constraint cuentas_por_cobrar_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.cuentas_por_cobrar add constraint cuentas_por_cobrar_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.cuentas_por_cobrar add constraint cuentas_por_cobrar_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES app.unidades(id);
alter table app.cuotas add constraint cuotas_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.cuotas add constraint cuotas_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES app.unidades(id) ON DELETE CASCADE;
alter table app.empleados add constraint empleados_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.empleados add constraint empleados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.empleados add constraint empleados_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.empresas add constraint empresas_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.gastos add constraint gastos_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.gastos add constraint gastos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.gastos add constraint gastos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.incidencias add constraint incidencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.incidencias add constraint incidencias_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.ingresos add constraint ingresos_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.ingresos add constraint ingresos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.ingresos add constraint ingresos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.inversion_publicidad add constraint inversion_publicidad_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.inversion_publicidad add constraint inversion_publicidad_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id);
alter table app.miembros add constraint miembros_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.miembros add constraint miembros_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table app.nomina_lineas add constraint nomina_lineas_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.nomina_lineas add constraint nomina_lineas_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.nomina_lineas add constraint nomina_lineas_gasto_id_fkey FOREIGN KEY (gasto_id) REFERENCES app.gastos(id) ON DELETE SET NULL;
alter table app.nomina_lineas add constraint nomina_lineas_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.nomina_lineas add constraint nomina_lineas_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES app.nomina_periodos(id) ON DELETE CASCADE;
alter table app.nomina_periodos add constraint nomina_periodos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.nomina_periodos add constraint nomina_periodos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.pagos add constraint pagos_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.pagos add constraint pagos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES app.contratos(id);
alter table app.pagos add constraint pagos_cxc_id_fkey FOREIGN KEY (cxc_id) REFERENCES app.cuentas_por_cobrar(id);
alter table app.pagos add constraint pagos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.pagos add constraint pagos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.pagos add constraint pagos_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES app.unidades(id);
alter table app.pasivos add constraint pasivos_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES app.activos(id);
alter table app.pasivos add constraint pasivos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.pasivos add constraint pasivos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.prestamo_abonos add constraint prestamo_abonos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.prestamo_abonos add constraint prestamo_abonos_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES app.prestamos(id) ON DELETE CASCADE;
alter table app.prestamos add constraint prestamos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.prestamos add constraint prestamos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.prospectos add constraint prospectos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES app.empresas(id);
alter table app.prospectos add constraint prospectos_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id);
alter table app.tareas add constraint tareas_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.tareas add constraint tareas_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.tareas add constraint tareas_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.tareas add constraint tareas_plantilla_id_fkey FOREIGN KEY (plantilla_id) REFERENCES app.tareas_plantilla(id);
alter table app.tareas_plantilla add constraint tareas_plantilla_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.tareas_plantilla add constraint tareas_plantilla_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.tareas_plantilla add constraint tareas_plantilla_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.tipo_cambio add constraint tipo_cambio_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.unidades add constraint unidades_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES app.centros(id);
alter table app.unidades add constraint unidades_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;
alter table app.vacaciones add constraint vacaciones_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES app.empleados(id);
alter table app.vacaciones add constraint vacaciones_org_id_fkey FOREIGN KEY (org_id) REFERENCES app.organizaciones(id) ON DELETE CASCADE;

-- ===== índices =====
CREATE INDEX activos_empresa_id_idx ON app.activos USING btree (empresa_id);
CREATE INDEX activos_org_id_idx ON app.activos USING btree (org_id);
CREATE INDEX activos_centro_id_idx ON app.activos USING btree (centro_id);
CREATE INDEX activos_unidad_id_idx ON app.activos USING btree (unidad_id);
CREATE INDEX asistencia_org_id_idx ON app.asistencia USING btree (org_id);
CREATE INDEX centros_empresa_id_idx ON app.centros USING btree (empresa_id);
CREATE INDEX checadas_centro_id_idx ON app.checadas USING btree (centro_id);
CREATE INDEX checadas_empleado_id_momento_idx ON app.checadas USING btree (empleado_id, momento);
CREATE INDEX checadas_org_id_idx ON app.checadas USING btree (org_id);
CREATE INDEX contratos_unidad_id_idx ON app.contratos USING btree (unidad_id);
CREATE INDEX contratos_org_id_idx ON app.contratos USING btree (org_id);
CREATE INDEX contratos_centro_id_idx ON app.contratos USING btree (centro_id);
CREATE INDEX cuentas_por_cobrar_empresa_id_idx ON app.cuentas_por_cobrar USING btree (empresa_id);
CREATE INDEX cuentas_por_cobrar_unidad_id_idx ON app.cuentas_por_cobrar USING btree (unidad_id);
CREATE INDEX cuentas_por_cobrar_contrato_id_idx ON app.cuentas_por_cobrar USING btree (contrato_id);
CREATE INDEX cuentas_por_cobrar_org_id_idx ON app.cuentas_por_cobrar USING btree (org_id);
CREATE INDEX cuentas_por_cobrar_centro_id_idx ON app.cuentas_por_cobrar USING btree (centro_id);
CREATE INDEX cuotas_org_id_idx ON app.cuotas USING btree (org_id);
CREATE INDEX empleados_org_id_idx ON app.empleados USING btree (org_id);
CREATE INDEX empleados_empresa_id_idx ON app.empleados USING btree (empresa_id);
CREATE INDEX empleados_centro_id_idx ON app.empleados USING btree (centro_id);
CREATE INDEX gastos_por_pagar_idx ON app.gastos USING btree (org_id) WHERE (estado = 'por_pagar'::text);
CREATE INDEX gastos_centro_id_fecha_idx ON app.gastos USING btree (centro_id, fecha);
CREATE INDEX gastos_org_id_fecha_idx ON app.gastos USING btree (org_id, fecha);
CREATE INDEX gastos_empresa_id_idx ON app.gastos USING btree (empresa_id);
CREATE INDEX incidencias_org_id_idx ON app.incidencias USING btree (org_id);
CREATE INDEX incidencias_empleado_id_idx ON app.incidencias USING btree (empleado_id);
CREATE INDEX ingresos_centro_id_idx ON app.ingresos USING btree (centro_id);
CREATE INDEX ingresos_empresa_id_idx ON app.ingresos USING btree (empresa_id);
CREATE INDEX ingresos_org_id_idx ON app.ingresos USING btree (org_id);
CREATE INDEX inversion_publicidad_empresa_idx ON app.inversion_publicidad USING btree (empresa_id);
CREATE UNIQUE INDEX miembros_usuario_unico ON app.miembros USING btree (lower(usuario)) WHERE (usuario IS NOT NULL);
CREATE INDEX miembros_user_id_idx ON app.miembros USING btree (user_id);
CREATE INDEX nomina_lineas_empleado_id_idx ON app.nomina_lineas USING btree (empleado_id);
CREATE INDEX nomina_lineas_gasto_id_idx ON app.nomina_lineas USING btree (gasto_id);
CREATE INDEX nomina_lineas_centro_id_idx ON app.nomina_lineas USING btree (centro_id);
CREATE INDEX nomina_lineas_org_id_idx ON app.nomina_lineas USING btree (org_id);
CREATE INDEX nomina_periodos_org_id_idx ON app.nomina_periodos USING btree (org_id);
CREATE INDEX pagos_contrato_id_periodo_idx ON app.pagos USING btree (contrato_id, periodo);
CREATE INDEX pagos_org_id_fecha_idx ON app.pagos USING btree (org_id, fecha);
CREATE INDEX pagos_cxc_id_idx ON app.pagos USING btree (cxc_id);
CREATE INDEX pagos_unidad_id_periodo_idx ON app.pagos USING btree (unidad_id, periodo);
CREATE INDEX pagos_centro_id_idx ON app.pagos USING btree (centro_id);
CREATE INDEX pagos_empresa_id_idx ON app.pagos USING btree (empresa_id);
CREATE INDEX pasivos_empresa_id_idx ON app.pasivos USING btree (empresa_id);
CREATE INDEX pasivos_org_id_idx ON app.pasivos USING btree (org_id);
CREATE INDEX pasivos_activo_id_idx ON app.pasivos USING btree (activo_id);
CREATE INDEX prestamo_abonos_org_idx ON app.prestamo_abonos USING btree (org_id);
CREATE INDEX prestamo_abonos_prestamo_idx ON app.prestamo_abonos USING btree (prestamo_id);
CREATE INDEX prestamos_empleado_id_idx ON app.prestamos USING btree (empleado_id);
CREATE INDEX prestamos_org_id_idx ON app.prestamos USING btree (org_id);
CREATE INDEX prospectos_empresa_idx ON app.prospectos USING btree (empresa_id);
CREATE UNIQUE INDEX prospectos_externo_uk ON app.prospectos USING btree (org_id, externo_id) WHERE (externo_id IS NOT NULL);
CREATE INDEX prospectos_org_idx ON app.prospectos USING btree (org_id, creado_en DESC);
CREATE INDEX prospectos_estado_idx ON app.prospectos USING btree (org_id, estado);
CREATE INDEX tareas_plantilla_id_idx ON app.tareas USING btree (plantilla_id);
CREATE INDEX tareas_centro_id_fecha_idx ON app.tareas USING btree (centro_id, fecha);
CREATE INDEX tareas_org_id_idx ON app.tareas USING btree (org_id);
CREATE INDEX tareas_empleado_id_idx ON app.tareas USING btree (empleado_id);
CREATE INDEX tareas_plantilla_centro_id_idx ON app.tareas_plantilla USING btree (centro_id);
CREATE INDEX tareas_plantilla_org_id_idx ON app.tareas_plantilla USING btree (org_id);
CREATE INDEX tareas_plantilla_empleado_id_idx ON app.tareas_plantilla USING btree (empleado_id);
CREATE INDEX unidades_org_id_idx ON app.unidades USING btree (org_id);
CREATE INDEX vacaciones_org_id_idx ON app.vacaciones USING btree (org_id);
CREATE INDEX vacaciones_empleado_id_idx ON app.vacaciones USING btree (empleado_id);

-- ===== funciones =====
CREATE OR REPLACE FUNCTION app.asistencia_marcar(p_empleado uuid, p_fecha date, p_accion text)
 RETURNS app.asistencia
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  e empleados; prev asistencia; res asistencia;
  ahora timestamptz := now();
  tol int; jornada numeric; tarifa_hora numeric; diaria numeric;
  esperada_ent timestamptz; esperada_sal timestamptz;
  min_tarde int := 0; min_temprano int := 0; horas numeric := 0;
begin
  select * into e from empleados where id = p_empleado;
  if e.id is null then raise exception 'Empleado no encontrado'; end if;
  if not tiene_rol(e.org_id, array['administracion','encargado']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  if p_accion not in ('entrada','salida','falta','permiso') then raise exception 'Acción inválida'; end if;

  tol := coalesce(e.tolerancia_min, 0);
  jornada := extract(epoch from (coalesce(e.hora_salida, '17:00') - coalesce(e.hora_entrada, '08:00'))) / 3600;
  if jornada <= 0 then jornada := jornada + 24; end if;
  if jornada = 0 then jornada := 8; end if;
  diaria := coalesce(e.salario_semanal, 0) / nullif(coalesce(e.dias_semana, 6), 0);
  tarifa_hora := coalesce(diaria / jornada, 0);
  esperada_ent := (p_fecha + coalesce(e.hora_entrada, '08:00')) at time zone 'America/Monterrey';
  esperada_sal := (p_fecha + coalesce(e.hora_salida, '17:00')) at time zone 'America/Monterrey';
  if esperada_sal <= esperada_ent then esperada_sal := esperada_sal + interval '1 day'; end if;   -- turno de noche

  select * into prev from asistencia where empleado_id = e.id and fecha = p_fecha;

  if p_accion = 'entrada' then
    min_tarde := greatest(0, round(extract(epoch from (ahora - esperada_ent)) / 60)::int - tol);
    horas := least(min_tarde / 60.0, jornada);
    insert into asistencia (org_id, empleado_id, fecha, estado, hora_entrada, minutos_tarde, horas_descontadas, monto_descuento, registrado_por)
    values (e.org_id, e.id, p_fecha, case when min_tarde > 0 then 'retardo' else 'presente' end, ahora, min_tarde, horas,
            round(horas * tarifa_hora), (select nombre from miembros where user_id = auth.uid() and org_id = e.org_id))
    on conflict (empleado_id, fecha) do update set estado = excluded.estado, hora_entrada = excluded.hora_entrada,
      minutos_tarde = excluded.minutos_tarde, horas_descontadas = excluded.horas_descontadas, monto_descuento = excluded.monto_descuento,
      registrado_por = excluded.registrado_por
    returning * into res;

  elsif p_accion = 'salida' then
    min_temprano := greatest(0, round(extract(epoch from (esperada_sal - ahora)) / 60)::int - tol);
    horas := least(coalesce(prev.horas_descontadas, 0) + min_temprano / 60.0, jornada);
    insert into asistencia (org_id, empleado_id, fecha, estado, hora_salida, minutos_salida_temprano, horas_descontadas, monto_descuento, registrado_por)
    values (e.org_id, e.id, p_fecha,
            case when prev.estado in ('falta','permiso') then prev.estado when horas > 0 then 'retardo' else 'presente' end,
            ahora, min_temprano, horas, round(horas * tarifa_hora),
            (select nombre from miembros where user_id = auth.uid() and org_id = e.org_id))
    on conflict (empleado_id, fecha) do update set estado = excluded.estado, hora_salida = excluded.hora_salida,
      minutos_salida_temprano = excluded.minutos_salida_temprano, horas_descontadas = excluded.horas_descontadas,
      monto_descuento = excluded.monto_descuento
    returning * into res;

  else  -- falta o permiso
    insert into asistencia (org_id, empleado_id, fecha, estado, minutos_tarde, horas_descontadas, monto_descuento, registrado_por)
    values (e.org_id, e.id, p_fecha, p_accion, 0,
            case when p_accion = 'falta' then jornada else 0 end,
            case when p_accion = 'falta' then round(diaria) else 0 end,
            (select nombre from miembros where user_id = auth.uid() and org_id = e.org_id))
    on conflict (empleado_id, fecha) do update set estado = excluded.estado, hora_entrada = null, hora_salida = null,
      minutos_tarde = 0, minutos_salida_temprano = 0, horas_descontadas = excluded.horas_descontadas,
      monto_descuento = excluded.monto_descuento, registrado_por = excluded.registrado_por
    returning * into res;
  end if;
  return res;
end $function$
;

CREATE OR REPLACE FUNCTION app.correo_para_login(p_usuario text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select u.email from miembros m join auth.users u on u.id = m.user_id
  where lower(m.usuario) = lower(trim(p_usuario)) and m.activo
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION app.equipo_de(p_centro uuid)
 RETURNS TABLE(id uuid, nombre text, puesto text, hora_entrada time without time zone, hora_salida time without time zone, tolerancia_min integer, dias_laborales text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select e.id, e.nombre, e.puesto, e.hora_entrada, e.hora_salida, e.tolerancia_min, e.dias_laborales
  from empleados e join centros c on c.id = e.centro_id
  where e.centro_id = p_centro and e.activo
    and tiene_rol(c.org_id, array['administracion','encargado']::rol_usuario[])
    and puede_ver_empresa(c.org_id, c.empresa_id)
  order by e.nombre;
$function$
;

CREATE OR REPLACE FUNCTION app.es_miembro(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select exists (select 1 from miembros where org_id = p_org and user_id = auth.uid() and activo);
$function$
;

CREATE OR REPLACE FUNCTION app.marcar_password_cambiado()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  update miembros set debe_cambiar_password = false where user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION app.nomina_pagar(p_empleado uuid, p_semana date, p_monto numeric, p_fecha date, p_forma text, p_notas text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare e empleados; v_periodo uuid; v_gasto uuid; v_linea uuid; v_centro uuid; faltas int; k int := 0;
begin
  select * into e from empleados where id = p_empleado;
  if e.id is null then raise exception 'Empleado no encontrado'; end if;
  if not tiene_rol(e.org_id, array['administracion']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  if p_monto is null or p_monto < 0 then raise exception 'Monto inválido'; end if;

  select id into v_periodo from nomina_periodos where empresa_id = e.empresa_id and fecha_inicio = p_semana;
  while v_periodo is null loop                     -- fecha_pago es única por empresa: se usa el viernes, o el siguiente día libre
    begin
      insert into nomina_periodos (org_id, empresa_id, fecha_inicio, fecha_pago, estado)
      values (e.org_id, e.empresa_id, p_semana, p_semana + 4 + k, 'pagada') returning id into v_periodo;
    exception when unique_violation then
      k := k + 1;
      select id into v_periodo from nomina_periodos where empresa_id = e.empresa_id and fecha_inicio = p_semana;
      if k > 60 then raise exception 'No se pudo crear el periodo de nómina'; end if;
    end;
  end loop;

  if exists (select 1 from nomina_lineas where periodo_id = v_periodo and empleado_id = e.id) then
    raise exception 'Ya hay un pago de nómina de esta persona en esa semana';
  end if;

  v_centro := coalesce(e.centro_id, (select id from centros where org_id = e.org_id and nombre = 'Por asignar'));
  insert into gastos (org_id, empresa_id, centro_id, fecha, monto, concepto, proveedor, categoria, forma_pago, notas, capturado_por)
  values (e.org_id, coalesce((select empresa_id from centros where id = v_centro), e.empresa_id), v_centro, p_fecha,
          round(p_monto, 2), 'Nómina — ' || e.nombre, e.nombre, 'Nómina', p_forma,
          'Semana del ' || to_char(p_semana, 'DD/MM/YYYY') || coalesce(' · ' || nullif(p_notas, ''), ''),
          (select nombre from miembros where user_id = auth.uid() and org_id = e.org_id))
  returning id into v_gasto;

  select count(*) into faltas from asistencia where empleado_id = e.id and estado = 'falta' and fecha between p_semana and p_semana + 6;
  insert into nomina_lineas (org_id, periodo_id, empleado_id, centro_id, dias_trabajados, sueldo, forma_pago, notas, fecha, gasto_id)
  values (e.org_id, v_periodo, e.id, e.centro_id, greatest(coalesce(e.dias_semana, 6) - faltas, 0), round(p_monto, 2),
          p_forma, nullif(p_notas, ''), p_fecha, v_gasto)
  returning id into v_linea;
  return v_linea;
end $function$
;

CREATE OR REPLACE FUNCTION app.prospectos_tiempos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'app', 'public'
AS $function$
begin
  new.actualizado_en := now();
  if new.primera_respuesta is null and new.estado <> 'nuevo' then
    new.primera_respuesta := now();
  end if;
  if new.calificado_en is null and new.estado in ('calificado','cotizado','ganado') then
    new.calificado_en := now();
  end if;
  if new.atendido_por is null and new.primera_respuesta is not null then
    new.atendido_por := auth.uid();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION app.puede_ver_centro(p_org uuid, p_centro uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select p_centro is null
      or not exists (select 1 from centros c where c.id = p_centro and c.tipo in ('socio','personal'))
      or tiene_rol(p_org, array['administracion']::rol_usuario[]);
$function$
;

CREATE OR REPLACE FUNCTION app.puede_ver_empresa(p_org uuid, p_empresa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select exists (select 1 from miembros where org_id = p_org and user_id = auth.uid() and activo
                   and (empresas is null or p_empresa = any (empresas)));
$function$
;

CREATE OR REPLACE FUNCTION app.registrar_cambio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
begin
  insert into bitacora (org_id, tabla, fila_id, accion, antes, despues)
  values (coalesce(new.org_id, old.org_id), tg_table_name,
          coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION app.registrar_prospecto(p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_emp  empresas%rowtype;
  v_nom  text := left(nullif(trim(p->>'nombre'), ''), 120);
  v_tel  text := left(nullif(regexp_replace(coalesce(p->>'whatsapp',''), '[^0-9+]', '', 'g'), ''), 30);
  v_mail text := left(nullif(lower(trim(p->>'correo')), ''), 160);
  v_src  text := lower(left(nullif(trim(p->>'utm_source'), ''), 120));
  v_ori  text;
  v_m2   numeric;
begin
  if v_nom is null or (v_tel is null and v_mail is null) then
    raise exception 'Faltan nombre y teléfono o correo';
  end if;
  if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_mail := null; end if;

  -- Empresa que recibe los prospectos: la que mande la página (p->>'empresa', nombre corto) o la primera activa
  select * into v_emp from empresas where activo and (p->>'empresa' is null or nombre_corto = p->>'empresa') order by creado_en limit 1;
  if not found then raise exception 'Empresa no encontrada'; end if;

  if (select count(*) from prospectos where org_id = v_emp.org_id and creado_en > now() - interval '10 minutes') >= 40
     or (select count(*) from prospectos where org_id = v_emp.org_id and creado_en > now() - interval '1 hour'
           and ((v_tel is not null and whatsapp = v_tel) or (v_mail is not null and correo = v_mail))) >= 3 then
    return true;
  end if;

  v_ori := case
    when nullif(p->>'gclid','') is not null or v_src in ('google','adwords','gads') then 'google'
    when v_src in ('instagram','ig') then 'instagram'
    when v_src in ('facebook','fb','meta') then 'facebook'
    when nullif(p->>'fbclid','') is not null then 'instagram'
    else 'web' end;
  begin v_m2 := nullif(regexp_replace(coalesce(p->>'m2',''), '[^0-9.]', '', 'g'), '')::numeric;
  exception when others then v_m2 := null; end;

  insert into prospectos (org_id, empresa_id, nombre, empresa, whatsapp, correo, tipo_obra, m2, tiene_terreno,
    cuando, ubicacion, mensaje, origen, campana, utm_source, utm_medium, utm_campaign, utm_term, gclid, fbclid, pagina)
  values (v_emp.org_id, v_emp.id, v_nom,
    left(nullif(trim(p->>'empresa'), ''), 120), v_tel, v_mail,
    left(nullif(trim(p->>'tipo_obra'), ''), 60), v_m2,
    case when p->>'tiene_terreno' in ('si','no','buscando') then p->>'tiene_terreno' end,
    case when p->>'cuando' in ('ya','3_meses','6_meses','explorando') then p->>'cuando' end,
    left(nullif(trim(p->>'ubicacion'), ''), 120),
    left(nullif(trim(p->>'mensaje'), ''), 2000),
    v_ori,
    left(nullif(trim(coalesce(p->>'utm_campaign', '')), ''), 160),
    v_src, left(nullif(trim(p->>'utm_medium'), ''), 120), left(nullif(trim(p->>'utm_campaign'), ''), 160),
    left(nullif(trim(p->>'utm_term'), ''), 160), left(nullif(p->>'gclid', ''), 255), left(nullif(p->>'fbclid', ''), 255),
    left(nullif(p->>'pagina', ''), 300));
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION app.siguiente_folio_cuota(p_org uuid, p_periodo date)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select 'REC-' || to_char(p_periodo, 'YYYYMM') || '-' ||
    lpad((coalesce(max(nullif(split_part(folio, '-', 3), '')::int), 0) + 1)::text, 4, '0')
  from pagos
  where org_id = p_org and concepto in ('mantenimiento', 'luz')
    and folio like 'REC-' || to_char(p_periodo, 'YYYYMM') || '-%'
    and tiene_rol(p_org, array['administracion','cobranza']::rol_usuario[]);
$function$
;

CREATE OR REPLACE FUNCTION app.siguiente_folio_renta(p_org uuid)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select 'REC-' || lpad((coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
  from pagos where org_id = p_org and concepto = 'renta' and folio like 'REC-%'
    and tiene_rol(p_org, array['administracion','cobranza']::rol_usuario[]);
$function$
;

CREATE OR REPLACE FUNCTION app.tiene_rol(p_org uuid, p_roles app.rol_usuario[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select exists (select 1 from miembros
                 where org_id = p_org and user_id = auth.uid() and activo
                   and (rol = any (p_roles || array['dueno'::rol_usuario])
                        or roles && (p_roles || array['dueno'::rol_usuario])
                        or (cardinality(p_roles) > 0
                            and (rol = 'socio'::rol_usuario or 'socio'::rol_usuario = any (roles)))));
$function$
;

CREATE OR REPLACE FUNCTION app.usuarios_lista()
 RETURNS TABLE(user_id uuid, nombre text, usuario text, correo text, rol app.rol_usuario, roles app.rol_usuario[], empresas uuid[], activo boolean, debe_cambiar_password boolean, ultimo_acceso timestamp with time zone, creado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select m.user_id, m.nombre, m.usuario, u.email, m.rol, m.roles, m.empresas, m.activo, m.debe_cambiar_password,
         u.last_sign_in_at, m.creado_en
  from miembros m join auth.users u on u.id = m.user_id
  where tiene_rol(m.org_id, array[]::rol_usuario[])
  order by m.activo desc, m.nombre;
$function$
;

-- ===== vistas =====
create or replace view app.v_gasto_mensual with (security_invoker=true) as
 SELECT g.org_id,
    g.empresa_id,
    g.centro_id,
    ce.nombre AS centro,
    (date_trunc('month'::text, (g.fecha)::timestamp with time zone))::date AS mes,
    g.categoria,
    sum(g.monto) AS total,
    count(*) AS movimientos
   FROM (app.gastos g
     JOIN app.centros ce ON ((ce.id = g.centro_id)))
  GROUP BY g.org_id, g.empresa_id, g.centro_id, ce.nombre, ((date_trunc('month'::text, (g.fecha)::timestamp with time zone))::date), g.categoria;

create or replace view app.v_saldos_cxc with (security_invoker=true) as
 SELECT c.id,
    c.org_id,
    c.empresa_id,
    c.centro_id,
    c.contrato_id,
    c.unidad_id,
    c.tipo,
    c.cliente,
    c.referencia,
    c.monto_original,
    c.moneda,
    c.fecha_origen,
    c.notas,
    c.creado_en,
    COALESCE(sum(p.monto), (0)::numeric) AS pagado,
    (c.monto_original - COALESCE(sum(p.monto), (0)::numeric)) AS saldo
   FROM (app.cuentas_por_cobrar c
     LEFT JOIN app.pagos p ON ((p.cxc_id = c.id)))
  GROUP BY c.id;

-- ===== disparadores (bitácora de cambios, tiempos de prospectos) =====
CREATE TRIGGER activos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.activos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER asistencia_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.asistencia FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER centros_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.centros FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER checadas_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.checadas FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER contratos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.contratos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER cuentas_por_cobrar_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.cuentas_por_cobrar FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER cuotas_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.cuotas FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER empleados_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.empleados FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER empresas_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.empresas FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER gastos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.gastos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER incidencias_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.incidencias FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER ingresos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.ingresos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER inversion_publicidad_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.inversion_publicidad FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER nomina_lineas_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.nomina_lineas FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER nomina_periodos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.nomina_periodos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER pagos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.pagos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER pasivos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.pasivos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER prestamo_abonos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.prestamo_abonos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER prestamos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.prestamos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER prospectos_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.prospectos FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER prospectos_tiempos BEFORE UPDATE ON app.prospectos FOR EACH ROW EXECUTE FUNCTION app.prospectos_tiempos();
CREATE TRIGGER tareas_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.tareas FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER tareas_plantilla_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.tareas_plantilla FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER tipo_cambio_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.tipo_cambio FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER unidades_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.unidades FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();
CREATE TRIGGER vacaciones_bitacora AFTER INSERT OR DELETE OR UPDATE ON app.vacaciones FOR EACH ROW EXECUTE FUNCTION app.registrar_cambio();

-- ===== seguridad por filas =====
alter table app.activos enable row level security;
alter table app.asistencia enable row level security;
alter table app.bitacora enable row level security;
alter table app.centros enable row level security;
alter table app.checadas enable row level security;
alter table app.contratos enable row level security;
alter table app.cuentas_por_cobrar enable row level security;
alter table app.cuotas enable row level security;
alter table app.empleados enable row level security;
alter table app.empresas enable row level security;
alter table app.gastos enable row level security;
alter table app.incidencias enable row level security;
alter table app.ingresos enable row level security;
alter table app.inversion_publicidad enable row level security;
alter table app.miembros enable row level security;
alter table app.nomina_lineas enable row level security;
alter table app.nomina_periodos enable row level security;
alter table app.organizaciones enable row level security;
alter table app.pagos enable row level security;
alter table app.pasivos enable row level security;
alter table app.prestamo_abonos enable row level security;
alter table app.prestamos enable row level security;
alter table app.prospectos enable row level security;
alter table app.tareas enable row level security;
alter table app.tareas_plantilla enable row level security;
alter table app.tipo_cambio enable row level security;
alter table app.unidades enable row level security;
alter table app.vacaciones enable row level security;

create policy activos_borrar on app.activos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy activos_crear on app.activos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy activos_editar on app.activos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario])) with check (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy activos_ver on app.activos as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy asistencia_borrar on app.asistencia as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'encargado'::app.rol_usuario]));
create policy asistencia_crear on app.asistencia as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,encargado}'::app.rol_usuario[]));
create policy asistencia_editar on app.asistencia as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,encargado}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,encargado}'::app.rol_usuario[]));
create policy asistencia_ver on app.asistencia as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy bitacora_ver on app.bitacora as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy centros_borrar on app.centros as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy centros_crear on app.centros as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy centros_editar on app.centros as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy centros_ver on app.centros as PERMISSIVE for SELECT to public using ((app.puede_ver_empresa(org_id, empresa_id) AND app.puede_ver_centro(org_id, id)));
create policy checadas_borrar on app.checadas as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy checadas_crear on app.checadas as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,encargado,operacion}'::app.rol_usuario[]));
create policy checadas_editar on app.checadas as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,encargado,operacion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,encargado,operacion}'::app.rol_usuario[]));
create policy checadas_ver on app.checadas as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy contratos_borrar on app.contratos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy contratos_crear on app.contratos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy contratos_editar on app.contratos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy contratos_ver on app.contratos as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy cuentas_por_cobrar_borrar on app.cuentas_por_cobrar as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'cobranza'::app.rol_usuario]));
create policy cuentas_por_cobrar_crear on app.cuentas_por_cobrar as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy cuentas_por_cobrar_editar on app.cuentas_por_cobrar as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy cuentas_por_cobrar_ver on app.cuentas_por_cobrar as PERMISSIVE for SELECT to public using (app.puede_ver_empresa(org_id, empresa_id));
create policy cuotas_borrar on app.cuotas as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy cuotas_crear on app.cuotas as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy cuotas_editar on app.cuotas as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy cuotas_ver on app.cuotas as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy empleados_borrar on app.empleados as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy empleados_crear on app.empleados as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy empleados_editar on app.empleados as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy empleados_ver on app.empleados as PERMISSIVE for SELECT to public using ((app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]) AND app.puede_ver_empresa(org_id, empresa_id) AND app.puede_ver_centro(org_id, centro_id)));
create policy empresas_borrar on app.empresas as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy empresas_crear on app.empresas as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy empresas_editar on app.empresas as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy empresas_ver on app.empresas as PERMISSIVE for SELECT to public using (app.puede_ver_empresa(org_id, id));
create policy gastos_borrar on app.gastos as PERMISSIVE for DELETE to public using ((app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]) OR (app.tiene_rol(org_id, ARRAY['operacion'::app.rol_usuario]) AND (capturado_por = ( SELECT m.nombre
   FROM app.miembros m
  WHERE ((m.user_id = auth.uid()) AND (m.org_id = gastos.org_id))
 LIMIT 1)))));
create policy gastos_crear on app.gastos as PERMISSIVE for INSERT to public with check ((app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'operacion'::app.rol_usuario]) AND app.puede_ver_empresa(org_id, empresa_id) AND app.puede_ver_centro(org_id, centro_id)));
create policy gastos_editar on app.gastos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'operacion'::app.rol_usuario])) with check ((app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'operacion'::app.rol_usuario]) AND app.puede_ver_empresa(org_id, empresa_id) AND app.puede_ver_centro(org_id, centro_id)));
create policy gastos_ver on app.gastos as PERMISSIVE for SELECT to public using ((app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'operacion'::app.rol_usuario]) AND app.puede_ver_empresa(org_id, empresa_id) AND app.puede_ver_centro(org_id, centro_id)));
create policy incidencias_borrar on app.incidencias as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy incidencias_crear on app.incidencias as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,encargado,operacion}'::app.rol_usuario[]));
create policy incidencias_editar on app.incidencias as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,encargado,operacion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,encargado,operacion}'::app.rol_usuario[]));
create policy incidencias_ver on app.incidencias as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy ingresos_borrar on app.ingresos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy ingresos_crear on app.ingresos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy ingresos_editar on app.ingresos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy ingresos_ver on app.ingresos as PERMISSIVE for SELECT to public using (app.puede_ver_empresa(org_id, empresa_id));
create policy inversion_borrar on app.inversion_publicidad as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy inversion_crear on app.inversion_publicidad as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy inversion_editar on app.inversion_publicidad as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario])) with check (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy inversion_ver on app.inversion_publicidad as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy miembros_admin on app.miembros as PERMISSIVE for ALL to public using (app.tiene_rol(org_id, ARRAY[]::app.rol_usuario[])) with check (app.tiene_rol(org_id, ARRAY[]::app.rol_usuario[]));
create policy miembros_ver on app.miembros as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy nomina_lineas_borrar on app.nomina_lineas as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy nomina_lineas_crear on app.nomina_lineas as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy nomina_lineas_editar on app.nomina_lineas as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy nomina_lineas_ver on app.nomina_lineas as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy nomina_periodos_borrar on app.nomina_periodos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy nomina_periodos_crear on app.nomina_periodos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy nomina_periodos_editar on app.nomina_periodos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy nomina_periodos_ver on app.nomina_periodos as PERMISSIVE for SELECT to public using ((app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]) AND app.puede_ver_empresa(org_id, empresa_id)));
create policy org_ver on app.organizaciones as PERMISSIVE for SELECT to public using (app.es_miembro(id));
create policy pagos_borrar on app.pagos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'cobranza'::app.rol_usuario]));
create policy pagos_crear on app.pagos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy pagos_editar on app.pagos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy pagos_ver on app.pagos as PERMISSIVE for SELECT to public using (app.puede_ver_empresa(org_id, empresa_id));
create policy pasivos_borrar on app.pasivos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy pasivos_crear on app.pasivos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy pasivos_editar on app.pasivos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario])) with check (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy pasivos_ver on app.pasivos as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['dueno'::app.rol_usuario]));
create policy prestamo_abonos_borrar on app.prestamo_abonos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prestamo_abonos_crear on app.prestamo_abonos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prestamo_abonos_editar on app.prestamo_abonos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prestamo_abonos_ver on app.prestamo_abonos as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prestamos_borrar on app.prestamos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prestamos_crear on app.prestamos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy prestamos_editar on app.prestamos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy prestamos_ver on app.prestamos as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prospectos_borrar on app.prospectos as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prospectos_crear on app.prospectos as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prospectos_editar on app.prospectos as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario])) with check (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy prospectos_ver on app.prospectos as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy tareas_borrar on app.tareas as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario, 'encargado'::app.rol_usuario]));
create policy tareas_crear on app.tareas as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]));
create policy tareas_editar on app.tareas as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,operacion,encargado}'::app.rol_usuario[]));
create policy tareas_ver on app.tareas as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy tareas_plantilla_borrar on app.tareas_plantilla as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy tareas_plantilla_crear on app.tareas_plantilla as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,operacion}'::app.rol_usuario[]));
create policy tareas_plantilla_editar on app.tareas_plantilla as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,operacion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,operacion}'::app.rol_usuario[]));
create policy tareas_plantilla_ver on app.tareas_plantilla as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy tipo_cambio_borrar on app.tipo_cambio as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy tipo_cambio_crear on app.tipo_cambio as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy tipo_cambio_editar on app.tipo_cambio as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy tipo_cambio_ver on app.tipo_cambio as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy unidades_borrar on app.unidades as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy unidades_crear on app.unidades as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy unidades_editar on app.unidades as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion,cobranza}'::app.rol_usuario[]));
create policy unidades_ver on app.unidades as PERMISSIVE for SELECT to public using (app.es_miembro(org_id));
create policy vacaciones_borrar on app.vacaciones as PERMISSIVE for DELETE to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));
create policy vacaciones_crear on app.vacaciones as PERMISSIVE for INSERT to public with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy vacaciones_editar on app.vacaciones as PERMISSIVE for UPDATE to public using (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[])) with check (app.tiene_rol(org_id, '{administracion}'::app.rol_usuario[]));
create policy vacaciones_ver on app.vacaciones as PERMISSIVE for SELECT to public using (app.tiene_rol(org_id, ARRAY['administracion'::app.rol_usuario]));

-- ===== permisos =====
grant usage on schema app to anon;
grant usage on schema app to authenticated;
grant usage on schema app to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.activos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.activos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.activos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.asistencia to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.asistencia to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.asistencia to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.bitacora to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.bitacora to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.bitacora to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.centros to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.centros to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.centros to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.checadas to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.checadas to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.checadas to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.contratos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.contratos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.contratos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.cuentas_por_cobrar to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.cuentas_por_cobrar to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.cuentas_por_cobrar to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.cuotas to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.cuotas to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.cuotas to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.empleados to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.empleados to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.empleados to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.empresas to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.empresas to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.empresas to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.gastos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.gastos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.gastos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.incidencias to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.incidencias to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.incidencias to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.ingresos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.ingresos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.ingresos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.inversion_publicidad to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.inversion_publicidad to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.miembros to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.miembros to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.miembros to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.nomina_lineas to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.nomina_lineas to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.nomina_lineas to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.nomina_periodos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.nomina_periodos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.nomina_periodos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.organizaciones to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.organizaciones to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.organizaciones to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.pagos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.pagos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.pagos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.pasivos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.pasivos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.pasivos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.prestamo_abonos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.prestamo_abonos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.prestamos to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.prestamos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.prestamos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.prospectos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.prospectos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.tareas to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.tareas to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.tareas to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.tareas_plantilla to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.tareas_plantilla to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.tareas_plantilla to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.tipo_cambio to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.tipo_cambio to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.tipo_cambio to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.unidades to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.unidades to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.unidades to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.v_gasto_mensual to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.v_gasto_mensual to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.v_saldos_cxc to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.v_saldos_cxc to service_role;
grant DELETE, INSERT, SELECT, UPDATE on app.vacaciones to anon;
grant DELETE, INSERT, SELECT, UPDATE on app.vacaciones to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on app.vacaciones to service_role;
grant execute on function app.es_miembro(p_org uuid) to authenticated;
grant execute on function app.es_miembro(p_org uuid) to service_role;
grant execute on function app.es_miembro(p_org uuid) to anon;
grant execute on function app.puede_ver_empresa(p_org uuid, p_empresa uuid) to authenticated;
grant execute on function app.puede_ver_empresa(p_org uuid, p_empresa uuid) to service_role;
grant execute on function app.puede_ver_empresa(p_org uuid, p_empresa uuid) to anon;
grant execute on function app.registrar_cambio() to authenticated;
grant execute on function app.registrar_cambio() to service_role;
grant execute on function app.registrar_cambio() to anon;
grant execute on function app.tiene_rol(p_org uuid, p_roles app.rol_usuario[]) to authenticated;
grant execute on function app.tiene_rol(p_org uuid, p_roles app.rol_usuario[]) to service_role;
grant execute on function app.tiene_rol(p_org uuid, p_roles app.rol_usuario[]) to anon;
grant execute on function app.correo_para_login(p_usuario text) to anon;
grant execute on function app.correo_para_login(p_usuario text) to authenticated;
grant execute on function app.correo_para_login(p_usuario text) to service_role;
grant execute on function app.puede_ver_centro(p_org uuid, p_centro uuid) to authenticated;
grant execute on function app.puede_ver_centro(p_org uuid, p_centro uuid) to anon;
grant execute on function app.puede_ver_centro(p_org uuid, p_centro uuid) to service_role;
grant execute on function app.marcar_password_cambiado() to authenticated;
grant execute on function app.usuarios_lista() to authenticated;
grant execute on function app.siguiente_folio_renta(p_org uuid) to authenticated;
grant execute on function app.equipo_de(p_centro uuid) to authenticated;
grant execute on function app.asistencia_marcar(p_empleado uuid, p_fecha date, p_accion text) to authenticated;
grant execute on function app.nomina_pagar(p_empleado uuid, p_semana date, p_monto numeric, p_fecha date, p_forma text, p_notas text) to authenticated;
grant execute on function app.siguiente_folio_cuota(p_org uuid, p_periodo date) to authenticated;
grant execute on function app.registrar_prospecto(p jsonb) to anon;
grant execute on function app.registrar_prospecto(p jsonb) to authenticated;
alter default privileges in schema app grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema app grant all on tables to service_role;

-- ===== archivos (fotos y comprobantes) =====
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', true) on conflict (id) do nothing;
create policy "comprobantes: leer" on storage.objects for select to anon, authenticated using (bucket_id = 'comprobantes');
create policy "comprobantes: subir" on storage.objects for insert to authenticated with check (bucket_id = 'comprobantes');

-- ===== inventario_cotizaciones.sql =====
-- Tablas de los módulos Inventario y Cotizaciones (opcionales). NO están aplicadas en la base de Treme/MEDCO:
-- se aplican al instalar la plataforma para un cliente que las use (hoy solo existen en el demo, ?demo).
set search_path = app, public;

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

-- ===== lecturas_servicios.sql =====
-- Lecturas de luz, gas y agua por departamento (módulo "Lecturas"). Para el edificio que paga un solo recibo
-- a CFE / gas / Agua y Drenaje y le cobra a cada unidad lo que consumió según su submedidor.
-- NO está aplicada en la base de Treme/MEDCO: se aplica al instalar la plataforma para un cliente que la use.
set search_path = app, public;

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


-- ===== bitácora también en los módulos opcionales =====
create trigger productos_bitacora after insert or delete or update on app.productos for each row execute function app.registrar_cambio();
create trigger inventario_movs_bitacora after insert or delete or update on app.inventario_movs for each row execute function app.registrar_cambio();
create trigger cotizaciones_bitacora after insert or delete or update on app.cotizaciones for each row execute function app.registrar_cambio();
create trigger medidores_bitacora after insert or delete or update on app.medidores for each row execute function app.registrar_cambio();
create trigger lecturas_bitacora after insert or delete or update on app.lecturas for each row execute function app.registrar_cambio();
grant all on app.productos, app.inventario_movs, app.cotizaciones, app.medidores, app.lecturas, app.recibos_servicio, app.tarifas_servicio to service_role;

-- ===== prospectos desde el chat de la página (28/10/2026) =====
-- Resumen, puntaje, costo estimado y conversación. "empresa_destino" = empresa que recibe el prospecto;
-- "empresa" = la empresa del prospecto (antes se confundían).
alter table app.prospectos add column if not exists puntaje smallint check (puntaje between 0 and 100);
alter table app.prospectos add column if not exists resumen text check (length(resumen) <= 2000);
alter table app.prospectos add column if not exists costo_mensual numeric check (costo_mensual is null or costo_mensual >= 0);
alter table app.prospectos add column if not exists conversacion jsonb;
alter table app.prospectos add column if not exists completa boolean not null default true;

CREATE OR REPLACE FUNCTION app.registrar_prospecto(p jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'app', 'public'
AS $function$
declare
  v_emp  empresas%rowtype;
  v_nom  text := left(nullif(trim(p->>'nombre'), ''), 120);
  v_tel  text := left(nullif(regexp_replace(coalesce(p->>'whatsapp',''), '[^0-9+]', '', 'g'), ''), 30);
  v_mail text := left(nullif(lower(trim(p->>'correo')), ''), 160);
  v_src  text := lower(left(nullif(trim(p->>'utm_source'), ''), 120));
  v_ori  text;
  v_m2   numeric;
  v_pts  smallint;
  v_costo numeric;
  v_conv jsonb;
begin
  if v_nom is null or (v_tel is null and v_mail is null) then
    raise exception 'Faltan nombre y teléfono o correo';
  end if;
  if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_mail := null; end if;

  select * into v_emp from empresas where activo and (nullif(p->>'empresa_destino','') is null or nombre_corto = p->>'empresa_destino') order by creado_en limit 1;
  if not found then raise exception 'Empresa no encontrada'; end if;

  if (select count(*) from prospectos where org_id = v_emp.org_id and creado_en > now() - interval '10 minutes') >= 40
     or (select count(*) from prospectos where org_id = v_emp.org_id and creado_en > now() - interval '1 hour'
           and ((v_tel is not null and whatsapp = v_tel) or (v_mail is not null and correo = v_mail))) >= 3 then
    return true;
  end if;

  v_ori := case
    when nullif(p->>'gclid','') is not null or v_src in ('google','adwords','gads') then 'google'
    when v_src in ('instagram','ig') then 'instagram'
    when v_src in ('facebook','fb','meta') then 'facebook'
    when nullif(p->>'fbclid','') is not null then 'instagram'
    else 'web' end;
  begin v_m2 := nullif(regexp_replace(coalesce(p->>'m2',''), '[^0-9.]', '', 'g'), '')::numeric; exception when others then v_m2 := null; end;
  begin v_pts := least(greatest((p->>'puntaje')::numeric, 0), 100)::smallint; exception when others then v_pts := null; end;
  begin v_costo := greatest((p->>'costo_mensual')::numeric, 0); exception when others then v_costo := null; end;
  v_conv := case when jsonb_typeof(p->'conversacion') = 'array' and length((p->'conversacion')::text) <= 20000 then p->'conversacion' end;

  insert into prospectos (org_id, empresa_id, nombre, empresa, whatsapp, correo, tipo_obra, m2, tiene_terreno,
    cuando, ubicacion, mensaje, origen, campana, utm_source, utm_medium, utm_campaign, utm_term, gclid, fbclid, pagina,
    puntaje, resumen, costo_mensual, conversacion, completa)
  values (v_emp.org_id, v_emp.id, v_nom,
    left(nullif(trim(p->>'empresa'), ''), 120), v_tel, v_mail,
    left(nullif(trim(p->>'tipo_obra'), ''), 60), v_m2,
    case when p->>'tiene_terreno' in ('si','no','buscando') then p->>'tiene_terreno' end,
    case when p->>'cuando' in ('ya','3_meses','6_meses','explorando') then p->>'cuando' end,
    left(nullif(trim(p->>'ubicacion'), ''), 120),
    left(nullif(trim(p->>'mensaje'), ''), 2000),
    v_ori,
    left(nullif(trim(coalesce(p->>'utm_campaign', '')), ''), 160),
    v_src, left(nullif(trim(p->>'utm_medium'), ''), 120), left(nullif(trim(p->>'utm_campaign'), ''), 160),
    left(nullif(trim(p->>'utm_term'), ''), 160), left(nullif(p->>'gclid', ''), 255), left(nullif(p->>'fbclid', ''), 255),
    left(nullif(p->>'pagina', ''), 300),
    v_pts, left(nullif(trim(p->>'resumen'), ''), 2000), v_costo, v_conv, coalesce((p->>'completa')::boolean, true));
  return true;
end $function$;
grant execute on function app.registrar_prospecto(jsonb) to anon, authenticated;

-- Exponer el esquema app en la API (equivale a Settings → API → Exposed schemas)
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, app';
notify pgrst, 'reload config';

-- ===== pláticas del chat con IA (28/10/2026): un prospecto por conversación, solo lo llama el servidor del chat =====
alter table app.prospectos add column if not exists datos jsonb;
-- La función app.guardar_chat(p jsonb) está en la base de Unaria (gimvgsjpeyvdretubrgc); copiarla de ahí con
--   select pg_get_functiondef('app.guardar_chat(jsonb)'::regprocedure);
-- y después: revoke execute on function app.guardar_chat(jsonb) from public, anon, authenticated;
--            grant execute on function app.guardar_chat(jsonb) to service_role;

-- ===== Asistente de Ayuda (migración 0026) =====
create table if not exists app.asistente_preguntas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references app.organizaciones(id),
  user_id uuid not null,
  nombre text,
  modulo text,
  pregunta text not null check (length(pregunta) <= 2000),
  respuesta text,
  escalar text,
  tokens_entrada integer,
  tokens_salida integer,
  creado_en timestamptz not null default now()
);
create index if not exists asistente_preguntas_user_idx on app.asistente_preguntas (user_id, creado_en desc);
create index if not exists asistente_preguntas_org_idx on app.asistente_preguntas (org_id, creado_en desc);
alter table app.asistente_preguntas enable row level security;
create policy asistente_ver on app.asistente_preguntas for select using (app.tiene_rol(org_id, array['dueno']::app.rol_usuario[]));
grant select on app.asistente_preguntas to authenticated;
grant all on app.asistente_preguntas to service_role;
