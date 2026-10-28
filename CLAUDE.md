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

## Producto para vender a otros clientes
- **Marca configurable** (`MARCA` en `js/config.js`, se sobreescribe con `window.__MARCA`): nombre, texto del menú, logos,
  color, módulos visibles (`modulos`), títulos (`titulos`), palabra para obra (`palabraObra`), categorías de gasto propias,
  pestañas de Personal ocultas (`ocultarPestanas`) y centro inicial (`centroPersonal`).
  Por omisión es Treme / MEDCO y nada cambia. Módulos con `opcional: true` (Cotizaciones, Inventario) solo salen si la marca los pide.
- **Dos demos** (base en memoria `js/demo/supabase-demo.js`, datos inventados `js/demo/datos-demo.js`; no tocan la base real,
  se reinician al recargar): `app.medco.mx/?demo=galcor` (o `?demo`): distribuidor de válvulas Emerson con servicio — Prospectos,
  Cotizaciones, Inventario, Proyectos, Gastos, Personal; y `?demo=inmobiliaria`: sus torres en renta — Prospectos, Rentas (abonos y
  Ocupación), Gastos, Personal. Cada uno filtra los datos a su empresa. Prospectos con 12 semanas de inversión simulada en Google y
  Meta (también como gasto "Publicidad"). El vocabulario de Prospectos se cambia con `MARCA.prospectos` (tipos, cuándo, terreno, saludo…).
  Los demos traen el menú completo: Patrimonio, Usuarios (alta simulada) y Personal separado en opciones del menú (Nómina,
  Asistencia, Tareas, Rondín, Incidencias, Empleados, Vacaciones, Préstamos: módulos `opcional` con `vista: 'personal'` y `tab`;
  `MARCA.centrosPersonal` limita los centros). Galcor sin Rondín ni Incidencias; la inmobiliaria con todo.
- **Rentas con opciones de marca:** `rentaParcial` (abonos: si los pagos del mes no suman la renta queda "Abonado" y muestra lo que
  falta; el recibo dice el saldo) y `ocupacion` (pestaña Ocupación: mapa de unidades por torre/tipo, ligado por `contratos.unidad_id`).
  Treme hoy no las usa (si se activa `rentaParcial`, Apetit jul–ago saldría con $3,400 pendientes). Recibo: `reciboEmpresa/Logo/Color`.
  El demo trae 2a empresa del cliente: inmobiliaria con Torre Cumbres (8 locales, 12 oficinas, 80 deptos) y Torre Valle (12 oficinas).
- **Inventario** (`inventario.js`): productos + movimientos (entrada/salida/ajuste); existencia = suma de movimientos.
  **Cotizaciones** (`cotizaciones.js` + `cotizacion-pdf.js`): partidas en jsonb, IVA 16 %, estados borrador/enviada/aceptada/rechazada;
  al aceptar crea proyecto (centro tipo obra + cxc venta) y descuenta inventario. Sus tablas están en
  `supabase/plantilla/inventario_cotizaciones.sql` (no aplicadas en Treme/MEDCO).
- **Lecturas de luz, gas y agua** (`lecturas.js`, opcionales `lecturas` = "Toma de lecturas" y `servicios` = "Luz, gas y agua", vista
  `lecturas`): para edificios que pagan un solo recibo (CFE, gas, Agua y Drenaje) y cobran a cada unidad según su submedidor (primer
  cliente: la torre de la inmobiliaria de Galcor). Placa QR por medidor ("MED:<id>", hoja imprimible con `js/vendor/qrcode.min.js`);
  el lecturista escanea con la cámara (BarcodeDetector o `js/vendor/jsQR.js`), escribe la lectura y foto obligatoria; avisa si es menor
  a la anterior o más de 2.2× su consumo normal (queda "revisar"). Encargado: avance, revisión/aprobación, cuadre contra el recibo de
  cada compañía, aviso de cobro PDF por unidad (recibo.js con `encabezado`/`totalTexto`/`estadoTexto`), tarifas (fija o reparto del
  recibo real). Tablas en `supabase/plantilla/lecturas_servicios.sql` (no aplicadas en Treme/MEDCO). En el demo: ?demo=inmobiliaria.
  Pendiente: leer la foto con IA para confirmar el número; ligar el cobro a Rentas/abonos.
