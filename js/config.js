// Configuración pública. La llave "publishable" está hecha para ir en el navegador:
// lo que protege los datos son los permisos por usuario (RLS) en la base, no esta llave.
export const SUPABASE_URL = 'https://mqzuaxxnidaokhdqcurm.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_y1lW-QidgXb4LoVtqoC2rw_5Oj4GpKJ';
export const ESQUEMA = 'app';
export const BUCKET_COMPROBANTES = 'comprobantes';

// Módulos de la plataforma y qué roles los ven.
// "legacy" = página vieja que se sigue usando mientras el módulo se migra.
export const MODULOS = [
  { id: 'inicio',     titulo: 'Inicio',      icono: '◧', roles: ['dueno','administracion'], listo: false },
  { id: 'gastos',     titulo: 'Gastos',      icono: '◫', roles: ['dueno','administracion','operacion'], listo: true },
  { id: 'cobranza',   titulo: 'Cobranza Elysium', icono: '◩', roles: ['dueno','administracion','cobranza'], listo: true },
  { id: 'rentas',     titulo: 'Rentas',      icono: '◪', roles: ['dueno','administracion','cobranza'], listo: true },
  { id: 'personal',   titulo: 'Personal',    icono: '◑', roles: ['dueno','administracion','encargado'], listo: false,
    legacy: [['Elysium · Mi día','https://andresmedellin-jpg.github.io/victorolazaran/']] },
  { id: 'patrimonio', titulo: 'Patrimonio',  icono: '◨', roles: ['dueno'], listo: false },
  { id: 'reportes',   titulo: 'Reportes',    icono: '◰', roles: ['dueno','administracion'], listo: false,
    legacy: [['Reporte mensual Elysium','https://andresmedellin-jpg.github.io/reportemensual/']] },
  { id: 'usuarios',   titulo: 'Usuarios',    icono: '◉', roles: ['dueno'], listo: true },
];

// Perfiles listos para dar de alta a alguien: un rol principal + roles extra
export const PERFILES = [
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
  { nombre: 'Miguel Medellín',   usuario: 'miguel',   perfil: 'cobranza',  empresas: ['Treme'] },
];

export const CATEGORIAS = {
  'General':'📌','Mantenimiento':'🔧','Electricidad':'⚡','Agua':'💧','Gas':'🔥','Auto':'🚗','Limpieza':'🧹',
  'Seguridad':'🔒','Reparaciones':'🛠','Construcción':'🏗','Administración':'📋','Nómina':'👷',
  'Impuestos':'🧾','Retiro socios':'💸','Otro':'•'
};
export const FORMAS_PAGO = ['Transferencia','Efectivo','Tarjeta','Cheque','Otro'];
export const FORMAS_COBRO = ['Transferencia','Efectivo','Depósito','Tarjeta','Otro'];
export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
