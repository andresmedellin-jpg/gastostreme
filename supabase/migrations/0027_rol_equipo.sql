-- Rol para el personal de piso (vigilancia, limpieza, mantenimiento) que usa la app desde su celular
alter type app.rol_usuario add value if not exists 'equipo';
