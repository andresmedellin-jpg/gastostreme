// Unaria · el modelo: la instalación propia de Unaria (base de Supabase "unaria", nada de Treme / MEDCO).
// Aquí se construye y se prueba todo lo nuevo antes de llevarlo a cada cliente, y sirve como demostración en vivo.
window.__CLIENTE = {
  id: 'unaria',
  nombre: 'Unaria',
  supabaseUrl: 'https://gimvgsjpeyvdretubrgc.supabase.co',
  supabaseKey: 'sb_publishable_Bs4JM83V0_P3sJ0Ui7i_Pw_IV33gOBm',
  marca: {
    color: '#BF4D17', color2: '#9A3D11', colorSuave: '#F6E7DD',
    nombre: 'Unaria', marca: ['Unaria'],
    logos: [],
    // Módulos generales (sirven a cualquier giro). El paquete inmobiliario (rentas, ocupación, lecturas) se prende por cliente.
    modulos: ['inicio', 'prospectos', 'cotizaciones', 'inventario', 'obras', 'gastos', 'patrimonio',
      'nomina', 'asistencia', 'tareas', 'incidencias', 'empleados', 'vacaciones', 'prestamos', 'importar', 'usuarios'],
    titulos: { obras: 'Proyectos' }, palabraObra: ['proyecto', 'proyectos'],
    reciboEmpresa: 'Unaria',
    dominioUsuarios: '@usuarios.unaria.mx',
  },
};
