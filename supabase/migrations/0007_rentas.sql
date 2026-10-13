-- Aplicado como app_rentas_adeudos (13/oct/2026)
set local search_path = app, public;
alter table cuentas_por_cobrar add column if not exists meses int;
update cuentas_por_cobrar set meses = nullif(substring(notas from '^(\d+) meses'), '')::int
where tipo = 'adeudo_inicial' and meses is null;
alter policy cuentas_por_cobrar_borrar on cuentas_por_cobrar
  using (tiene_rol(org_id, array['administracion','cobranza']::rol_usuario[]));
create or replace function siguiente_folio_renta(p_org uuid)
returns text language sql volatile security definer set search_path = app, public as $$
  select 'REC-' || lpad((coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
  from pagos where org_id = p_org and concepto = 'renta' and folio like 'REC-%'
    and tiene_rol(p_org, array['administracion','cobranza']::rol_usuario[]);
$$;
revoke all on function siguiente_folio_renta(uuid) from public, anon;
grant execute on function siguiente_folio_renta(uuid) to authenticated;
