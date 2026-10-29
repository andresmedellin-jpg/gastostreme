// Manual de la plataforma para el asistente de Ayuda. Una sección por módulo (mismo id que MODULOS en js/config.js).
// Al asistente solo se le pasan las secciones de los módulos que la persona puede ver.
// Si cambia una pantalla, actualiza aquí su sección: el asistente no sabe nada que no esté escrito aquí.

export const GENERAL = `
ENTRAR Y MOVERSE
- Se entra con el usuario (o el correo, si tiene) y la contraseña. Si la olvidó: escribir el usuario y tocar "¿Olvidaste tu contraseña?". Si el usuario tiene correo, le llega un enlace para cambiarla; si no tiene correo, se la cambia el dueño en Usuarios.
- La primera vez que alguien entra con una contraseña temporal, la plataforma le pide crear la suya (mínimo 6 caracteres).
- El menú está a la izquierda. En el celular se abre con el botón de tres rayitas (☰) de arriba.
- Cada persona solo ve los módulos de su puesto. Si alguien necesita ver algo que no le aparece, eso lo decide el dueño en Usuarios.
- Para salir: botón "Salir" del menú.
- Todo lo que se cambia o borra queda registrado en una bitácora con quién y cuándo.
- Los montos son en pesos. Las fechas se escriben con el calendario del campo.
- En el celular, las tablas se ven como tarjetas: cada renglón muestra sus datos uno debajo de otro.
`;

