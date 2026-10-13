-- =====================================================================
-- MIGRACIÓN DE DATOS: public (sistema viejo) -> app (plataforma nueva)
-- Reglas de limpieza (verificadas una por una antes de escribir esto):
--   * pagos con tipo NULL (62)      -> copia exacta de pagos_rentas: NO se migran
--   * egresos (27)                  -> ya existen en gastos de Elysium: NO se migran
--   * gastos idénticos (9)          -> mismo comprobante y mismo segundo de captura: se migra 1
--   * locales tipo 'elysium'        -> padrón viejo de junio; manda 'mtto'. Solo se rescatan
--                                      las unidades que no existen en 'mtto'
--   * CFE 'NO. DEPTO'               -> encabezado de Excel; se omite si no tiene pagos
--   * CFE 'LOFT 1203' etc.          -> se ligan a la unidad 1203 si existe
--   * empleados                     -> maestro = nómina JSON (35) + ex-empleados con pagos
--                                      (11) + 2 del checador viejo que no están en nómina
--   * contratos #20 y #24 borrados  -> contratos inactivos para no perder sus pagos
-- =====================================================================
set local search_path = app, public, extensions;

do $$ declare t text; begin
  for t in select distinct event_object_table from information_schema.triggers
           where trigger_schema = 'app' and trigger_name like '%\_bitacora' loop
    execute format('alter table app.%I disable trigger %I', t, t || '_bitacora');
  end loop;
end $$;

create temp table m (k text primary key, id uuid not null) on commit drop;

-- ================================================================ ORG / EMPRESAS
with o as (insert into organizaciones (nombre) values ('Grupo Treme · MEDCO') returning id)
insert into m select 'org', id from o;

with e as (
  insert into empresas (org_id, nombre, nombre_corto, color)
  select (select id from m where k='org'), x.n, x.c, x.col
  from (values ('Grupo Inmobiliario Treme S.A. de C.V.','Treme','#1F4E79'),
               ('Desarrollos y Proyectos MEDCO','MEDCO','#B45309')) x(n,c,col)
  returning id, nombre_corto)
insert into m select 'emp:' || nombre_corto, id from e;

insert into miembros (org_id, user_id, nombre, rol)
select (select id from m where k='org'), id, 'Andrés', 'dueno'
from auth.users where email = 'andres.medellin@medco.mx';

-- ================================================================ CENTROS
create temp table c_def (nombre text, tipo tipo_centro, empresa text, ciudad text) on commit drop;
insert into c_def values
 ('Torre Elysium','condominio','Treme','Monterrey'),
 ('Oficina','oficina','Treme','San Pedro Garza García'),
 ('Plaza GM 202','plaza','Treme','San Pedro Garza García'),
 ('Plaza Hudson','plaza','Treme','San Pedro Garza García'),
 ('Plaza Ellion','plaza','Treme','San Pedro Garza García'),
 ('Plaza Maranta','plaza','Treme','San Pedro Garza García'),
 ('Plaza Platino','plaza','Treme','Escobedo'),
 ('Plaza Barton Creek','plaza','Treme','Mission, TX'),
 ('Solare Tower','propiedad','Treme','South Padre Island, TX'),
 ('Calzada San Pedro','propiedad','Treme','San Pedro Garza García'),
 ('Plazas (general)','otro','Treme',null),
 ('Casa','personal','Treme',null),
 ('Socios - Miguel Medellin','socio','Treme',null),
 ('Socios - Miguel Medellin Jr.','socio','Treme',null),
 ('Por asignar','otro','Treme',null),
 ('Bodega Escobedo','obra','MEDCO','Escobedo'),
 ('Bodega Santa Catarina','obra','MEDCO','Santa Catarina');

with c as (
  insert into centros (org_id, empresa_id, nombre, tipo, ciudad)
  select (select id from m where k='org'), (select id from m where k='emp:'||d.empresa), d.nombre, d.tipo, d.ciudad
  from c_def d returning id, nombre)
insert into m select 'cen:' || nombre, id from c;

