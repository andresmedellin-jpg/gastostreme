-- Las páginas viejas de gastos, cobranza, centro de control y reporte ya se retiraron.
-- Sus tablas quedan como respaldo, pero ya no se pueden leer ni escribir desde internet.
revoke all on table public.gastos, public.pagos, public.ingresos, public.egresos, public.locales,
  public.pagos_medco, public.ventas_medco, public.activos, public.pasivos,
  public.cartera_vencida, public.cartera_vencida_abonos, public.incidencias, public.registros
from anon, authenticated;
