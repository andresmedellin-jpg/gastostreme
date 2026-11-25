-- 25/11/2026, petición de Andrés: en Torre Elysium los recibos de mantenimiento y luz solo los da la administración
-- (Andrés, Miguel), y solo cuando ven el dinero. Quien cobra en Elysium (Liz) ya no puede sacar folio de recibo.
-- Las plazas (Barby) siguen igual: quien cobra sin acceso a Elysium sí puede.
create or replace function app.siguiente_folio_cuota(p_org uuid, p_periodo date)
 returns text
 language sql
 security definer
 set search_path to 'app', 'public'
as $function$
  with emp as (select distinct empresa_id from pagos where org_id = p_org and concepto in ('mantenimiento', 'luz') and empresa_id is not null),
  f as (
    select folio from pagos where org_id = p_org
      and (concepto in ('mantenimiento', 'luz') or empresa_id in (select empresa_id from emp))
      and folio like 'REC-' || to_char(p_periodo, 'YYYYMM') || '-%'
    union all
    select folio from ingresos where org_id = p_org and empresa_id in (select empresa_id from emp)
      and folio like 'REC-' || to_char(p_periodo, 'YYYYMM') || '-%'
  )
  -- sin permiso devuelve null (antes el filtro dejaba la lista vacía y salía el folio 0001)
  select case when tiene_rol(p_org, array['administracion']::rol_usuario[])
     or (tiene_rol(p_org, array['cobranza']::rol_usuario[])
         and exists (select 1 from miembros m where m.org_id = p_org and m.user_id = auth.uid() and m.activo and m.centros is not null
                     and not exists (select 1 from centros c where c.id = any (m.centros) and c.nombre = 'Torre Elysium')))
    then 'REC-' || to_char(p_periodo, 'YYYYMM') || '-' ||
      lpad((coalesce(max(nullif(split_part(folio, '-', 3), '')::int), 0) + 1)::text, 4, '0') end
  from f;
$function$;
