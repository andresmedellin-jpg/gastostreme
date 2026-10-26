// Datos de ejemplo del demo (empresa distribuidora de válvulas con servicio de mantenimiento e instalación).
// Todo es inventado, se genera igual cada vez (semilla fija) y se acomoda a la fecha de hoy:
// cubre los últimos 6 meses. Lo usa js/demo/supabase-demo.js.
(function () {
  'use strict';
  const COLOR = '#1f4e79';
  const logo = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80">
    <g fill="none" stroke="${COLOR}" stroke-width="7"><circle cx="40" cy="40" r="26"/><path d="M14 40h52M40 14v52" stroke-width="5"/></g>
    <circle cx="40" cy="40" r="9" fill="${COLOR}"/>
    <text x="80" y="52" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" letter-spacing="3" fill="#141414">GALCOR</text>
    <text x="82" y="70" font-family="Arial,Helvetica,sans-serif" font-size="10.5" letter-spacing="2.2" fill="${COLOR}">VÁLVULAS · SERVICIO</text></svg>`);

  const logoInm = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80">
    <rect x="14" y="10" width="22" height="60" fill="${COLOR}"/><rect x="42" y="26" width="22" height="44" fill="${COLOR}" opacity=".6"/>
    <text x="76" y="46" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" letter-spacing="2" fill="#141414">GALCOR</text>
    <text x="78" y="66" font-family="Arial,Helvetica,sans-serif" font-size="11" letter-spacing="2.4" fill="${COLOR}">INMOBILIARIA</text></svg>`);

  // Dos demos: ?demo=galcor (válvulas y servicio, por omisión) y ?demo=inmobiliaria (torres en renta)
  // ?demo=medco: la plataforma de Treme/MEDCO completa con números inventados (usuario "demo" en el acceso)
  const MEDCO = /[?&]demo=medco/i.test(location.search);
  const VARIANTE = /[?&]demo=inmob/i.test(location.search) ? 'inmobiliaria' : 'galcor';
  const INM = VARIANTE === 'inmobiliaria';
  const COLOR_INM = '#2d6a5f';
  const comunes = {
    color: INM ? COLOR_INM : COLOR, color2: INM ? '#22544b' : '#163a5c', colorSuave: INM ? '#e7f2ef' : '#eaf1f8',
    contacto: 'Monterrey, N.L.', demo: true,
  };
  const CATS_BASE = { 'Nómina': '👷', 'Seguro social e ISN': '🏥', 'Luz': '⚡', 'Agua': '💧', 'Teléfono e internet': '📶',
    'Administración': '📋', 'Impuestos': '🧾', 'Publicidad': '📣', 'Intereses y comisiones': '🏦', 'Otros': '📌' };
  const AYUDA_BASE = { 'Nómina': 'Sueldos de todo el personal', 'Seguro social e ISN': 'IMSS, Infonavit e impuesto sobre nómina',
    'Luz': 'Recibos de CFE', 'Agua': 'Agua y Drenaje', 'Teléfono e internet': 'Celulares e internet',
    'Administración': 'Papelería, software, contador, trámites', 'Impuestos': 'Predial y otros impuestos que no son de nómina',
    'Publicidad': 'Google Ads, Meta (Instagram y Facebook), letreros', 'Intereses y comisiones': 'Intereses de créditos y comisiones bancarias',
    'Otros': 'Solo si no cabe en ninguna de las anteriores' };

  window.__MARCA = MEDCO ? {
    demo: true, contacto: 'Monterrey, N.L.', rentaParcial: true, ocupacion: true,
    modulos: ['inicio', 'prospectos', 'cotizaciones', 'inventario', 'obras', 'rentas', 'lecturas', 'servicios', 'gastos', 'patrimonio', 'nomina', 'asistencia',
      'tareas', 'rondin', 'incidencias', 'empleados', 'vacaciones', 'prestamos', 'importar', 'usuarios'],
  } : INM ? {
    ...comunes,
    nombre: 'Inmobiliaria Galcor · Administración',
    marca: ['Galcor', 'Inmobiliaria'],
    logos: [{ src: logoInm.replaceAll(encodeURIComponent(COLOR), encodeURIComponent(COLOR_INM)), alt: 'Inmobiliaria Galcor', clase: 'logo-demo' }],
    modulos: ['inicio', 'prospectos', 'rentas', 'lecturas', 'servicios', 'gastos', 'patrimonio', 'nomina', 'asistencia', 'tareas', 'rondin', 'incidencias', 'empleados', 'vacaciones', 'prestamos', 'importar', 'usuarios'],
    centrosPersonal: ['Torre Cumbres', 'Torre Valle'],
    rentaParcial: true, ocupacion: true,
    reciboEmpresa: 'Inmobiliaria Galcor', reciboLogo: logoInm.replaceAll(encodeURIComponent(COLOR), encodeURIComponent(COLOR_INM)), reciboColor: COLOR_INM,
    centroPersonal: 'Torre Cumbres',
    categorias: { ...CATS_BASE, 'Mantenimiento': '🔧', 'Limpieza': '🧹', 'Seguridad': '🔒' },
    ayuda: { ...AYUDA_BASE, 'Mantenimiento': 'Elevadores, plomería, pintura, jardín, reparaciones de unidades',
      'Limpieza': 'Insumos y servicios de limpieza de las torres', 'Seguridad': 'Vigilancia, cámaras, control de acceso' },
    prospectos: {
      negocio: 'Inmobiliaria Galcor', empresaCorta: 'Inmobiliaria', sitio: 'la página y los anuncios',
      tipos: ['Departamento', 'Oficina', 'Local comercial'], campoTipo: 'Busca', columnaTipo: 'Busca',
      terreno: null, cuando: { ya: 'Este mes', '3_meses': 'En 1 a 2 meses', '6_meses': 'En 3 meses o más', explorando: 'Solo viendo' },
      campoCuando: '¿Para cuándo se muda?', campoM2: 'm² que busca', sufijoM2: 'm²', ubicacionEj: 'Torre Cumbres, Torre Valle…',
      calificadoAyuda: 'tienen presupuesto y fecha para mudarse', seVuelve: 'se vuelva contrato', ganados: 'Contratos firmados',
      montoGanado: 'Renta mensual del contrato', montoEj: 'Ej. 14500', notaGanado: 'Sirve para saber cuánto rentaron los anuncios. Después da de alta el contrato en Rentas.',
      motivos: ['Precio', 'Rentó en otro lado', 'No contestó', 'Lo pospuso', 'No le gustó la unidad'],
      motivosNo: ['Presupuesto bajo', 'Busca en otra zona', 'Solo viendo', 'No tiene aval o fiador', 'Número equivocado'],
      saludo: (n, t) => `Hola ${n}, te escribe Inmobiliaria Galcor. Vimos que te interesa ${t ? (t === 'Oficina' ? 'una oficina' : t === 'Departamento' ? 'un departamento' : 'un local') : 'rentar'} en nuestras torres. ¿Cuándo te gustaría verlo?`,
    },
  } : {
    ...comunes,
    nombre: 'Galcor · Administración',
    marca: ['Galcor'],
    logos: [{ src: logo, alt: 'Galcor', clase: 'logo-demo' }],
    modulos: ['inicio', 'prospectos', 'cotizaciones', 'inventario', 'obras', 'gastos', 'patrimonio', 'nomina', 'asistencia', 'tareas', 'empleados', 'vacaciones', 'prestamos', 'importar', 'usuarios'],
    centrosPersonal: ['Taller de servicio', 'Almacén y ventas', 'Oficina'],
    titulos: { obras: 'Proyectos y servicios' }, palabraObra: ['proyecto', 'proyectos'],
    centroPersonal: 'Taller de servicio',
    categorias: { 'Compra de mercancía': '📦', 'Material y refacciones': '🔩', ...CATS_BASE, 'Viáticos': '🧳', 'Gasolina': '⛽',
      'Vehículos': '🚗', 'Herramienta y equipo': '🧰', 'Fletes y paquetería': '🚚', 'Renta': '🏢' },
    ayuda: { ...AYUDA_BASE, 'Compra de mercancía': 'Válvulas y equipo que se compra para revender (inventario)',
      'Material y refacciones': 'Empaques, kits, tornillería y consumibles para servicios',
      'Viáticos': 'Hotel, comidas y casetas de los técnicos en servicio', 'Gasolina': 'Gasolina y diésel de las unidades',
      'Vehículos': 'Servicio, llantas y refacciones de las unidades', 'Herramienta y equipo': 'Herramienta, equipo de prueba, EPP',
      'Fletes y paquetería': 'Envíos a clientes y fletes de proveedores', 'Renta': 'Renta de almacén y oficina' },
    prospectos: {
      negocio: 'Galcor', empresaCorta: 'Galcor', sitio: 'la página y los anuncios',
      tipos: ['Válvulas (suministro)', 'Mantenimiento de válvulas', 'Instalación o proyecto', 'Refacciones', 'Otro'], campoTipo: 'Necesita', columnaTipo: 'Necesita',
      terreno: null, cuando: { ya: 'Urgente (paro de planta)', '3_meses': 'Este mes', '6_meses': 'Próximos meses', explorando: 'Solo cotizando' },
      campoCuando: '¿Para cuándo?', campoM2: 'Número de válvulas', sufijoM2: 'válvulas', ubicacionEj: 'Planta en Apodaca, Saltillo…',
      calificadoAyuda: 'tienen necesidad real y fecha', seVuelve: 'se vuelva venta', ganados: 'Ventas ganadas',
      montoGanado: 'Monto vendido (sin IVA)', montoEj: 'Ej. 380000', notaGanado: 'Sirve para saber cuánto vendieron los anuncios. Si es proyecto, hazle su cotización.',
      motivos: ['Precio', 'Tiempo de entrega', 'Eligió a otro', 'No contestó', 'Lo pospuso'],
      motivosNo: ['Solo cotizando', 'Marca que no manejamos', 'Fuera de zona', 'Pedido muy chico', 'Número equivocado'],
      saludo: (n, t) => `Hola ${n}, te escribe Galcor. Recibimos tu solicitud${t ? ` de ${t.toLowerCase()}` : ''}. ¿Te puedo marcar para ver modelo, medida y cantidad?`,
    },
  };

  window.__DEMO_DATOS = function () {
    // ---------- utilidades ----------
    let semilla = 20261021;
    const rnd = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const entre = (a, b) => Math.round(a + rnd() * (b - a));
    const elige = (l) => l[Math.floor(rnd() * l.length)];
    let n = 0;
    const id = (p) => `${p}-${String(++n).padStart(5, '0')}-demo`;
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const HOY = new Date(); HOY.setHours(12, 0, 0, 0);
    const hoy = iso(HOY);
    const dias = (k) => { const d = new Date(HOY); d.setDate(d.getDate() + k); return iso(d); };
    const lunes = (f) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
    const sumar = (f, k) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + k); return iso(d); };
    const r2 = (x) => Math.round(x * 100) / 100;
    const ORG = 'org-demo';
    const ADMIN = 'Dirección';

    // ---------- empresa y centros ----------
    const E = { id: 'emp-galcor', org_id: ORG, nombre: 'Galcor S.A. de C.V.', nombre_corto: 'Galcor', rfc: null, color: COLOR, activo: true };
    const C = (nombre, tipo, extra = {}) => ({ id: id('cen'), org_id: ORG, empresa_id: extra.empresa_id || E.id, nombre, tipo, activo: true, en_gastos: true, ...extra });
    const almacen = C('Almacén y ventas', 'bodega'), oficina = C('Oficina', 'oficina'), taller = C('Taller de servicio', 'otro');
    const PROY = [
      { c: C('Línea de vapor · Aceros del Valle', 'obra'), cliente: 'Aceros del Valle', valor: 1240000, cobrado: 0.6, costo: 0.58, inicio: -110, dur: 140 },
      { c: C('Válvulas de control · Petroquímica Laguna Azul', 'obra'), cliente: 'Petroquímica Laguna Azul', valor: 2650000, cobrado: 0.4, costo: 0.52, inicio: -75, dur: 120 },
      { c: C('Válvulas de alivio · Generadora Cerro Alto', 'obra'), cliente: 'Generadora Cerro Alto', valor: 385000, cobrado: 1, costo: 0.61, inicio: -150, dur: 45 },
      { c: C('Actuadores · Alimentos Montesur', 'obra'), cliente: 'Alimentos Montesur', valor: 214000, cobrado: 0.5, costo: 0.47, inicio: -40, dur: 35 },
      { c: C('Mantenimiento anual · Química Santa Rosa', 'obra'), cliente: 'Química Industrial Santa Rosa', valor: 960000, cobrado: 0.25, costo: 0.3, inicio: -25, dur: 365 },
    ];
    // Segunda empresa: inmobiliaria con dos torres (renta de locales, oficinas y departamentos)
    const E2 = { id: 'emp-inmob', org_id: ORG, nombre: 'Inmobiliaria Galcor S.A. de C.V.', nombre_corto: 'Inmobiliaria', rfc: null, color: '#5b7c99', activo: true };
    const torreA = C('Torre Cumbres', 'condominio', { empresa_id: E2.id }), torreB = C('Torre Valle', 'condominio', { empresa_id: E2.id });
    const centros = [almacen, oficina, taller, ...PROY.map((p) => p.c), torreA, torreB];

    // ---------- productos (marca representada: Emerson) ----------
    const P = (clave, categoria, descripcion, linea, medida, clase, costo, margen, minimo, ubic) => ({
      id: id('prd'), org_id: ORG, empresa_id: E.id, clave, categoria, descripcion, marca: 'Emerson · ' + linea, medida, clase,
      unidad: 'pza', costo, precio: Math.round(costo * (margen + 0.22) / 10) * 10, minimo, ubicacion: ubic, activo: true });
    const productos = [
      P('VB-0200-150', 'Válvula de bola', 'Válvula de bola bridada, acero al carbón', 'KTM', '2"', 'Clase 150', 6850, 1.38, 6, 'A-1'),
      P('VB-0300-150', 'Válvula de bola', 'Válvula de bola bridada, acero al carbón', 'KTM', '3"', 'Clase 150', 9900, 1.38, 4, 'A-1'),
      P('VB-0400-300', 'Válvula de bola', 'Válvula de bola bridada, acero inoxidable', 'KTM', '4"', 'Clase 300', 21400, 1.35, 2, 'A-2'),
      P('VB-0100-NPT', 'Válvula de bola', 'Válvula de bola roscada 3 piezas, inoxidable', 'KTM', '1"', 'NPT 1000 WOG', 1980, 1.45, 12, 'A-3'),
      P('VM-0600-LUG', 'Válvula de mariposa', 'Válvula de mariposa tipo lug, disco inoxidable', 'Keystone', '6"', 'Clase 150', 5200, 1.42, 6, 'B-1'),
      P('VM-0800-LUG', 'Válvula de mariposa', 'Válvula de mariposa tipo lug, disco inoxidable', 'Keystone', '8"', 'Clase 150', 7350, 1.42, 4, 'B-1'),
      P('VM-1200-WAF', 'Válvula de mariposa', 'Válvula de mariposa tipo wafer', 'Keystone', '12"', 'Clase 150', 12800, 1.4, 2, 'B-2'),
      P('VC-0200-ET', 'Válvula de globo', 'Válvula de control de globo, cuerpo acero al carbón', 'Fisher', '2"', 'Clase 300', 48500, 1.32, 2, 'C-1'),
      P('VC-0300-ET', 'Válvula de globo', 'Válvula de control de globo, cuerpo acero al carbón', 'Fisher', '3"', 'Clase 300', 66200, 1.3, 1, 'C-1'),
      P('VA-0100-RV', 'Válvula de alivio', 'Válvula de alivio de presión para vapor', 'Crosby', '1" x 2"', 'Set 150 psi', 14300, 1.4, 4, 'C-2'),
      P('VA-0150-RV', 'Válvula de alivio', 'Válvula de alivio de presión para vapor', 'Crosby', '1½" x 2½"', 'Set 250 psi', 19800, 1.4, 3, 'C-2'),
      P('VK-0300-SW', 'Válvula check', 'Válvula check columpio, acero al carbón', 'Yarway', '3"', 'Clase 150', 5600, 1.45, 4, 'D-1'),
      P('VK-0200-WF', 'Válvula check', 'Válvula check doble disco tipo wafer', 'Yarway', '2"', 'Clase 150', 3100, 1.5, 6, 'D-1'),
      P('VG-0400-150', 'Válvula de compuerta', 'Válvula de compuerta bridada, vástago ascendente', 'Vanessa', '4"', 'Clase 150', 11200, 1.38, 3, 'D-2'),
      P('RG-0100-627', 'Regulador', 'Regulador de presión de gas, autooperado', 'Fisher', '1"', '627 · 0-60 psi', 7900, 1.4, 5, 'E-1'),
      P('RG-0200-1098', 'Regulador', 'Regulador de presión piloto-operado', 'Fisher', '2"', '1098 · EGR', 38600, 1.33, 1, 'E-1'),
      P('AC-0063-NEU', 'Actuador', 'Actuador neumático cremallera, doble efecto', 'Bettis', 'Tam. 63', 'Hasta 2"', 6400, 1.45, 4, 'E-2'),
      P('AC-0125-NEU', 'Actuador', 'Actuador neumático cremallera, retorno por resorte', 'Bettis', 'Tam. 125', 'Hasta 6"', 15200, 1.4, 2, 'E-2'),
      P('AC-EL-0300', 'Actuador', 'Actuador eléctrico multivuelta 120 V', 'EIM', '300 Nm', 'NEMA 4X', 32800, 1.35, 1, 'E-3'),
      P('KR-0200-VB', 'Refacción / kit', 'Kit de reparación (asientos y sellos) válvula de bola', 'KTM', '2"', 'PTFE', 980, 1.8, 10, 'F-1'),
      P('KR-0300-VC', 'Refacción / kit', 'Kit de empaques para válvula de control', 'Fisher', '3"', 'Grafito', 2650, 1.7, 6, 'F-1'),
      P('PS-DVC-6200', 'Refacción / kit', 'Posicionador digital para válvula de control', 'Fisher', 'DVC6200', 'HART', 41500, 1.3, 1, 'F-2'),
    ];
    const pid = (clave) => productos.find((p) => p.clave === clave).id;
    const existe = (clave) => inventario_movs.filter((m) => m.producto_id === pid(clave)).reduce((t, m) => t + (m.tipo === 'salida' ? -m.cantidad : m.cantidad), 0);

    // ---------- movimientos de inventario ----------
    const inventario_movs = [];
    const mov = (fecha, clave, tipo, cantidad, extra = {}) => inventario_movs.push({ id: id('mov'), org_id: ORG, producto_id: pid(clave), fecha, tipo, cantidad,
      costo_unitario: productos.find((p) => p.clave === clave).costo, capturado_por: ADMIN, creado_en: fecha + 'T15:00:00Z', ...extra });
    const inicio = dias(-185);
    const inicial = { 'VB-0200-150': 18, 'VB-0300-150': 10, 'VB-0400-300': 4, 'VB-0100-NPT': 40, 'VM-0600-LUG': 14, 'VM-0800-LUG': 9, 'VM-1200-WAF': 4,
      'VC-0200-ET': 4, 'VC-0300-ET': 2, 'VA-0100-RV': 9, 'VA-0150-RV': 6, 'VK-0300-SW': 10, 'VK-0200-WF': 16, 'VG-0400-150': 6, 'RG-0100-627': 14,
      'RG-0200-1098': 2, 'AC-0063-NEU': 12, 'AC-0125-NEU': 5, 'AC-EL-0300': 2, 'KR-0200-VB': 30, 'KR-0300-VC': 12, 'PS-DVC-6200': 3 };
    Object.entries(inicial).forEach(([k, q]) => mov(inicio, k, 'entrada', q, { referencia: 'Inventario inicial (conteo físico)' }));

    // ---------- clientes de mostrador ----------
    const CLIENTES = ['Mantenimiento Industrial Regio', 'Procesos Térmicos del Norte', 'Ingeniería Hidráulica Saltillo', 'Plásticos Cumbres',
      'Embotelladora Sierra Madre', 'Papelera San Nicolás', 'Vidrios Técnicos de Apodaca', 'Gas Industrial Escobedo', 'Textiles La Silla', 'Fundición Topo Chico'];

    // Resurtidos (compras a la marca) para que el inventario no se acabe; algunos quedan bajo el mínimo a propósito
    const gastos = [];
    const G = (fecha, centro, monto, concepto, proveedor, categoria, extra = {}) => gastos.push({ id: id('gas'), org_id: ORG, empresa_id: centro.empresa_id, centro_id: centro.id,
      fecha, monto: r2(monto), moneda: 'MXN', concepto, proveedor, categoria, forma_pago: extra.estado === 'por_pagar' ? null : (extra.forma_pago || 'Transferencia'),
      estado: 'pagado', capturado_por: ADMIN, creado_en: fecha + 'T17:00:00Z', ...extra });
    const resurtir = (k, claves, estado) => {
      const f = dias(k); let total = 0;
      claves.forEach(([c, q]) => { mov(f, c, 'entrada', q, { referencia: 'Compra a Emerson · OC-' + (2400 + inventario_movs.length) }); total += q * productos.find((p) => p.clave === c).costo; });
      G(f, almacen, total * 1.16, `Compra de mercancía (${claves.length} partidas) · OC-${2400 + inventario_movs.length}`, 'Emerson', 'Compra de mercancía',
        estado ? { estado: 'por_pagar', fecha_vencimiento: sumar(f, 30), notas: 'Crédito a 30 días' } : {});
    };

    // ---------- proyectos: cuenta por cobrar, cobros, material de inventario y gastos ----------
    const cuentas_por_cobrar = [], pagos = [];
    const materialDe = [
      [['VA-0100-RV', 6], ['VA-0150-RV', 4], ['KR-0300-VC', 4]],
      [['VC-0200-ET', 3], ['VC-0300-ET', 1], ['PS-DVC-6200', 2], ['AC-0125-NEU', 3], ['KR-0300-VC', 3]],
      [['VA-0100-RV', 5], ['VA-0150-RV', 2]],
      [['AC-0063-NEU', 4], ['AC-EL-0300', 1], ['KR-0200-VB', 6]],
      [['VB-0200-150', 6], ['VM-0800-LUG', 4], ['KR-0200-VB', 10], ['VK-0300-SW', 3]],
    ];
    PROY.forEach((p, i) => {
      const f0 = dias(p.inicio);
      const cxc = { id: id('cxc'), org_id: ORG, empresa_id: E.id, centro_id: p.c.id, tipo: 'venta', cliente: p.cliente, referencia: 'COT-' + String(3 + i * 2).padStart(4, '0'),
        monto_original: p.valor, moneda: 'MXN', fecha_origen: f0, notas: p.c.nombre.split(' · ')[0], creado_en: f0 + 'T12:00:00Z' };
      cuentas_por_cobrar.push(cxc);
      // cobros: anticipo 30-50 % y estimaciones
      let falta = p.valor * p.cobrado, k = p.inicio + 2, num = 0;
      while (falta > 1 && k <= 0) {
        const m = num === 0 ? Math.min(falta, p.valor * (p.cobrado >= 0.5 ? 0.4 : p.cobrado)) : Math.min(falta, p.valor * 0.2);
        pagos.push({ id: id('pag'), org_id: ORG, empresa_id: E.id, centro_id: p.c.id, cxc_id: cxc.id, concepto: 'venta', monto: r2(m), fecha: dias(k),
          forma_pago: 'Transferencia', notas: num === 0 ? 'Anticipo' : 'Estimación ' + num, capturado_por: ADMIN, creado_en: dias(k) + 'T16:00:00Z' });
        falta -= m; num++; k += entre(18, 30);
      }
      // Las válvulas del proyecto se compran para él: entran al almacén y salen al proyecto; su compra es costo del proyecto
      const oc = 'OC-' + (2300 + i);
      materialDe[i].forEach(([c, q], j) => {
        mov(dias(p.inicio + 3), c, 'entrada', q, { referencia: 'Compra a Emerson · ' + oc + ' (' + p.cliente + ')' });
        mov(dias(p.inicio + 5 + j * 6), c, 'salida', q, { centro_id: p.c.id, referencia: cxc.referencia + ' · ' + p.cliente });
      });
      const meta = p.valor * p.costo;
      const material = materialDe[i].reduce((s, [c, q]) => s + q * productos.find((x) => x.clave === c).costo, 0) * 1.16;
      let gastado = material;
      G(dias(p.inicio + 3), p.c, material, `Válvulas para el proyecto (${materialDe[i].length} partidas) · ${oc}`, 'Emerson', 'Compra de mercancía');
      const CONCEPTOS = [['Hospedaje y comidas de cuadrilla', 'Hotel Ejecutivo Industrial', 'Viáticos', 6000, 22000],
        ['Empaques, espárragos y tornillería', 'Tornillería y Sellos del Norte', 'Material y refacciones', 4000, 28000],
        ['Renta de grúa y maniobras', 'Grúas Industriales Monterrey', 'Herramienta y equipo', 9000, 42000],
        ['Pruebas hidrostáticas y calibración', 'Laboratorio de Metrología Regio', 'Material y refacciones', 6000, 26000],
        ['Diésel camioneta de servicio', 'Gasolinera', 'Gasolina', 1500, 4500],
        ['Flete de válvulas a planta', 'Fletes Rápidos del Norte', 'Fletes y paquetería', 2500, 9000]];
      let k2 = p.inicio + 3;
      while (gastado < meta * 0.62 && k2 <= Math.min(0, p.inicio + p.dur)) {
        const [c, prov, cat, a, b] = elige(CONCEPTOS); const m = entre(a, b * (p.valor > 1e6 ? 1.6 : 1));
        G(dias(k2), p.c, m, c, prov, cat, { forma_pago: elige(['Transferencia', 'Tarjeta', 'Transferencia']) });
        gastado += m; k2 += entre(2, 6);
      }
      if (i === 1) G(dias(-4), p.c, 86400, 'Servicio de maquinado de bridas', 'Maquinados de Precisión Apodaca', 'Material y refacciones',
        { estado: 'por_pagar', fecha_vencimiento: dias(11), notas: 'Factura a 15 días' });
    });

    // ---------- ventas de mostrador día por día, con resurtido quincenal a la marca ----------
    // Lo comprado en los últimos 30 días queda "por pagar" (crédito a 30 días con la marca).
    const ingresos = [];
    const VENDIBLES = [['VB-0200-150', 4], ['VB-0100-NPT', 10], ['VM-0600-LUG', 4], ['VK-0200-WF', 6], ['RG-0100-627', 3], ['AC-0063-NEU', 3],
      ['KR-0200-VB', 10], ['VB-0300-150', 3], ['VK-0300-SW', 2], ['VA-0100-RV', 2], ['VM-0800-LUG', 2], ['VC-0200-ET', 1], ['VA-0150-RV', 1],
      ['VG-0400-150', 2], ['AC-0125-NEU', 2], ['VB-0400-300', 1], ['KR-0300-VC', 3], ['RG-0200-1098', 1]];
    const NO_RESURTIR_YA = ['VA-0100-RV', 'VK-0300-SW', 'VM-0600-LUG'];   // quedan bajo el mínimo para que se vea la alerta
    for (let k = -178; k <= 0; k++) {
      const f = dias(k), d = new Date(f + 'T12:00:00'), dw = d.getDay();
      if ([1, 15].includes(d.getDate())) {
        const compra = [];
        VENDIBLES.forEach(([c]) => {
          const p = productos.find((x) => x.clave === c), meta = Math.max(3, Math.round(p.minimo * 2.2)), hay = existe(c);
          if (hay <= p.minimo && !(k > -25 && NO_RESURTIR_YA.includes(c))) compra.push([c, meta - hay]);
        });
        if (compra.length) {
          const oc = 'OC-' + (2400 + inventario_movs.length);
          let total = 0;
          compra.forEach(([c, q]) => { mov(f, c, 'entrada', q, { referencia: 'Compra a Emerson · ' + oc }); total += q * productos.find((p) => p.clave === c).costo; });
          G(f, almacen, total * 1.16, `Compra de mercancía (${compra.length} partidas) · ${oc}`, 'Emerson', 'Compra de mercancía',
            k > -30 ? { estado: 'por_pagar', fecha_vencimiento: sumar(f, 30), notas: 'Crédito a 30 días' } : {});
        }
      }
      if (dw === 0 || dw === 6 || rnd() > 0.75) continue;
      const cliente = elige(CLIENTES), lineas = entre(1, 4);
      let total = 0; const desc = [];
      for (let j = 0; j < lineas; j++) {
        const [clave, maxq] = elige(VENDIBLES), p = productos.find((x) => x.clave === clave), q = entre(1, maxq);
        if (existe(clave) - q < 1) continue;                          // no vender lo que no hay
        total += q * p.precio; desc.push(`${q} × ${p.clave}`);
        mov(f, clave, 'salida', q, { referencia: 'Venta · ' + cliente });
      }
      if (!total) continue;
      ingresos.push({ id: id('ing'), org_id: ORG, empresa_id: E.id, centro_id: almacen.id, fecha: f, monto: r2(total * 1.16), concepto: 'Venta de mostrador: ' + desc.join(', '),
        cliente, categoria: 'Venta', forma_pago: elige(['Transferencia', 'Transferencia', 'Transferencia', 'Depósito']), capturado_por: ADMIN, creado_en: f + 'T18:00:00Z' });
    }

    // ---------- personal ----------
    const EMP = [
      ['Raúl Garza Treviño', 'Supervisor de servicio', taller, 9800, '2016-03-14', true],
      ['Jesús Alberto Rocha', 'Técnico de válvulas', taller, 6200, '2019-08-05', false],
      ['Óscar Villarreal Díaz', 'Técnico de válvulas', taller, 6200, '2021-01-18', false],
      ['Luis Ángel Cantú', 'Técnico de válvulas', taller, 5800, '2023-06-12', false],
      ['Eduardo Salinas Pérez', 'Técnico en instrumentación', taller, 7400, '2020-10-01', false],
      ['Mario Hernández Leal', 'Ayudante técnico', taller, 3900, '2024-02-19', false],
      ['Kevin Alejandro Ruiz', 'Ayudante técnico', taller, 3800, '2025-05-05', false],
      ['José Luis Martínez', 'Soldador', taller, 6600, '2018-04-23', false],
      ['Ricardo Elizondo', 'Almacenista', almacen, 4600, '2017-09-11', false],
      ['Diana Lizeth Treviño', 'Ejecutiva de ventas', almacen, 7800, '2022-03-07', true],
      ['Alejandro Ibarra Saldaña', 'Ingeniero de ventas', almacen, 9500, '2015-07-20', true],
      ['Patricia Garza Molina', 'Administración y cobranza', oficina, 7200, '2014-01-13', true],
      ['Sofía Medina Castillo', 'Auxiliar contable', oficina, 5200, '2024-09-02', false],
      ['Fernando Cavazos', 'Chofer / mensajero', oficina, 4200, '2021-11-29', false],
      ['Rosa María Quiroga', 'Administradora de torres', torreA, 6800, '2013-05-06', true],
      ['Juan Carlos Benavides', 'Vigilante', torreA, 3900, '2020-02-10', false],
      ['Arturo Sepúlveda', 'Vigilante', torreA, 3900, '2023-08-21', false],
      ['Gilberto Ramos', 'Vigilante', torreB, 3900, '2022-04-04', false],
      ['Maribel Castañeda', 'Limpieza', torreA, 3300, '2019-10-14', false],
      ['Leticia Guerra', 'Limpieza', torreA, 3300, '2025-01-20', false],
      ['Héctor Barrientos', 'Mantenimiento de torres', torreA, 5200, '2017-06-12', false],
    ];
    const empleados = EMP.map(([nombre, puesto, c, sueldo, ingreso, prima]) => ({ id: id('emp'), org_id: ORG, empresa_id: c.empresa_id, centro_id: c.id, nombre, puesto,
      departamento: null, salario_semanal: sueldo, dias_semana: c === oficina ? 5 : 6, hora_entrada: c === taller ? '07:30:00' : '08:30:00',
      hora_salida: c === taller ? '17:30:00' : '18:00:00', tolerancia_min: 10, dias_laborales: c === oficina ? 'LUN,MAR,MIE,JUE,VIE' : 'LUN,MAR,MIE,JUE,VIE,SAB',
      fecha_ingreso: ingreso, activo: true, imss: true, nss: null, nombre_imss: null, alta_imss: ingreso, prima_vacacional: prima }));

    // Nómina pagada de las últimas 26 semanas (la actual queda pendiente) + su gasto, repartido por centro.
    // Los técnicos se cargan al proyecto donde andaban esa semana.
    const nomina_periodos = [], nomina_lineas = [], asistencia = [];
    const lunesHoy = lunes(hoy);
    for (let w = 26; w >= 1; w--) {
      const sem = sumar(lunesHoy, -7 * w), pago = sumar(sem, 5);
      const pers = {};
      [E, E2].forEach((x) => { pers[x.id] = { id: id('per'), org_id: ORG, empresa_id: x.id, fecha_inicio: sem, fecha_pago: pago, estado: 'pagada', creado_en: pago + 'T20:00:00Z' };
        nomina_periodos.push(pers[x.id]); });
      const activos = PROY.filter((p) => sem >= dias(p.inicio) && sem <= dias(p.inicio + p.dur));
      empleados.forEach((e) => {
        let falta = rnd() < 0.05 ? 1 : 0;
        const monto = r2(e.salario_semanal - falta * e.salario_semanal / e.dias_semana);
        const destino = e.centro_id === taller.id && activos.length && rnd() < 0.55 ? elige(activos).c : centros.find((c) => c.id === e.centro_id);
        const gid = id('gas');
        gastos.push({ id: gid, org_id: ORG, empresa_id: destino.empresa_id, centro_id: destino.id, fecha: pago, monto, moneda: 'MXN', concepto: 'Nómina — ' + e.nombre,
          proveedor: e.nombre, categoria: 'Nómina', forma_pago: 'Transferencia', estado: 'pagado', notas: 'Semana del ' + sem.split('-').reverse().join('/'),
          capturado_por: ADMIN, creado_en: pago + 'T20:00:00Z' });
        nomina_lineas.push({ id: id('lin'), org_id: ORG, periodo_id: pers[e.empresa_id].id, empleado_id: e.id, centro_id: e.centro_id, dias_trabajados: e.dias_semana - falta,
          sueldo: monto, extras: 0, descuentos: 0, abono_prestamo: 0, total: monto, forma_pago: 'Transferencia', notas: null, fecha: pago, gasto_id: gid });
        if (falta) asistencia.push({ id: id('asi'), org_id: ORG, empleado_id: e.id, fecha: sumar(sem, entre(0, 4)), estado: 'falta', minutos_tarde: 0,
          minutos_salida_temprano: 0, monto_descuento: Math.round(e.salario_semanal / e.dias_semana), horas_descontadas: 9, registrado_por: ADMIN });
      });
    }
    // Asistencia de esta semana hasta hoy: casi todos a tiempo, un par de retardos y una falta
    for (let d = 0; sumar(lunesHoy, d) <= hoy && d < 6; d++) {
      const f = sumar(lunesHoy, d);
      empleados.forEach((e, i) => {
        if (d >= e.dias_semana) return;
        if (f === hoy && i % 3 === 0) return;                // hoy todavía no checan todos
        const tarde = (i + d) % 9 === 4 ? entre(15, 40) : 0;
        if (i === 6 && d === 1) {
          asistencia.push({ id: id('asi'), org_id: ORG, empleado_id: e.id, fecha: f, estado: 'falta', minutos_tarde: 0, minutos_salida_temprano: 0,
            monto_descuento: Math.round(e.salario_semanal / e.dias_semana), horas_descontadas: 10, registrado_por: ADMIN });
          return;
        }
        const [h, m] = e.hora_entrada.split(':').map(Number);
        const ent = new Date(f + 'T00:00:00'); ent.setHours(h, m + tarde - entre(0, 8), 0, 0);
        const tarifa = e.salario_semanal / e.dias_semana / 10;
        asistencia.push({ id: id('asi'), org_id: ORG, empleado_id: e.id, fecha: f, estado: tarde > 10 ? 'retardo' : 'presente',
          hora_entrada: ent.toISOString(), hora_salida: f < hoy ? new Date(ent.getTime() + 10 * 3600e3).toISOString() : null,
          minutos_tarde: tarde > 10 ? tarde - 10 : 0, minutos_salida_temprano: 0, horas_descontadas: tarde > 10 ? (tarde - 10) / 60 : 0,
          monto_descuento: tarde > 10 ? Math.round((tarde - 10) / 60 * tarifa) : 0, registrado_por: 'Raúl Garza Treviño' });
      });
    }

    // ---------- inmobiliaria: unidades, contratos, rentas cobradas y gastos de las torres ----------
    const unidades = [], contratos = [];
    const U = (centro, identificador, tipo, m2) => { const u = { id: id('uni'), org_id: ORG, centro_id: centro.id, identificador, tipo, superficie_m2: m2, exento: false, activo: true };
      unidades.push(u); return u; };
    for (let k = 1; k <= 8; k++) U(torreA, 'Local ' + String(k).padStart(2, '0'), 'local', entre(45, 140));
    for (let k = 1; k <= 12; k++) U(torreA, 'Oficina ' + (200 + k), 'oficina', entre(40, 95));
    for (let piso = 3; piso <= 12; piso++) for (let k = 1; k <= 8; k++) U(torreA, 'Depto ' + (piso * 100 + k), 'depto', k <= 2 ? 120 : k <= 6 ? 85 : 62);
    for (let piso = 1; piso <= 3; piso++) for (let k = 1; k <= 4; k++) U(torreB, 'Oficina ' + (piso * 100 + k), 'oficina', entre(55, 110));

    const NOMBRES = ['Alejandra', 'Roberto', 'Mariana', 'Luis', 'Fernanda', 'Jorge', 'Paola', 'Ricardo', 'Daniela', 'Carlos', 'Sofía', 'Miguel', 'Andrea',
      'Eduardo', 'Valeria', 'Sergio', 'Gabriela', 'Héctor', 'Lorena', 'Arturo', 'Karla', 'Raúl', 'Mónica', 'Óscar', 'Claudia', 'Javier', 'Ximena', 'Rodrigo'];
    const APELLIDOS = ['González', 'Garza', 'Treviño', 'Martínez', 'Rodríguez', 'Villarreal', 'Cantú', 'Hernández', 'Salinas', 'Elizondo', 'Leal', 'Flores',
      'Cavazos', 'Zambrano', 'Sada', 'Montemayor', 'Chapa', 'Rocha', 'Benavides', 'Lozano', 'Guajardo', 'Ayala', 'De la Garza', 'Medina'];
    const NEGOCIOS = ['Farmacia del Barrio', 'Café Cumbres', 'Lavandería Express', 'Tienda de conveniencia 24h', 'Estética Bella Vista',
      'Consultorio Dental Sonrisa', 'Papelería y Copias', 'Taquería El Fogón'];
    const EMPRESAS_OF = ['Despacho Fiscal Garza', 'Ingeniería Montemayor', 'Seguros del Norte Agentes', 'Consultores en Logística', 'Arquitectura Sada Leal',
      'Agencia Digital Norte', 'Notaría 140 (anexo)', 'Bufete Jurídico Zambrano', 'Clínica de Terapia Física', 'Inmobiliaria Rocha Agentes',
      'Corredores Industriales', 'Laboratorio de Software Regio', 'Contadores Asociados Leal', 'Despacho de Diseño Ayala'];
    const persona = () => `${elige(NOMBRES)} ${elige(APELLIDOS)} ${elige(APELLIDOS)}`;
    const telefono = () => '81 ' + entre(1000, 9999) + ' ' + entre(1000, 9999);
    // ocupación: departamentos casi llenos, locales 6 de 8, oficinas bajas
    const libres = new Set();
    const elegirLibres = (lista, n) => { const l = [...lista]; for (let k = 0; k < n; k++) { const j = Math.floor(rnd() * l.length); libres.add(l.splice(j, 1)[0].id); } };
    elegirLibres(unidades.filter((u) => u.centro_id === torreA.id && u.tipo === 'depto'), 6);
    elegirLibres(unidades.filter((u) => u.centro_id === torreA.id && u.tipo === 'local'), 2);
    elegirLibres(unidades.filter((u) => u.centro_id === torreA.id && u.tipo === 'oficina'), 5);
    elegirLibres(unidades.filter((u) => u.centro_id === torreB.id), 7);
    let neg = 0, ofi = 0;
    const contrato = (u, inicio, activo, extra = {}) => {
      const tipo = u.tipo, piso = Math.floor(Number(u.identificador.replace(/\D/g, '')) / 100);
      const monto = tipo === 'depto' ? Math.round((u.superficie_m2 * 150 + piso * 250 + entre(-500, 800)) / 100) * 100
        : tipo === 'local' ? Math.round(u.superficie_m2 * 330 / 100) * 100 : Math.round((u.superficie_m2 * (u.centro_id === torreB.id ? 145 : 165)) / 100) * 100;
      const nombre = tipo === 'depto' ? persona() : tipo === 'local' ? NEGOCIOS[neg++ % NEGOCIOS.length] : EMPRESAS_OF[ofi++ % EMPRESAS_OF.length];
      const c = { id: id('con'), org_id: ORG, unidad_id: u.id, centro_id: u.centro_id, arrendatario: nombre, monto, moneda: 'MXN',
        dia_pago: elige([1, 1, 1, 5, 5, 10, 15]), fecha_inicio: inicio, fecha_fin: (() => { let fn = sumar(inicio, 365); while (activo && fn <= hoy) fn = sumar(fn, 365); return fn; })(), ajuste_inpc: false, telefono: telefono(), email: null,
        notas: null, activo, creado_en: inicio + 'T12:00:00Z', ...extra };
      contratos.push(c); return c;
    };
    unidades.forEach((u) => {
      if (libres.has(u.id)) {
        // algunas disponibles tuvieron inquilino que se fue hace poco (movimiento)
        if (u.tipo === 'depto' || rnd() < 0.3) contrato(u, dias(-entre(300, 700)), false, { notas: 'Desocupó el ' + dias(-entre(20, 120)).split('-').reverse().join('/') });
        return;
      }
      const nuevo = u.tipo === 'depto' ? rnd() < 0.14 : rnd() < 0.05;     // los departamentos rotan más
      contrato(u, nuevo ? dias(-entre(15, 150)) : dias(-entre(160, 900)), true);
    });
    // contratos que vencen pronto (para que se vea el aviso)
    contratos.filter((c) => c.activo).slice(0, 5).forEach((c, k) => { c.fecha_fin = dias(entre(10, 80)); });

    // Pagos de renta de los últimos 6 meses: la mayoría completos; algunos en abonos (no traían completo) y unos cuantos atrasados
    let folio = 0;
    const FORMAS_R = ['Efectivo', 'Efectivo', 'Transferencia', 'Transferencia', 'Depósito'];
    const morosos = new Set(contratos.filter((c) => c.activo).filter(() => rnd() < 0.06).map((c) => c.id));
    contratos.forEach((c) => {
      for (let mm = 5; mm >= 0; mm--) {
        const d0 = new Date(HOY.getFullYear(), HOY.getMonth() - mm, 1, 12), per = iso(d0);
        const ini = c.fecha_inicio.slice(0, 7), fin = c.activo ? '9999' : (c.notas || '').replace(/^Desocupó el (\d\d)\/(\d\d)\/(\d{4})$/, '$3-$2');
        if (per.slice(0, 7) < ini || per.slice(0, 7) > fin) continue;
        const fpago = (k) => { const x = new Date(d0); x.setDate(Math.min(28, c.dia_pago + k)); return iso(x); };
        const esActual = mm === 0;
        if (esActual && fpago(0) > hoy) { if (rnd() < 0.35) pagoR(c, per, c.monto, fpago(-entre(1, 3)) <= hoy ? fpago(-entre(1, 3)) : hoy); continue; }
        if (morosos.has(c.id) && mm <= 1) continue;                                   // no han pagado los últimos meses
        const suerte = rnd();
        if (suerte < 0.12) {                                                          // abonos: no traía completo
          const primero = Math.round(c.monto * elige([0.5, 0.6, 0.7]) / 100) * 100;
          pagoR(c, per, primero, fpago(entre(0, 3)), 'Abono · no traía completo');
          if (!(esActual || (mm === 1 && rnd() < 0.5))) pagoR(c, per, c.monto - primero, fpago(entre(8, 14)) <= hoy ? fpago(entre(8, 14)) : hoy, 'Resto del mes');
        } else if (suerte < 0.2 && esActual) {
          // todavía no paga este mes (atrasado)
        } else {
          pagoR(c, per, c.monto, fpago(entre(-2, 4)) <= hoy ? fpago(entre(-2, 4)) : hoy);
        }
      }
    });
    function pagoR(c, per, monto, fecha, notas = null) {
      pagos.push({ id: id('pag'), org_id: ORG, empresa_id: E2.id, centro_id: c.centro_id, unidad_id: c.unidad_id, contrato_id: c.id, concepto: 'renta',
        periodo: per, monto, moneda: 'MXN', forma_pago: elige(FORMAS_R), fecha, folio: 'REC-' + String(++folio).padStart(4, '0'), notas,
        capturado_por: 'Rosa María Quiroga', creado_en: fecha + 'T17:00:00Z' });
    }
    // adeudos anotados a mano (lo que ya se sabía que debían)
    [...morosos].slice(0, 3).forEach((cid) => { const c = contratos.find((x) => x.id === cid);
      cuentas_por_cobrar.push({ id: id('cxc'), org_id: ORG, empresa_id: E2.id, centro_id: c.centro_id, contrato_id: c.id, tipo: 'adeudo_inicial',
        cliente: c.arrendatario, meses: 2, monto_original: c.monto * 2, moneda: 'MXN', notas: 'Promete ponerse al corriente', creado_en: dias(-20) + 'T12:00:00Z' }); });

    // Gastos de las torres
    for (let mmes = 5; mmes >= 0; mmes--) {
      const d = new Date(HOY.getFullYear(), HOY.getMonth() - mmes, 1, 12);
      const f = (dd) => { const x = new Date(d); x.setDate(dd); return iso(x) <= hoy ? iso(x) : null; };
      [[f(6), torreA, entre(21000, 27000), 'Luz de áreas comunes y elevadores', 'CFE', 'Luz'],
       [f(6), torreB, entre(6000, 8200), 'Luz de áreas comunes', 'CFE', 'Luz'],
       [f(9), torreA, entre(5200, 7400), 'Agua de áreas comunes', 'Agua y Drenaje', 'Agua'],
       [f(11), torreA, 9800, 'Mantenimiento mensual de elevadores', 'Elevadores del Norte', 'Mantenimiento'],
       [f(11), torreB, 4900, 'Mantenimiento mensual de elevador', 'Elevadores del Norte', 'Mantenimiento'],
       [f(14), torreA, entre(3500, 5500), 'Insumos de limpieza', 'Distribuidora de Limpieza Regia', 'Limpieza'],
       [f(16), torreA, 3200, 'Monitoreo de cámaras y control de acceso', 'Seguridad Electrónica Cumbres', 'Seguridad'],
       [f(19), torreA, entre(2500, 14000), elige(['Plomería en depto', 'Pintura de pasillos', 'Reparación de bomba de agua', 'Cambio de luminarias', 'Impermeabilización parcial']), 'Mantenimiento varios', 'Mantenimiento'],
       [f(23), torreB, entre(1500, 6000), elige(['Reparación de clima en oficina', 'Cerrajería', 'Jardinería']), 'Mantenimiento varios', 'Mantenimiento'],
       [f(25), torreA, entre(1200, 2400), 'Comisiones por depósitos en efectivo', 'Banco', 'Intereses y comisiones'],
       [f(3), torreA, 318000, 'Crédito de la torre: intereses del mes', 'Banco', 'Intereses y comisiones'],
       [f(4), torreA, 17800, 'Seguro de daños de las torres', 'Aseguradora', 'Administración'],
       [f(20), torreA, entre(0, 1) ? entre(35000, 110000) : 0, elige(['Mantenimiento mayor a bombas y cisterna', 'Pintura de fachada (avance)', 'Remodelación de depto desocupado', 'Cambio de cerraduras y portón']), 'Contratistas varios', 'Mantenimiento'],
      ].forEach(([fe, c, m, con, prov, cat]) => { if (fe && m) G(fe, c, m, con, prov, cat, { capturado_por: 'Rosa María Quiroga' }); });
    }
    G(dias(-140), torreA, 86500, 'Predial anual Torre Cumbres', 'Tesorería Municipal', 'Impuestos');
    G(dias(-140), torreB, 21400, 'Predial anual Torre Valle', 'Tesorería Municipal', 'Impuestos');

    // ---------- gastos fijos mensuales ----------
    for (let mmes = 5; mmes >= 0; mmes--) {
      const d = new Date(HOY.getFullYear(), HOY.getMonth() - mmes, 1, 12);
      const f = (dd) => { const x = new Date(d); x.setDate(dd); return iso(x) <= hoy ? iso(x) : null; };
      const fijos = [
        [f(2), almacen, 38000, 'Renta de almacén y oficina', 'Inmobiliaria Parque Apodaca', 'Renta'],
        [f(8), oficina, entre(4200, 6100), 'Recibo de luz', 'CFE', 'Luz'],
        [f(10), oficina, 3480, 'Celulares e internet', 'Telcel', 'Teléfono e internet'],
        [f(17), oficina, entre(38000, 41000), 'Cuotas IMSS, Infonavit e ISN', 'IMSS', 'Seguro social e ISN'],
        [f(5), oficina, 9500, 'Honorarios contables', 'Despacho Contable Garza & Asociados', 'Administración'],
        [f(12), taller, entre(9000, 14000), 'Gasolina unidades de servicio', 'Gasolinera', 'Gasolina'],
        [f(20), taller, entre(2500, 9000), 'Servicio a camioneta de servicio', 'Servicio Automotriz Universidad', 'Vehículos'],
        [f(25), almacen, entre(3000, 7000), 'Paquetería a clientes', 'Paquetería Express', 'Fletes y paquetería'],
        [f(26), oficina, entre(600, 1400), 'Comisiones bancarias', 'Banco', 'Intereses y comisiones'],
      ];
      fijos.forEach(([fe, c, m, con, prov, cat]) => { if (fe) G(fe, c, m, con, prov, cat, { forma_pago: cat === 'Gasolina' ? 'Tarjeta' : 'Transferencia' }); });
    }

    // ---------- cotizaciones ----------
    const part = (clave, q) => { const p = productos.find((x) => x.clave === clave);
      return { producto_id: p.id, clave, descripcion: `${p.descripcion} ${p.medida} ${p.clase} · ${p.marca}`, unidad: 'pza', cantidad: q, precio: p.precio }; };
    const mo = (descripcion, precio, cantidad = 1) => ({ producto_id: null, descripcion, unidad: 'servicio', cantidad, precio });
    const COND = 'Precios en pesos mexicanos más IVA. Tiempo de entrega sujeto a existencias. Anticipo del 50 % para iniciar.';
    const cots = [
      [-112, 'aceptada', PROY[0].cliente, 'Mantenimiento a línea de vapor (válvulas de alivio y control)', [part('VA-0100-RV', 6), part('VA-0150-RV', 4), part('KR-0300-VC', 4), mo('Mano de obra: desmontaje, calibración y montaje de válvulas', 640000), mo('Pruebas en banco y certificados', 85000)], PROY[0].c.id],
      [-96, 'rechazada', 'Embotelladora Sierra Madre', 'Sustitución de válvulas de mariposa en línea de jarabe', [part('VM-0600-LUG', 8), part('AC-0063-NEU', 8), mo('Instalación y puesta en marcha', 58000)]],
      [-78, 'aceptada', PROY[1].cliente, 'Suministro e instalación de válvulas de control', [part('VC-0200-ET', 3), part('VC-0300-ET', 1), part('PS-DVC-6200', 2), part('AC-0125-NEU', 3), mo('Ingeniería y dimensionamiento', 180000), mo('Instalación, calibración y lazo de control', 1450000)], PROY[1].c.id],
      [-60, 'aceptada', PROY[3].cliente, 'Reparación de actuadores y automatización de 4 válvulas', [part('AC-0063-NEU', 4), part('AC-EL-0300', 1), part('KR-0200-VB', 6), mo('Mano de obra de reparación', 46000)], PROY[3].c.id],
      [-44, 'rechazada', 'Papelera San Nicolás', 'Válvulas de bola para línea de pasta', [part('VB-0300-150', 6), part('VB-0200-150', 10)]],
      [-30, 'aceptada', PROY[4].cliente, 'Contrato de mantenimiento anual a 48 válvulas', [part('VB-0200-150', 6), part('VM-0800-LUG', 4), part('KR-0200-VB', 10), part('VK-0300-SW', 3), mo('Mantenimiento preventivo mensual (12 visitas)', 52000, 12)], PROY[4].c.id],
      [-21, 'enviada', 'Gas Industrial Escobedo', 'Reguladores de presión para estación de medición', [part('RG-0200-1098', 2), part('RG-0100-627', 6), mo('Instalación y ajuste', 38000)]],
      [-14, 'enviada', 'Fundición Topo Chico', 'Válvulas de alivio y check para caldera 2', [part('VA-0150-RV', 3), part('VK-0300-SW', 4), part('VG-0400-150', 2), mo('Servicio de instalación con paro programado', 64000)]],
      [-9, 'enviada', 'Procesos Térmicos del Norte', 'Válvulas de bola inoxidable', [part('VB-0400-300', 4), part('VB-0100-NPT', 20)]],
      [-5, 'enviada', 'Vidrios Técnicos de Apodaca', 'Diagnóstico y reparación de válvulas de control', [part('KR-0300-VC', 4), part('PS-DVC-6200', 1), mo('Diagnóstico en sitio', 18500), mo('Reparación en taller por válvula', 22000, 4)]],
      [-2, 'borrador', 'Textiles La Silla', 'Mariposas tipo wafer para agua helada', [part('VM-1200-WAF', 6), part('AC-0125-NEU', 6), mo('Instalación', 72000)]],
      [0, 'borrador', 'Plásticos Cumbres', 'Kits de reparación y servicio', [part('KR-0200-VB', 16), mo('Servicio de reparación en planta', 26000)]],
    ];
    const cotizaciones = cots.map(([k, estado, cliente, titulo, partidas, centro_id], i) => {
      const sub = partidas.reduce((s, x) => s + x.cantidad * x.precio, 0);
      return { id: id('cot'), org_id: ORG, empresa_id: E.id, folio: 'COT-' + String(i + 1).padStart(4, '0'), fecha: dias(k), vigencia_dias: 15, estado, cliente,
        contacto: elige(['Ing. Carlos Treviño', 'Ing. Mónica Leal', 'Lic. Roberto Garza', 'Ing. Daniela Ochoa', 'Ing. Héctor Salinas']), correo: null,
        titulo, partidas, condiciones: COND, centro_id: centro_id || null, total: r2(sub * 1.16), capturado_por: ADMIN, creado_en: dias(k) + 'T15:00:00Z' };
    });
    // El valor de cada proyecto = su cotización aceptada
    cotizaciones.filter((c) => c.centro_id).forEach((c) => { const x = cuentas_por_cobrar.find((y) => y.centro_id === c.centro_id); x.monto_original = c.total; x.referencia = c.folio; });

    // ---------- vacaciones y préstamos ----------
    const emp = (nom) => empleados.find((e) => e.nombre.startsWith(nom));
    const vacaciones = [
      { id: id('vac'), org_id: ORG, empleado_id: emp('Patricia').id, periodo: 12, tipo: 'disfrutadas', dias: 10, fecha_inicio: dias(-120), fecha_fin: dias(-108), monto: null, prima: null },
      { id: id('vac'), org_id: ORG, empleado_id: emp('Raúl').id, periodo: 10, tipo: 'pagadas', dias: 12, fecha_inicio: dias(-60), fecha_fin: dias(-60), monto: 19600, prima: 4900 },
      { id: id('vac'), org_id: ORG, empleado_id: emp('José Luis').id, periodo: 8, tipo: 'disfrutadas', dias: 6, fecha_inicio: dias(-35), fecha_fin: dias(-29), monto: null, prima: null },
    ];
    const prestamos = [
      { id: id('pre'), org_id: ORG, empleado_id: emp('Mario').id, monto: 6000, abono_semanal: 500, fecha: dias(-63), notas: 'Para reparación de su carro', liquidado: false },
      { id: id('pre'), org_id: ORG, empleado_id: emp('Óscar').id, monto: 4000, abono_semanal: 500, fecha: dias(-100), notas: null, liquidado: true },
    ];
    const prestamo_abonos = [];
    for (let k = 1; k <= 8; k++) prestamo_abonos.push({ id: id('abo'), org_id: ORG, prestamo_id: prestamos[1].id, monto: 500, fecha: dias(-100 + k * 7) });
    for (let k = 1; k <= 8; k++) prestamo_abonos.push({ id: id('abo'), org_id: ORG, prestamo_id: prestamos[0].id, monto: 500, fecha: dias(-63 + k * 7) });

    const tareas_plantilla = [
      ['Revisar y cargar herramienta de la camioneta', 'Herramienta'], ['Orden y limpieza del taller', 'Limpieza'],
      ['Reporte fotográfico del servicio del día', 'Servicio'], ['Revisión de EPP de la cuadrilla', 'Seguridad'],
    ].map(([tarea, categoria]) => ({ id: id('tpl'), org_id: ORG, centro_id: taller.id, empleado_id: null, puesto: null, tarea, categoria, frecuencia: 'diaria', dia_semana: null, activo: true }));

    vacaciones.push({ id: id('vac'), org_id: ORG, empleado_id: emp('Rosa María').id, periodo: 13, tipo: 'pagadas', dias: 12, fecha_inicio: dias(-75), fecha_fin: dias(-75), monto: 13600, prima: 3400 });
    const preT = { id: id('pre'), org_id: ORG, empleado_id: emp('Arturo').id, monto: 3000, abono_semanal: 500, fecha: dias(-28), notas: 'Útiles escolares', liquidado: false };
    prestamos.push(preT);
    for (let k = 1; k <= 3; k++) prestamo_abonos.push({ id: id('abo'), org_id: ORG, prestamo_id: preT.id, monto: 500, fecha: dias(-28 + k * 7) });

    // ---------- prospectos y publicidad (lo invertido en Google y Meta cada semana y lo que trajo) ----------
    const prospectos = [], inversion_publicidad = [];
    const hora = (f, h, m) => { const d = new Date(f + 'T00:00:00'); d.setHours(h, m, 0, 0); return d; };
    const tel = () => '81' + entre(10000000, 99999999);
    const genProspectos = (empresa, cfg) => {
      for (let w = 12; w >= 0; w--) {
        const lun = sumar(lunesHoy, -7 * w);
        const parcial = w === 0 ? Math.min(1, ((new Date(hoy + 'T12:00:00') - new Date(lun + 'T12:00:00')) / 864e5 + 1) / 7) : 1;
        ['google', 'meta'].forEach((pl) => {
          const monto = Math.round(cfg.inv[pl] * (0.85 + rnd() * 0.3));
          if (w > 0) inversion_publicidad.push({ id: id('inv'), org_id: ORG, empresa_id: empresa.id, semana: lun, plataforma: pl, monto, notas: null, creado_en: lun + 'T15:00:00Z' });
        });
        const llegan = [...Array(Math.round(entre(...cfg.leads.google) * parcial)).fill('google'), ...Array(Math.round(entre(...cfg.leads.meta) * parcial)).fill(null).map(() => elige(['instagram', 'facebook', 'instagram'])),
          ...Array(Math.round(entre(...cfg.leads.org) * parcial)).fill(null).map(() => elige(cfg.organicos))];
        llegan.forEach((origen) => {
          let f = sumar(lun, entre(0, 6)); if (f > hoy) f = hoy;
          const cuando = hora(f, entre(8, 20), entre(0, 59));
          if (cuando > new Date()) cuando.setTime(Date.now() - entre(10, 300) * 60000);
          const tipo = elige(cfg.tipos), nombre = `${elige(NOMBRES)} ${elige(APELLIDOS)}`;
          const califP = origen === 'google' ? cfg.calif.google : ['instagram', 'facebook'].includes(origen) ? cfg.calif.meta : cfg.calif.org;
          const edad = (Date.now() - cuando.getTime()) / 864e5;
          let est = 'nuevo', motivo = null, monto = null;
          if (edad > 0.6) {
            if (rnd() < califP) {
              est = 'calificado';
              if (edad > 3 && rnd() < 0.6) { est = 'cotizado';
                if (edad > 8) { const r = rnd(); if (r < cfg.cierre) { est = 'ganado'; monto = cfg.monto(tipo); } else if (r < cfg.cierre + 0.35) { est = 'perdido'; motivo = elige(cfg.motivos); } } }
            } else { est = 'no_calificado'; motivo = elige(cfg.motivosNo); }
          }
          const contesta = est === 'nuevo' && edad < 0.6 && rnd() < 0.5 ? null : new Date(cuando.getTime() + (rnd() < 0.7 ? entre(4, 55) : entre(70, 600)) * 60000);
          prospectos.push({ id: id('pro'), org_id: ORG, empresa_id: empresa.id, creado_en: cuando.toISOString(), actualizado_en: cuando.toISOString(),
            nombre, empresa: cfg.empresaDe ? cfg.empresaDe(tipo) : null, whatsapp: tel(), correo: null, tipo_obra: tipo, m2: cfg.m2(tipo),
            tiene_terreno: null, cuando: est === 'no_calificado' ? 'explorando' : elige(['ya', 'ya', '3_meses', '6_meses']), ubicacion: cfg.ubicacion(tipo),
            mensaje: elige(cfg.mensajes(tipo)), origen, campana: origen === 'google' ? cfg.campanaG : ['instagram', 'facebook'].includes(origen) ? cfg.campanaM : null,
            utm_source: origen === 'google' ? 'google' : ['instagram', 'facebook'].includes(origen) ? origen : null, utm_medium: null, utm_campaign: null,
            utm_term: origen === 'google' ? elige(cfg.busquedas) : null, gclid: null, fbclid: null, pagina: null,
            estado: est, motivo, monto, primera_respuesta: contesta && contesta.getTime() < Date.now() ? contesta.toISOString() : null, atendido_por: null,
            notas: null, calificado_en: ['calificado', 'cotizado', 'ganado'].includes(est) || (est === 'perdido') ? new Date(cuando.getTime() + 864e5).toISOString() : null, externo_id: null });
        });
      }
      // que el mes en curso ya traiga ventas cerradas gracias a los anuncios (al menos 3)
      const mesHoy = hoy.slice(0, 7);
      const delMes = prospectos.filter((p) => p.empresa_id === empresa.id && p.creado_en.slice(0, 7) === mesHoy);
      const faltan = 3 - delMes.filter((p) => p.estado === 'ganado').length;
      delMes.filter((p) => ['cotizado', 'calificado'].includes(p.estado) && p.origen !== 'whatsapp' && (Date.now() - new Date(p.creado_en)) > 3 * 864e5)
        .slice(0, Math.max(0, faltan)).forEach((p) => { p.estado = 'ganado'; p.monto = cfg.monto(p.tipo_obra); p.calificado_en ||= p.creado_en; });
      // lo invertido también es gasto (categoría Publicidad), un cargo por mes y plataforma
      const porMes = {};
      inversion_publicidad.filter((r) => r.empresa_id === empresa.id).forEach((r) => { const k = r.semana.slice(0, 7) + '|' + r.plataforma; porMes[k] = (porMes[k] || 0) + r.monto; });
      Object.entries(porMes).forEach(([k, m]) => { const [mes, pl] = k.split('|'); let f = mes + '-28'; if (f > hoy) f = hoy;
        G(f, cfg.centroGasto, m, pl === 'google' ? 'Anuncios Google Ads' : 'Anuncios Instagram y Facebook', pl === 'google' ? 'Google' : 'Meta', 'Publicidad', { forma_pago: 'Tarjeta' }); });
    };
    genProspectos(E, {
      inv: { google: 2600, meta: 1500 }, leads: { google: [3, 6], meta: [3, 6], org: [1, 3] }, organicos: ['web', 'whatsapp', 'recomendacion'],
      calif: { google: 0.62, meta: 0.45, org: 0.7 }, cierre: 0.35,
      tipos: ['Válvulas (suministro)', 'Válvulas (suministro)', 'Mantenimiento de válvulas', 'Instalación o proyecto', 'Refacciones'],
      monto: (t) => t === 'Instalación o proyecto' ? entre(18, 120) * 10000 : t === 'Mantenimiento de válvulas' ? entre(8, 45) * 10000 : entre(3, 28) * 10000,
      m2: (t) => entre(2, t === 'Refacciones' ? 10 : 30), ubicacion: () => elige(['Apodaca', 'Escobedo', 'Santa Catarina', 'Guadalupe', 'Saltillo', 'Ramos Arizpe', 'Pesquería']),
      empresaDe: () => elige(['Planta de alimentos', 'Acerera', 'Química', 'Embotelladora', 'Generadora', 'Cementera', 'Papelera']) + ' ' + elige(['del Norte', 'Regia', 'Industrial', 'del Valle']),
      mensajes: (t) => [`Necesito cotización de ${t.toLowerCase()}, ¿manejan Fisher?`, 'Tenemos paro programado en noviembre, ocupamos revisar válvulas de alivio',
        '¿Tienen en existencia válvulas de bola de 2" clase 150?', 'Buscamos proveedor de mantenimiento para válvulas de control', 'Me urge un regulador de presión para gas'],
      motivos: ['Precio', 'Tiempo de entrega', 'Eligió a otro', 'No contestó', 'Lo pospuso'],
      motivosNo: ['Solo cotizando', 'Marca que no manejamos', 'Fuera de zona', 'Pedido muy chico', 'Número equivocado'],
      campanaG: 'Válvulas Emerson Monterrey', campanaM: 'Servicio de válvulas', busquedas: ['valvulas emerson monterrey', 'mantenimiento de valvulas', 'valvula de alivio vapor', 'distribuidor fisher mexico'],
      centroGasto: oficina,
    });
    genProspectos(E2, {
      inv: { google: 1700, meta: 2300 }, leads: { google: [2, 5], meta: [6, 11], org: [1, 3] }, organicos: ['whatsapp', 'recomendacion', 'otro', 'web'],
      calif: { google: 0.65, meta: 0.5, org: 0.7 }, cierre: 0.45,
      tipos: ['Departamento', 'Departamento', 'Departamento', 'Oficina', 'Local comercial'],
      monto: (t) => t === 'Departamento' ? entre(120, 190) * 100 : t === 'Oficina' ? entre(80, 160) * 100 : entre(180, 450) * 100,
      m2: (t) => t === 'Departamento' ? elige([62, 85, 120]) : t === 'Oficina' ? entre(40, 95) : entre(45, 140),
      ubicacion: (t) => t === 'Oficina' ? elige(['Torre Cumbres', 'Torre Valle']) : 'Torre Cumbres',
      mensajes: (t) => [`¿Tienen ${t.toLowerCase()} disponible?`, '¿Cuánto es la renta y qué piden de requisitos?', '¿Aceptan mascotas?',
        '¿Puedo ir a verlo este sábado?', 'Busco algo para entrar el próximo mes'],
      motivos: ['Precio', 'Rentó en otro lado', 'No contestó', 'Lo pospuso', 'No le gustó la unidad'],
      motivosNo: ['Presupuesto bajo', 'Busca en otra zona', 'Solo viendo', 'No tiene aval o fiador', 'Número equivocado'],
      campanaG: 'Renta deptos Cumbres', campanaM: 'Deptos y oficinas en renta', busquedas: ['departamentos en renta cumbres', 'renta de oficinas monterrey', 'local comercial renta'],
      centroGasto: torreA,
    });

    // ---------- tareas del día, rondines e incidencias ----------
    const tareas = [];
    const TPL = [
      [torreA, 'Limpieza', ['Barrer y trapear el lobby', 'Limpiar elevadores y espejos', 'Sacar la basura de todos los pisos', 'Limpiar vidrios del acceso'], 'Limpieza'],
      [torreA, 'Vigilante', ['Revisar cámaras al iniciar turno', 'Anotar visitas y paqueterías en bitácora', 'Recorrido de estacionamiento y azotea'], 'Seguridad'],
      [torreA, 'Mantenimiento de torres', ['Revisar bomba y nivel de cisterna', 'Revisar luminarias de pasillos', 'Atender reportes de inquilinos'], 'Mantenimiento'],
      [torreB, 'Vigilante', ['Revisar cámaras al iniciar turno', 'Anotar visitas en bitácora', 'Recorrido de estacionamiento'], 'Seguridad'],
      [taller, 'Técnico', ['Revisar y cargar herramienta de la camioneta', 'Reporte fotográfico del servicio del día'], 'Servicio'],
      [taller, 'Ayudante', ['Orden y limpieza del taller', 'Inventario de consumibles (empaques, tornillería)'], 'Limpieza'],
      [taller, 'Supervisor', ['Revisión de EPP de la cuadrilla', 'Confirmar servicios del día con clientes'], 'Seguridad'],
    ];
    const tplRows = [];
    TPL.forEach(([c, puesto, lista, cat]) => lista.forEach((t) => tplRows.push({ id: id('tpl'), org_id: ORG, centro_id: c.id, empleado_id: null, puesto, tarea: t, categoria: cat, frecuencia: 'diaria', dia_semana: null, activo: true })));
    tareas_plantilla.length = 0; tareas_plantilla.push(...tplRows);
    const empDe = (c) => empleados.filter((e) => e.centro_id === c.id);
    for (let k = -3; k <= 0; k++) {
      const f = dias(k);
      if (new Date(f + 'T12:00:00').getDay() === 0) continue;
      tplRows.forEach((p) => empDe(centros.find((c) => c.id === p.centro_id)).filter((e) => e.puesto.toLowerCase().includes(p.puesto.toLowerCase()) || p.puesto.toLowerCase().includes(e.puesto.toLowerCase())).forEach((e) => {
        if (k === 0 && rnd() < 0.45) return;                       // hoy van a medias
        const ok = rnd() < 0.9;
        const h = hora(f, entre(8, 17), entre(0, 59));
        if (h > new Date()) return;
        tareas.push({ id: id('tar'), org_id: ORG, centro_id: p.centro_id, plantilla_id: p.id, empleado_id: e.id, fecha: f, tipo: 'tarea', tarea: p.tarea,
          categoria: p.categoria, estado: ok ? 'hecho' : 'no_hecho', hora_registro: h.toISOString(), registrado_por: e.nombre, creado_en: h.toISOString() });
      }));
      // rondín de la administradora / supervisor: verifica a cada quien un par de veces al día
      [torreA, torreB].forEach((c) => empDe(c).filter((e) => !/administradora/i.test(e.puesto)).forEach((e) => {
        [10, 16].forEach((hh) => { const h = hora(f, hh, entre(0, 50)); if (h > new Date()) return;
          tareas.push({ id: id('ron'), org_id: ORG, centro_id: c.id, empleado_id: e.id, fecha: f, tipo: 'rondin', tarea: 'Verificación de rondín', categoria: 'Rondín',
            estado: rnd() < 0.92 ? 'hecho' : 'no_hecho', hora_registro: h.toISOString(), registrado_por: 'Rosa María Quiroga', creado_en: h.toISOString() }); });
      }));
    }
    const INC = [
      [torreA, -1, 'Fuga de agua en baño del depto 704', 'Falla de mantenimiento', 'grave', 'Se cerró la llave de paso; plomero viene mañana', false],
      [torreA, -2, 'Elevador 2 hace ruido al subir', 'Falla de mantenimiento', 'leve', 'Se reportó a Elevadores del Norte', false],
      [torreA, -4, 'Portón del estacionamiento no cierra', 'Falla de mantenimiento', 'grave', null, true],
      [torreA, -6, 'Vigilante del turno nocturno dormido', 'Uso indebido de horario', 'grave', 'Se habló con él; primera llamada de atención', true],
      [torreA, -3, 'Inquilino del 1003 se queja de ruido del 1103', 'Otro', 'leve', 'Se le avisó al inquilino del 1103', false],
      [torreB, -5, 'Lámpara fundida en pasillo del piso 2', 'Falla de mantenimiento', 'leve', null, true],
      [taller, -2, 'Camioneta 2 con llanta baja', 'Falla de mantenimiento', 'leve', null, false],
      [taller, -8, 'Faltó equipo de protección en servicio de Aceros del Valle', 'Otro', 'grave', 'Se compraron 4 arneses nuevos', true],
    ];
    INC.forEach(([c, k, t, cat, sev, notas, ok]) => { const h = hora(dias(k), entre(9, 18), entre(0, 59));
      tareas.push({ id: id('inc'), org_id: ORG, centro_id: c.id, empleado_id: null, fecha: dias(k), tipo: 'incidencia', tarea: t, categoria: cat, severidad: sev,
        notas, estado: ok ? 'hecho' : 'pendiente', resuelto_en: ok ? new Date(h.getTime() + 864e5).toISOString() : null, registrado_por: ADMIN, creado_en: h.toISOString() }); });

    // ---------- patrimonio ----------
    const activos = [
      { empresa_id: E2.id, codigo: 'INM-01', entidad_legal: E2.nombre, tipo_unidad: 'Edificio', identificador: 'Torre Cumbres', direccion: 'Av. Cumbres 1500', ciudad: 'Monterrey',
        superficie_m2: 14800, valor_comercial: 385000000, moneda: 'MXN', fecha_valuacion: 'Avalúo 2025', costo_adquisicion: 210000000, fecha_adquisicion: '2016-03-01', uso_actual: 'Departamentos, oficinas y locales en renta' },
      { empresa_id: E2.id, codigo: 'INM-02', entidad_legal: E2.nombre, tipo_unidad: 'Edificio', identificador: 'Torre Valle', direccion: 'Calz. del Valle 320', ciudad: 'San Pedro Garza García',
        superficie_m2: 2900, valor_comercial: 92000000, moneda: 'MXN', fecha_valuacion: 'Avalúo 2025', costo_adquisicion: 61000000, fecha_adquisicion: '2019-08-15', uso_actual: 'Oficinas en renta' },
      { empresa_id: E2.id, codigo: 'INM-03', entidad_legal: E2.nombre, tipo_unidad: 'Terreno', identificador: 'Terreno junto a Torre Cumbres', direccion: 'Av. Cumbres 1520', ciudad: 'Monterrey',
        superficie_m2: 1800, valor_comercial: 18500000, moneda: 'MXN', fecha_valuacion: 'Estimado', costo_adquisicion: 9800000, fecha_adquisicion: '2021-02-10', uso_actual: 'Estacionamiento de visitas' },
      { empresa_id: E.id, codigo: 'GAL-01', entidad_legal: E.nombre, tipo_unidad: 'Terreno', identificador: 'Lote industrial Apodaca', direccion: 'Parque Industrial Apodaca', ciudad: 'Apodaca',
        superficie_m2: 3200, valor_comercial: 14500000, moneda: 'MXN', fecha_valuacion: 'Estimado', costo_adquisicion: 8200000, fecha_adquisicion: '2022-06-01', uso_actual: 'Para la bodega propia (hoy se renta una)' },
      { empresa_id: E.id, codigo: 'GAL-02', entidad_legal: E.nombre, tipo_unidad: 'Vehículo', identificador: '3 camionetas de servicio', ciudad: 'Monterrey',
        valor_comercial: 2100000, moneda: 'MXN', fecha_valuacion: 'Libro azul', costo_adquisicion: 2650000, fecha_adquisicion: '2023-01-15', uso_actual: 'Cuadrillas de servicio' },
      { empresa_id: E.id, codigo: 'GAL-03', entidad_legal: E.nombre, tipo_unidad: 'Equipo', identificador: 'Banco de pruebas de válvulas', ciudad: 'Monterrey',
        valor_comercial: 1350000, moneda: 'MXN', fecha_valuacion: 'Factura', costo_adquisicion: 1600000, fecha_adquisicion: '2020-09-01', uso_actual: 'Calibración y certificación' },
    ].map((a) => ({ id: id('act'), org_id: ORG, centro_id: null, unidad_id: null, clave_catastral: null, renta_mercado_estimada: null, notas: null,
      inquilino: null, ingreso_mensual: a.identificador === 'Torre Cumbres' ? 1285000 : a.identificador === 'Torre Valle' ? 190000 : null, fecha_vencimiento_contrato: null, ...a }));
    const pasivos = [
      { empresa_id: E2.id, acreedor: 'Banco del Norte', tipo_pasivo: 'Hipoteca', saldo_actual: 33200000, tasa_interes: 11.5, pago_mensual: 520000, fecha_inicio: '2018-05-01', fecha_vencimiento: '2033-05-01', activo_ref: 'Torre Cumbres', garantia: 'Torre Cumbres' },
      { empresa_id: E2.id, acreedor: 'Banco del Norte', tipo_pasivo: 'Línea de crédito', saldo_actual: 2400000, tasa_interes: 13.2, pago_mensual: 85000, fecha_inicio: '2025-01-15', fecha_vencimiento: '2027-01-15', activo_ref: 'Remodelación de departamentos', garantia: null },
      { empresa_id: E.id, acreedor: 'Emerson (crédito comercial)', tipo_pasivo: 'Proveedor a largo plazo', saldo_actual: 907000, tasa_interes: 0, pago_mensual: null, fecha_inicio: null, fecha_vencimiento: null, activo_ref: 'Compras de mercancía a 30 días', garantia: null },
      { empresa_id: E.id, acreedor: 'Financiera Automotriz', tipo_pasivo: 'Crédito simple', saldo_actual: 980000, tasa_interes: 14.9, pago_mensual: 58000, fecha_inicio: '2023-01-15', fecha_vencimiento: '2027-01-15', activo_ref: '3 camionetas de servicio', garantia: 'Las camionetas' },
    ].map((p) => ({ id: id('pas'), org_id: ORG, activo_id: null, fecha_saldo: hoy, moneda: 'MXN', notas: null, ...p }));

    // ---------- usuarios con acceso (ejemplo) ----------
    const miembros = [{ org_id: ORG, user_id: 'demo-usuario', nombre: ADMIN, usuario: 'direccion', rol: 'dueno', roles: [], empresas: null, activo: true, debe_cambiar_password: false, creado_en: '2026-01-05T12:00:00Z' },
      ...(INM ? [['Rosa María Quiroga', 'rosa', 'administracion', []], ['Lupita Cantú', 'lupita', 'cobranza', []], ['Juan Carlos Benavides', 'juancarlos', 'encargado', []]]
        : [['Patricia Garza Molina', 'patricia', 'administracion', []], ['Diana Treviño', 'diana', 'cobranza', ['operacion']], ['Raúl Garza Treviño', 'raul', 'encargado', []], ['Ricardo Elizondo', 'ricardo', 'operacion', []]])
        .map(([nombre, usuario, rol, roles], k) => ({ org_id: ORG, user_id: 'demo-u' + k, nombre, usuario, rol, roles, empresas: null, activo: true, debe_cambiar_password: false,
          creado_en: '2026-02-1' + k + 'T12:00:00Z', ultimo_acceso: new Date(Date.now() - entre(1, 48) * 3600e3).toISOString() }))];

    // ---------- lecturas de luz, gas y agua (Torre Cumbres y Torre Valle) ----------
    // Aleatorio propio, para no mover el resto de los datos del demo
    let sem2 = 777; const rm2 = () => ((sem2 = (sem2 * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const em2 = (a, b) => Math.round(a + rm2() * (b - a));
    const medidores = [], lecturas = [], recibos_servicio = [], tarifas_servicio = [];
    const ZONA = { luz: 'Cuarto de medidores (sótano)', gas: 'Fila de gas (estacionamiento)', agua: 'Cuarto de bombas' };
    const PER = []; for (let k = 4; k >= 0; k--) { const d = new Date(HOY); d.setDate(1); d.setMonth(d.getMonth() - k); PER.push(iso(d).slice(0, 7) + '-01'); }
    const ocupada = new Set(contratos.filter((c) => c.activo).map((c) => c.unidad_id));
    const BASE = { luz: { depto: 260, oficina: 420, local: 900 }, gas: { depto: 16 }, agua: { depto: 13, oficina: 6, local: 9 } };
    const fotoDe = (v) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#d9d6cf"/><rect x="60" y="100" width="360" height="90" rx="6" fill="#141414"/>${[...String(Math.round(v)).padStart(6, '0')].map((d, i) => `<text x="${95 + i * 58}" y="163" fill="#f5f5f0" font-family="monospace" font-size="50" text-anchor="middle">${d}</text>`).join('')}<text x="240" y="240" fill="#555" font-family="Arial" font-size="18" text-anchor="middle">foto de ejemplo</text></svg>`);
    for (const torre of [torreA, torreB]) {
      const orden = { luz: 0, gas: 0, agua: 0 };
      unidades.filter((u) => u.centro_id === torre.id).forEach((u) => {
        for (const sv of ['luz', 'gas', 'agua']) {
          const base = BASE[sv][u.tipo]; if (!base) continue;
          const med = { id: id('med'), org_id: ORG, centro_id: torre.id, unidad_id: u.id, servicio: sv, serie: `${sv[0].toUpperCase()}${em2(1000000, 9999999)}`,
            zona: ZONA[sv], orden: ++orden[sv], lectura_inicial: em2(1500, 60000), activo: true };
          medidores.push(med);
          const prom = ocupada.has(u.id) ? base * (0.6 + rm2() * 0.8) : base * 0.05;
          let v = med.lectura_inicial;
          PER.forEach((pe, k) => {
            const actual = k === PER.length - 1;
            if (actual && rm2() < 0.14) return;                        // faltan algunas este mes
            let c = Math.max(0, Math.round(prom * (0.85 + rm2() * 0.3)));
            let est = actual ? 'ok' : 'aprobada';
            if (actual && rm2() < 0.025) { c = Math.round(prom * 3.1) + 5; est = 'revisar'; }
            v += c;
            lecturas.push({ id: id('lec'), org_id: ORG, centro_id: torre.id, medidor_id: med.id, periodo: pe, lectura: v,
              fecha: pe.slice(0, 8) + String(em2(2, 5)).padStart(2, '0'), estado: est, foto_path: actual || k === PER.length - 2 ? fotoDe(v) : null,
              capturado_por: 'Juan Carlos Benavides', nota: null });
          });
        }
      });
      // Recibos de las compañías: lo de los medidores + áreas comunes; el gas del mes actual no cuadra
      PER.forEach((pe, k) => {
        for (const sv of ['luz', 'gas', 'agua']) {
          const ms = medidores.filter((m) => m.centro_id === torre.id && m.servicio === sv); if (!ms.length) continue;
          let suma = 0;
          ms.forEach((m) => { const ls = lecturas.filter((l) => l.medidor_id === m.id).sort((a, b) => a.periodo.localeCompare(b.periodo));
            const i = ls.findIndex((l) => l.periodo === pe); const ant = i > 0 ? ls[i - 1].lectura : i === 0 ? m.lectura_inicial : null;
            if (i >= 0) suma += ls[i].lectura - ant; else { const s0 = ls.length > 1 ? (ls[ls.length - 1].lectura - ls[0].lectura) / (ls.length - 1) : 0; suma += s0; } });
          const factor = sv === 'gas' && k === PER.length - 1 ? 1.24 : sv === 'luz' ? 1.07 : 1.05;
          const consumo = Math.round(suma * factor);
          const precio = { luz: 3.05, gas: 13.8, agua: 29.5 }[sv];
          recibos_servicio.push({ id: id('rsv'), org_id: ORG, centro_id: torre.id, servicio: sv, periodo: pe,
            compania: { luz: 'CFE', gas: 'Naturgy', agua: 'Agua y Drenaje de Monterrey' }[sv], consumo, monto: Math.round(consumo * precio * (0.95 + rm2() * 0.1)) });
        }
      });
      tarifas_servicio.push({ id: id('tar'), org_id: ORG, centro_id: torre.id, servicio: 'luz', modo: 'prorrateo', precio: 0, cargo_fijo: 0 },
        { id: id('tar'), org_id: ORG, centro_id: torre.id, servicio: 'gas', modo: 'tarifa', precio: 14.5, cargo_fijo: 0 },
        { id: id('tar'), org_id: ORG, centro_id: torre.id, servicio: 'agua', modo: 'tarifa', precio: 31.5, cargo_fijo: 45 });
    }

    const todoJunto = {
      organizaciones: [{ id: ORG, nombre: 'Galcor', plan: 'demo' }],
      miembros,
      empresas: [E, E2], centros, productos, inventario_movs, ingresos, gastos, cuentas_por_cobrar, pagos, empleados,
      nomina_periodos, nomina_lineas, asistencia, vacaciones, prestamos, prestamo_abonos, tareas_plantilla, tareas,
      cotizaciones, contratos, unidades, cuotas: [], medidores, lecturas, recibos_servicio, tarifas_servicio, activos, pasivos, tipo_cambio: [], prospectos, inversion_publicidad,
    };
    if (MEDCO) {            // las dos empresas juntas, con los nombres de Treme y MEDCO
      E.nombre = 'Desarrollos y Proyectos MEDCO'; E.nombre_corto = 'MEDCO';
      E2.nombre = 'Grupo Inmobiliario Treme'; E2.nombre_corto = 'Treme';
      todoJunto.organizaciones[0].nombre = 'Treme / MEDCO';
      return todoJunto;
    }
    // Cada demo lleva solo su empresa
    const SOLO = INM ? E2.id : E.id, D = todoJunto;
    const porEmp = (l) => l.filter((r) => r.empresa_id === SOLO);
    D.empresas = D.empresas.filter((e) => e.id === SOLO); D.centros = porEmp(D.centros);
    const cen = new Set(D.centros.map((c) => c.id));
    ['gastos', 'ingresos', 'pagos', 'cuentas_por_cobrar', 'empleados', 'nomina_periodos', 'productos', 'cotizaciones', 'prospectos', 'inversion_publicidad', 'activos', 'pasivos']
      .forEach((t) => { D[t] = porEmp(D[t]); });
    ['unidades', 'contratos', 'tareas_plantilla', 'tareas', 'medidores', 'lecturas', 'recibos_servicio', 'tarifas_servicio'].forEach((t) => { D[t] = D[t].filter((r) => cen.has(r.centro_id)); });
    const emps = new Set(D.empleados.map((e) => e.id));
    ['nomina_lineas', 'asistencia', 'vacaciones', 'prestamos'].forEach((t) => { D[t] = D[t].filter((r) => emps.has(r.empleado_id)); });
    const pres = new Set(D.prestamos.map((p) => p.id));
    D.prestamo_abonos = D.prestamo_abonos.filter((a) => pres.has(a.prestamo_id));
    const prods = new Set(D.productos.map((p) => p.id));
    D.inventario_movs = D.inventario_movs.filter((m) => prods.has(m.producto_id));
    D.organizaciones[0].nombre = INM ? 'Inmobiliaria Galcor' : 'Galcor';
    return D;
    };
})();
