-- Doble candado. Las 15 tablas del sistema viejo (esquema public) ya no tienen permisos para
-- anon/authenticated (nadie con la llave pública puede leerlas ni cambiarlas), pero tenían RLS apagado.
-- Se prende RLS sin reglas: aunque alguien les devolviera permisos, seguirían cerradas.
alter table public.activos enable row level security;
alter table public.asistencia_diaria enable row level security;
alter table public.cartera_vencida enable row level security;
alter table public.cartera_vencida_abonos enable row level security;
alter table public.control_tareas enable row level security;
alter table public.egresos enable row level security;
alter table public.gastos enable row level security;
alter table public.horario_personal enable row level security;
alter table public.ingresos enable row level security;
alter table public.nomina_data enable row level security;
alter table public.pagos_medco enable row level security;
alter table public.pagos_rentas enable row level security;
alter table public.pasivos enable row level security;
alter table public.plantilla_tareas enable row level security;
alter table public.ventas_medco enable row level security;
-- Las vistas de la app ya respetan las reglas (security_invoker); además, sin sesión no se pueden consultar.
revoke all on app.v_gasto_mensual, app.v_saldos_cxc from anon;
