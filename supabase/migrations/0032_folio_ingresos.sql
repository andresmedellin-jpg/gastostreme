-- Recibos de los ingresos capturados en Inicio (y de los abonos de clientes de obra).
-- Folio REC-AAAAMM-NNNN con numeración propia de cada empresa (MEDCO independiente de Treme).
alter table app.ingresos add column if not exists folio text;

-- Siguiente folio de la empresa en el mes de la fecha: revisa todos sus pagos e ingresos con ese formato
create or replace function app.siguiente_folio_empresa(p_empresa uuid, p_fecha date)
returns text language sql security definer set search_path = app, public as $$
  with f as (
    select folio from pagos where empresa_id = p_empresa and folio like 'REC-' || to_char(p_fecha, 'YYYYMM') || '-%'
    union all
    select folio from ingresos where empresa_id = p_empresa and folio like 'REC-' || to_char(p_fecha, 'YYYYMM') || '-%'
  )
  select 'REC-' || to_char(p_fecha, 'YYYYMM') || '-' ||
         lpad((coalesce(max(nullif(split_part(folio, '-', 3), '')::int), 0) + 1)::text, 4, '0')
  from f, empresas e
  where e.id = p_empresa and tiene_rol(e.org_id, array['administracion','cobranza']::rol_usuario[]);
$$;
revoke all on function app.siguiente_folio_empresa(uuid, date) from public, anon;
grant execute on function app.siguiente_folio_empresa(uuid, date) to authenticated;

-- Los recibos de mantenimiento y luz (Treme) siguen su numeración, pero ahora también cuentan los folios
-- que Treme haya dado a ingresos o abonos, para que nunca se repita un número.
create or replace function app.siguiente_folio_cuota(p_org uuid, p_periodo date)
returns text language sql security definer set search_path = app, public as $$
  with emp as (select distinct empresa_id from pagos where org_id = p_org and concepto in ('mantenimiento', 'luz') and empresa_id is not null),
  f as (
    select folio from pagos where org_id = p_org
      and (concepto in ('mantenimiento', 'luz') or empresa_id in (select empresa_id from emp))
      and folio like 'REC-' || to_char(p_periodo, 'YYYYMM') || '-%'
    union all
    select folio from ingresos where org_id = p_org and empresa_id in (select empresa_id from emp)
      and folio like 'REC-' || to_char(p_periodo, 'YYYYMM') || '-%'
  )
  select 'REC-' || to_char(p_periodo, 'YYYYMM') || '-' ||
    lpad((coalesce(max(nullif(split_part(folio, '-', 3), '')::int), 0) + 1)::text, 4, '0')
  from f
  where tiene_rol(p_org, array['administracion','cobranza']::rol_usuario[]);
$$;
