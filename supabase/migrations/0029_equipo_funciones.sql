-- Funciones del Equipo (iguales a Unaria)
create or replace function app.puede_checar(p_empleado uuid) returns boolean
language sql stable security definer set search_path to 'app', 'public' as $$
  select exists (select 1 from empleados e where e.id = p_empleado and (
    tiene_rol(e.org_id, array['administracion','encargado']::rol_usuario[])
    or exists (select 1 from miembros m where m.org_id = e.org_id and m.user_id = auth.uid() and m.activo
               and (m.rol = 'equipo' or 'equipo' = any (m.roles)) and (m.empleado_id is null or m.empleado_id = e.id))));
$$;
create or replace function app.puede_checar_fecha(p_fecha date) returns boolean language sql stable as $$
  select p_fecha between (now() at time zone 'America/Monterrey')::date - 1 and (now() at time zone 'America/Monterrey')::date $$;

create or replace function app.asistencia_marcar(p_empleado uuid, p_fecha date, p_accion text)
 returns app.asistencia language plpgsql security definer set search_path to 'app', 'public' as $function$
declare
  e empleados; prev asistencia; res asistencia;
  ahora timestamptz := now();
  tol int; jornada numeric; tarifa_hora numeric; diaria numeric;
  esperada_ent timestamptz; esperada_sal timestamptz;
  min_tarde int := 0; min_temprano int := 0; horas numeric := 0;
  t_ini time; t_fin time;
begin
  select * into e from empleados where id = p_empleado;
  if e.id is null then raise exception 'Empleado no encontrado'; end if;
  if p_accion not in ('entrada','salida','falta','permiso') then raise exception 'Acción inválida'; end if;
  if not tiene_rol(e.org_id, array['administracion','encargado']::rol_usuario[]) then
    -- el personal solo checa entrada y salida, de hoy (la salida de un turno de noche, también de ayer)
    if not puede_checar(e.id) or p_accion not in ('entrada','salida')
       or not (p_fecha = (now() at time zone 'America/Monterrey')::date or (p_accion = 'salida' and puede_checar_fecha(p_fecha))) then
      raise exception 'Sin permiso';
    end if;
  end if;
  -- horario del día: el turno asignado si hay, si no el horario del empleado
  select hora_inicio, hora_fin into t_ini, t_fin from turnos where empleado_id = e.id and fecha = p_fecha and not descanso;
  t_ini := coalesce(t_ini, e.hora_entrada, '08:00'); t_fin := coalesce(t_fin, e.hora_salida, '17:00');

  tol := coalesce(e.tolerancia_min, 0);
  jornada := extract(epoch from (t_fin - t_ini)) / 3600;
  if jornada <= 0 then jornada := jornada + 24; end if;
  if jornada = 0 then jornada := 8; end if;
  diaria := coalesce(e.salario_semanal, 0) / nullif(coalesce(e.dias_semana, 6), 0);
  tarifa_hora := coalesce(diaria / jornada, 0);
  esperada_ent := (p_fecha + t_ini) at time zone 'America/Monterrey';
  esperada_sal := (p_fecha + t_fin) at time zone 'America/Monterrey';
  if esperada_sal <= esperada_ent then esperada_sal := esperada_sal + interval '1 day'; end if;   -- turno de noche

  select * into prev from asistencia where empleado_id = e.id and fecha = p_fecha;

  if p_accion = 'entrada' then
    min_tarde := greatest(0, round(extract(epoch from (ahora - esperada_ent)) / 60)::int - tol);
    horas := least(min_tarde / 60.0, jornada);
    insert into asistencia (org_id, empleado_id, fecha, estado, hora_entrada, minutos_tarde, horas_descontadas, monto_descuento, registrado_por)
    values (e.org_id, e.id, p_fecha, case when min_tarde > 0 then 'retardo' else 'presente' end, ahora, min_tarde, horas,
            round(horas * tarifa_hora), (select nombre from miembros where user_id = auth.uid() and org_id = e.org_id))
    on conflict (empleado_id, fecha) do update set estado = excluded.estado, hora_entrada = excluded.hora_entrada,
      minutos_tarde = excluded.minutos_tarde, horas_descontadas = excluded.horas_descontadas, monto_descuento = excluded.monto_descuento,
      registrado_por = excluded.registrado_por
    returning * into res;
  elsif p_accion = 'salida' then
    min_temprano := greatest(0, round(extract(epoch from (esperada_sal - ahora)) / 60)::int - tol);
    horas := least(coalesce(prev.horas_descontadas, 0) + min_temprano / 60.0, jornada);
    insert into asistencia (org_id, empleado_id, fecha, estado, hora_salida, minutos_salida_temprano, horas_descontadas, monto_descuento, registrado_por)
    values (e.org_id, e.id, p_fecha,
            case when prev.estado in ('falta','permiso') then prev.estado when horas > 0 then 'retardo' else 'presente' end,
            ahora, min_temprano, horas, round(horas * tarifa_hora),
            (select nombre from miembros where user_id = auth.uid() and org_id = e.org_id))
    on conflict (empleado_id, fecha) do update set estado = excluded.estado, hora_salida = excluded.hora_salida,
      minutos_salida_temprano = excluded.minutos_salida_temprano, horas_descontadas = excluded.horas_descontadas,
      monto_descuento = excluded.monto_descuento
    returning * into res;
  else  -- falta o permiso
    insert into asistencia (org_id, empleado_id, fecha, estado, minutos_tarde, horas_descontadas, monto_descuento, registrado_por)
    values (e.org_id, e.id, p_fecha, p_accion, 0,
            case when p_accion = 'falta' then jornada else 0 end,
            case when p_accion = 'falta' then round(diaria) else 0 end,
            (select nombre from miembros where user_id = auth.uid() and org_id = e.org_id))
    on conflict (empleado_id, fecha) do update set estado = excluded.estado, hora_entrada = null, hora_salida = null,
      minutos_tarde = 0, minutos_salida_temprano = 0, horas_descontadas = excluded.horas_descontadas,
      monto_descuento = excluded.monto_descuento, registrado_por = excluded.registrado_por
    returning * into res;
  end if;
  return res;
