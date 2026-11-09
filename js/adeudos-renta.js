// Lo que debe cada inquilino. Una sola regla para Rentas y para Patrimonio > Por cobrar, así siempre coinciden:
//  · adeudo anterior registrado en Rentas > Adeudos (cuenta "adeudo_inicial"), menos lo abonado a esa cuenta, y
//  · los meses de los últimos 3 cuyo día de pago ya pasó sin ningún pago registrado,
//    sin contar meses antes del inicio del contrato ni los que ya quedaron dentro del adeudo registrado.
export const MESES_REVISADOS = 3;
const per = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}-01`;

export function mesesSinPago(r, pagos, adeudo = null, hoy = new Date()) {
  if (!r?.activo || !Number(r.monto)) return [];
  const inicio = r.fecha_inicio ? String(r.fecha_inicio).slice(0, 7) : null;
  // El adeudo registrado cubre hasta el mes en que se capturó o se actualizó por última vez (fecha_origen)
  const hasta = adeudo?.fecha_origen || adeudo?.creado_en, cubierto = hasta ? String(hasta).slice(0, 7) : null;
  const dp = r.dia_pago || 1, out = [];
  for (let i = 0; i < MESES_REVISADOS; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1), y = d.getFullYear(), m = d.getMonth(), p = per(y, m), ym = p.slice(0, 7);
    if (inicio && ym < inicio) continue;
    if (cubierto && ym <= cubierto) continue;
    const vencio = i === 0 ? hoy.getDate() > dp : new Date(y, m, dp) < hoy;
    if (!vencio) continue;
    if (pagos.some((x) => x.contrato_id === r.id && x.periodo === p)) continue;
    out.push({ periodo: p, monto: Number(r.monto) });
  }
  return out;
}

export function adeudoRenta(r, pagos, adeudo = null, hoy = new Date()) {
  const meses = mesesSinPago(r, pagos, adeudo, hoy);
  const anterior = adeudo ? Math.max(0, Number(adeudo.saldo ?? adeudo.monto_original) || 0) : 0;
  return { anterior, meses, total: anterior + meses.reduce((s, x) => s + x.monto, 0) };
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const nombreMeses = (meses) => meses.map((x) => MES[Number(x.periodo.slice(5, 7)) - 1]).reverse().join(', ');