export const MODULOS: Record<string, string> = {
  inicio: `
INICIO (dueño y administración)
- Es el estado de resultados de las empresas: ingresos contra gastos del mes, por empresa, con la gráfica de los últimos 6 meses, "Ingresos por fuente" y "Gastos por centro".
- Ingresos = rentas cobradas + mantenimiento y luz cobrados en el condominio + ventas (pagos de clientes de obras) + ingresos capturados a mano.
- Los gastos "por pagar" (pedidos a proveedores) no cuentan en el mes del pedido: cuentan en el mes en que se pagan. Lo pendiente se muestra aparte.
- "＋ Ingreso" (arriba a la derecha): para registrar un ingreso que no viene de rentas ni cobranza. Campos: Empresa, Centro, Fecha, Monto, Concepto, Cliente, Categoría, Forma de cobro y Notas. Luego "Guardar ingreso".
- Si el centro elegido es una obra con cliente (cuenta por cobrar), aparece "Abonar a la cuenta de…": el cobro se guarda como pago de ese cliente, baja su saldo en Obras y cuenta como ingreso de "Obras y construcción". No hay que capturarlo dos veces.
- Para borrar un ingreso capturado a mano: en la lista de ingresos, botón ✕ y confirmar "Eliminar".
`,
  reportes: `
REPORTE MENSUAL (dueño y administración)
- Es el reporte de Torre Elysium: mantenimiento cobrado contra lo que se gastó en el edificio, por mes.
- Se elige el mes y el reporte se arma solo con lo capturado en Cobranza Elysium y en Gastos (centro Torre Elysium).
- El recibo de luz de CFE no entra en los egresos del reporte. Se suman todos los pagos del mes de cada unidad.
- Para sacarlo en PDF: botón "⬇ Descargar PDF" (arriba a la derecha) y en la ventana de impresión elegir "Guardar como PDF".
`,
  gastos: `
GASTOS (dueño, administración y quien captura gastos)
Pantalla:
- Arriba se elige el Mes, el Año y el Centro ("Todos", "Todo <empresa>" o un centro). Luego vienen los totales del mes, "Por categoría", "Por centro" (tocar una barra filtra ese centro) y la tabla de gastos.
- En la tabla se puede buscar por concepto o proveedor y filtrar por categoría y forma de pago. El total de lo filtrado sale abajo.
- Si hay pedidos a proveedores sin pagar, sale arriba el recuadro "Por pagar a proveedores" con el total, cuántos están vencidos (en rojo) y los proveedores principales.
Registrar un gasto:
1. Botón "＋ Nuevo gasto" (arriba a la derecha).
2. "¿Ya se pagó?": "Sí, ya se pagó" (gasto normal) o "No, es un pedido por pagar" (factura o pedido que todavía se debe).
3. Centro (obligatorio), Fecha (si es por pagar dice "Fecha del pedido"), Monto (mayor a cero) y Concepto (obligatorio: en qué se gastó).
4. Proveedor (opcional): al escribirlo sugiere proveedores anteriores y la categoría que se le ha puesto antes.
5. Categoría: debajo dice qué va en cada una. Forma de pago (Transferencia, Efectivo, Tarjeta, Cheque u Otro); si es por pagar, en su lugar aparece "Vence" (fecha límite, opcional).
6. Notas (opcional) y Comprobante: foto o PDF (máximo 10 MB). En el celular abre la cámara.
7. "Guardar gasto".
Categorías: Construcción (material y servicios de obra), Nómina, Seguro social e ISN (IMSS, Infonavit, ISN), Gasolina, Vehículos, Mantenimiento (de edificios), Limpieza, Seguridad, Luz (CFE), Agua, Gas, Teléfono e internet, Administración (oficina, papelería, software, contador, trámites), Impuestos (predial, SAT; no nómina), Intereses y comisiones, Retiro socios (dinero que sacan los socios) y Otros (solo si no cabe en ninguna).
Corregir, borrar, pagar y comprobantes:
- Corregir: botón ✎ "Corregir gasto" en el renglón. Se corrige el mismo registro (no se duplica). Pueden administración y quien captura gastos.
- Borrar: botón ✕. Administración puede borrar cualquiera; quien captura gastos solo los que capturó ella misma. Si sale "solo puedes borrar los gastos que tú capturaste", hay que pedírselo a administración.
- Pagar un pedido: en "Por pagar a proveedores", botón "Pagar" del pedido, poner la fecha de pago y la forma, y "Guardar pago". Es el mismo registro: no se captura otro gasto. En Inicio cuenta en el mes en que se pagó.
- Ver comprobante: botón 📎 del renglón. Para agregar o cambiar el comprobante de un gasto ya capturado: ✎ y subir el archivo (reemplaza al anterior).
- La nómina pagada en Personal crea sola su gasto de "Nómina"; no se captura aparte.
- Hay centros que solo aparecen en Rentas y no en Gastos. Casa y Socios solo los ven dueño, socio y administración.
`,
  cobranza: `
COBRANZA ELYSIUM (dueño, administración y cobranza)
- Cobra mantenimiento y luz por unidad y por mes en Torre Elysium. Pestañas: "Resumen", "🏠 Mantenimiento", "⚡ Luz" y "Deudores". Arriba se elige el mes (botones de meses) y el año.
- Una unidad está pagada en el mes si tiene al menos un pago de ese mes.
- En Mantenimiento o Luz: totales (unidades que pagan, pagaron, pendientes, % de cobranza), filtros "Todas / ✓ Pagadas / ✗ Pendientes" y buscador por unidad u ocupante.
Registrar un pago:
1. Ir a la pestaña del concepto (Mantenimiento o Luz) y al mes.
2. En el renglón de la unidad, botón "＋ Registrar pago" (solo sale si la unidad no ha pagado ese mes).
3. Campos: "Mes que paga", "¿Cuántos meses paga?" (de 1 a 6), "Monto recibido", "Fecha de pago", "Forma de pago" y "Nota" (opcional).
   - El mes que paga sigue a la fecha de pago, salvo que lo cambies a mano. Ejemplo: si hoy paga septiembre atrasado, elige "Septiembre" en "Mes que paga".
   - Si paga varios meses, pon cuántos y el total: se reparte parejo y se guarda un pago por cada mes.
4. "Guardar pago" o "Guardar y ver recibo". El recibo que sale ahí es solo del concepto que se acaba de cobrar.
Otros:
- "Ver" (o "N pagos") muestra los pagos del mes de la unidad. Desde ahí se puede borrar un pago o "＋ Registrar otro pago".
- Botón "Recibo" del renglón: recibo del mes de esa unidad. En "¿Qué recibo?" se elige juntos (mantenimiento + luz) o solo uno; "Recibí de" (a nombre de quién va), Tipo de unidad, Fecha del recibo y Nota. Luego "Ver recibo / PDF", donde están "Descargar PDF" e "Imprimir". Si el navegador bloquea la ventana, hay que permitir ventanas emergentes.
- Cuando el dueño paga mantenimiento y el inquilino paga la luz, se hacen recibos separados con el nombre de cada quien; la plataforma lo recuerda para la próxima vez.
- "＋ Unidad" da de alta una unidad; ✎ en el renglón la edita (Unidad, Tipo, Ocupante / propietario, Cuota y Estado). Cambiar el nombre de la unidad no afecta sus pagos.
- "Deudores": unidades sin pago en el mes elegido, con los meses del año que no tienen ningún pago y el adeudo estimado con la cuota.
`,
  rentas: `
RENTAS (dueño, administración y cobranza)
- Pestañas: "Rentas del mes", "Adeudos", "Historial y recibos" y "Contratos". Las flechas ‹ › y "Hoy" cambian el mes.
- "Rentas del mes": cada contrato activo con su día de pago. Filtros: Todas, Atrasadas, Por vencer, Pendientes y Pagadas. Buscador por arrendatario.
Cobrar una renta:
1. En "Rentas del mes", botón "Cobrar" del contrato (o "＋ Registrar pago" arriba).
2. Campos: Renta (el contrato), "Periodo que paga", Fecha de pago, Monto recibido, Forma de pago y Notas.
   - El periodo sigue a la fecha de pago, salvo que lo cambies. Si paga un mes atrasado, elige ese mes en "Periodo que paga".
3. "Guardar" o "Guardar y ver recibo". El recibo de rentas lleva folio REC-NNNN y se puede descargar en PDF o imprimir.
- "Historial y recibos": pagos anteriores; desde ahí se vuelve a sacar el recibo de un pago o se borra.
- Contratos: "＋ Contrato" o "Editar contrato". Campos: Arrendatario / negocio, Desarrollo, Unidad, Renta mensual, Moneda, Día de pago (1 a 31), Vence el contrato, Teléfono, Correo, Notas y "Activo (se cobra cada mes)". Para dejar de cobrar un contrato, quitarle "Activo".
- Adeudos: "＋ Registrar adeudo" para deudas registradas a mano (Meses de atraso, Monto adeudado, Notas). Para darlo por saldado, dejar meses y monto en 0.
`,
  obras: `
OBRAS (dueño y administración)
- Por cada obra: cuánto vale (lo pactado con el cliente), cuánto se ha cobrado, cuánto ha costado (gastos pagados + pedidos por pagar) y la "Utilidad al terminar" = valor menos lo que lleva costando hoy (bajará con los gastos que falten).
- Los gastos de una obra se capturan en Gastos eligiendo el centro de esa obra.
- Los cobros al cliente de la obra se registran en Inicio con "＋ Ingreso", eligiendo el centro de la obra: se abonan solos a su cuenta.
`,
  prospectos: `
PROSPECTOS (dueño, socio y administración)
- Pestañas: "Prospectos" y "Publicidad".
- Cada prospecto tiene estado: nuevo → calificado o no calificado → cotizado → ganado o perdido. Se cambia con los botones de un toque. "Ganado" pide el monto; "perdido" y "no calificado" piden el motivo (opcional, ayuda a ajustar los anuncios).
- Botón de WhatsApp: abre la plática con el prospecto con un saludo listo y marca la hora de primera respuesta.
- "＋ Prospecto": dar de alta uno a mano (por ejemplo, alguien que escribió por WhatsApp o lo recomendaron). Se guarda como ya contestado.
- El número rojo en el menú son prospectos nuevos con más de una hora sin respuesta.
- Los de la página web y de los anuncios llegan solos, con su origen (Google, Instagram, Facebook, página).
- Publicidad: "＋ Registrar inversión" cada lunes (semana y plataforma Google o Meta, monto). Muestra contactos, calificados, costo por calificado, cotizados, ganados, tiempo de respuesta y motivos de descarte.
- "Importar contactos de Meta": subir el archivo CSV que se descarga del Centro de clientes potenciales de Meta. Descarta pruebas, incompletos y repetidos.
`,
  patrimonio: `
PATRIMONIO (solo dueño y socio)
- Pestañas "🏢 Activos" (inmuebles: valor, renta, contrato) y "💳 Pasivos" (deudas: acreedor, saldo, pago mensual, tasa, vencimiento).
- Se agregan, editan y eliminan con sus botones; solo el dueño y el socio lo ven.
`,
  personal: `
PERSONAL
- Pestañas según el puesto: administración ve "Nómina", "Empleados", "Vacaciones" y "Préstamos"; además todos los que entran a Personal ven "Asistencia", "Tareas", "Rondín" e "Incidencias". Arriba se elige el centro y la fecha (‹ › y "Hoy").
Asistencia:
- Tocar "Entrada" o "Salida" en el momento en que cada quien llega o se va. El retardo y su descuento se calculan solos con su horario. También "Falta" o "Permiso" (permiso no descuenta).
Tareas:
- Lista de tareas del día por persona; se marca "✓ Hecho". "＋ Agregar tarea" agrega una solo para ese día; las tareas fijas de cada día están en la plantilla.
Rondín:
- Recorrer el edificio y marcar a cada persona "✓ Trabajando" o "✕ No la encontré". Se puede marcar varias veces al día. "deshacer" quita la última marca de esa persona.
Incidencias:
- "＋ Reportar algo": qué pasó, con foto opcional. Filtros Abiertas / Resueltas / Todas. "Marcar resuelta" la cierra.
Nómina (administración):
- Se elige la semana. Arriba: total a pagar, ya pagado y por pagar.
- Cada persona aparece en su centro con su sueldo semanal. Debajo están sus días: tocar un día marca o quita una falta (se descuenta un día de sueldo).
- "Pagar" de cada persona (o "Pagar a N pendientes" arriba): revisar Monto, Fecha, Método (forma de pago) y Nota, y "Confirmar pago".
- Cada pago crea solo su gasto de "Nómina" en el centro de la persona. Los retardos se muestran como referencia, no se descuentan solos.
- Para deshacer un pago: ✕ en la tarjeta de la persona (también borra su gasto de Nómina).
Empleados (administración):
- "＋ Empleado" o "Editar": nombre, puesto, centro, sueldo semanal, días que trabaja, horario, tolerancia, fecha de ingreso, seguro social (IMSS, NSS) y si se le paga prima vacacional.
- Para dar de baja a alguien, quitarle "Activo (sale en nómina y asistencia)". No se borra para conservar su historial de nómina.
Vacaciones (administración):
- Por ley (desde 2023): 12 días al cumplir 1 año, +2 por año hasta 20 al 5º, y +2 cada 5 años después. Hay 6 meses después del aniversario para darlas.
- Se muestran en semanas de sueldo y en pesos. La prima vacacional del 25 % solo es para quien la tiene marcada.
- "＋ Registrar": elegir persona y año de servicio, fechas, y si "Las tomó (descansó esos días)" o "Se le pagaron sin descansar".
Préstamos (administración):
- "＋ Préstamo": persona, monto y abono semanal. "＋ Abono" registra lo que va pagando; muestra el saldo.
`,
  usuarios: `
USUARIOS (solo el dueño)
- "＋ Nuevo usuario": nombre, usuario (para entrar sin correo) o correo, perfil y empresas que puede ver. Perfiles: Socio (todo menos usuarios), Captura (gastos y cobranza), Cobranza y rentas, Solo gastos, Encargado de sitio (tareas, rondín, incidencias y asistencia; no ve dinero) y Administración (todo menos Patrimonio y Usuarios).
- Al darlo de alta se genera una contraseña temporal: "Copiar mensaje" y mandárselo. Después de cerrar esa ventana ya no se puede ver la contraseña.
- Nadie puede ver las contraseñas. Si alguien la olvida: "Editar" o "Contraseña" en su renglón y ponerle una nueva (le pedirá cambiarla al entrar).
- Para quitarle el acceso a alguien: botón "Desactivar" en su renglón ("Activar" lo regresa).
`,
  cotizaciones: `
COTIZACIONES
- Partidas con producto, cantidad y precio; calcula IVA 16 %. Estados: borrador, enviada, aceptada o rechazada. Se descarga en PDF.
- Al marcarla aceptada se crea el proyecto con su cliente y se descuenta del inventario.
`,
  inventario: `
INVENTARIO
- Productos con su existencia. La existencia es la suma de movimientos: entrada, salida o ajuste.
`,
  lecturas: `
TOMA DE LECTURAS (luz, gas y agua por medidor)
- Recorrido: escanear el código QR de la placa del medidor con la cámara, escribir la lectura y tomar la foto (obligatoria).
- Avisa si la lectura es menor que la anterior o mucho más alta que el consumo normal (queda "revisar").
`,
  importar: `
IMPORTAR DATOS
- Descargar la plantilla de Excel (Unidades, Inquilinos, Empleados, Medidores), llenarla y subirla. Revisa renglón por renglón y no duplica lo que ya existe.
`,
};
