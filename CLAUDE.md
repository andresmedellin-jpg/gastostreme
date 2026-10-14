# Instrucciones para trabajar en esta plataforma

Plataforma administrativa de Grupo Inmobiliario Treme y Desarrollos y Proyectos MEDCO (dueño: Andrés Medellín).
En producción en **https://app.medco.mx**. Habla con Andrés en español, claro y sin tecnicismos; él prefiere
que hagas todo tú (GitHub, Supabase) y le digas el resultado. Lee también `README.md`.

## Piezas
- **Repositorio:** `andresmedellin-jpg/gastostreme`, rama `main`, GitHub Pages desde la raíz. Archivo `CNAME` = app.medco.mx.
- **Supabase:** proyecto `mqzuaxxnidaokhdqcurm` (https://mqzuaxxnidaokhdqcurm.supabase.co), esquema **`app`**.
  Llave pública en `js/config.js`. El esquema `public` es el sistema viejo: ya sin acceso desde internet (respaldo).
  Respaldo completo del sistema viejo en el esquema `respaldo_20261012`.
- **Función del servidor** `supabase/functions/usuarios/index.ts` (alta/edición de usuarios, solo el dueño).
  Si la cambias, despliégala con el contenido completo del archivo.
- **Sin compilación:** `index.html` + módulos ES en `js/` (`app.js`, `lib.js`, `config.js`, `modulos/*.js`) y `css/app.css`.

## Reglas al cambiar código
1. Antes de cada commit que toque `js/` o `css/`: `python3 publicar.py` (sube la versión del importmap para que
   todos vean el cambio al recargar). Un módulo nuevo se agrega al importmap de `index.html`, a `MODULOS`
   en `js/config.js` (con `grupo` e `icono`) y a `vistas` en `js/app.js`.
2. Consultas grandes: la base entrega máximo 1,000 filas. Usa `todo(() => db().from(...)...)` de `lib.js`.
3. Permisos: la regla real vive en la base (RLS con `app.tiene_rol`, `puede_ver_empresa`, `puede_ver_centro`).
   En pantalla, `tieneRol(lista)`. Roles: dueno, socio (todo menos usuarios), administracion, cobranza,
   operacion, encargado, lectura. Casa y Socios (centros tipo `personal`/`socio`) solo dueño/socio/administración.
4. Migraciones: guárdalas en `supabase/migrations/NNNN_nombre.sql`. Las que llevan DROP o DELETE se cancelan
   solas en este entorno: usa ALTER POLICY, REVOKE, columnas-bandera (`activo`, `en_padron`) o borra desde la app.
5. Estilo: opción "Treme" — Arial, blanco, rojo Treme `#a21d21` solo como acento, tablas con encabezado en
   mayúsculas y línea negra, esquinas de 4px. **Solo modo claro.** Íconos de línea SVG en el menú.
6. Prueba antes de publicar: Playwright con un Supabase falso (se sirve el repo en localhost y se reemplaza
   `supabase.min.js`), revisa escritorio y celular (390px), sin errores en consola.
7. Commits como `-c user.name="Andrés Medellín" -c user.email="andres.medellin@medco.mx"`.

## Reglas de negocio que ya se acordaron
- Gastos: "Todos" excluye Casa y Socios. Nómina pagada crea su gasto (categoría Nómina).
- Cobranza Elysium: una unidad está pagada en el mes si tiene al menos un pago (igual que la página vieja).
- Inicio: ingresos = rentas + mantenimiento + luz + ventas + ingresos a mano (agrupados por categoría:
  "Obra / construcción", "Venta", otros). La luz cobrada sí cuenta como ingreso (el recibo de CFE es gasto).
- Bodegas de MEDCO (clientes Ortegón → Bodega Santa Catarina, Isidro Pérez → Bodega Escobedo): cada cliente es una
  `cuentas_por_cobrar` tipo venta con su precio; sus pagos son `pagos` concepto venta ligados con `cxc_id`.
  En Inicio cuentan como "Obras y construcción". No capturarlos además como ingreso a mano.
- Reporte mensual de Elysium: sin CFE en egresos; suma todos los pagos del mes de cada unidad.
- Empleados dados de baja: se conservan por su historial de nómina, ocultos por defecto.
- Contraseña mínima: 6 caracteres. Usuario sin correo: `usuario@usuarios.medco.mx`.
- **Nunca** dar acceso a franciscosr971@gmail.com (fsrsalazar).

## Personas
- Andrés: dueño. Miguel (hermano): socio. Victoria: captura gastos y cobranza. Víctor: encargado de Torre Elysium.

## Pendiente / ideas acordadas
- **Conciliación bancaria** (Andrés la quiere): subir estados de cuenta de 3 cuentas; comparar cada movimiento con
  lo capturado (monto exacto, fecha ±2-3 días, tipo); estados ✅ registrado / 🟡 posible / 🔴 falta / ⚪ ignorar
  (traspasos entre sus cuentas, comisiones); un registro se liga a un solo movimiento; huella única por movimiento
  para que no se dupliquen al resubir; nada se crea sin aprobación; marcar pagos como "verificado en banco".
  Incluir **fondos entregados**: transferencias a un empleado para compras no son gasto hasta que hay ticket;
  saldo por comprobar por empleado. Falta: estados de cuenta de cada cuenta, banco/empresa de cada una,
  en qué cuenta caen mantenimiento/luz y rentas, y a qué empleados les transfiere.
- Otras propuestas: utilidad por obra (MEDCO), alertas en Inicio, presupuesto por obra, exportar a Excel,
  pantalla de historial de cambios (la tabla `app.bitacora` ya registra).
- En unas semanas: Andrés borra los repositorios viejos (gastos, cobranzaelysium, centrodeoperaciones,
  reportemensual, victorolazaran, rentastreme, elysiumacceso); hoy muestran un aviso que manda a app.medco.mx.
  No tocar el repositorio `boda`.
