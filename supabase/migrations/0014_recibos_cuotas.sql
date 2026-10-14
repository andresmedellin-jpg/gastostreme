-- Recibos de mantenimiento y luz (Torre Elysium) con folio REC-AAAAMM-NNNN.
-- Un recibo por unidad y mes: el mismo folio se guarda en los pagos de mantenimiento y luz de ese mes.
set local search_path = app, public;

alter type tipo_unidad add value if not exists 'loft';

create or replace function siguiente_folio_cuota(p_org uuid, p_periodo date)
returns text language sql volatile security definer set search_path = app, public as $$
  select 'REC-' || to_char(p_periodo, 'YYYYMM') || '-' ||
    lpad((coalesce(max(nullif(split_part(folio, '-', 3), '')::int), 0) + 1)::text, 4, '0')
  from pagos
  where org_id = p_org and concepto in ('mantenimiento', 'luz')
    and folio like 'REC-' || to_char(p_periodo, 'YYYYMM') || '-%'
    and tiene_rol(p_org, array['administracion','cobranza']::rol_usuario[]);
$$;
revoke all on function siguiente_folio_cuota(uuid, date) from public, anon;
grant execute on function siguiente_folio_cuota(uuid, date) to authenticated;
