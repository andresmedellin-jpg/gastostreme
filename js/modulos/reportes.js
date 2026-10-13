// Reporte mensual de Torre Elysium (mantenimiento cobrado vs. gasto del edificio).
// Reemplaza la página "Reporte mensual". Se arma como documento aparte (iframe) para que
// se vea igual en tema claro u oscuro y salga limpio al guardarlo como PDF.
import { MESES } from '../config.js';
import { db, todo, estado, fmtFecha, esc, toast, normalizar } from '../lib.js';

const st = { anio: new Date().getFullYear(), mes: new Date().getMonth(), inversionistas: false };
let centro, raiz;

export async function render(view) {
  raiz = view;
  centro = estado.centros.find((c) => c.nombre === 'Torre Elysium');
  if (!centro) { view.innerHTML = '<div class="vacio">No tienes acceso a Torre Elysium.</div>'; return; }
  const anios = [];
  for (let a = new Date().getFullYear() + 1; a >= 2024; a--) anios.push(a);
  view.innerHTML = `
    <div class="sub-head">
      <div class="filtros">
        <select id="r-mes" aria-label="Mes">${MESES.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select>
        <select id="r-anio" aria-label="Año">${anios.map((a) => `<option>${a}</option>`).join('')}</select>
        <label class="check-linea"><input type="checkbox" id="r-inv"> Vista inversionistas</label>
      </div>
      <div class="sub-meta">Torre Elysium · reporte mensual</div>
    </div>
    <div id="r-estado" class="sub-meta" role="status"></div>
    <div class="reporte-marco"><iframe id="r-doc" title="Reporte mensual"></iframe></div>`;
  // El marco crece con el reporte para que no haya doble barra de desplazamiento
  const marco = view.querySelector('#r-doc');
  marco.addEventListener('load', () => {
    const doc = marco.contentDocument;
    const ajustar = () => { marco.style.height = doc.documentElement.scrollHeight + 'px'; };
    ajustar();
    doc.fonts?.ready.then(ajustar);
    doc.querySelectorAll('img').forEach((i) => i.addEventListener('load', ajustar));
  });
  view.querySelector('#r-mes').value = st.mes;
  view.querySelector('#r-anio').value = st.anio;
  view.querySelector('#r-inv').checked = st.inversionistas;
  view.querySelector('#r-mes').addEventListener('change', (e) => { st.mes = +e.target.value; cargar(); });
  view.querySelector('#r-anio').addEventListener('change', (e) => { st.anio = +e.target.value; cargar(); });
  view.querySelector('#r-inv').addEventListener('change', (e) => { st.inversionistas = e.target.checked; cargar(); });
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-primary" id="r-pdf">⬇ Descargar PDF</button>`;
  document.getElementById('r-pdf').addEventListener('click', () => {
    const w = raiz.querySelector('#r-doc').contentWindow;
    w.focus(); w.print();
  });
  await cargar();
}

const iso = (a, m) => `${a}-${String(m + 1).padStart(2, '0')}-01`;
const sigMes = (a, m) => (m === 11 ? [a + 1, 0] : [a, m + 1]);
const antMes = (a, m) => (m === 0 ? [a - 1, 11] : [a, m - 1]);
// La luz (CFE) se cobra y se factura aparte: no entra en este reporte.
// A veces se captura con otra categoría, por eso también se revisa el proveedor.
const esCFE = (g) => g.categoria === 'Electricidad' || String(g.proveedor || '').toUpperCase().includes('CFE');