create temp table alias (viejo text primary key, nuevo text not null) on commit drop;
insert into alias values
 ('Elysium','Torre Elysium'), ('Torre Elysium','Torre Elysium'), ('Monterrey Torre Elysium','Torre Elysium'),
 ('Oficina','Oficina'),
 ('Plaza GM 202','Plaza GM 202'), ('San Pedro Plaza GM 202','Plaza GM 202'),
 ('Plaza Hudson','Plaza Hudson'), ('San Pedro Plaza Hudson','Plaza Hudson'),
 ('Plaza Ellion','Plaza Ellion'), ('San Pedro Plaza Ellion','Plaza Ellion'),
 ('Plaza Maranta','Plaza Maranta'), ('San Pedro Plaza Maranta','Plaza Maranta'),
 ('Plaza Platino','Plaza Platino'), ('Escobedo Plaza Platino','Plaza Platino'),
 ('Mission, TX','Plaza Barton Creek'), ('McAllen Plaza Barton Creek','Plaza Barton Creek'),
 ('South Padre Island, TX','Solare Tower'),
 ('Calzada San Pedro','Calzada San Pedro'),
 ('Plazas','Plazas (general)'),
 ('Casa','Casa'),
 ('Socios - Miguel Medellin','Socios - Miguel Medellin'),
 ('Socios - Miguel Medellin Jr.','Socios - Miguel Medellin Jr.'),
 ('Bodega Escobedo','Bodega Escobedo'),
 ('Bodega Santa Catarina','Bodega Santa Catarina');

-- centro_id a partir del nombre viejo (null si no existe)
create temp table cen on commit drop as
  select a.viejo, m.id centro_id, ce.empresa_id
  from alias a join m on m.k = 'cen:' || a.nuevo join centros ce on ce.id = m.id;
alter table cen add primary key (viejo);

-- Si queda algún nombre de centro viejo sin mapear, la migración se detiene
do $$ declare faltan text; begin
  select string_agg(distinct x, ', ') into faltan from (
    select obra x from public.gastos union select obra from public.control_tareas
    union select obra from public.plantilla_tareas union select desarrollo from public.rentas
    union select desarrollo from public.activos union select obra from public.ventas_medco
  ) s where x is not null and x not in (select viejo from alias);
  if faltan is not null then raise exception 'Centros sin mapear: %', faltan; end if;
end $$;

-- ================================================================ UNIDADES ELYSIUM
create temp table loc on commit drop as
  select tipo, upper(regexp_replace(trim(local), '\s+', ' ', 'g')) k, segmento, nombre, cantidad, exento
  from public.locales;

create temp table pag_k on commit drop as
  select distinct upper(regexp_replace(trim(local), '\s+', ' ', 'g')) k from public.pagos where tipo in ('mtto','cfe');

-- unidad "real" a la que apunta cada clave vieja (LOFT 1203 -> 1203)
create temp table uni_k (k text primary key, ident text not null, segmento text, ocupante text, exento boolean, fuente text) on commit drop;

insert into uni_k select k, k, segmento, nombre, coalesce(exento,false), 'mtto' from loc where tipo = 'mtto';
insert into uni_k select k, k, segmento, nombre, coalesce(exento,false), 'elysium' from loc
  where tipo = 'elysium' and k not in (select k from uni_k);
insert into uni_k
  select l.k,
         case when regexp_replace(l.k, '^LOFT ', '') in (select k from uni_k) then regexp_replace(l.k, '^LOFT ', '') else l.k end,
         coalesce(l.segmento, case when l.k like 'LOFT%' then 'depto' else 'local' end), null, false, 'cfe'
  from loc l
  where l.tipo = 'cfe' and l.k not in (select k from uni_k)
    and not (l.k = 'NO. DEPTO' and l.k not in (select k from pag_k));

with u as (
  insert into unidades (org_id, centro_id, identificador, tipo, ocupante, exento, notas, legacy_id)
  select (select id from m where k='org'), (select id from m where k='cen:Torre Elysium'),
         ident,
         case max(segmento) when 'depto' then 'depto'::tipo_unidad when 'oficina' then 'oficina'::tipo_unidad else 'local'::tipo_unidad end,
         max(ocupante), bool_or(exento),
         case when ident ~ ' Y |,' then 'Medidor CFE compartido' end,
         'locales:' || ident
  from uni_k group by ident
  returning id, identificador)
insert into m select 'uni:' || identificador, id from u;

-- clave vieja -> unidad nueva
create temp table uk on commit drop as select uk.k, m.id unidad_id from uni_k uk join m on m.k = 'uni:' || uk.ident;
alter table uk add primary key (k);

