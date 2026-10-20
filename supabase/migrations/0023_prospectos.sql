-- Prospectos (clientes potenciales de MEDCO) y lo que se invierte en publicidad.
-- Aplicada el 19/10/2026 como "app_prospectos". Los ve y edita: dueño, socio y administración.
set local search_path = app, public;

create table if not exists prospectos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizaciones(id),
  empresa_id        uuid references empresas(id),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  nombre            text not null check (length(nombre) between 1 and 120),
  empresa           text check (length(empresa) <= 120),
  whatsapp          text check (length(whatsapp) <= 30),
  correo            text check (length(correo) <= 160),
  tipo_obra         text check (length(tipo_obra) <= 60),
  m2                numeric check (m2 is null or m2 >= 0),
  tiene_terreno     text check (tiene_terreno in ('si','no','buscando')),
  cuando            text check (cuando in ('ya','3_meses','6_meses','explorando')),
  ubicacion         text check (length(ubicacion) <= 120),
  mensaje           text check (length(mensaje) <= 2000),
  origen            text not null default 'web'
                    check (origen in ('google','instagram','facebook','web','whatsapp','recomendacion','otro')),
  campana           text check (length(campana) <= 160),
  utm_source        text check (length(utm_source) <= 120),
  utm_medium        text check (length(utm_medium) <= 120),
  utm_campaign      text check (length(utm_campaign) <= 160),
  utm_term          text check (length(utm_term) <= 160),
  gclid             text check (length(gclid) <= 255),
  fbclid            text check (length(fbclid) <= 255),
  pagina            text check (length(pagina) <= 300),
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo','calificado','no_calificado','cotizado','ganado','perdido')),
  motivo            text check (length(motivo) <= 300),
  monto             numeric check (monto is null or monto >= 0),
  primera_respuesta timestamptz,
  atendido_por      uuid,
  notas             text check (length(notas) <= 4000),
  calificado_en     timestamptz
);
comment on table prospectos is 'Clientes potenciales (leads) de MEDCO: formulario web, campañas y captura manual';
comment on column prospectos.estado is 'nuevo → calificado | no_calificado → cotizado → ganado | perdido';
comment on column prospectos.primera_respuesta is 'Primera vez que alguien lo contactó (para medir el tiempo de respuesta)';
comment on column prospectos.monto is 'Valor estimado de la obra; al ganar, el monto del contrato';
create index if not exists prospectos_org_idx on prospectos (org_id, creado_en desc);
create index if not exists prospectos_empresa_idx on prospectos (empresa_id);
create index if not exists prospectos_estado_idx on prospectos (org_id, estado);

create table if not exists inversion_publicidad (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id),
  empresa_id  uuid references empresas(id),
  semana      date not null,
  plataforma  text not null check (plataforma in ('google','meta')),
  monto       numeric not null check (monto >= 0),
  notas       text check (length(notas) <= 300),
  creado_en   timestamptz not null default now(),
  unique (org_id, semana, plataforma)
);
comment on table inversion_publicidad is 'Lo gastado por semana en Google Ads y Meta (Instagram/Facebook), capturado a mano';
create index if not exists inversion_publicidad_empresa_idx on inversion_publicidad (empresa_id);

alter table prospectos enable row level security;
alter table inversion_publicidad enable row level security;
create policy prospectos_ver on prospectos for select
  using (tiene_rol(org_id, array['administracion']::rol_usuario[]));
create policy prospectos_crear on prospectos for insert
  with check (tiene_rol(org_id, array['administracion']::rol_usuario[]));
create policy prospectos_editar on prospectos for update
  using (tiene_rol(org_id, array['administracion']::rol_usuario[]))
  with check (tiene_rol(org_id, array['administracion']::rol_usuario[]));
create policy prospectos_borrar on prospectos for delete
  using (tiene_rol(org_id, array['administracion']::rol_usuario[]));

create policy inversion_ver on inversion_publicidad for select
  using (tiene_rol(org_id, array['administracion']::rol_usuario[]));
create policy inversion_crear on inversion_publicidad for insert
  with check (tiene_rol(org_id, array['administracion']::rol_usuario[]));
create policy inversion_editar on inversion_publicidad for update
  using (tiene_rol(org_id, array['administracion']::rol_usuario[]))
  with check (tiene_rol(org_id, array['administracion']::rol_usuario[]));
create policy inversion_borrar on inversion_publicidad for delete
  using (tiene_rol(org_id, array['administracion']::rol_usuario[]));

revoke all on prospectos, inversion_publicidad from anon, public;
grant select, insert, update, delete on prospectos, inversion_publicidad to authenticated;
grant all on prospectos, inversion_publicidad to service_role;

create trigger prospectos_bitacora after insert or update or delete on prospectos
  for each row execute function registrar_cambio();
create trigger inversion_publicidad_bitacora after insert or update or delete on inversion_publicidad
  for each row execute function registrar_cambio();

-- El formulario público de construcciones.medco.mx llama a esta función (sin sesión).
-- Valida y recorta todo, deduce el origen (Google / Instagram / Facebook / web) y frena el spam.
create or replace function registrar_prospecto(p jsonb)
returns boolean language plpgsql security definer set search_path = app, public as $$
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

  select * into v_emp from empresas where nombre_corto = 'MEDCO' and activo limit 1;
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
end $$;
revoke all on function registrar_prospecto(jsonb) from public;
grant execute on function registrar_prospecto(jsonb) to anon, authenticated;
