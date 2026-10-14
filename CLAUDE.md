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
- Categorías de gasto: una sola lista en `CATEGORIAS` de `js/config.js` (con `CATEGORIA_AYUDA`), usada en todo. Construcción,
  Nómina, Seguro social e ISN, Gasolina, Vehículos, Mantenimiento, Limpieza, Seguridad, Luz, Agua, Gas, Teléfono e internet,
  Administración, Impuestos, Retiro socios, Otros. Ya no existen General/Otro/Auto/Reparaciones/Electricidad (se migraron).
  El formulario de gasto sugiere la categoría según el proveedor.
- Gastos: "Todos" excluye Casa y Socios. Nómina pagada crea su gasto (categoría Nómina).
- Corregir/borrar gastos: botón ✎ "Corregir gasto" (mismo registro) para administración y operación. Borrar (✕):
  administración cualquiera; operación (Victoria) solo los que ella capturó (`capturado_por` = su nombre, RLS 0020).
  Los 415 viejos con `capturado_por = 'Victoria'` del sistema anterior solo los borra administración.
- Cobranza Elysium: una unidad está pagada en el mes si tiene al menos un pago (igual que la página vieja).
- Inicio: ingresos = rentas + mantenimiento + luz + ventas + ingresos a mano (agrupados por categoría:
  "Obra / construcción", "Venta", otros). La luz cobrada sí cuenta como ingreso (el recibo de CFE es gasto).
- Bodegas de MEDCO (clientes Ortegón → Bodega Santa Catarina, Isidro Pérez → Bodega Escobedo): cada cliente es una
  `cuentas_por_cobrar` tipo venta con su precio; sus pagos son `pagos` concepto venta ligados con `cxc_id`.
  En Inicio cuentan como "Obras y construcción". No capturarlos además como ingreso a mano: el botón "+ Ingreso" de Inicio,
  si el centro tiene cuenta por cobrar de venta, guarda el cobro como `pagos` (abono a esa cuenta) en vez de `ingresos`.
- Gastos "por pagar" (`gastos.estado = 'por_pagar'`): pedidos a proveedores aún sin pagar. Cuentan como costo de la
  obra desde el pedido; en Inicio el gasto cuenta en el mes en que se paga (`fecha_pago`, o `fecha` si se pagó al
  momento) y lo pendiente se muestra aparte. Se pagan con "Marcar pagado" en Gastos (mismo registro, no se duplica).
- Facturas de proveedores que llegan por correo (Gmail de Andrés): se registran como gasto "por pagar" en la obra que
  dice la factura ("Orden de compra"), con `cfdi_uuid`, `legacy_id = 'cfdi:<UUID>'` (evita duplicados) y el enlace al
  correo en `comprobante_path`. Home Center Ferretera (RFC HCF141121TT3): crédito a 15 días; su deuda vieja vive en
  Patrimonio → pasivos.
- Facturas pagadas en parcialidades (Vigu/Construmart manda "ReciboPag" = complemento de pago): un gasto por cada pago,
  con fecha del pago y el UUID del complemento en `cfdi_uuid`. Anticipos de Concremóvil: el anticipo es el gasto; de la
  factura que lo aplica solo se registra la diferencia. Victoria captura pagos (no facturas): revisar antes de agregar.
- Nómina estimada (antes de junio 2026): un gasto por semana (sábado), proveedor "Nómina estimada",
  `legacy_id = 'estimado:nomina:<sc|esc|elysium>:<fecha>'`. Santa Catarina desde 19/07/2025 a $32,500; Escobedo desde
  17/05/2025 a $21,161.40 (promedio real); Elysium ene–may 2026 a $34,900. Si llega la raya real, reemplazar.
- Barrido de Gmail ya hecho hasta el 14/10/2026 (facturas XML a MEDCO, RFC DPM131211I4A).
- Obras (módulo `obras.js`): centros tipo `obra`; valor = cuenta por cobrar tipo venta; costo = pagado + por pagar.
- Recibos (rentas y Cobranza Elysium) usan `js/recibo.js`: formato Treme que Andrés entrega (Inter incrustada desde
  `fonts/`, rojo #8B1A1A, tamaño carta). Elysium: botón "Recibo" por unidad y mes, juntos (mantenimiento + luz) o
  separados (el dueño paga mantenimiento, el inquilino la luz); quién paga cada concepto se guarda en `cuotas.pagador`.
  Folio `REC-AAAAMM-NNNN` vía `siguiente_folio_cuota`, guardado en los pagos. Rentas conserva su folio `REC-NNNN`.
  Siempre "Grupo Inmobiliario Treme" (nunca "Treme Grupo Inmobiliario"). Tipo de unidad `loft` existe (1204, 1406).
  Isidro (Loft 1204) paga $1,000 + $1,000 por acuerdo: está al corriente.
- IMSS / Infonavit / ISN: todos los asegurados están en el registro patronal de MEDCO (Y39-27810-10-5), también los
  de Treme (Elysium, plazas, oficina). Empleados con `imss = true`, `nss`, `nombre_imss`, `alta_imss`. Cada pago se reparte
  por centro según la cédula de cuotas del SUA (categoría "Seguro social e ISN"; el registro original queda como parte
  de Santa Catarina y las demás partes con `legacy_id = 'reparto:<id original>:<centro>'`). Jun–sep 2026 ya repartidos
  con la cédula de sept. Desde oct. 2026 hay 24 asegurados (8 altas del 02/10 en Escobedo y Elysium).
- Vacaciones (Personal → Vacaciones): LFT 2023 — 12 días al 1er año, +2 hasta 20 al 5º, +2 cada 5 años; plazo 6 meses
  tras el aniversario; prima 25 %. Cada registro va ligado a su año de servicio (`vacaciones.periodo`), tipo
  `disfrutadas` o `pagadas`, con `monto` y `prima`. Antigüedad = `empleados.fecha_ingreso` (la que la familia les
  reconoce, aunque el alta del IMSS sea posterior). Se muestran y pagan en **semanas de sueldo** (semana = `dias_semana`
  días; 12 días = 2 semanas): se muestran en pesos (semanas × sueldo semanal); prima del 25 % solo a quien tiene `empleados.prima_vacacional`
  (Víctor, Bárbara, Victoria y Liz).
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
- Otras propuestas: alertas en Inicio, presupuesto por obra, exportar a Excel,
  pantalla de historial de cambios (la tabla `app.bitacora` ya registra).
- En unas semanas: Andrés borra los repositorios viejos (gastos, cobranzaelysium, centrodeoperaciones,
  reportemensual, victorolazaran, rentastreme, elysiumacceso); hoy muestran un aviso que manda a app.medco.mx.
  No tocar el repositorio `boda`.
