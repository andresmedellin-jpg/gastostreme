-- OPERIA · alta de un cliente nuevo en su base (correr DESPUÉS de operia_base.sql).
-- Antes: crear al dueño en Authentication → Users → "Add user" (correo y contraseña).
-- Cambia los valores de la sección "datos del cliente" y corre todo el archivo.
do $$
declare
  -- ===== datos del cliente =====
  v_org_nombre  text := 'Galcor';                          -- nombre de la organización
  v_dueno_mail  text := 'dueno@cliente.mx';                -- correo del dueño (ya creado en Authentication)
  v_dueno_nom   text := 'Nombre del dueño';
  v_dueno_user  text := 'dueno';                           -- usuario para entrar sin escribir el correo
  -- empresas: nombre legal | nombre corto | color
  v_empresas    text[][] := array[
    ['Galcor S.A. de C.V.', 'Galcor', '#1f4e79'],
    ['Inmobiliaria Galcor S.A. de C.V.', 'Inmobiliaria', '#2d6a5f']];
  -- centros (dónde se registran gastos e ingresos): nombre | tipo | nombre corto de su empresa
  -- tipos: condominio, plaza, bodega, obra, oficina, propiedad, socio, personal, otro
  v_centros     text[][] := array[
    ['Oficina', 'oficina', 'Galcor'],
    ['Taller de servicio', 'otro', 'Galcor'],
    ['Torre 1', 'condominio', 'Inmobiliaria'],
    ['Torre 2', 'condominio', 'Inmobiliaria']];
  -- ===== fin de datos =====
  v_org uuid; v_user uuid; v_emp uuid; i int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_dueno_mail);
  if v_user is null then raise exception 'Primero crea al dueño (%) en Authentication → Users', v_dueno_mail; end if;
  if exists (select 1 from app.organizaciones) then raise exception 'Esta base ya tiene una organización: el alta solo se corre una vez'; end if;

  insert into app.organizaciones (nombre, plan) values (v_org_nombre, 'cliente') returning id into v_org;
  for i in 1 .. array_length(v_empresas, 1) loop
    insert into app.empresas (org_id, nombre, nombre_corto, color) values (v_org, v_empresas[i][1], v_empresas[i][2], v_empresas[i][3]);
  end loop;
  for i in 1 .. array_length(v_centros, 1) loop
    select id into v_emp from app.empresas where org_id = v_org and nombre_corto = v_centros[i][3];
    if v_emp is null then raise exception 'El centro % pide la empresa %, que no está en la lista', v_centros[i][1], v_centros[i][3]; end if;
    insert into app.centros (org_id, empresa_id, nombre, tipo) values (v_org, v_emp, v_centros[i][1], v_centros[i][2]::app.tipo_centro);
  end loop;
  insert into app.miembros (org_id, user_id, nombre, rol, usuario, activo) values (v_org, v_user, v_dueno_nom, 'dueno', v_dueno_user, true);
  raise notice 'Listo: organización %, % empresas, % centros, dueño %', v_org_nombre, array_length(v_empresas, 1), array_length(v_centros, 1), v_dueno_mail;
end $$;
