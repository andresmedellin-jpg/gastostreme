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
   operacion, encargado, lectura, equipo (personal de piso: solo "Mi turno" desde su celular; `soloRoles` en MODULOS). Casa y Socios (centros tipo `personal`/`socio`) solo dueño/socio/administración.
4. Migraciones: guárdalas en `supabase/migrations/NNNN_nombre.sql`. Las que llevan DROP o DELETE se cancelan
   solas en este entorno: usa ALTER POLICY, REVOKE, columnas-bandera (`activo`, `en_padron`) o borra desde la app.
5. Estilo "Ejecutivo" (desde 05/11/2026, `css/ejecutivo.css` encima de `app.css`): Inter (incrustada en `fonts/`), fondo papel
   `#F4F3EF`, tarjetas blancas de 14px con línea fina, tinta `#101216` para botones principales y el menú activo, vino Treme
   `#8B1A1A` solo como acento (etiqueta de sección arriba del título) y azul MEDCO `#23408E` para distinguir empresas.
   Tablas con encabezado en mayúsculas pequeñas y líneas finas; números tabulares. Lenguaje formal y profesional, sin emojis
   en pantallas de administración (las categorías llevan un punto de color: `catIco` de `config.js`). **Solo modo claro.**
   Inicio = "Resumen ejecutivo": utilidad del mes (compara el mes en curso contra el mismo periodo del anterior), flujo de 6 meses,
   tarjeta por empresa, composición de ingresos y egresos, y solo los 8 movimientos más recientes (botón para ver todos).
   **Mundos (sin menú lateral):** barra superior negra con el selector Grupo · Treme · MEDCO (`MUNDOS` en `config.js`) y debajo
   las secciones de ese mundo. Rutas `#/<mundo>/<módulo>` (las viejas `#/gastos` siguen sirviendo). En Treme o MEDCO,
   `estado.foco` = id de la empresa y `db()` (lib.js) agrega `.eq('empresa_id', foco)` a cada lectura de las tablas con empresa
   (`CON_EMPRESA`); `estado.empresas`/`estado.centros` quedan solo con esa empresa (las completas en `todasEmpresas`/`todosCentros`).
   Grupo = Resumen del grupo, Patrimonio, Gastos consolidados, Importar, Usuarios. Treme = Resumen, Rentas, Torre Elysium (cobranza:
   Estado de cuenta anual unidad × mes, Cobrar del mes, Deudores y Reporte mensual en la misma pantalla), Gastos, Nómina y equipo, Patrimonio.
   Selector de empresa sin burbujas: "Grupo" en texto y los dos logos; la activa con línea de su color.
   Rentas = hoja de cobranza del mes (historial de 6 meses por renta, avance por desarrollo, contratos por atender).
   Obras = franja por obra: cobrado vs costo (pagado / por pagar), curva acumulada, utilidad esperada y caja de la obra. MEDCO = Resumen, Obras, Prospectos, Gastos, Nómina y equipo, Patrimonio. Color de acento por mundo.
   **Nómina y equipo** (antes "Personal"): Hoy · Turnos · Raya semanal · Plantilla · Vacaciones · Préstamos. Raya = hoja de la semana
   (‹ semana ›, filtro por centro, días L–D para marcar faltas, sueldo, faltas, abono a préstamo editable, a pagar, Pagar);
   al pagar con abono: gasto de Nómina por el sueldo, `nomina_lineas.abono_prestamo` y un `prestamo_abonos`.
   Gastos: centros como botones con lo gastado en el mes (sin menú desplegable), también en el formulario.
   Patrimonio: Panorama (neto, deuda/valor, flujo, rendimiento, costo de la deuda = pago mensual ÷ saldo, lectura para decidir,
   simulador "¿Qué pasa si vendo…?" que paga primero la deuda más cara, rendimiento por inmueble, concentración) · Inmuebles · Deuda.
6. Prueba antes de publicar: Playwright con un Supabase falso (se sirve el repo en localhost y se reemplaza
   `supabase.min.js`), revisa escritorio y celular (390px), sin errores en consola.
7. Commits como `-c user.name="Andrés Medellín" -c user.email="andres.medellin@medco.mx"`.

## Reglas de negocio que ya se acordaron
- Categorías de gasto: una sola lista en `CATEGORIAS` de `js/config.js` (con `CATEGORIA_AYUDA`), usada en todo. Construcción,
  Nómina, Seguro social e ISN, Gasolina, Vehículos, Mantenimiento, Limpieza, Seguridad, Luz, Agua, Gas, Teléfono e internet,
  Administración, Impuestos, Intereses y comisiones, Retiro socios, Otros. Ya no existen General/Otro/Auto/Reparaciones/Electricidad (se migraron).
  El formulario de gasto sugiere la categoría según el proveedor.
