# Plataforma administrativa · Treme · MEDCO

Una sola app (con login) que reemplaza los HTML sueltos: Centro de Control, Gastos, Cobranza Elysium,
Rentas Treme, Acceso Elysium y Reporte Mensual.

## Cómo está armada

- **Página única** (`index.html`) publicada con GitHub Pages. Sin paso de compilación: módulos de JavaScript en `js/`.
- **Datos en Supabase**, esquema `app`. Cada persona entra con **usuario y contraseña** y solo ve lo que su rol permite;
  esa regla vive en la base (RLS), no en la pantalla.
- **Usuarios:** el nombre de usuario vive en `app.miembros.usuario`. Quien tiene correo puede recuperar su contraseña
  con el enlace; quien no tiene, recibe un correo interno `usuario@usuarios.medco.mx` y su contraseña la cambia el dueño.
- **Módulos** en `js/modulos/`. Cada uno exporta `render(view, modulo)`. Se registran en `js/config.js` (`MODULOS`)
  y en `js/app.js` (`vistas`).

## Roles

| Rol | Ve |
|---|---|
| Dueño | Todo, incluidos Casa y Socios |
| Administración | Todo menos Patrimonio |
| Cobranza | Cobranza |
| Operación / Encargado | Gastos de obra, personal y tareas de su centro |

## Base de datos

`supabase/migrations/` guarda, en orden, todo lo que se aplicó:

1. `0001b_esquema_app.sql`: estructura nueva (empresas, centros, unidades, contratos, pagos, gastos, nómina, tareas, patrimonio, bitácora).
2. `0002_ajustes_migracion.sql`: ajustes previos a la carga.
3. `0003_migracion_datos.sql`: paso de datos del sistema viejo (esquema `public`) sin duplicados.
4. `0004_login_usuario_y_privacidad.sql`: acceso con usuario, Casa y Socios visibles solo para dueño y administración, índices.
5. `0005_usuarios_y_permisos.sql`: varios roles por persona, contraseña temporal obligatoria de cambiar, lista de usuarios.

`supabase/functions/usuarios/`: función del servidor que crea usuarios, cambia contraseñas y da o quita acceso.
Solo responde al dueño; usa la llave de servicio, que nunca llega al navegador.

El respaldo completo del sistema viejo está en el esquema `respaldo_20261012`.

## Estado de la migración

| Módulo | Estado | Herramienta vieja |
|---|---|---|
| Usuarios | ✅ En la plataforma | — |
| Gastos | ✅ En la plataforma | Centro de Control (pestaña Gastos), Gastos Treme |
| Cobranza | En proceso | Cobranza Elysium, Rentas Treme |
| Personal | En proceso | Elysium · Mi día (victorolazaran), Nómina del Centro de Control. Acceso Elysium: retirado |
| Patrimonio | En proceso | — |
| Reportes | En proceso | Reporte Mensual |
