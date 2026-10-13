-- Socio: ve y hace todo lo que hace el dueño, incluido Patrimonio,
-- menos administrar usuarios (lo que pide un arreglo vacío de roles = solo el dueño).
alter type app.rol_usuario add value if not exists 'socio';
-- (en otra transacción)
create or replace function app.tiene_rol(p_org uuid, p_roles app.rol_usuario[])
 returns boolean language sql stable security definer set search_path to 'app', 'public'
as $function$
  select exists (select 1 from miembros
                 where org_id = p_org and user_id = auth.uid() and activo
                   and (rol = any (p_roles || array['dueno'::rol_usuario])
                        or roles && (p_roles || array['dueno'::rol_usuario])
                        or (cardinality(p_roles) > 0
                            and (rol = 'socio'::rol_usuario or 'socio'::rol_usuario = any (roles)))));
$function$;
