-- Gastos "por pagar": pedidos a proveedores que ya cuentan como costo de la obra
-- aunque el dinero todavía no sale. Al pagarlos se marca la fecha de pago (no se captura dos veces).
alter table app.gastos
  add column if not exists estado text not null default 'pagado',
  add column if not exists fecha_vencimiento date,
  add column if not exists fecha_pago date;
alter table app.gastos add constraint gastos_estado_valido check (estado in ('pagado', 'por_pagar'));
create index if not exists gastos_por_pagar_idx on app.gastos (org_id) where estado = 'por_pagar';
comment on column app.gastos.estado is 'pagado | por_pagar';
comment on column app.gastos.fecha_pago is 'Día en que se pagó un gasto que estuvo por pagar; si es nulo, se pagó en "fecha"';