- Gastos: Casa y Socios cuentan como cualquier centro, en "Todos" y en Inicio (todo sale de la empresa). Victoria no
  los ve (lo impide `puede_ver_centro` en la base). Menús de centro en Gastos: solo centros con `centros.en_gastos`
  (false: Calzada San Pedro, Barton Creek, Ellion, Platino, Por asignar, Plazas (general); siguen en Rentas).
  Nómina pagada crea su gasto (categoría Nómina).
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
  `fonts/`, rojo #8B1A1A, tamaño carta). Botón "Descargar PDF" guarda el archivo directo (html2pdf en `js/vendor/`,
  nombre "Recibo <folio> <quien pagó>.pdf"); "Imprimir" aparte. Elysium: botón "Recibo" por unidad y mes, juntos (mantenimiento + luz) o
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
- **Patrimonio ↔ Rentas (09/11/2026):** la renta de un inmueble NO se captura en Patrimonio; sale de sus contratos de Rentas
  ligados en `app.activo_contrato` (0030; un contrato puede cubrir varios locales y se reparte por valor; un local puede tener
  varios contratos). Rentas manda: si difieren, vale el contrato (lo cobrado). Cada inmueble tiene su plaza (`activos.centro_id`).
  `activos.ingreso_mensual`/`inquilino` quedan solo como dato viejo y se limpian al ligar. Panorama: valor total = pesos + dólares
  × tipo de cambio del día (frankfurter, se puede fijar a mano; se guarda en el navegador); **la deuda es de las empresas: se muestra
  aparte y nunca se resta**. "Por revisar" lista contratos sin inmueble, inmuebles con renta vieja sin contrato, contratos de baja y
  sin plaza. Rentas muestra los locales de cada contrato vía `app.espacios_contratos()` (0031, solo nombres).
  Parte fija (`activo_contrato.monto`, 0033): si un contrato incluye algo que no es inmueble del patrimonio (Lote de Autos:
  $18,000 Local 20 + $22,000 estacionamiento del edificio), el inmueble lleva su parte y lo demás se muestra "aparte" en Panorama.
  Proyección (Panorama): renta posible de lo no rentado = `renta_mercado_estimada` si se capturó; si no, mediana de $/m² de los
  rentados del mismo tipo y plaza. No cuenta lo de uso propio (Operación MEDCO, casa de la familia).
- **Recibo de ingresos (09/11/2026):** "＋ Ingreso" de Inicio genera recibo PDF (casilla marcada por omisión) y los movimientos tienen
  botón "Recibo". MEDCO: "Desarrollos y Proyectos MEDCO", azul #1E4F9C, `img/logo-medco.png`, fila "Obra", IVA "No desglosado",
  saldo pendiente si abona a una cuenta de obra. Treme: formato de siempre. Folio `REC-AAAAMM-NNNN` por empresa con
  `app.siguiente_folio_empresa` (0032), guardado en `ingresos.folio` / `pagos.folio`; `siguiente_folio_cuota` también los cuenta.
- Empleados dados de baja: se conservan por su historial de nómina, ocultos por defecto.
- Contraseña mínima: 6 caracteres. Usuario sin correo: `usuario@usuarios.medco.mx`.
- **Nunca** dar acceso a franciscosr971@gmail.com (fsrsalazar).

## Ventas y publicidad (MEDCO)
- **Prospectos** (módulo `prospectos.js`, Ventas; dueño, socio y administración — Andrés y Miguel ven lo mismo): leads de MEDCO
  para las campañas de Google y Meta. Tabla `prospectos` (estados nuevo → calificado / no_calificado → cotizado → ganado / perdido,
  botones de un toque; `ganado` pide monto, `perdido`/`no_calificado` piden motivo). Botón WhatsApp abre wa.me y anota
  `primera_respuesta`. El trigger `prospectos_tiempos` (0024) anota `primera_respuesta`, `calificado_en`, `atendido_por` y
  `actualizado_en`. "Calificado" = tiene `calificado_en` o estado calificado/cotizado/ganado. Origen: google | instagram | facebook |
  web | whatsapp | recomendacion | otro; Meta = instagram + facebook. Pestaña Publicidad: `inversion_publicidad` (semana = lunes,
  plataforma google|meta, una fila por semana y plataforma, capturada a mano cada lunes) contra contactos, calificados, costo por
  calificado, cotizados, ganados y vendido; tiempo de respuesta (mediana) y motivos de descarte. Contador rojo en el menú =
  prospectos nuevos con más de 1 hora sin respuesta (app.js `avisoProspectos`, cada 5 min).
  Alta a mano (＋ Prospecto) guarda `primera_respuesta` al crear, con cualquier origen (ya hablaron con él; no sale "sin contestar").
  WhatsApp desde Instagram/página: construcciones.medco.mx/whatsapp?de=instagram|web abre wa.me/528134031022 con "los vi en …"; se captura a mano con ese origen.
  **Importar contactos de Meta** (botón en la pestaña Publicidad): sube el CSV del Centro de clientes potenciales (UTF-16 con
  tabuladores o UTF-8 con comas), mapea full_name/phone_number/email/platform/campaign_name/ad_name y las preguntas del formulario
  (construir → tipo, metros → m2, terreno, empezar → cuando), descarta prueba/incompletos/repetidos (mismo teléfono de 10 dígitos,
  correo o `externo_id` = 'meta:<lead id>', índice único 0025) y los da de alta como nuevo.