end $function$;

create or replace function app.asistencia_foto(p_asistencia uuid, p_tipo text, p_url text) returns void
language plpgsql security definer set search_path to 'app', 'public' as $$
declare a asistencia;
begin
  select * into a from asistencia where id = p_asistencia;
  if a.id is null or not puede_checar(a.empleado_id) then raise exception 'Sin permiso'; end if;
  if p_tipo = 'entrada' then update asistencia set foto_entrada = p_url where id = a.id;
  elsif p_tipo = 'salida' then update asistencia set foto_salida = p_url where id = a.id;
  else raise exception 'Tipo inválido'; end if;
end $$;

create or replace function app.equipo_de(p_centro uuid)
 returns table(id uuid, nombre text, puesto text, hora_entrada time, hora_salida time, tolerancia_min integer, dias_laborales text)
 language sql stable security definer set search_path to 'app', 'public' as $function$
  select e.id, e.nombre, e.puesto, e.hora_entrada, e.hora_salida, e.tolerancia_min, e.dias_laborales
  from empleados e join centros c on c.id = e.centro_id
  where e.centro_id = p_centro and e.activo
    and tiene_rol(c.org_id, array['administracion','encargado','equipo']::rol_usuario[])
    and puede_ver_empresa(c.org_id, c.empresa_id)
  order by e.nombre;
$function$;

create or replace function app.mi_empleado()
returns table(id uuid, nombre text, puesto text, centro_id uuid, hora_entrada time, hora_salida time, tolerancia_min int, dias_laborales text, telefono text)
language sql stable security definer set search_path to 'app', 'public' as $$
  select e.id, e.nombre, e.puesto, e.centro_id, e.hora_entrada, e.hora_salida, e.tolerancia_min, e.dias_laborales, e.telefono
  from miembros m join empleados e on e.id = m.empleado_id
  where m.user_id = auth.uid() and m.activo and e.activo limit 1;
$$;

-- Reporte de un residente desde el QR del elevador (sin cuenta). Solo crea el reporte; no puede leer nada.
create or replace function app.reporte_residente(p_centro uuid, p_unidad text, p_nombre text, p_telefono text, p_descripcion text)
returns text language plpgsql security definer set search_path to 'app', 'public' as $$
declare c centros; u unidades; recientes int; dig text := regexp_replace(coalesce(p_unidad, ''), '\D', '', 'g');
begin
  select * into c from centros where id = p_centro and activo;
  if c.id is null then raise exception 'Edificio no encontrado'; end if;
  if coalesce(length(trim(p_descripcion)), 0) < 3 or length(p_descripcion) > 1000 then raise exception 'Describe el problema'; end if;
  if length(coalesce(p_unidad, '')) > 30 or length(coalesce(p_nombre, '')) > 80 or length(coalesce(p_telefono, '')) > 30 then raise exception 'Datos demasiado largos'; end if;
  select count(*) into recientes from solicitudes where centro_id = c.id and origen = 'qr' and creado_en > now() - interval '1 hour';
  if recientes >= 30 then raise exception 'Intenta más tarde'; end if;
  -- "D305", "305" o "Depto 305": se busca por el texto o por el número
  select * into u from unidades where centro_id = c.id and (lower(identificador) = lower(trim(p_unidad))
    or (dig <> '' and regexp_replace(identificador, '\D', '', 'g') = dig)) order by (lower(identificador) = lower(trim(p_unidad))) desc limit 1;
  insert into solicitudes (org_id, centro_id, unidad_id, unidad_txt, reporta, telefono, descripcion, origen, registrado_por)
  values (c.org_id, c.id, u.id, coalesce(u.identificador, nullif(trim(p_unidad), '')), nullif(trim(p_nombre), ''), nullif(trim(p_telefono), ''), trim(p_descripcion), 'qr', 'Residente (QR)');
  return 'ok';
end $$;
create or replace function app.centro_publico(p_centro uuid) returns text
language sql stable security definer set search_path to 'app', 'public' as $$ select nombre from centros where id = p_centro and activo $$;

revoke all on function app.reporte_residente(uuid, text, text, text, text) from public;
revoke all on function app.centro_publico(uuid) from public;
grant execute on function app.reporte_residente(uuid, text, text, text, text) to anon, authenticated;
grant execute on function app.centro_publico(uuid) to anon, authenticated;
grant execute on function app.asistencia_foto(uuid, text, text) to authenticated;
grant execute on function app.mi_empleado() to authenticated;
grant execute on function app.puede_checar(uuid) to authenticated;