-- Cuotas: mantenimiento (mtto, o padrón viejo si no hay mtto) y luz (cfe)
insert into cuotas (org_id, unidad_id, concepto, monto)
select (select id from m where k='org'), uk.unidad_id, 'mantenimiento', round(l.cantidad, 2)
from loc l join uk on uk.k = l.k where l.tipo = 'mtto'
on conflict (unidad_id, concepto) do nothing;

insert into cuotas (org_id, unidad_id, concepto, monto)
select (select id from m where k='org'), uk.unidad_id, 'mantenimiento', round(l.cantidad, 2)
from loc l join uk on uk.k = l.k
where l.tipo = 'elysium' and l.k not in (select k from loc where tipo = 'mtto')
on conflict (unidad_id, concepto) do nothing;

insert into cuotas (org_id, unidad_id, concepto, monto)
select (select id from m where k='org'), uk.unidad_id, 'luz', round(sum(l.cantidad), 2)
from loc l join uk on uk.k = l.k where l.tipo = 'cfe'
group by uk.unidad_id
on conflict (unidad_id, concepto) do nothing;

-- ================================================================ PAGOS COBRANZA ELYSIUM (mtto / cfe)
insert into pagos (org_id, empresa_id, centro_id, unidad_id, concepto, periodo, monto, forma_pago, fecha,
                   folio, notas, capturado_por, creado_en, legacy_id)
select (select id from m where k='org'), (select id from m where k='emp:Treme'), (select id from m where k='cen:Torre Elysium'),
       uk.unidad_id,
       case p.tipo when 'mtto' then 'mantenimiento'::concepto_cobro else 'luz'::concepto_cobro end,
       make_date(
         extract(year from p.f)::int - case when mm.n > extract(month from p.f) + 2 then 1 else 0 end,
         mm.n, 1),
       round(p.monto, 2), p.forma, p.f, p.folio,
       nullif(concat_ws(' · ', nullif(p.nota,''), nullif(p.notas,''),
              case when p.fecha is null then 'Sin fecha de pago en el sistema viejo; se usó la fecha de captura' end), ''),
       p.creado_por, p.creado_en, 'pagos:' || p.id
from (select *, coalesce(fecha, (creado_en at time zone 'America/Monterrey')::date) f from public.pagos) p
join uk on uk.k = upper(regexp_replace(trim(p.local), '\s+', ' ', 'g'))
join (values ('ENE',1),('FEB',2),('MAR',3),('MZO',3),('ABR',4),('MAY',5),('JUN',6),('JUL',7),
             ('AGO',8),('SEP',9),('SEPT',9),('OCT',10),('NOV',11),('DIC',12)) mm(t,n) on mm.t = upper(trim(p.mes))
where p.tipo in ('mtto','cfe');

-- ================================================================ CONTRATOS DE RENTA
create temp table mc (renta_id int primary key, contrato_id uuid, moneda text, centro_id uuid) on commit drop;

with ins as (
  insert into contratos (org_id, centro_id, arrendatario, monto, moneda, dia_pago, fecha_fin, telefono, email, notas, activo, creado_en, legacy_id)
  select (select id from m where k='org'), cen.centro_id, trim(r.nombre), r.monto, r.moneda, r.dia_pago, r.contrato,
         r.telefono, r.email, r.notas, coalesce(r.activo, true), r.creado_en, 'rentas:' || r.id
  from public.rentas r join cen on cen.viejo = r.desarrollo
  returning id, legacy_id, moneda, centro_id)
insert into mc select replace(legacy_id, 'rentas:', '')::int, id, moneda, centro_id from ins;

-- Contratos borrados que todavía tienen pagos
with ins as (
  insert into contratos (org_id, centro_id, arrendatario, monto, moneda, notas, activo, legacy_id)
  select (select id from m where k='org'), (select id from m where k='cen:Por asignar'),
         'Contrato eliminado #' || p.renta_id, max(p.monto), 'MXN',
         'Se borró del sistema viejo pero tenía pagos registrados. Revisar a qué inmueble corresponde.',
         false, 'rentas:' || p.renta_id
  from public.pagos_rentas p
  where p.renta_id is not null and p.renta_id not in (select id from public.rentas)
  group by p.renta_id
  returning id, legacy_id, moneda, centro_id)
insert into mc select replace(legacy_id, 'rentas:', '')::int, id, moneda, centro_id from ins;

insert into pagos (org_id, empresa_id, centro_id, contrato_id, concepto, periodo, monto, moneda, forma_pago, fecha,
                   folio, notas, capturado_por, creado_en, legacy_id)
