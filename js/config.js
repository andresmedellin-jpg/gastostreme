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
};

// Módulos de la plataforma, en el orden y grupo del menú, y qué roles los ven.
export const MODULOS = [
  { id: 'inicio',     grupo: 'General',   titulo: 'Inicio',           icono: ICONOS.inicio,     roles: ['dueno','administracion'], listo: true },
  { id: 'reportes',   grupo: 'General',   titulo: 'Reporte mensual',  icono: ICONOS.reportes,   roles: ['dueno','administracion'], listo: true },
  { id: 'gastos',     grupo: 'Finanzas',  titulo: 'Gastos',           icono: ICONOS.gastos,     roles: ['dueno','administracion','operacion'], listo: true },
  { id: 'cobranza',   grupo: 'Finanzas',  titulo: 'Cobranza Elysium', icono: ICONOS.cobranza,   roles: ['dueno','administracion','cobranza'], listo: true },
  { id: 'rentas',     grupo: 'Finanzas',  titulo: 'Rentas',           icono: ICONOS.rentas,     roles: ['dueno','administracion','cobranza'], listo: true },
  { id: 'obras',      grupo: 'Finanzas',  titulo: 'Obras',            icono: ICONOS.obras,      roles: ['dueno','administracion'], listo: true },
  { id: 'patrimonio', grupo: 'Finanzas',  titulo: 'Patrimonio',       icono: ICONOS.patrimonio, roles: ['dueno','socio'], listo: true },
  { id: 'personal',   grupo: 'Operación', titulo: 'Personal',         icono: ICONOS.personal,   roles: ['dueno','administracion','encargado'], listo: true },
  { id: 'usuarios',   grupo: 'Operación', titulo: 'Usuarios',         icono: ICONOS.usuarios,   roles: ['dueno'], listo: true },
];

// Perfiles listos para dar de alta a alguien: un rol principal + roles extra
export const PERFILES = [
  { id: 'socio',     titulo: 'Socio: todo',                rol: 'socio',     roles: [],
    desc: 'Ve y hace todo, igual que el dueño: Casa, Socios, nómina y patrimonio. Solo no puede dar de alta usuarios.' },
  { id: 'captura',   titulo: 'Captura: gastos y cobranza', rol: 'cobranza',  roles: ['operacion'],
    desc: 'Captura gastos de obra y oficina, y registra cobranza. No ve Casa, Socios, nómina ni patrimonio.' },
  { id: 'cobranza',  titulo: 'Cobranza y rentas',          rol: 'cobranza',  roles: [],
    desc: 'Rentas, cobranza de Elysium y adeudos. No ve gastos.' },
  { id: 'gastos',    titulo: 'Solo gastos',                rol: 'operacion', roles: [],
    desc: 'Captura y consulta gastos de obra y oficina.' },
  { id: 'encargado', titulo: 'Encargado de sitio',         rol: 'encargado', roles: [],
    desc: 'Tareas, rondines, incidencias y asistencia de su personal. No ve dinero.' },
  { id: 'admin',     titulo: 'Administración',             rol: 'administracion', roles: [],
    desc: 'Todo, incluidos Casa, Socios y nómina, menos Patrimonio y Usuarios.' },
];

// Altas sugeridas (desaparecen al crearlas)
export const SUGERIDOS = [
  { nombre: 'Victoria Carrillo', usuario: 'victoria', perfil: 'captura',   empresas: 'todas' },
  { nombre: 'Víctor Olazarán',   usuario: 'victor',   perfil: 'encargado', empresas: ['Treme'] },
  { nombre: 'Miguel Medellín',   usuario: 'miguel',   perfil: 'socio',     empresas: 'todas' },
];

// Una sola lista de categorías de gasto para toda la plataforma (Gastos, Obras, Inicio, reportes).
export const CATEGORIAS = {
  'Construcción':'🏗','Nómina':'👷','Seguro social e ISN':'🏥','Gasolina':'⛽','Vehículos':'🚗',
  'Mantenimiento':'🔧','Limpieza':'🧹','Seguridad':'🔒','Luz':'⚡','Agua':'💧','Gas':'🔥',
  'Teléfono e internet':'📶','Administración':'📋','Impuestos':'🧾','Retiro socios':'💸','Otros':'📌'
};
// Qué va en cada una (se muestra al capturar, para que todos usen la misma)
export const CATEGORIA_AYUDA = {
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
  'Retiro socios': 'Dinero que sacan los socios',
  'Otros': 'Solo si no cabe en ninguna de las anteriores',
};
export const FORMAS_PAGO = ['Transferencia','Efectivo','Tarjeta','Cheque','Otro'];
export const FORMAS_COBRO = ['Transferencia','Efectivo','Depósito','Tarjeta','Otro'];
export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
