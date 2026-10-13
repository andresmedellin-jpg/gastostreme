# Treme / MEDCO · plataforma administrativa

**Liga para todos: https://app.medco.mx** (registro CNAME `app` → `andresmedellin-jpg.github.io` en el DNS de medco.mx, en WordPress.com; archivo `CNAME` en este repositorio).

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
| Socio | Igual que el dueño, menos dar de alta usuarios |
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
6. `0006` a `0008`: cobranza Elysium, rentas, personal y nómina.
7. `0009_patrimonio_solo_dueno.sql`: activos y pasivos solo los ve y edita el dueño.
8. `0010_cerrar_tablas_viejas_fase1.sql`: las tablas viejas de gastos, cobranza, ingresos y patrimonio ya no se pueden
   leer ni escribir desde internet (se quedan como respaldo).
9. `0011_rol_socio.sql`: rol Socio (todo menos administrar usuarios).
10. `0012_cerrar_tablas_viejas_fase2.sql`: se cierran las últimas tablas viejas; el esquema `public` ya no se usa.

`supabase/functions/usuarios/`: función del servidor que crea usuarios, cambia contraseñas y da o quita acceso.
Solo responde al dueño; usa la llave de servicio, que nunca llega al navegador.

El respaldo completo del sistema viejo está en el esquema `respaldo_20261012`.

## Estado de la migración

| Módulo | Estado | Herramienta vieja |
|---|---|---|
| Inicio (estado de resultados) | ✅ En la plataforma | Centro de Control: retirado |
| Gastos | ✅ En la plataforma | Gastos Treme: retirado |
| Cobranza Elysium | ✅ En la plataforma | Cobranza Elysium: retirado |
| Rentas Treme | ✅ En la plataforma | Rentas Treme: retirado |
| Personal y nómina | ✅ En la plataforma | Elysium · Mi día (victorolazaran) y Acceso Elysium: retirados |
| Patrimonio | ✅ En la plataforma | — |
| Reporte mensual | ✅ En la plataforma | Reporte Mensual: retirado |
| Usuarios | ✅ En la plataforma | — |

Las páginas retiradas muestran un aviso y mandan a la plataforma; su código sigue en el historial de cada repositorio.

## Publicar cambios

Antes de cada commit que toque `js/` o `css/`, corre `python3 publicar.py`: sube la versión en `index.html`
para que todos vean lo nuevo con solo recargar.

## Notas de datos (cobranza Elysium)

- 256 pagos de enero a mayo vivían solo dentro del código de la página vieja; se pasaron a la base
  (respaldo en `respaldo_20261012.catalogo_cobranza`).
- Las oficinas *904/*905 eran las mismas que 904/905 (se renombraron en julio); su historial se unió.
- Regla de cobranza (igual que la página vieja): una unidad está pagada en un mes si tiene al menos un pago.
