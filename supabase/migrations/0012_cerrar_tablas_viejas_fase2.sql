-- Se retiraron también Elysium · Mi día y Rentas Treme: ya no queda ninguna página vieja.
-- Las tablas viejas quedan como respaldo, sin acceso desde internet.
revoke all on table public.asistencia_diaria, public.control_tareas, public.horario_personal,
  public.plantilla_tareas, public.rentas, public.pagos_rentas, public.adeudos_manual,
  public.nomina_data, public.empleados
from anon, authenticated;