select (select id from m where k='org'), (select id from m where k='emp:Treme'), mc.centro_id, mc.contrato_id, 'renta',
       to_date(p.periodo || '-01', 'YYYY-MM-DD'), round(p.monto, 2), mc.moneda, p.forma,
       coalesce(p.fecha, (p.creado_en at time zone 'America/Monterrey')::date), p.folio,
       nullif(concat_ws(' · ', nullif(p.nota,''), nullif(p.notas,''),
              case when p.fecha is null then 'Sin fecha de pago en el sistema viejo; se usó la fecha de captura' end), ''),
       p.creado_por, p.creado_en, 'pagos_rentas:' || p.id
from public.pagos_rentas p join mc on mc.renta_id = p.renta_id;

-- Adeudos de arranque
insert into cuentas_por_cobrar (org_id, empresa_id, centro_id, contrato_id, tipo, cliente, monto_original, notas, legacy_id)
select (select id from m where k='org'), (select id from m where k='emp:Treme'), mc.centro_id, mc.contrato_id, 'adeudo_inicial',
       c.arrendatario, a.monto_adeudo,
       concat_ws(' · ', a.meses || ' meses de atraso al arrancar el sistema', nullif(a.notas_adeudo, '')),
       'adeudos_manual:' || a.id
from public.adeudos_manual a join mc on mc.renta_id = a.renta_id join contratos c on c.id = mc.contrato_id
where coalesce(a.monto_adeudo, 0) <> 0;

-- ================================================================ VENTAS MEDCO
create temp table mv (venta_id bigint primary key, cxc_id uuid, centro_id uuid) on commit drop;
with ins as (
  insert into cuentas_por_cobrar (org_id, empresa_id, centro_id, tipo, cliente, monto_original, fecha_origen, notas, creado_en, legacy_id)
  select (select id from m where k='org'), (select id from m where k='emp:MEDCO'), cen.centro_id, 'venta',
         v.cliente, v.precio_total, v.fecha_venta, v.notas, v.creado_en, 'ventas_medco:' || v.id
  from public.ventas_medco v join cen on cen.viejo = v.obra
  returning id, legacy_id, centro_id)
insert into mv select replace(legacy_id, 'ventas_medco:', '')::bigint, id, centro_id from ins;

insert into pagos (org_id, empresa_id, centro_id, cxc_id, concepto, monto, forma_pago, fecha, comprobante_path,
                   notas, es_ajuste, creado_en, legacy_id)
select (select id from m where k='org'), (select id from m where k='emp:MEDCO'), mv.centro_id, mv.cxc_id, 'venta',
       round(p.monto, 2), p.forma_pago, coalesce(p.fecha, (p.creado_en at time zone 'America/Monterrey')::date), p.comprobante_path,
       nullif(concat_ws(' · ', case when p.tipo <> 'pago' then initcap(p.tipo) end, nullif(p.nota, '')), ''),
       p.tipo <> 'pago', p.creado_en, 'pagos_medco:' || p.id
from public.pagos_medco p join mv on mv.venta_id = p.venta_id;

-- Cartera vencida (hoy vacía; se deja por si acaso)
insert into cuentas_por_cobrar (org_id, empresa_id, tipo, cliente, referencia, monto_original, fecha_origen, notas, creado_en, legacy_id)
select (select id from m where k='org'),
       (select id from m where k = case when c.empresa ilike '%medco%' then 'emp:MEDCO' else 'emp:Treme' end),
       'cartera_vencida', c.cliente, c.referencia, c.monto_original, c.fecha_origen,
       concat_ws(' · ', c.tipo_deuda, c.notas), c.creado_en, 'cartera_vencida:' || c.id
from public.cartera_vencida c;

-- ================================================================ GASTOS (sin los 9 duplicados exactos)
insert into gastos (org_id, empresa_id, centro_id, fecha, monto, concepto, proveedor, categoria, forma_pago,
                    comprobante_path, notas, capturado_por, creado_en, legacy_id)
select (select id from m where k='org'), cen.empresa_id, cen.centro_id, g.fecha, round(g.monto, 2), g.concepto,
       g.proveedor, coalesce(g.categoria, 'General'), g.forma_pago, g.comprobante_url, g.notas,
       g.creado_por, g.creado_en, 'gastos:' || g.id
from (
  select *, row_number() over (
           partition by obra, fecha, monto, concepto, coalesce(comprobante_nombre, ''), date_trunc('second', creado_en)
           order by id) rn
  from public.gastos) g
