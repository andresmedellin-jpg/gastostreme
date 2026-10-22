// Configuración pública. La llave "publishable" está hecha para ir en el navegador:
// lo que protege los datos son los permisos por usuario (RLS) en la base, no esta llave.
export const SUPABASE_URL = 'https://mqzuaxxnidaokhdqcurm.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_y1lW-QidgXb4LoVtqoC2rw_5Oj4GpKJ';
export const ESQUEMA = 'app';
export const BUCKET_COMPROBANTES = 'comprobantes';

// Íconos de línea (heredan el color del texto)
const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONOS = {
  inicio:     svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  reportes:   svg('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
  gastos:     svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  cobranza:   svg('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>'),
  rentas:     svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/>'),
  patrimonio: svg('<path d="M3 21h18M5 21V10M19 21V10M9.5 21V10M14.5 21V10M2 10l10-6 10 6z"/>'),
  obras:      svg('<path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 7v4M9 8.5v2.5M15 8.5v2.5"/><path d="M4 21h16"/>'),
  personal:   svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>'),
  usuarios:   svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  nomina:     svg('<rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>'),
  asistencia: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
  tareas:     svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>'),
  rondin:     svg('<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'),
  incidencias: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>'),
  vacaciones: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  medidor:    svg('<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M8 21h8"/>'),
  lecturaqr:  svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'),
  prestamos:  svg('<path d="M3 10h18M5 10V20M19 10V20M9.5 10V20M14.5 10V20M2 21h20M12 3l9 5H3z"/>'),
  empleados:  svg('<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3"/>'),
  inventario: svg('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  cotizaciones: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 12h6M10 16h6M4 7v14h10" opacity=".9"/>'),
  prospectos: svg('<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>'),
};

// Marca de la plataforma. Por omisión, Treme / MEDCO. Otra instalación (o el demo, con ?demo) la cambia
// definiendo window.__MARCA antes de cargar la app: nombre, logos, color, módulos visibles y títulos.
export const MARCA = Object.assign({
  nombre: 'Treme / MEDCO',                         // título de la pestaña
  marca: ['Treme', 'MEDCO'],                       // texto del menú (separado por una diagonal roja)
  logos: [{ src: 'img/logo-treme.png', alt: 'Treme Grupo Inmobiliario', clase: 'logo-treme' },
          { src: 'img/logo-medco.png', alt: 'MEDCO Construcciones', clase: 'logo-medco' }],
  color: null,                                     // color principal; null = rojo Treme
  modulos: null,                                   // lista de ids visibles; null = todos los "listo"
  titulos: {},                                     // { obras: 'Proyectos y servicios', … }
  demo: false,
}, window.__MARCA || {});

// Módulos de la plataforma, en el orden y grupo del menú, y qué roles los ven.
export const MODULOS = [
  { id: 'inicio',     grupo: 'General',   titulo: 'Inicio',           icono: ICONOS.inicio,     roles: ['dueno','administracion'], listo: true },
  { id: 'reportes',   grupo: 'General',   titulo: 'Reporte mensual',  icono: ICONOS.reportes,   roles: ['dueno','administracion'], listo: true },
  { id: 'gastos',     grupo: 'Finanzas',  titulo: 'Gastos',           icono: ICONOS.gastos,     roles: ['dueno','administracion','operacion'], listo: true },
  { id: 'cobranza',   grupo: 'Finanzas',  titulo: 'Cobranza Elysium', icono: ICONOS.cobranza,   roles: ['dueno','administracion','cobranza'], listo: true },
  { id: 'rentas',     grupo: 'Finanzas',  titulo: 'Rentas',           icono: ICONOS.rentas,     roles: ['dueno','administracion','cobranza'], listo: true },
  { id: 'obras',      grupo: 'Finanzas',  titulo: 'Obras',            icono: ICONOS.obras,      roles: ['dueno','administracion'], listo: true },
  { id: 'prospectos', grupo: 'Ventas',    titulo: 'Prospectos',       icono: ICONOS.prospectos, roles: ['dueno','administracion'], listo: true },
  { id: 'cotizaciones', grupo: 'Ventas',  titulo: 'Cotizaciones',     icono: ICONOS.cotizaciones, roles: ['dueno','administracion','cobranza'], listo: true, opcional: true },
  { id: 'inventario', grupo: 'Ventas',    titulo: 'Inventario',       icono: ICONOS.inventario, roles: ['dueno','administracion','operacion'], listo: true, opcional: true },
  { id: 'patrimonio', grupo: 'Finanzas',  titulo: 'Patrimonio',       icono: ICONOS.patrimonio, roles: ['dueno','socio'], listo: true },
  { id: 'personal',   grupo: 'Operación', titulo: 'Personal',         icono: ICONOS.personal,   roles: ['dueno','administracion','encargado'], listo: true },
  // Personal separado en el menú (solo si la marca lo pide con sus ids en "modulos"; usan el módulo de Personal)
  { id: 'nomina',      grupo: 'Personal', titulo: 'Nómina',      icono: ICONOS.nomina,      roles: ['dueno','administracion'], listo: true, opcional: true, vista: 'personal', tab: 'nomina' },
  { id: 'asistencia',  grupo: 'Personal', titulo: 'Asistencia',  icono: ICONOS.asistencia,  roles: ['dueno','administracion','encargado'], listo: true, opcional: true, vista: 'personal', tab: 'asistencia' },
  { id: 'tareas',      grupo: 'Personal', titulo: 'Tareas',      icono: ICONOS.tareas,      roles: ['dueno','administracion','encargado'], listo: true, opcional: true, vista: 'personal', tab: 'tareas' },
  { id: 'rondin',      grupo: 'Personal', titulo: 'Rondín',      icono: ICONOS.rondin,      roles: ['dueno','administracion','encargado'], listo: true, opcional: true, vista: 'personal', tab: 'rondin' },
  { id: 'incidencias', grupo: 'Personal', titulo: 'Incidencias', icono: ICONOS.incidencias, roles: ['dueno','administracion','encargado'], listo: true, opcional: true, vista: 'personal', tab: 'incidencias' },
  { id: 'empleados',   grupo: 'Personal', titulo: 'Empleados',   icono: ICONOS.empleados,   roles: ['dueno','administracion'], listo: true, opcional: true, vista: 'personal', tab: 'empleados' },
  { id: 'vacaciones',  grupo: 'Personal', titulo: 'Vacaciones',  icono: ICONOS.vacaciones,  roles: ['dueno','administracion'], listo: true, opcional: true, vista: 'personal', tab: 'vacaciones' },
  { id: 'prestamos',   grupo: 'Personal', titulo: 'Préstamos',   icono: ICONOS.prestamos,   roles: ['dueno','administracion'], listo: true, opcional: true, vista: 'personal', tab: 'prestamos' },
  // Luz, gas y agua por medidor (opcionales: solo para edificios que reparten un recibo entre sus unidades)
  { id: 'lecturas',  grupo: 'Servicios', titulo: 'Toma de lecturas', icono: ICONOS.lecturaqr, roles: ['dueno','administracion','operacion','encargado'], listo: true, opcional: true, vista: 'lecturas', tab: 'recorrido' },
  { id: 'servicios', grupo: 'Servicios', titulo: 'Luz, gas y agua',  icono: ICONOS.medidor,   roles: ['dueno','administracion','cobranza'], listo: true, opcional: true, vista: 'lecturas' },
  { id: 'usuarios',   grupo: 'Operación', titulo: 'Usuarios',         icono: ICONOS.usuarios,   roles: ['dueno'], listo: true },
];

// Perfiles listos para dar de alta a alguien: un rol principal + roles extra
export const PERFILES = [
  { id: 'socio',     titulo: 'Socio: todo',                rol: 'socio',     roles: [],
    desc: 'Ve y hace todo, igual que el dueño: Casa, Socios, nómina y patrimonio. Solo no puede dar de alta usuarios.' },
  { id: 'captura',   titulo: 'Captura: gastos y cobranza', rol: 'cobranza',  roles: ['operacion'],
    desc: 'Captura gastos de obra y oficina, y registra cobranza. No ve Casa, Socios, nómina ni patrimonio.' },
  { id: 'cobranza',  titulo: 'Cobranza y rentas',          rol: 'cobranza',  roles: [],
    desc: MARCA.demo ? 'Rentas, cobranza y adeudos. No ve gastos.' : 'Rentas, cobranza de Elysium y adeudos. No ve gastos.' },
  { id: 'gastos',    titulo: 'Solo gastos',                rol: 'operacion', roles: [],
    desc: 'Captura y consulta gastos de obra y oficina.' },
  { id: 'encargado', titulo: 'Encargado de sitio',         rol: 'encargado', roles: [],
    desc: 'Tareas, rondines, incidencias y asistencia de su personal. No ve dinero.' },
  { id: 'admin',     titulo: 'Administración',             rol: 'administracion', roles: [],
    desc: 'Todo, incluidos Casa, Socios y nómina, menos Patrimonio y Usuarios.' },
];

// Altas sugeridas (desaparecen al crearlas)
export const SUGERIDOS = MARCA.demo ? [] : [
  { nombre: 'Victoria Carrillo', usuario: 'victoria', perfil: 'captura',   empresas: 'todas' },
  { nombre: 'Víctor Olazarán',   usuario: 'victor',   perfil: 'encargado', empresas: ['Treme'] },
  { nombre: 'Miguel Medellín',   usuario: 'miguel',   perfil: 'socio',     empresas: 'todas' },
];

// Una sola lista de categorías de gasto para toda la plataforma (Gastos, Obras, Inicio, reportes).
export const CATEGORIAS = MARCA.categorias || {
  'Construcción':'🏗','Nómina':'👷','Seguro social e ISN':'🏥','Gasolina':'⛽','Vehículos':'🚗',
  'Mantenimiento':'🔧','Limpieza':'🧹','Seguridad':'🔒','Luz':'⚡','Agua':'💧','Gas':'🔥',
  'Teléfono e internet':'📶','Administración':'📋','Impuestos':'🧾','Intereses y comisiones':'🏦','Retiro socios':'💸','Otros':'📌'
};
// Qué va en cada una (se muestra al capturar, para que todos usen la misma)
export const CATEGORIA_AYUDA = MARCA.ayuda || {
  'Construcción': 'Material y servicios de obra: acero, concreto, ferretería, grúas, renta de maquinaria',
  'Nómina': 'Raya y sueldos, vacaciones, aguinaldo',
  'Seguro social e ISN': 'IMSS, Infonavit, impuesto sobre nómina, recargos',
  'Gasolina': 'Gasolina y diésel (Oxxo Gas, BP, Mobil, Petromax…)',
  'Vehículos': 'Servicio, refacciones, llantas, taller, tenencia y control vehicular',
  'Mantenimiento': 'Reparaciones y mantenimiento de edificios: elevadores, climas, pintura, jardinería',
  'Limpieza': 'Productos y servicios de limpieza, fumigación, basura, uniformes',
  'Seguridad': 'Vigilancia, cámaras, cerrajería',
  'Luz': 'Recibos de CFE',
  'Agua': 'Agua y Drenaje, garrafones',
  'Gas': 'Gas natural o LP (Naturgy, gas de tanque)',
  'Teléfono e internet': 'Telcel, Telmex, Starlink',
  'Administración': 'Oficina, papelería, software, contador, trámites',
  'Impuestos': 'Predial, SAT y otros impuestos (no nómina)',
  'Intereses y comisiones': 'Intereses de préstamos o créditos, comisiones del banco y de terminal',
  'Retiro socios': 'Dinero que sacan los socios',
  'Otros': 'Solo si no cabe en ninguna de las anteriores',
};
export const FORMAS_PAGO = ['Transferencia','Efectivo','Tarjeta','Cheque','Otro'];
export const FORMAS_COBRO = ['Transferencia','Efectivo','Depósito','Tarjeta','Otro'];
// Módulos que se ven en esta instalación (los "opcional" solo si la marca los pide) y con su título de la marca
MODULOS.forEach((m) => { if (MARCA.titulos[m.id]) m.titulo = MARCA.titulos[m.id]; });
export const MODULOS_ACTIVOS = MODULOS.filter((m) => (MARCA.modulos ? MARCA.modulos.includes(m.id) : !m.opcional));
if (MARCA.modulos) MODULOS_ACTIVOS.sort((a, b) => MARCA.modulos.indexOf(a.id) - MARCA.modulos.indexOf(b.id));

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
