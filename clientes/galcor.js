// Operia · cliente Galcor (válvulas Emerson y servicio) y su inmobiliaria (Torre Cumbres / Torre Valle en el demo).
// Su base de datos es SUYA (proyecto de Supabase aparte). Mientras supabaseUrl esté vacío, su dirección muestra "en preparación".
window.__CLIENTE = {
  id: 'galcor',
  nombre: 'Galcor',
  supabaseUrl: '',
  supabaseKey: '',
  marca: {
    color: '#1f4e79', color2: '#163a5c', colorSuave: '#eaf1f8',
    marca: ['Galcor'],
    logos: [],
    modulos: ['inicio', 'prospectos', 'cotizaciones', 'inventario', 'obras', 'rentas', 'lecturas', 'servicios', 'gastos', 'patrimonio',
      'nomina', 'asistencia', 'tareas', 'rondin', 'incidencias', 'empleados', 'vacaciones', 'prestamos', 'importar', 'usuarios'],
    titulos: { obras: 'Proyectos y servicios' }, palabraObra: ['proyecto', 'proyectos'],
    rentaParcial: true, ocupacion: true,
    reciboEmpresa: 'Galcor',
  },
};