join cen on cen.viejo = g.obra
where g.rn = 1;

-- ================================================================ INGRESOS
insert into ingresos (org_id, empresa_id, centro_id, fecha, monto, concepto, cliente, categoria, forma_pago, notas,
                      capturado_por, creado_en, legacy_id)
select (select id from m where k='org'),
       (select id from m where k = case when i.empresa ilike '%medco%' then 'emp:MEDCO' else 'emp:Treme' end),
       cen.centro_id, i.fecha, round(i.monto, 2), i.concepto, i.cliente, i.categoria, i.forma_pago, i.notas,
       i.creado_por, i.creado_en, 'ingresos:' || i.id
from public.ingresos i left join cen on cen.viejo = i.obra;

-- ================================================================ EMPLEADOS
create temp table me (legacy text primary key, empleado_id uuid not null) on commit drop;

create temp table emp_src (legacy text, nombre text, puesto text, sueldo numeric, dias int, obra text,
                           fecha_ingreso date, activo boolean, nota text) on commit drop;

-- 1) Nómina vigente (maestro)
insert into emp_src
select e->>'id', trim(e->>'nombre'), nullif(e->>'puesto',''), (e->>'sueldo')::numeric,
       coalesce((e->>'dias')::int, 6), e->>'obra', nullif(e->>'fecha_ingreso','')::date,
       coalesce((e->>'activo')::boolean, true), null
from public.nomina_data, jsonb_array_elements(data->'empleados') e where user_id = 'admin';

-- 2) Ex-empleados con pagos de nómina (nombre recuperado cruzando con gastos "Nómina — X")
insert into emp_src
select x.legacy, x.nombre, null, 0, 6, x.obra, null, false, x.nota
from (values
  ('upze2dcumqw8wggz','Hilario','Bodega Escobedo', 'Ex-empleado. Nombre recuperado de gastos de nómina (12/12 pagos coinciden).'),
  ('htpjwtd2mrf4v8lo','Leonardo','Bodega Santa Catarina', 'Ex-empleado. Nombre recuperado de gastos de nómina (11/11 pagos coinciden).'),
  ('emp-022','Hector Requena','Bodega Santa Catarina', 'Ex-empleado. Nombre recuperado de gastos de nómina (10/11 pagos coinciden).'),
  ('emp-028','Gilberto','Bodega Escobedo', 'Ex-empleado. Nombre recuperado de gastos de nómina (6/7 pagos coinciden).'),
  ('emp-032','Ivan','Bodega Escobedo', 'Ex-empleado. Nombre recuperado de gastos de nómina (6/7 pagos coinciden).'),
  ('qnnqsmkmmt36tmr7','Alejandro','Bodega Santa Catarina', 'Ex-empleado. Nombre recuperado de gastos de nómina (2/2 pagos coinciden).')
) x(legacy, nombre, obra, nota);

insert into emp_src
select p.emp, 'Ex-empleado sin nombre (' || p.emp || ')', null, 0, 6, null, null, false,
       'Tenía pagos de nómina pero se borró de la lista. Ponerle nombre.'
from (select distinct d->>'empId' emp from public.nomina_data, jsonb_array_elements(data->'pagos') d where user_id='admin') p
where p.emp not in (select legacy from emp_src);

-- 3) Checador viejo: personas que no están en nómina
insert into emp_src
select 'empleados:' || t.id, trim(t.nombre), nullif(t.dept,''), coalesce(t.salario,0), coalesce(t.dias,6), null, null, false,
       'Venía del checador viejo de Elysium; no aparece en nómina.'
