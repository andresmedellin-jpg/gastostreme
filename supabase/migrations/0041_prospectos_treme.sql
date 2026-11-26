-- Prospectos de Treme (26/11/2026): la página inmuebles.medco.mx manda interesados en rentar o comprar
-- oficinas, bodega y departamento de Torre Elysium. Misma tabla que MEDCO, con su empresa y la operación.
alter table app.prospectos add column if not exists operacion text
  check (operacion is null or operacion in ('renta', 'venta', 'ambas'));

create or replace function app.registrar_prospecto(p jsonb)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
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

  -- marca = 'treme' (página de inmuebles); cualquier otra cosa o nada = MEDCO (construcciones.medco.mx)
  select * into v_emp from empresas
   where nombre_corto = case when lower(coalesce(p->>'marca','')) = 'treme' then 'Treme' else 'MEDCO' end and activo limit 1;
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
    cuando, ubicacion, mensaje, origen, campana, utm_source, utm_medium, utm_campaign, utm_term, gclid, fbclid, pagina, operacion)
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
    case when p->>'operacion' in ('renta','venta','ambas') then p->>'operacion' end);
  return true;
end $function$;
