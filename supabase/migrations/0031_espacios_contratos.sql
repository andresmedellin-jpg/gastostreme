-- Nombre de los inmuebles de cada contrato (p. ej. "Local 21, Local 22") para Rentas y sus recibos.
-- Solo entrega los nombres de las unidades, no valores: así Cobranza ve lo mismo que el dueño sin abrir Patrimonio.
create or replace function app.espacios_contratos()
returns table (contrato_id uuid, espacio text)
language sql stable security definer set search_path = app, public as $$
  select ac.contrato_id,
         string_agg(coalesce(a.identificador, a.tipo_unidad, a.codigo), ', ' order by a.identificador) as espacio
  from app.activo_contrato ac join app.activos a on a.id = ac.activo_id
  where app.es_miembro(ac.org_id)
  group by ac.contrato_id
$$;
revoke all on function app.espacios_contratos() from public, anon;
grant execute on function app.espacios_contratos() to authenticated;