from public.empleados t
where lower(translate(trim(t.nombre),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) not in
      (select lower(translate(nombre,'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) from emp_src);

with ins as (
  insert into empleados (org_id, empresa_id, centro_id, nombre, puesto, salario_semanal, dias_semana,
                         fecha_ingreso, activo, legacy_id)
  select (select id from m where k='org'),
         coalesce(cen.empresa_id, (select id from m where k='emp:Treme')), cen.centro_id,
         s.nombre, coalesce(s.puesto, s.nota), round(coalesce(s.sueldo,0), 2), s.dias, s.fecha_ingreso, s.activo, s.legacy
  from emp_src s left join cen on cen.viejo = s.obra
  returning id, legacy_id)
insert into me select legacy_id, id from ins;

-- ids del checador viejo (enteros) -> mismo empleado por nombre
insert into me
select 'empleados:' || t.id, e.id
from public.empleados t
join empleados e on lower(translate(trim(e.nombre),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn')) = lower(translate(trim(t.nombre),'ÁÉÍÓÚáéíóúÑñ','AEIOUaeiouNn'))
where ('empleados:' || t.id) not in (select legacy from me)
on conflict do nothing;

-- Horarios
update empleados e set hora_entrada = h.hora_entrada::time, hora_salida = h.hora_salida::time,
       tolerancia_min = h.tolerancia_min, dias_laborales = h.dias_laborales,
       puesto = coalesce(e.puesto, h.puesto)
from public.horario_personal h join me on me.legacy = h.emp_id
where e.id = me.empleado_id;

-- ================================================================ ASISTENCIA / CHECADAS
-- Checador abril–mayo
insert into checadas (org_id, empleado_id, centro_id, tipo, momento, registrado_por, creado_en, legacy_id)
select (select id from m where k='org'), me.empleado_id, (select id from m where k='cen:Torre Elysium'), r.tipo,
       (to_timestamp(r.fecha_str || ' ' || replace(replace(r.hora, 'a.m.', 'AM'), 'p.m.', 'PM'), 'DD/MM/YYYY HH12:MI AM')::timestamp)
         at time zone 'America/Monterrey',
       'checador', r.created_at, 'registros:' || r.id
from public.registros r join me on me.legacy = 'empleados:' || r.emp_id;

insert into asistencia (org_id, empleado_id, fecha, estado, minutos_tarde, registrado_por, creado_en)
select distinct on (me.empleado_id, r.fecha_iso)
       (select id from m where k='org'), me.empleado_id, r.fecha_iso,
       case when r.estado = 'retardo' then 'retardo' else 'presente' end, coalesce(r.minutos_tarde, 0), 'checador', r.created_at
from public.registros r join me on me.legacy = 'empleados:' || r.emp_id
where r.tipo = 'entrada' and r.fecha_iso is not null
order by me.empleado_id, r.fecha_iso, r.created_at;

-- Control de asistencia septiembre–octubre
insert into asistencia (org_id, empleado_id, fecha, estado, minutos_tarde, minutos_salida_temprano, monto_descuento,
                        notas, registrado_por, creado_en)
select (select id from m where k='org'), me.empleado_id, a.fecha, a.estado, a.minutos_tarde, a.minutos_salida_temprano,
       round(a.monto_descuento, 2), a.notas, a.registrado_por, a.creado_en
from public.asistencia_diaria a join me on me.legacy = a.emp_id
on conflict (empleado_id, fecha) do nothing;

-- Faltas marcadas en la nómina
insert into asistencia (org_id, empleado_id, fecha, estado, registrado_por)
select (select id from m where k='org'), me.empleado_id, f::date, 'falta', 'nomina'
from public.nomina_data n, jsonb_array_elements(n.data->'asistencias') a, jsonb_array_elements_text(a->'faltas') f, me
where n.user_id = 'admin' and me.legacy = a->>'empId'
on conflict (empleado_id, fecha) do nothing;

-- ================================================================ NÓMINA
create temp table np on commit drop as
  select me.empleado_id, (p->>'semana')::date semana, (p->>'fecha')::date fecha, (p->>'monto')::numeric monto,
         p->>'metodo' metodo, nullif(p->>'nota','') nota, p->>'id' pid
  from public.nomina_data n
  cross join lateral jsonb_array_elements(n.data->'pagos') p
  join me on me.legacy = p->>'empId'
  where n.user_id = 'admin';

insert into nomina_periodos (org_id, empresa_id, fecha_inicio, fecha_pago, estado)
select (select id from m where k='org'), e.empresa_id, np.semana, min(np.fecha), 'pagada'
from np join empleados e on e.id = np.empleado_id
group by e.empresa_id, np.semana;

insert into nomina_lineas (org_id, periodo_id, empleado_id, centro_id, dias_trabajados, sueldo, forma_pago, notas)
select (select id from m where k='org'), pe.id, np.empleado_id, e.centro_id,
       greatest(e.dias_semana - coalesce(fa.n, 0), 0), round(np.monto, 2), np.metodo,
       concat_ws(' · ', np.nota, case when np.fecha <> pe.fecha_pago then 'Pagado el ' || to_char(np.fecha, 'DD/MM') end)
from np
join empleados e on e.id = np.empleado_id
join nomina_periodos pe on pe.empresa_id = e.empresa_id and pe.fecha_inicio = np.semana
left join lateral (
  select count(*) n from asistencia a
  where a.empleado_id = np.empleado_id and a.estado = 'falta' and a.fecha between np.semana and np.semana + 6
) fa on true;

-- ================================================================ TAREAS
insert into tareas_plantilla (org_id, centro_id, empleado_id, puesto, tarea, categoria, frecuencia, dia_semana, activo)
  select (select id from m where k='org'), cen.centro_id, me.empleado_id, p.puesto, p.tarea, p.categoria,
         p.frecuencia, p.dia_semana, p.activo
from public.plantilla_tareas p join cen on cen.viejo = p.obra left join me on me.legacy = p.emp_id;

insert into tareas (org_id, centro_id, empleado_id, fecha, tipo, tarea, categoria, estado, severidad, foto_path,
                    notas, resuelto_en, registrado_por, creado_en, legacy_id)
select (select id from m where k='org'), cen.centro_id, me.empleado_id, t.fecha, t.tipo, t.tarea, t.categoria,
       t.estado, t.severidad, t.foto_url,
       nullif(concat_ws(' · ', nullif(t.notas,''), case when t.detectado_por is not null then 'Detectó: ' || t.detectado_por end), ''),
       t.resuelto_en, t.registrado_por, t.creado_en, 'control_tareas:' || t.id
from public.control_tareas t join cen on cen.viejo = t.obra left join me on me.legacy = t.emp_id;

-- Incidencias del checador (hoy vacías)
insert into incidencias (org_id, empleado_id, tipo, texto, momento)
select (select id from m where k='org'), me.empleado_id, i.tipo, i.texto, i.created_at
from public.incidencias i left join me on me.legacy = 'empleados:' || i.emp_id;

-- ================================================================ PATRIMONIO
insert into activos (org_id, empresa_id, centro_id, codigo, entidad_legal, tipo_unidad, identificador, direccion, ciudad,
                     superficie_m2, clave_catastral, fecha_adquisicion, costo_adquisicion, valor_comercial, fecha_valuacion,
                     moneda, uso_actual, renta_mercado_estimada, notas, inquilino, ingreso_mensual,
                     fecha_vencimiento_contrato, creado_en, legacy_id)
select (select id from m where k='org'), (select id from m where k='emp:' || a.empresa), cen.centro_id,
       a.codigo, a.entidad_legal, a.tipo_unidad, a.identificador, a.direccion, a.ciudad, a.superficie_m2, a.clave_catastral,
       a.fecha_adquisicion, a.costo_adquisicion, a.valor_comercial, a.fecha_valuacion, coalesce(a.moneda, 'MXN'),
       a.uso_actual, a.renta_mercado_estimada, a.notas, nullif(a.inquilino_cliente, ''), a.ingreso_mensual,
       a.fecha_vencimiento_contrato, a.creado_en, 'activos:' || a.id
from public.activos a left join cen on cen.viejo = a.desarrollo;

insert into pasivos (org_id, empresa_id, activo_ref, acreedor, tipo_pasivo, saldo_actual, fecha_saldo, moneda,
                     tasa_interes, pago_mensual, fecha_inicio, fecha_vencimiento, garantia, notas, creado_en, legacy_id)
select (select id from m where k='org'), (select id from m where k='emp:' || p.empresa), p.activo_ref, p.acreedor,
       p.tipo_pasivo, p.saldo_actual, p.fecha_saldo, coalesce(p.moneda, 'MXN'), p.tasa_interes, p.pago_mensual,
       p.fecha_inicio, p.fecha_vencimiento, p.garantia, p.notas, p.creado_en, 'pasivos:' || p.id
from public.pasivos p;

-- ================================================================ TIPO DE CAMBIO
insert into tipo_cambio (org_id, fecha, usd_mxn)
select (select id from m where k='org'), current_date, (data->>'fx_usd_mxn')::numeric
from public.nomina_data where user_id = 'catalogo_fx' and data ? 'fx_usd_mxn';

-- Bitácora de vuelta
do $$ declare t text; begin
  for t in select distinct event_object_table from information_schema.triggers
           where trigger_schema = 'app' and trigger_name like '%\_bitacora' loop
    execute format('alter table app.%I enable trigger %I', t, t || '_bitacora');
  end loop;
end $$;