async function cargar() {
  const a = st.anio, m = st.mes;
  const [pa, pm] = antMes(a, m);
  const [sa, sm] = sigMes(a, m);
  const edo = raiz.querySelector('#r-estado');
  edo.textContent = 'Cargando…';
  const [u, c, p, g, e] = await Promise.all([
    db().from('unidades').select('id, identificador, tipo, ocupante').eq('centro_id', centro.id).eq('activo', true),
    db().from('cuotas').select('unidad_id, monto, activo, en_padron').eq('concepto', 'mantenimiento').eq('en_padron', true),
    todo(() => db().from('pagos').select('id, unidad_id, periodo, monto, forma_pago, fecha')
      .eq('centro_id', centro.id).eq('concepto', 'mantenimiento')
      .gte('periodo', iso(pa, pm)).lt('periodo', iso(sa, sm))),
    todo(() => db().from('gastos').select('id, fecha, concepto, proveedor, categoria, monto')
      .eq('centro_id', centro.id).gte('fecha', iso(pa, pm)).lt('fecha', iso(sa, sm)).order('fecha')),
    db().from('empleados').select('nombre, puesto'),
  ]);
  const err = u.error || c.error || p.error || g.error;
  if (err) { edo.textContent = ''; toast('No se pudo cargar el reporte: ' + err.message, true); return; }

  const actual = iso(a, m), previo = iso(pa, pm);
  const pagosDe = (per) => {
    const mapa = new Map();
    p.data.filter((x) => x.periodo.slice(0, 10) === per).forEach((x) => {
      if (!mapa.has(x.unidad_id)) mapa.set(x.unidad_id, []);
      mapa.get(x.unidad_id).push(x);
    });
    return mapa;
  };
  const pagosMes = pagosDe(actual), pagosPrev = pagosDe(previo);

  const unidades = new Map(u.data.map((x) => [x.id, x]));
  const filas = c.data.filter((x) => unidades.has(x.unidad_id))
    .map((x) => ({ u: unidades.get(x.unidad_id), cuota: Number(x.monto), exento: !x.activo }))
    .sort((x, y) => x.u.identificador.localeCompare(y.u.identificador, 'es', { numeric: true }));
  const activos = filas.filter((r) => !r.exento);
  const suma = (lista) => lista.reduce((s, x) => s + Number(x.monto || 0), 0);
  const cobradoDe = (mapa) => filas.reduce((s, r) => s + suma(mapa.get(r.u.id) || []), 0);

  const esperado = activos.reduce((s, r) => s + r.cuota, 0);
  const pagados = activos.filter((r) => pagosMes.has(r.u.id));
  const deudores = activos.filter((r) => !pagosMes.has(r.u.id));
  const cobrado = cobradoDe(pagosMes);
  const cobradoPrev = cobradoDe(pagosPrev);
  const pendiente = deudores.reduce((s, r) => s + r.cuota, 0);
  const pct = esperado ? Math.round(cobrado / esperado * 100) : 0;
  const pctPrev = esperado ? Math.round(cobradoPrev / esperado * 100) : 0;

  const gastosMes = g.data.filter((x) => x.fecha.slice(0, 7) === actual.slice(0, 7) && !esCFE(x));
  const nomina = gastosMes.filter((x) => x.categoria === 'Nómina');
  const operativos = gastosMes.filter((x) => x.categoria !== 'Nómina');
  const totalNomina = suma(nomina), totalOp = suma(operativos), egresos = totalNomina + totalOp;
  const egresosPrev = suma(g.data.filter((x) => x.fecha.slice(0, 7) === previo.slice(0, 7) && !esCFE(x)));

  // Nómina por persona: semanas pagadas en el mes y total
  const puestos = new Map((e.data || []).map((x) => [normalizar(x.nombre), x.puesto]));
  const porPersona = new Map();
  nomina.forEach((x) => {
    const nombre = (x.proveedor || String(x.concepto || '').replace(/^Nómina\s*—\s*/, '')).trim() || 'Sin nombre';
    const k = normalizar(nombre);
    if (!porPersona.has(k)) porPersona.set(k, { nombre, puesto: puestos.get(k) || '—', pagos: 0, total: 0 });
    const r = porPersona.get(k); r.pagos++; r.total += Number(x.monto || 0);
  });

  edo.textContent = `${pct}% cobrado · ${pagados.length} de ${activos.length} unidades pagaron`;
  const datos = {
    a, m, pa, pm, esperado, cobrado, cobradoPrev, pendiente, pct, pctPrev, pagados, deudores, activos,
    pagosMes, operativos, totalNomina, totalOp, egresos, egresosPrev,
    personal: [...porPersona.values()].sort((x, y) => y.total - x.total),
  };
  const logo = new URL('img/logo-treme.jpg', location.href).href;
  raiz.querySelector('#r-doc').srcdoc = documento(datos, logo, st.inversionistas);
}

