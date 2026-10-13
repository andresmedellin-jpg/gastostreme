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
  { id: 'gastos',     titulo: 'Gastos',      icono: '◫', roles: ['dueno','administracion','operacion','encargado'], listo: true },
  { id: 'cobranza',   titulo: 'Cobranza',    icono: '◩', roles: ['dueno','administracion','cobranza'], listo: false,
    legacy: [['Cobranza Elysium','https://andresmedellin-jpg.github.io/cobranzaelysium/'],['Rentas Treme','https://andresmedellin-jpg.github.io/rentastreme/']] },
  { id: 'personal',   titulo: 'Personal',    icono: '◪', roles: ['dueno','administracion','encargado'], listo: false,
    legacy: [['Acceso Elysium','https://andresmedellin-jpg.github.io/elysiumacceso/']] },
  { id: 'patrimonio', titulo: 'Patrimonio',  icono: '◨', roles: ['dueno'], listo: false },
  { id: 'reportes',   titulo: 'Reportes',    icono: '◰', roles: ['dueno','administracion'], listo: false,
    legacy: [['Reporte mensual Elysium','https://andresmedellin-jpg.github.io/reportemensual/']] },
];

export const CATEGORIAS = {
  'General':'📌','Mantenimiento':'🔧','Electricidad':'⚡','Agua':'💧','Gas':'🔥','Auto':'🚗','Limpieza':'🧹',
  'Seguridad':'🔒','Reparaciones':'🛠','Construcción':'🏗','Administración':'📋','Nómina':'👷',
  'Impuestos':'🧾','Retiro socios':'💸','Otro':'•'
};
export const FORMAS_PAGO = ['Transferencia','Efectivo','Tarjeta','Cheque','Otro'];
export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
