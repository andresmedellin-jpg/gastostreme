-- Asesor de ventas y rentas de Treme (26/11/2026, petición de Andrés).
-- Bot que contesta WhatsApp, Instagram y el formulario de la página con el inventario real de la plataforma.
-- Andrés autorizó una cuenta de IA PROPIA de Treme para esto (nada de Unaria).

-- 1) Lo que el asesor puede ofrecer: precios y textos públicos en el patrimonio
alter table app.activos add column if not exists publicar boolean not null default false;
alter table app.activos add column if not exists precio_renta numeric check (precio_renta is null or precio_renta >= 0);
alter table app.activos add column if not exists renta_mas_iva boolean not null default false;
alter table app.activos add column if not exists precio_venta numeric check (precio_venta is null or precio_venta >= 0);
alter table app.activos add column if not exists descripcion_publica text check (length(descripcion_publica) <= 1500);

-- Precios aprobados por Andrés el 26/11/2026 (oficinas $350/m² + IVA; venta = valor comercial)
update app.activos set publicar = true, renta_mas_iva = true, precio_renta = 51000, precio_venta = 8410000 where codigo = 'TRM-015'; -- 602
update app.activos set publicar = true, renta_mas_iva = true, precio_renta = 44000, precio_venta = 7308000 where codigo = 'TRM-016'; -- 603
update app.activos set publicar = true, renta_mas_iva = true, precio_renta = 44000, precio_venta = 7308000 where codigo = 'TRM-017'; -- 604
update app.activos set publicar = true, renta_mas_iva = true, precio_renta = 61000, precio_venta = 10150000 where codigo = 'TRM-018'; -- 605
update app.activos set publicar = true, renta_mas_iva = true, precio_renta = 49000, precio_venta = 8120000 where codigo = 'TRM-019'; -- 606
update app.activos set publicar = true, renta_mas_iva = false, precio_renta = 40000, precio_venta = 10000000 where codigo = 'TRM-027'; -- Depto 1401
update app.activos set publicar = true, renta_mas_iva = false, precio_renta = 21000, precio_venta = null where codigo = 'TRM-048'; -- Bodega 3

-- 2) Conversaciones del asesor
create table if not exists app.bot_conversaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id),
  empresa_id uuid not null references app.empresas(id),
  canal text not null check (canal in ('whatsapp', 'instagram', 'web')),
  contacto text not null check (length(contacto) <= 80),          -- teléfono (WhatsApp) o id de Instagram
  nombre text check (length(nombre) <= 120),
  prospecto_id uuid references app.prospectos(id),
  bot_activo boolean not null default true,                       -- false = la tomó una persona
  pidio_humano boolean not null default false,
  ultimo_cliente timestamptz,                                     -- abre la ventana de 24 h de Meta
  actualizado_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  unique (empresa_id, canal, contacto)
);
create table if not exists app.bot_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references app.bot_conversaciones(id),
  rol text not null check (rol in ('cliente', 'asesor', 'humano', 'sistema')),
  texto text not null check (length(texto) <= 4000),
  meta_id text unique,                                            -- evita duplicados si Meta reintenta
  enviado_por uuid,
  creado_en timestamptz not null default now()
);
create index if not exists bot_mensajes_conv_idx on app.bot_mensajes (conversacion_id, creado_en);
create index if not exists bot_conv_act_idx on app.bot_conversaciones (empresa_id, actualizado_en desc);

alter table app.bot_conversaciones enable row level security;
alter table app.bot_mensajes enable row level security;
create policy bot_conv_ver on app.bot_conversaciones for select
  using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]));
create policy bot_conv_editar on app.bot_conversaciones for update
  using (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]))
  with check (app.tiene_rol(org_id, array['administracion']::app.rol_usuario[]));
create policy bot_msg_ver on app.bot_mensajes for select
  using (exists (select 1 from app.bot_conversaciones c where c.id = conversacion_id
                 and app.tiene_rol(c.org_id, array['administracion']::app.rol_usuario[])));
revoke all on app.bot_conversaciones, app.bot_mensajes from anon, public;
grant select, update on app.bot_conversaciones to authenticated;
grant select on app.bot_mensajes to authenticated;
grant all on app.bot_conversaciones, app.bot_mensajes to service_role;