- **Formulario de construcciones.medco.mx** (repo `andresmedellin-jpg/medco-web`, conectado el 20/10/2026; si falla abre el correo): llama a la función pública
  `app.registrar_prospecto(jsonb)` con la llave publishable (anon solo puede ejecutar esa función, no leer la tabla). Manda
  utm_source/medium/campaign/term, gclid y fbclid guardados de la URL de llegada; la función deduce el origen y frena spam
  (40 por 10 min, 3 por teléfono/correo por hora). Plan de publicidad: $7,000/mes Google, $5,000/mes Meta, 3 meses.

## Unaria (NO va aquí)
- **Unaria** (producto de Andrés con su socio Angel Galván Treviño) vive **completamente aparte**: repositorio
  `andresmedellin-jpg/unaria` (unaria.mx, unaria.mx/app = la app modelo, unaria.mx/demo = demos de Galcor/inmobiliaria),
  base de Supabase `gimvgsjpeyvdretubrgc`, su propia cuenta de Anthropic. **Andrés pidió no meter nada de Unaria en
  Treme/MEDCO**: ni demos, ni clientes, ni la llave de Anthropic, ni el asistente AI. Lo nuevo de Unaria se hace allá.
- En este repo solo queda el demo propio de Treme/MEDCO (`?demo=medco`, usuario "demo"), y el código de marca configurable
  (`MARCA`, `CLIENTE` en `js/config.js`) que no se usa aquí. La app de Unaria partió de una copia de este código.
- Restos inactivos en el proyecto de Treme: función `asistente` (sin llave, nadie la llama) y tabla `app.asistente_preguntas`
  (migración 0026, vacía). No conectar Anthropic a este proyecto.

## Equipo (Personal) — igual que en Unaria (02/11/2026)
- **Solo 3 pestañas, por momento:** Hoy · Semana (turnos + nómina) · Personas (empleados; Vacaciones y Préstamos como botones).
  El encargado (Víctor) ve solo Hoy y Semana. Lo demás son vistas de detalle con "← Volver" (Asistencia, Tareas, Rondines,
  Reportes, Paquetes, Incidencias por día). "⚙ Configurar": puntos del rondín/QR, tareas de cada día (`tareas_plantilla`), QR del elevador.
- En Hoy cada persona es una tarjeta: Llegó / Faltó / Salió, 👁 Supervisar (antes la pestaña Rondín/Supervisión de Víctor;
  guarda `tareas` tipo rondin), y al tocarla su día (tareas, darle otra tarea, permiso, reportar algo = incidencia).
  A la derecha "Necesita tu atención": quién no ha llegado, tareas de quien faltó (se pasan a otro), reportes sin asignar o
  atorados, último rondín incompleto, paquetes de más de un día, caseta sin vigilante.
- `js/modulos/equipo.js`: Hoy, turnos, rondines (placas QR "PTO:<id>"), reportes, paquetes, tareas de cada día, configurar.
- `js/modulos/turno.js` = **Mi turno**, la pantalla del celular del personal (rol `equipo`): checar entrada/salida con selfie,
  rondín por QR, pendientes con foto, reportes asignados, paquetes, buscar placa, reportar, entregar turno con nota.
  Acceso: Personal → Empleados → "📱 Dar acceso" (solo el dueño; queda ligado con `miembros.empleado_id`).
- QR del elevador: Reportes → "QR para el elevador" → `reportar.html?c=<centro>` (público; solo la función `reporte_residente`).
- Tablas (0028): turnos, puntos_rondin, rondin_marcas, solicitudes, paquetes, bitacora_turno; `asistencia.foto_entrada/foto_salida`,
  `empleados.telefono`. Funciones (0029): puede_checar, asistencia_foto, mi_empleado, reporte_residente, centro_publico;
  `asistencia_marcar` usa el turno del día si hay y deja al personal checar solo su entrada/salida.
- Turnos: "volver a su horario normal" deja el renglón sin horas (no se borra).

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