- Cada cliente real debe ir en su propio proyecto de Supabase (no mezclar con los datos de Treme/MEDCO).

## Operia (el producto para otros clientes)
- **Nombre provisional: Operia.** Un solo código para todos; cada cliente con su **propia base de Supabase** (~US$10/mes extra
  por proyecto en el plan Pro de Andrés; se le cobra al cliente) y su carpeta: `app.medco.mx/<cliente>/` (luego dominio propio).
- **Cliente = archivo `clientes/<id>.js`** (`window.__CLIENTE` = { id, nombre, supabaseUrl, supabaseKey, marca }). `publicar.py`
  genera `<id>/index.html` desde `index.html` (con `<base href="/">`, sin modo demo; no editar a mano). Sin `supabaseUrl` la
  página dice "en preparación". En `config.js`, `CLIENTE` cambia la base y parte de una marca genérica (`BASE_CLIENTE`: categorías,
  vocabulario de Prospectos, módulos, sin nada de Treme); `clientes/<id>.js → marca` la ajusta. Sin cliente todo es Treme/MEDCO.
- **Base nueva:** `supabase/plantilla/operia_base.sql` (estructura completa del esquema app de Treme sin datos + inventario,
  cotizaciones y lecturas; probada en Postgres local) y luego `alta_cliente.sql` (organización, empresas, centros y dueño, que
  antes se crea en Authentication). En el proyecto: exponer el esquema `app` en la API y desplegar la función `usuarios`
  con el secreto `DOMINIO_INTERNO` (p. ej. usuarios.operia.mx; marca.dominioUsuarios = '@usuarios.operia.mx').
  Si cambias la base de Treme (migración nueva), aplica el mismo cambio a operia_base.sql.
- **Importar datos** (`importar.js`, opcional `importar`): plantilla de Excel (Unidades, Inquilinos, Empleados, Medidores),
  revisa renglón por renglón, no duplica lo existente, crea unidades que falten. Lector SheetJS 0.20.3 desde cdn.sheetjs.com
  (no usar 0.18.5 de npm: tiene fallas de seguridad al leer archivos).
- Lo de Treme quedó como opción: `MARCA.condominio` (Cobranza/Reporte; por omisión Torre Elysium), `reciboEmpresa`, `dominioUsuarios`.
- Primer cliente: Galcor (`clientes/galcor.js`, aún sin base).
- **Unaria** (nombre final del producto; socio: Angel Galván Treviño, clientes y operación; Andrés: producto y tecnología).
  Su propia base de Supabase: proyecto `gimvgsjpeyvdretubrgc` ("unaria", us-east-2), creada el 28/10/2026 con
  operia_base.sql + módulos opcionales. Org "Unaria", empresa "Unaria", centro "Oficina"; aún sin usuarios (crearlos en
  Authentication y luego `app.miembros`). Anon solo ejecuta `registrar_prospecto` y `correo_para_login`.
  `registrar_prospecto` acepta `empresa_destino` (empresa que recibe), `empresa` (la del prospecto), `puntaje`, `resumen`,
  `costo_mensual`, `conversacion` (columnas nuevas en `prospectos`). La página unaria.mx (no vive en este repo) manda ahí
  los prospectos del chat "¿Por dónde empiezo?". Nunca mezclar con la base de Treme/MEDCO ni con la de Moncan.
  Chat con IA (plantilla para clientes, basada en el prompt calificador de Angel): `chat-widget.js` (burbuja de una línea),
  `functions/api/chat.js` (Cloudflare Pages: Claude + herramientas `registrar_datos` y `calcular_costo`, aviso por Resend)
  y `lib/chat-config.js` (lo único que cambia por cliente). Guarda vía `app.guardar_chat(jsonb)` (solo service_role;
  un prospecto por plática con `externo_id = 'chat:<id>'`, columnas `datos`, `puntaje`, `resumen`, `costo_mensual`,
  `conversacion`, `completa`). Ese código vive fuera de este repo (carpeta unaria-web entregada en zip).

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
