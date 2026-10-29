-- Asistente de Ayuda: cada pregunta y respuesta queda registrada (para ver qué pregunta la gente, mejorar el manual
-- y limitar a 100 preguntas por persona al día). Solo el servidor (función "asistente") escribe; solo el dueño lee.
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
