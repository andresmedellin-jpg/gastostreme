-- Catálogo único de categorías de gasto (14/10/2026). Se reclasificaron los gastos existentes:
-- Electricidad → Luz, Reparaciones → Mantenimiento, Auto → Vehículos, General/Otro → Otros,
-- gasolineras → Gasolina, Telcel/Telmex/Starlink → Teléfono e internet (actualización hecha con execute_sql).
alter table app.gastos alter column categoria set default 'Otros';