// ---------- documento ----------
const n0 = (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const signo = (v) => (v >= 0 ? '+' : '−') + n0(Math.abs(v));
const etiqueta = (u) => ({ local: 'Local ', depto: 'Depto ', oficina: 'Oficina ' }[u.tipo] || '') + u.identificador;

function documento(d, logo, inv) {
  const mes = `${MESES[d.m]} ${d.a}`, mesPrev = MESES[d.pm];
  const saldo = d.cobrado - d.egresos;
  const diffPct = d.pct - d.pctPrev, diff = d.cobrado - d.cobradoPrev;
  const tend = `${diffPct >= 0 ? '▲' : '▼'} ${Math.abs(diffPct)}% vs ${mesPrev}`;
  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const filasPagados = d.pagados.map((r) => {
    const ps = d.pagosMes.get(r.u.id);
    const total = ps.reduce((s, x) => s + Number(x.monto), 0);
    return `<tr><td class="b">${esc(etiqueta(r.u))}</td><td class="t2">${esc(r.u.ocupante || '—')}</td>
      <td>${esc([...new Set(ps.map((x) => x.forma_pago).filter(Boolean))].join(', ') || '—')}</td>
      <td>${ps.map((x) => fmtFecha(x.fecha)).join(', ')}</td><td class="r ok">${n0(total)}</td></tr>`;
  }).join('');
  const filasDeudores = d.deudores.map((r) => `<div class="deu"><span class="b">${esc(etiqueta(r.u))}</span>
    <span class="t2 f">${esc(r.u.ocupante || 'Sin nombre')}</span><span class="neg b">${n0(r.cuota)}</span></div>`).join('');
  const filasOp = d.operativos.length ? d.operativos.map((x) => `<tr><td>${fmtFecha(x.fecha)}</td>
    <td class="m">${esc(x.concepto || '—')}</td><td class="t2">${esc(x.proveedor || '—')}</td>
    <td class="t2">${esc(x.categoria || '—')}</td><td class="r neg">${n0(x.monto)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="vacio">Sin gastos operativos</td></tr>';
  const filasNomina = d.personal.map((x) => `<tr><td class="m">${esc(x.nombre)}</td><td class="t2">${esc(x.puesto)}</td>
    <td class="c">${x.pagos}</td><td class="r neg">${n0(x.total)}</td></tr>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Reporte mensual Torre Elysium · ${mes}</title>

<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#F0F0F0;color:#0A0A0A;padding:24px 12px}
.hoja{max-width:820px;margin:0 auto;background:#fff;border-radius:4px;box-shadow:0 2px 24px rgba(0,0,0,.08);overflow:hidden}
.cab{padding:32px 44px 24px;border-bottom:3px solid #0A0A0A;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.cab img{height:72px;object-fit:contain}
.cab .der{text-align:right}
.tit{font-size:22px;font-weight:900;letter-spacing:-.03em;text-transform:uppercase}
.sub{font-size:11px;font-weight:500;color:#A3A3A3;margin-top:3px;letter-spacing:.04em;text-transform:uppercase}
.per{font-size:13px;font-weight:700;color:#A21D21;margin-top:6px}
.sec{padding:24px 44px}.sec+.sec{border-top:1px solid #E8E8E8}
.st{font-size:10px;font-weight:800;color:#A3A3A3;text-transform:uppercase;letter-spacing:.12em;margin-bottom:14px}
.saldo{border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px}
.saldo.pos{background:#F0FDF4;border:1px solid #BBF7D0}.saldo.neg{background:#FFF1F1;border:1px solid #FECACA}
.saldo .v{font-size:32px;font-weight:900;letter-spacing:-.04em}
.resumen{background:#F8F8F8;border-radius:8px;padding:16px 20px;border-left:4px solid #0A0A0A;font-size:13px;line-height:1.7}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #E8E8E8;border-bottom:1px solid #E8E8E8}
.kpi{padding:20px 22px;border-right:1px solid #E8E8E8}.kpi:last-child{border-right:none}
.kl{font-size:9px;font-weight:800;color:#A3A3A3;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px}
.kv{font-size:24px;font-weight:900;letter-spacing:-.04em;line-height:1}
.ks{font-size:11px;color:#A3A3A3;margin-top:4px}
.comp{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#E8E8E8;border:1px solid #E8E8E8;border-radius:8px;overflow:hidden}
.comp>div{background:#fff;padding:14px 16px}.comp .v{font-size:19px;font-weight:800;letter-spacing:-.03em}
.barra{height:8px;background:#E8E8E8;border-radius:4px;overflow:hidden;margin-top:6px}.barra span{display:block;height:100%}
table{width:100%;border-collapse:collapse;font-size:12px}
th{padding:8px 10px;text-align:left;font-size:9px;font-weight:800;color:#A3A3A3;text-transform:uppercase;letter-spacing:.1em;border-bottom:2px solid #0A0A0A}
td{padding:8px 10px;border-bottom:1px solid #E8E8E8;vertical-align:top}tr:last-child td{border-bottom:none}
.r{text-align:right;font-weight:700;white-space:nowrap}.c{text-align:center}.b{font-weight:700}.m{font-weight:500}
.t2{color:#525252}.ok{color:#16A34A}.neg{color:#DC2626}
.deu{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #E8E8E8;font-size:12px}.deu:last-child{border-bottom:none}
.deu .b:first-child{min-width:90px}.f{flex:1}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.dos>div{background:#F8F8F8;border-radius:8px;padding:12px 16px}
.vacio{font-size:12px;color:#A3A3A3;text-align:center;padding:20px;font-style:italic}
.pie{padding:18px 44px;border-top:3px solid #0A0A0A;display:flex;justify-content:space-between;background:#FAFAFA;font-size:10px;color:#A3A3A3}
.pie div:last-child{text-align:right}
@media (max-width:640px){.cab,.sec,.pie{padding-left:18px;padding-right:18px}.kpis{grid-template-columns:1fr 1fr}.kpi:nth-child(2){border-right:none}
 .kpi{border-bottom:1px solid #E8E8E8}.comp{grid-template-columns:1fr}.cab img{height:48px}.tit{font-size:17px}table{font-size:11px}}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff;padding:0}
 .hoja{box-shadow:none;border-radius:0;max-width:100%}tr,.deu{break-inside:avoid}@page{margin:10mm;size:A4}}
</style></head><body><div class="hoja">
<div class="cab"><img src="${esc(logo)}" alt="Treme Grupo Inmobiliario" onerror="this.remove()">
 <div class="der"><div class="tit">Reporte mensual</div>
 <div class="sub">Torre Elysium · ${inv ? 'Resumen para inversionistas' : 'Administración'}</div><div class="per">${mes}</div></div></div>

<div class="sec">
 <div class="saldo ${saldo >= 0 ? 'pos' : 'neg'}"><div><div class="kl" style="color:#525252">Resultado del mes · saldo neto</div>
  <div class="t2" style="font-size:12px">Cobrado ${n0(d.cobrado)} − Gastado ${n0(d.egresos)}</div></div>
  <div class="v ${saldo >= 0 ? 'ok' : 'neg'}">${signo(saldo)}</div></div>
 <div class="resumen"><div class="kl">Resumen ejecutivo</div>
  En ${mes} se cobró el <b>${d.pct}%</b> del mantenimiento: <b>${n0(d.cobrado)}</b> de <b>${n0(d.esperado)}</b> esperados.
  ${d.deudores.length ? `Quedan <b class="neg">${d.deudores.length} unidades</b> sin pagar por <b class="neg">${n0(d.pendiente)}</b>.` : 'Todas las unidades pagaron.'}
  El gasto del edificio fue de <b>${n0(d.egresos)}</b> (${n0(d.egresosPrev)} en ${mesPrev}).
  <div class="b ${diffPct >= 0 ? 'ok' : 'neg'}" style="margin-top:6px;font-size:12px">${tend}</div></div>
</div>

<div class="kpis">
 <div class="kpi"><div class="kl">Total cobrado</div><div class="kv ok">${n0(d.cobrado)}</div><div class="ks">de ${n0(d.esperado)} esperado</div></div>
 <div class="kpi"><div class="kl">Total gastado</div><div class="kv neg">${n0(d.egresos)}</div><div class="ks">${n0(d.totalOp)} operativo + ${n0(d.totalNomina)} nómina</div></div>
 <div class="kpi"><div class="kl">Pendiente</div><div class="kv neg">${n0(d.pendiente)}</div><div class="ks">${d.deudores.length} unidades sin pagar</div></div>
 <div class="kpi"><div class="kl">Cobranza</div><div class="kv">${d.pct}%</div><div class="ks">${d.pagados.length} de ${d.activos.length} unidades</div></div>
</div>

<div class="sec"><div class="st">Comparativo vs. mes anterior</div>
 <div class="comp">
  <div><div class="kl">${mesPrev}</div><div class="v">${n0(d.cobradoPrev)}</div><div class="ks">${d.pctPrev}% cobrado</div></div>
  <div><div class="kl">${MESES[d.m]}</div><div class="v">${n0(d.cobrado)}</div><div class="ks">${d.pct}% cobrado</div></div>
  <div><div class="kl">Variación</div><div class="v ${diff >= 0 ? 'ok' : 'neg'}">${signo(diff)}</div><div class="ks b ${diffPct >= 0 ? 'ok' : 'neg'}">${tend}</div></div>
 </div>
 <div style="margin-top:18px;display:flex;justify-content:space-between;font-size:11px"><span class="t2">Avance de cobranza</span><b>${d.pct}%</b></div>
 <div class="barra"><span style="width:${Math.min(d.pct, 100)}%;background:${d.pct >= 80 ? '#16A34A' : '#F59E0B'}"></span></div>
</div>

${inv ? `<div class="sec"><div class="st">Pagos y cartera vencida</div>
 <div class="vacio">El detalle por unidad está en el reporte interno de administración.</div></div>` : `
<div class="sec"><div class="st">Pagos recibidos · ${d.pagados.length} unidad${d.pagados.length !== 1 ? 'es' : ''}</div>
 ${d.pagados.length ? `<table><thead><tr><th>Unidad</th><th>Propietario</th><th>Forma</th><th>Fecha</th><th class="r">Monto</th></tr></thead>
 <tbody>${filasPagados}</tbody></table>` : '<div class="vacio">Sin pagos este mes</div>'}</div>
${d.deudores.length ? `<div class="sec"><div class="st">Pendientes por cobrar · ${d.deudores.length} unidad${d.deudores.length !== 1 ? 'es' : ''}</div>${filasDeudores}</div>` : ''}`}

<div class="sec"><div class="st">Egresos operativos del edificio</div>
 <table><thead><tr><th>Fecha</th><th>Concepto</th><th>Proveedor</th><th>Categoría</th><th class="r">Monto</th></tr></thead><tbody>${filasOp}</tbody></table>
 ${d.operativos.length ? `<div class="r neg" style="margin-top:10px;font-size:12px">Total operativo: ${n0(d.totalOp)}</div>` : ''}
</div>

<div class="sec"><div class="st">Nómina del mes · ${n0(d.totalNomina)}</div>
 <div class="dos"><div><div class="kl">Total nómina</div><div class="kv neg" style="font-size:20px">${n0(d.totalNomina)}</div></div>
  <div><div class="kl">Gastos operativos</div><div class="kv neg" style="font-size:20px">${n0(d.totalOp)}</div></div></div>
 ${inv ? '<div class="vacio">El detalle por empleado está en el reporte interno de administración.</div>'
   : d.personal.length ? `<table><thead><tr><th>Empleado</th><th>Puesto</th><th class="c">Pagos</th><th class="r">Total del mes</th></tr></thead><tbody>${filasNomina}</tbody></table>`
   : '<div class="vacio">Sin nómina registrada este mes</div>'}
</div>

<div class="pie"><div>Treme Grupo Inmobiliario · Torre Elysium<br>Monterrey, N.L.</div>
 <div>Generado el ${hoy}<br>${inv ? 'Resumen mensual para inversionistas' : 'Administración de propiedades'}</div></div>
</div></body></html>`;
}
