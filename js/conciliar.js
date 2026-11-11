// Cruce de movimientos del banco contra lo capturado (pagos, ingresos y gastos). Solo sugiere: nada se liga sin aprobación.
// - "cuadra": el depósito menciona la unidad o el nombre de quien paga y el monto coincide (solo o sumando hasta 4 registros,
//   con o sin IVA del 16 %), dentro de ±12 días.
// - "posible": mismo monto (o suma de 2) dentro de ±4 días, pero sin nada en el texto que lo confirme (p. ej. depósitos en efectivo).
// - "traspaso": entre tus propias cuentas o de los socios, devoluciones y comisiones del banco.

const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
const NO_NOMBRE = new Set(['LOCAL', 'TORRE', 'OFICINA', 'DEPTO', 'BODEGA', 'PLAZA', 'EMPRESA', 'PAGO', 'RENTA', 'GRUPO', 'MANTENIMIENTO',
  'DESPACHO', 'SANTA', 'ELYSIUM', 'HUDSON', 'TREME', 'MEDCO', 'PROYECTOS', 'DESARROLLOS', 'INMOBILIARIO', 'NOMINA', 'ESTIMADA', 'VARIOS']);
const quitarAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const palabras = (s) => new Set((quitarAcentos(s).match(/[A-ZÑ]{4,}/g) || []).filter((w) => !NO_NOMBRE.has(w)));
const numeros = (s) => new Set((quitarAcentos(s).replace(/REF\.? ?\d+|\b\d{6,}\b|\b20\d\d\b/g, ' ').match(/(?<![\d.,/])\d{1,4}(?![\d.,/])/g) || []));
const iguala = (suma, monto) => Math.abs(suma - monto) < 0.6 || Math.abs(suma * 1.16 - monto) < 0.6;

// Movimientos que no son ingreso ni gasto de la operación
export function esTraspaso(m, propios) {
  const t = quitarAcentos(`${m.descripcion} ${m.detalle} ${m.quien}`);
  if (/DEVUELTO|DEVOLUCION/.test(t)) return 'Devolución';
  if (m.tipo === 'cargo' && /COMISION|IVA COM|ISR RET|CUOTA.*MANEJO/.test(t)) return 'Comisión del banco';
  if (propios.some((p) => p && t.includes(quitarAcentos(p)))) return 'Traspaso entre cuentas propias o socios';
  return null;
}

// movs: [{id, fecha, tipo, monto, descripcion, detalle, quien}]
// regs: [{id, clase:'pago'|'ingreso'|'gasto', fecha, monto, unidad, nombres}] (ya sin los que están ligados)
export function sugerir(movs, regs, propios = []) {
  const libres = new Set(regs.map((r) => r.clase + r.id));
  const usar = (lista) => lista.forEach((r) => libres.delete(r.clase + r.id));
  const out = new Map();
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || b.monto - a.monto);
  const pendientes = [];
  for (const m of orden) {
    const tr = esTraspaso(m, propios);
    if (tr) { out.set(m.id, { nivel: 'traspaso', motivo: tr, regs: [] }); continue; }
    const texto = `${m.descripcion} ${m.detalle} ${m.quien}`;
    const ns = numeros(texto), ws = palabras(texto), d = dia(m.fecha);
    const clase = m.tipo === 'abono' ? ['pago', 'ingreso'] : ['gasto'];
    const pista = (r) => 3 * [...numeros(r.unidad)].filter((x) => ns.has(x)).length + [...palabras(r.nombres)].filter((x) => ws.has(x)).length;
    const cand = regs.filter((r) => clase.includes(r.clase) && libres.has(r.clase + r.id) && Math.abs(dia(r.fecha) - d) <= 12 && pista(r) > 0)
      .sort((a, b) => pista(b) - pista(a) || Math.abs(dia(a.fecha) - d) - Math.abs(dia(b.fecha) - d)).slice(0, 10);
    let mejor = null, valor = -1;
    combinar(cand, 4, (c) => {
      if (!iguala(c.reduce((s, r) => s + Number(r.monto), 0), m.monto)) return;
      const v = c.reduce((s, r) => s + pista(r), 0) / c.length - 0.01 * c.reduce((s, r) => s + Math.abs(dia(r.fecha) - d), 0);
      if (v > valor) { valor = v; mejor = c; }
    });
    if (mejor) { usar(mejor); out.set(m.id, { nivel: 'cuadra', regs: mejor }); } else pendientes.push(m);
  }
  for (const m of pendientes) {
    const d = dia(m.fecha), clase = m.tipo === 'abono' ? ['pago', 'ingreso'] : ['gasto'];
    const cand = regs.filter((r) => clase.includes(r.clase) && libres.has(r.clase + r.id) && Math.abs(dia(r.fecha) - d) <= 4)
      .sort((a, b) => Math.abs(dia(a.fecha) - d) - Math.abs(dia(b.fecha) - d)).slice(0, 12);
    let hit = null;
    combinar(cand, 2, (c) => { if (!hit && iguala(c.reduce((s, r) => s + Number(r.monto), 0), m.monto)) hit = c; });
    if (hit) { usar(hit); out.set(m.id, { nivel: 'posible', regs: hit }); } else out.set(m.id, { nivel: 'falta', regs: [] });
  }
  return out;
}

function combinar(lista, maxK, fn) {
  const rec = (ini, k, acc) => {
    if (acc.length) fn(acc);
    if (acc.length === k) return;
    for (let i = ini; i < lista.length; i++) rec(i + 1, k, [...acc, lista[i]]);
  };
  rec(0, maxK, []);
}
