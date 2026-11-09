// Patrimonio: inmuebles y deuda. Solo el dueño y los socios lo ven.
// La renta de cada inmueble NO se captura aquí: sale de los contratos de Rentas ligados al inmueble (tabla activo_contrato),
// así Patrimonio y Rentas siempre dicen lo mismo. Los dólares se convierten a pesos con el tipo de cambio del día.
// La deuda es de las empresas: se muestra aparte y no se resta del valor del patrimonio.
import { db, estado, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';
import { FORMAS_COBRO } from '../config.js';

const st = { vista: 'panorama', plaza: '', entidad: '', q: '' };
let raiz, activos = [], pasivos = [], contratos = [], enlaces = [], cobrar = [];
let tc = { valor: 18.5, fecha: null, fuente: 'aproximado' };

const CAMPOS_ACTIVO = [
  ['identificador', 'Unidad (cómo se llama)', 'text'], ['tipo_unidad', 'Tipo', 'text', 'lista-tipos'],
  ['entidad_legal', 'Dueño legal', 'text', 'lista-entidades'], ['codigo', 'Código interno', 'text'],
  ['valor_comercial', 'Valor comercial', 'number'], ['moneda', 'Moneda', 'select', ['MXN', 'USD']],
  ['fecha_valuacion', 'Valuación (fecha o fuente)', 'text'], ['superficie_m2', 'Superficie (m²)', 'number'],
  ['direccion', 'Dirección', 'text'], ['ciudad', 'Ciudad', 'text'],
  ['clave_catastral', 'Clave catastral', 'text'], ['uso_actual', 'Uso actual (si no está rentado)', 'text'],
  ['costo_adquisicion', 'Costo de adquisición', 'number'], ['fecha_adquisicion', 'Fecha de adquisición', 'date'],
  ['renta_mercado_estimada', 'Renta de mercado estimada', 'number'], ['fecha_vencimiento_contrato', 'Vence contrato', 'date'],
  ['notas', 'Notas', 'textarea'],
];
const CAMPOS_PASIVO = [
  ['acreedor', 'Acreedor', 'text'], ['tipo_pasivo', 'Tipo', 'select', ['Hipoteca', 'Línea de crédito', 'Crédito simple', 'Proveedor a largo plazo', 'Préstamo de socio', 'Otro']],
  ['saldo_actual', 'Saldo actual', 'number'], ['fecha_saldo', 'Saldo al', 'date'],
  ['pago_mensual', 'Pago mensual', 'number'], ['tasa_interes', 'Tasa (%)', 'number'],
  ['moneda', 'Moneda', 'select', ['MXN', 'USD']], ['fecha_inicio', 'Inicio', 'date'],
  ['fecha_vencimiento', 'Vencimiento', 'date'], ['activo_ref', 'Para qué / qué inmueble', 'text'],
  ['garantia', 'Garantía', 'text'], ['notas', 'Notas', 'textarea'],
];

export async function render(view) {
  raiz = view;
  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        <button role="tab" data-vista="panorama">Panorama</button><button role="tab" data-vista="activos">Inmuebles</button><button role="tab" data-vista="cobrar">Por cobrar</button><button role="tab" data-vista="pasivos">Deuda</button>
      </div>
      <div class="sub-meta pz-tcbox" id="pt-tc"></div>
    </div>
    <div id="pt-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    if (st.vista !== b.dataset.vista) { st.q = ''; }
    st.vista = b.dataset.vista; pintar();
  }));
  const [ok] = await Promise.all([cargar(false), cargarTipoCambio()]);
  if (ok) pintar();
}

async function cargar(repintar = true) {
  const [a, p, k, e, c] = await Promise.all([
    db().from('activos').select('*').order('codigo'),
    db().from('pasivos').select('*').order('saldo_actual', { ascending: false }),
    db().from('contratos').select('id, centro_id, arrendatario, monto, moneda, activo').order('arrendatario'),
    db().from('activo_contrato').select('activo_id, contrato_id, monto'),
    db().from('v_saldos_cxc').select('*').order('saldo', { ascending: false }),
  ]);
  const err = a.error || p.error || k.error || e.error || c.error;
  if (err) { toast('No se pudo cargar el patrimonio: ' + err.message, true); return false; }
  activos = a.data; pasivos = p.data; contratos = k.data; enlaces = e.data; cobrar = c.data;
  if (repintar) pintar();
  return true;
}

// ---------- tipo de cambio (dólar → peso) ----------
const TC_CLAVE = 'patrimonio_tc';
function leerTC() { try { return JSON.parse(localStorage.getItem(TC_CLAVE) || 'null'); } catch { return null; } }
function guardarTC(x) { try { x ? localStorage.setItem(TC_CLAVE, JSON.stringify(x)) : localStorage.removeItem(TC_CLAVE); } catch { /* sin almacenamiento */ } }
async function cargarTipoCambio() {
  const guardado = leerTC();
  if (guardado?.manual) { tc = guardado; return; }
  if (guardado?.valor && Date.now() - (guardado.leido || 0) < 6 * 3600e3) { tc = guardado; return; }
  for (const url of ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN', 'https://api.frankfurter.app/latest?from=USD&to=MXN']) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      const v = Number(j?.rates?.MXN);
      if (v > 5 && v < 50) { tc = { valor: v, fecha: j.date, fuente: 'Tipo de cambio del día', leido: Date.now() }; guardarTC(tc); return; }
    } catch { /* sigue con la otra fuente */ }
  }
  tc = guardado?.valor ? { ...guardado, fuente: 'Último tipo de cambio disponible' } : { valor: 18.5, fecha: null, fuente: 'Tipo de cambio aproximado' };
}
function pintarTC() {
  const el = raiz.querySelector('#pt-tc');
  if (!el) return;
  el.innerHTML = `<span>${tc.manual ? 'Dólar fijado a mano' : esc(tc.fuente)}${tc.fecha ? ' · ' + fmtFecha(tc.fecha) : ''}:</span>
    <button class="pz-tc" id="pt-tc-b" title="Cambiar el tipo de cambio">$${tc.valor.toFixed(2)} por dólar</button>`;
  el.querySelector('#pt-tc-b').addEventListener('click', editarTC);
}
function editarTC() {
  const modal = abrirModal({
    titulo: 'Tipo de cambio',
    cuerpo: `<form class="form" id="tc-f" onsubmit="return false"><p class="sub-meta">Pesos por dólar con los que se convierten los inmuebles, rentas y deudas en dólares.
      Por omisión se toma automáticamente el del día.</p>
      <label>Pesos por dólar<input name="v" type="number" step="0.01" inputmode="decimal" value="${tc.valor.toFixed(2)}"></label></form>`,
    pie: `${tc.manual ? '<button class="btn btn-ghost" id="tc-auto">Usar el del día</button>' : ''}<span style="flex:1"></span>
      <button class="btn btn-ghost" id="tc-x">Cancelar</button><button class="btn btn-primary" id="tc-ok">Aplicar</button>`,
  });
  modal.querySelector('#tc-x').addEventListener('click', cerrarModal);
  modal.querySelector('#tc-auto')?.addEventListener('click', async () => { guardarTC(null); cerrarModal(); await cargarTipoCambio(); pintar(); });
  modal.querySelector('#tc-ok').addEventListener('click', () => {
    const v = Number(modal.querySelector('[name=v]').value);
    if (!(v > 5 && v < 50)) return toast('Escribe un tipo de cambio válido', true);
    tc = { valor: v, manual: true, fuente: 'Dólar fijado a mano' }; guardarTC(tc); cerrarModal(); pintar();
  });
}

// ---------- cálculos ----------
const num = (v) => Number(v || 0);
const aMXN = (v, moneda) => num(v) * ((moneda || 'MXN') === 'USD' ? tc.valor : 1);
const valMX = (a) => aMXN(a.valor_comercial, a.moneda);
const usd = (v) => '$' + Math.round(v).toLocaleString('es-MX') + ' USD';
const corto = (v) => {
  const a = Math.abs(v);
  return (v < 0 ? '−' : '') + (a >= 1e6 ? `$${(a / 1e6).toFixed(1)} M` : a >= 1e4 ? `$${Math.round(a / 1e3)} mil` : fmt(a));
};
const pct = (v, d = 1) => (v * 100).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %';
const centroDe = (id) => (estado.todosCentros.length ? estado.todosCentros : estado.centros).find((c) => c.id === id);
const plazaDe = (a) => centroDe(a.centro_id)?.nombre || 'Sin plaza';
const nombreActivo = (a) => a.identificador || a.tipo_unidad || a.codigo || 'Inmueble';
const nombreLargo = (a) => `${nombreActivo(a)} · ${plazaDe(a)}`;
const contratosDe = (a) => enlaces.filter((x) => x.activo_id === a.id).map((x) => contratos.find((k) => k.id === x.contrato_id)).filter(Boolean);
const activosDe = (k) => enlaces.filter((x) => x.contrato_id === k.id).map((x) => activos.find((a) => a.id === x.activo_id)).filter(Boolean);
const enlace = (aid, kid) => enlaces.find((x) => x.activo_id === aid && x.contrato_id === kid);
const fija = (aid, kid) => { const m = enlace(aid, kid)?.monto; return m == null || m === '' ? null : num(m); };
// Parte de un contrato que corresponde a un inmueble, en la moneda del contrato: la parte fija si se capturó;
// si no, lo que sobra del contrato se reparte según el valor de los inmuebles sin parte fija.
function parteDe(a, k) {
  const f = fija(a.id, k.id);
  if (f != null) return f;
  const grupo = activosDe(k), libres = grupo.filter((x) => fija(x.id, k.id) == null);
  const resto = Math.max(0, num(k.monto) - grupo.reduce((t, x) => t + (fija(x.id, k.id) ?? 0), 0));
  const total = libres.reduce((t, x) => t + valMX(x), 0);
  return resto * (total ? valMX(a) / total : 1 / Math.max(1, libres.length));
}
// Lo que cobra un contrato y no corresponde a ningún inmueble (p. ej. el estacionamiento del edificio)
function fueraDe(k) {
  const grupo = activosDe(k);
  if (!grupo.length || grupo.some((x) => fija(x.id, k.id) == null)) return 0;
  return Math.max(0, num(k.monto) - grupo.reduce((t, x) => t + fija(x.id, k.id), 0));
}
// Renta mensual del inmueble según Rentas, en pesos
function rentaDe(a) {
  return contratosDe(a).filter((k) => k.activo).reduce((s, k) => s + aMXN(parteDe(a, k), k.moneda), 0);
}
const inquilinos = (a) => contratosDe(a).filter((k) => k.activo && num(k.monto)).map((k) => k.arrendatario);
const rentado = (a) => rentaDe(a) > 0;
const rend = (a) => valMX(a) && rentaDe(a) ? rentaDe(a) * 12 / valMX(a) : 0;
// En uso propio (oficinas de MEDCO, casa de la familia): no se cuentan como renta posible
const pesos = (v) => '$' + Math.round(v).toLocaleString('es-MX');
const usoPropio = (a) => /operaci[oó]n medco|casa de mis/i.test(a.uso_actual || '') || /^casa$/i.test(a.tipo_unidad || '');
const mediana = (l) => { const o = [...l].sort((x, y) => x - y), m = o.length >> 1; return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; };
// Renta que podría dar un inmueble sin rentar, en pesos al mes: la capturada como "renta de mercado estimada";
// si no hay, lo que se cobra por m² en inmuebles del mismo tipo y la misma plaza (mediana)
function estimada(a) {
  if (num(a.renta_mercado_estimada)) return { mx: aMXN(a.renta_mercado_estimada, a.moneda), base: 'Renta de mercado capturada' };
  const m2 = num(a.superficie_m2);
  if (!m2 || !a.centro_id) return null;
  const comps = activos.filter((x) => x.id !== a.id && x.centro_id === a.centro_id && x.tipo_unidad === a.tipo_unidad && rentado(x) && num(x.superficie_m2));
  if (!comps.length) return null;
  const pm2 = mediana(comps.map((x) => rentaDe(x) / num(x.superficie_m2)));
  const enUsd = a.moneda === 'USD';
  const porM2 = enUsd ? `US$${(pm2 / tc.valor).toFixed(2)}` : pesos(pm2);
  return { mx: pm2 * m2, base: comps.length === 1 ? `${porM2}/m², igual que ${nombreActivo(comps[0])} en ${plazaDe(a)}`
    : `${porM2}/m², mediana de ${comps.length} inmuebles rentados del mismo tipo en ${plazaDe(a)}` };
}
const saldoMX = (p) => aMXN(p.saldo_actual, p.moneda), pagoMX = (p) => aMXN(p.pago_mensual, p.moneda);
const costoMes = (p) => num(p.saldo_actual) && num(p.pago_mensual) ? num(p.pago_mensual) / num(p.saldo_actual) : null;

// Diferencias entre Patrimonio y Rentas
function porRevisar() {
  const ligados = new Set(enlaces.map((x) => x.contrato_id));
  return {
    sinInmueble: contratos.filter((k) => k.activo && num(k.monto) && !ligados.has(k.id)),
    sinContrato: activos.filter((a) => num(a.ingreso_mensual) > 0 && !contratosDe(a).length),
    contratoBaja: activos.filter((a) => contratosDe(a).length && !contratosDe(a).some((k) => k.activo && num(k.monto))),
    sinPlaza: activos.filter((a) => !a.centro_id),
  };
}

function pintar() {
  raiz.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-selected', b.dataset.vista === st.vista));
  pintarTC();
  document.getElementById('page-actions').innerHTML = st.vista === 'panorama' ? ''
    : `<button class="btn btn-primary" id="pt-nuevo">＋ ${({ activos: 'Inmueble', pasivos: 'Deuda', cobrar: 'Por cobrar' })[st.vista]}</button>`;
  document.getElementById('pt-nuevo')?.addEventListener('click', () => st.vista === 'cobrar' ? editarCobro(null) : editar(st.vista, null));
  const el = raiz.querySelector('#pt-cuerpo');
  ({ panorama: pintarPanorama, activos: pintarActivos, cobrar: pintarCobrar, pasivos: pintarPasivos })[st.vista](el);
}

// ================= PANORAMA =================
function pintarPanorama(el) {
  const mx = activos.filter((a) => (a.moneda || 'MXN') !== 'USD'), us = activos.filter((a) => a.moneda === 'USD');
  const valMxn = mx.reduce((s, a) => s + num(a.valor_comercial), 0), valUsd = us.reduce((s, a) => s + num(a.valor_comercial), 0);
  const total = valMxn + valUsd * tc.valor;
  const renta = activos.reduce((s, a) => s + rentaDe(a), 0);
  const rentaUsd = contratos.filter((k) => k.activo && k.moneda === 'USD' && activosDe(k).length).reduce((s, k) => s + num(k.monto), 0);
  const fuera = contratos.filter((k) => k.activo).reduce((s, k) => s + aMXN(fueraDe(k), k.moneda), 0);
  const conRenta = activos.filter((a) => rentado(a) && valMX(a));
  const valRentado = conRenta.reduce((s, a) => s + valMX(a), 0);
  const rendProm = valRentado ? conRenta.reduce((s, a) => s + rentaDe(a) * 12, 0) / valRentado : 0;
  const libres = activos.filter((a) => !rentado(a) && !usoPropio(a)).map((a) => ({ a, e: estimada(a) }))
    .sort((x, y) => (plazaDe(x.a)).localeCompare(plazaDe(y.a), 'es') || String(x.a.identificador).localeCompare(String(y.a.identificador), 'es', { numeric: true }));
  const propios = activos.filter((a) => !rentado(a) && usoPropio(a)).map((a) => ({ a, e: estimada(a) }));
  const proyectado = libres.reduce((s, x) => s + (x.e?.mx || 0), 0);
  const valLibre = libres.reduce((s, x) => s + valMX(x.a), 0), valPropio = propios.reduce((s, x) => s + valMX(x.a), 0);
  const deuda = pasivos.reduce((s, p) => s + saldoMX(p), 0), pagos = pasivos.reduce((s, p) => s + pagoMX(p), 0);
  const vivas = cobrar.filter((x) => num(x.saldo) > 0.5);
  const porCobrar = vivas.reduce((s, x) => s + aMXN(x.saldo, x.moneda), 0), deudores = vivas.length;
  const caras = pasivos.filter((p) => costoMes(p) != null).sort((a, b) => costoMes(b) - costoMes(a));
  const sinPago = pasivos.filter((p) => costoMes(p) == null);
  const bajo = conRenta.filter((a) => rend(a) < rendProm * 0.6).sort((a, b) => rend(a) - rend(b));
  const rev = porRevisar();
  const nRev = rev.sinInmueble.length + rev.sinContrato.length + rev.contratoBaja.length + rev.sinPlaza.length;

  // Agrupado por plaza (o por dueño legal)
  st.agrupa ||= 'plaza';
  const clave = st.agrupa === 'plaza' ? plazaDe : (a) => a.entidad_legal || 'Sin asignar';
  const grupos = [...activos.reduce((m, a) => {
    const k = clave(a), x = m.get(k) || { k, val: 0, renta: 0, n: 0, rent: 0, valRent: 0 };
    x.val += valMX(a); x.n++;
    if (rentado(a)) { x.rent++; x.renta += rentaDe(a); x.valRent += valMX(a); }
    m.set(k, x); return m;
  }, new Map()).values()].sort((a, b) => b.val - a.val);
  const maxVal = Math.max(1, ...grupos.map((g) => g.val));

  // Para decidir: solo lo más importante
  const ideas = [];
  if (proyectado) ideas.push({ c: 'aviso', t: `Puedes ganar ${corto(proyectado)} más al mes`, d: `Rentando lo disponible, según lo que ya cobras por m² en cada plaza. El detalle está en "Ver la proyección de lo disponible".` });
  if (bajo.length) ideas.push({ c: '', t: `${bajo.length} inmueble${bajo.length === 1 ? '' : 's'} rinde${bajo.length === 1 ? '' : 'n'} muy poco`,
    d: `${bajo.slice(0, 3).map((a) => `${esc(nombreLargo(a))} (${pct(rend(a))})`).join(', ')}${bajo.length > 3 ? '…' : ''}. Candidatos a subir renta o vender.` });
  if (caras[0]) ideas.push({ c: '', t: `Deuda más cara: ${esc(caras[0].acreedor)}`,
    d: `${corto(saldoMX(caras[0]))}, con pago de ${fmt(pagoMX(caras[0]))} al mes (${pct(costoMes(caras[0]))} del saldo). Conviene liquidarla o refinanciarla primero.` });

  const segOcup = [
    { t: 'Rentado', v: valRentado, c: '#101216', d: `${conRenta.length} inmuebles · ${corto(renta)}/mes` },
    { t: 'Disponible', v: valLibre, c: '#C2862F', d: `${libres.length} inmuebles · podrían dar ${corto(proyectado)}/mes` },
    { t: 'Uso propio', v: valPropio, c: '#C9C5BB', d: `${propios.length} inmuebles · ${propios.map((x) => esc(nombreActivo(x.a))).join(', ')}` },
  ].filter((x) => x.v > 0);
  const valOcup = segOcup.reduce((s, x) => s + x.v, 0);

  el.innerHTML = `
    <section class="pz-hero pz-hero5">
      <div class="pz-neto"><span>Valor total del patrimonio</span><strong>${corto(total)}</strong>
        <small>${corto(valMxn)} en México${valUsd ? ` + ${usd(valUsd)} en Estados Unidos` : ''}</small></div>
      <div class="pz-m"><span>Renta mensual</span><strong>${corto(renta)}</strong><small>según Rentas${rentaUsd ? ` · incluye ${usd(rentaUsd)}` : ''}</small></div>
      <div class="pz-m"><span>Rendimiento anual</span><strong>${pct(rendProm)}</strong><small>sobre lo rentado</small></div>
      <div class="pz-m clic" data-ir="cobrar" tabindex="0"><span>Te deben</span><strong>${corto(porCobrar)}</strong><small>${deudores} cuenta${deudores === 1 ? '' : 's'} por cobrar</small></div>
      <div class="pz-m clic" data-ir="pasivos" tabindex="0"><span>Deuda de las empresas</span><strong>${corto(deuda)}</strong><small>aparte, no se resta</small></div>
    </section>

    ${nRev ? `<details class="pz-aviso"><summary><em><b>${nRev} pendiente${nRev === 1 ? '' : 's'} por revisar</b> entre Patrimonio y Rentas</em><span>Ver</span></summary>${revisarHTML(rev)}</details>` : ''}

    <section class="panel pz-ocup">
      <div class="panel-head"><h3>¿Qué tanto está trabajando tu patrimonio?</h3>${proyectado ? `<span class="pz-chip-ok">+${corto(proyectado)}/mes posibles</span>` : ''}</div>
      <div class="pz-ocup-barra">${segOcup.map((x) => `<span style="flex:${x.v};background:${x.c}" title="${x.t} · ${corto(x.v)}"></span>`).join('')}</div>
      <div class="pz-ocup-ley">${segOcup.map((x) => `<div><i style="background:${x.c}"></i><span>${x.t}</span><b>${valOcup ? pct(x.v / valOcup, 0) : '—'}</b><strong>${corto(x.v)}</strong><small>${x.d}</small></div>`).join('')}</div>
      ${libres.length ? `<details class="pz-mas"><summary>Ver la proyección de lo disponible</summary>${proyeccionHTML(libres, propios, proyectado, renta)}</details>` : ''}
    </section>

    <section class="panel pz-grupos">
      <div class="panel-head"><h3>Dónde está tu patrimonio</h3>
        <div class="segmento" role="tablist"><button data-agrupa="plaza" class="${st.agrupa === 'plaza' ? 'activo' : ''}">Por plaza</button><button data-agrupa="dueno" class="${st.agrupa !== 'plaza' ? 'activo' : ''}">Por dueño legal</button></div></div>
      <div class="tabla-wrap"><table class="tabla tm pz-tg">
        <thead><tr><th>${st.agrupa === 'plaza' ? 'Plaza' : 'Dueño legal'}</th><th class="pz-tg-barra">Valor</th><th class="num">Rentados</th><th class="num">Renta al mes</th><th class="num">Rendimiento</th></tr></thead>
        <tbody>${grupos.map((g) => `<tr class="${st.agrupa === 'plaza' ? 'clic' : ''}" ${st.agrupa === 'plaza' ? `data-plaza-ir="${esc(g.k)}" tabindex="0"` : ''}>
          <td data-l="${st.agrupa === 'plaza' ? 'Plaza' : 'Dueño'}"><b>${esc(g.k)}</b></td>
          <td data-l="Valor" class="pz-tg-barra"><div class="pz-tg-v"><span><i style="width:${g.val / maxVal * 100}%"></i></span><b>${corto(g.val)}</b><small>${total ? pct(g.val / total, 0) : ''}</small></div></td>
          <td data-l="Rentados" class="num">${g.rent} de ${g.n}</td>
          <td data-l="Renta al mes" class="num">${g.renta ? corto(g.renta) : '<span class="mut">—</span>'}</td>
          <td data-l="Rendimiento" class="num fuerte">${g.valRent ? pct(g.renta * 12 / g.valRent) : '<span class="mut">—</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
      ${st.agrupa === 'plaza' ? '<p class="nota">Toca una plaza para ver sus inmuebles.</p>' : ''}
    </section>

    <div class="pz-grid">
      <section class="panel pz-ideas"><h3>Para decidir</h3>
        <ul>${ideas.slice(0, 3).map((i) => `<li class="${i.c}"><strong>${i.t}</strong><p>${i.d}</p></li>`).join('') || '<li>Sin alertas.</li>'}</ul></section>
      <section class="panel"><details class="pz-mas pz-sim-d"><summary><b>¿Qué pasa si vendo…?</b><span>Simula una venta y cómo baja la deuda</span></summary><div class="pz-sim" id="pz-sim"></div></details></section>
    </div>
    <p class="nota">Los dólares se convierten a pesos con el tipo de cambio de arriba. La deuda pertenece a las empresas y se muestra aparte.${fuera ? ` Además se cobran ${corto(fuera)} al mes por áreas del edificio que no son inmuebles del patrimonio.` : ''}</p>`;
  el.querySelectorAll('[data-editar]').forEach((tr) => activar(tr, () => editar('activos', tr.dataset.editar)));
  el.querySelectorAll('[data-nuevo-contrato]').forEach((b) => b.addEventListener('click', () => ligarContrato(b.dataset.nuevoContrato)));
  el.querySelectorAll('[data-ligar]').forEach((b) => b.addEventListener('click', () => editar('activos', b.dataset.ligar)));
  el.querySelectorAll('[data-ir]').forEach((d) => activar(d, () => { st.vista = d.dataset.ir; st.q = ''; pintar(); window.scrollTo(0, 0); }));
  el.querySelectorAll('[data-agrupa]').forEach((b) => b.addEventListener('click', () => { st.agrupa = b.dataset.agrupa; pintar(); }));
  el.querySelectorAll('[data-plaza-ir]').forEach((tr) => activar(tr, () => { st.plaza = tr.dataset.plazaIr; st.entidad = ''; st.q = ''; st.vista = 'activos'; pintar(); window.scrollTo(0, 0); }));
  simulador(el.querySelector('#pz-sim'), { caras, sinPago, renta });
}

function proyeccionHTML(libres, propios, total, renta) {
  const fila = (x) => `<tr class="clic" data-editar="${x.a.id}" tabindex="0">
    <td data-l="Inmueble"><b>${esc(nombreActivo(x.a))}</b><small class="sub">${esc(plazaDe(x.a))}</small></td>
    <td data-l="m²" class="num">${x.a.superficie_m2 ? num(x.a.superficie_m2).toLocaleString('es-MX') : '—'}</td>
    <td data-l="Renta estimada" class="num fuerte">${x.e ? (x.a.moneda === 'USD' ? usd(x.e.mx / tc.valor) : pesos(x.e.mx)) : '—'}</td>
    <td data-l="Cómo se calculó" class="mut">${x.e ? esc(x.e.base) : 'Sin con qué comparar: captura su renta de mercado'}</td></tr>`;
  const totPropios = propios.reduce((s, x) => s + (x.e?.mx || 0), 0);
  return `<div class="pz-proy">
    <p class="sub-meta">${total ? `<b>+${pesos(total)} al mes</b>${renta ? `, ${pct(total / renta, 0)} más de lo que cobras hoy. ` : '. '}` : ''}Se calcula con lo que ya cobras por m² en inmuebles del mismo tipo y plaza. Abre un inmueble y escribe su "renta de mercado estimada" para usar otra cifra.</p>
    <div class="tabla-wrap"><table class="tabla tm"><thead><tr><th>Inmueble</th><th class="num">m²</th><th class="num">Renta estimada al mes</th><th>Cómo se calculó</th></tr></thead>
      <tbody>${libres.map(fila).join('')}
        <tr class="pz-total"><td colspan="2"><b>Total disponible</b></td><td class="num fuerte">${pesos(total)}</td><td class="mut">${pct(total * 12 / Math.max(1, libres.reduce((s, x) => s + (x.e ? valMX(x.a) : 0), 0)))} anual sobre su valor</td></tr>
      </tbody></table></div>
    ${propios.length ? `<p class="nota">No se cuentan por estar en uso propio: ${propios.map((x) => esc(nombreActivo(x.a))).join(', ')}${totPropios ? `. Si se rentaran darían unos ${pesos(totPropios)} al mes` : ''}.</p>` : ''}
  </div>`;
}

function revisarHTML(rev) {
  const li = (titulo, detalle, boton) => `<li><div><b>${titulo}</b><small>${detalle}</small></div>${boton || ''}</li>`;
  const bloques = [];
  if (rev.sinInmueble.length) bloques.push(`<h4>Contratos en Rentas sin inmueble en Patrimonio</h4><ul>${rev.sinInmueble.map((k) =>
    li(esc(k.arrendatario), `${esc(centroDe(k.centro_id)?.nombre || 'Sin plaza')} · ${k.moneda === 'USD' ? usd(num(k.monto)) : fmt(k.monto)}/mes en Rentas`,
      `<button class="btn btn-ghost btn-sm" data-nuevo-contrato="${k.id}">Ligar inmueble</button>`)).join('')}</ul>`);
  if (rev.sinContrato.length) bloques.push(`<h4>Inmuebles con renta anotada que no existe en Rentas</h4><ul>${rev.sinContrato.map((a) =>
    li(esc(nombreLargo(a)), `Patrimonio tenía ${fmt(a.ingreso_mensual)}/mes; en Rentas no hay contrato. No se cuenta como renta hasta ligarlo.`,
      `<button class="btn btn-ghost btn-sm" data-ligar="${a.id}">Ligar contrato</button>`)).join('')}</ul>`);
  if (rev.contratoBaja.length) bloques.push(`<h4>Inmuebles cuyo contrato está dado de baja en Rentas</h4><ul>${rev.contratoBaja.map((a) =>
    li(esc(nombreLargo(a)), `Contrato: ${esc(contratosDe(a).map((k) => k.arrendatario).join(', '))}. Si sigue rentado, actívalo en Rentas.`,
      `<button class="btn btn-ghost btn-sm" data-ligar="${a.id}">Abrir</button>`)).join('')}</ul>`);
  if (rev.sinPlaza.length) bloques.push(`<h4>Inmuebles sin plaza asignada</h4><ul>${rev.sinPlaza.map((a) =>
    li(esc(nombreActivo(a)), esc(a.entidad_legal || ''), `<button class="btn btn-ghost btn-sm" data-ligar="${a.id}">Asignar plaza</button>`)).join('')}</ul>`);
  return `<div class="pz-rev">${bloques.join('')}</div>`;
}

// Contrato de Rentas sin inmueble: elegir un inmueble existente de esa plaza o crear uno nuevo ya ligado
function ligarContrato(kid) {
  const k = contratos.find((x) => x.id === kid); if (!k) return;
  const opciones = activos.filter((a) => a.centro_id === k.centro_id).sort((a, b) => String(a.identificador || '').localeCompare(String(b.identificador || ''), 'es', { numeric: true }));
  const modal = abrirModal({
    titulo: `Ligar «${k.arrendatario}»`,
    cuerpo: `<p class="sub-meta">${esc(centroDe(k.centro_id)?.nombre || 'Sin plaza')} · ${k.moneda === 'USD' ? usd(num(k.monto)) : fmt(k.monto)}/mes en Rentas.
      Marca el inmueble o los inmuebles que ocupa este contrato.</p>
      <div class="pz-cands" id="lc-l">${opciones.map((a) => `<label class="pz-cand"><input type="checkbox" value="${a.id}">
        <span><b>${esc(nombreActivo(a))}</b><small>${inquilinos(a).length ? 'Rentado a ' + esc(inquilinos(a).join(', ')) : 'Sin renta'} · ${corto(valMX(a))}</small></span></label>`).join('')
        || '<div class="vacio">Esta plaza no tiene inmuebles en Patrimonio.</div>'}</div>`,
    pie: `<button class="btn btn-ghost" id="lc-nuevo">＋ Es un inmueble nuevo</button><span style="flex:1"></span>
      <button class="btn btn-ghost" id="lc-x">Cancelar</button><button class="btn btn-primary" id="lc-ok">Ligar</button>`,
  });
  modal.querySelectorAll('#lc-l input').forEach((c) => c.addEventListener('change', () => c.closest('.pz-cand').classList.toggle('on', c.checked)));
  modal.querySelector('#lc-x').addEventListener('click', cerrarModal);
  modal.querySelector('#lc-nuevo').addEventListener('click', () => { cerrarModal(); editar('activos', null, kid); });
  modal.querySelector('#lc-ok').addEventListener('click', async (ev) => {
    const ids = [...modal.querySelectorAll('#lc-l input:checked')].map((c) => c.value);
    if (!ids.length) return toast('Marca al menos un inmueble, o usa "Es un inmueble nuevo"', true);
    ev.currentTarget.disabled = true;
    const { error } = await db().from('activo_contrato').insert(ids.map((a) => ({ org_id: estado.miembro.org_id, activo_id: a, contrato_id: kid })));
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo ligar: ' + error.message, true); }
    await db().from('activos').update({ ingreso_mensual: null, inquilino: null }).in('id', ids);
    cerrarModal(); toast('Contrato ligado'); cargar();
  });
}

// ¿Qué pasa si vendo…? Se eligen inmuebles; el dinero paga primero la deuda más cara (todo en pesos).
function simulador(el, { caras, sinPago, renta }) {
  st.venta ||= new Set();
  const pagos = pasivos.reduce((s, p) => s + pagoMX(p), 0);
  const candidatos = activos.filter((a) => valMX(a)).sort((a, b) => (rentado(a) - rentado(b)) || rend(a) - rend(b));
  const pintarSim = () => {
    const elegidos = candidatos.filter((a) => st.venta.has(a.id));
    const descuento = (st.descVenta ?? 10) / 100;
    let caja = elegidos.reduce((s, a) => s + valMX(a), 0) * (1 - descuento);
    const bruto = caja;
    const rentaPerdida = elegidos.reduce((s, a) => s + rentaDe(a), 0);
    let pagosAhorro = 0; const liquida = [];
    for (const p of [...caras, ...sinPago]) {
      if (caja <= 0) break;
      const s = saldoMX(p); if (!s) continue;
      const usa = Math.min(s, caja);
      caja -= usa;
      if (costoMes(p) != null) pagosAhorro += pagoMX(p) * (usa / s);
      liquida.push({ p, usa, total: usa >= s - 0.5 });
    }
    const neto = pagosAhorro - rentaPerdida;
    el.innerHTML = `<div class="panel-head"><h3>¿Qué pasa si vendo…?</h3><label class="pz-desc">Vender con descuento de <input type="number" id="pz-d" min="0" max="50" step="1" value="${st.descVenta ?? 10}"> %</label></div>
      <p class="sub-meta">Elige inmuebles; lo que se obtenga paga primero la deuda más cara.</p>
      <div class="pz-cands">${candidatos.slice(0, 16).map((a) => `<label class="pz-cand ${st.venta.has(a.id) ? 'on' : ''}"><input type="checkbox" value="${a.id}" ${st.venta.has(a.id) ? 'checked' : ''}>
        <span><b>${esc(nombreActivo(a))}</b><small>${esc(plazaDe(a))} · ${rentado(a) ? `rinde ${pct(rend(a))}` : 'sin renta'} · ${corto(valMX(a))}</small></span></label>`).join('')}</div>
      ${elegidos.length ? `<div class="pz-res">
        <div><span>Se obtiene</span><strong>${corto(bruto)}</strong></div>
        <div><span>Renta que se pierde</span><strong class="neg">−${corto(rentaPerdida)}</strong><small>al mes</small></div>
        <div><span>Pagos que se ahorran</span><strong class="pos">+${corto(pagosAhorro)}</strong><small>neto ${neto >= 0 ? '+' : ''}${corto(neto)} al mes</small></div></div>
        <ul class="pz-liq">${liquida.map((x) => `<li><span>${esc(x.p.acreedor)}</span><b>${x.total ? 'Se liquida' : 'Abono ' + corto(x.usa)}</b></li>`).join('')}
          ${caja > 0.5 ? `<li><span>Sobra en caja</span><b>${corto(caja)}</b></li>` : ''}</ul>
        <p class="nota">Estimación sin impuestos ni comisiones de venta.</p>`
      : '<div class="vacio">Elige uno o varios inmuebles para ver el efecto.</div>'}`;
    el.querySelectorAll('.pz-cand input').forEach((c) => c.addEventListener('change', () => { c.checked ? st.venta.add(c.value) : st.venta.delete(c.value); pintarSim(); }));
    el.querySelector('#pz-d').addEventListener('change', (e) => { st.descVenta = Math.max(0, Math.min(50, Number(e.target.value) || 0)); pintarSim(); });
  };
  pintarSim();
}

// ================= INMUEBLES (por plaza) =================
function pintarActivos(el) {
  const total = activos.reduce((s, a) => s + valMX(a), 0);
  const plazas = [...new Set(activos.map(plazaDe))].sort((a, b) => a === 'Sin plaza' ? 1 : b === 'Sin plaza' ? -1 : a.localeCompare(b, 'es'));
  const entidades = [...new Set(activos.map((a) => a.entidad_legal || 'Sin asignar'))].sort();
  const filas = activos.filter((a) => (!st.plaza || plazaDe(a) === st.plaza) && (!st.entidad || (a.entidad_legal || 'Sin asignar') === st.entidad)
    && (!st.q || normalizar([a.codigo, a.identificador, a.tipo_unidad, plazaDe(a), a.ciudad, inquilinos(a).join(' '), a.uso_actual].join(' ')).includes(normalizar(st.q))));
  const grupos = plazas.map((p) => ({ p, l: filas.filter((a) => plazaDe(a) === p).sort((a, b) => String(a.identificador || '').localeCompare(String(b.identificador || ''), 'es', { numeric: true })) })).filter((g) => g.l.length);
  const dinero = (a, x) => x ? (a.moneda === 'USD' ? usd(x) : fmt(x)) : '—';
  el.innerHTML = `
    <div class="cx">${['', ...plazas].map((p) => {
      const l = activos.filter((a) => !p || plazaDe(a) === p);
      return `<button class="cx-chip ${st.plaza === p ? 'activo' : ''}" data-plaza="${esc(p)}"><span>${esc(p || 'Todas')}</span><b>${l.length} · ${corto(l.reduce((s, a) => s + valMX(a), 0))}</b></button>`; }).join('')}</div>
    <section class="panel">
      <div class="panel-head"><h3>${filas.length} inmueble${filas.length !== 1 ? 's' : ''} · ${corto(filas.reduce((s, a) => s + valMX(a), 0))}</h3>
        <div class="filtros filtros-sm"><input type="search" id="pt-q" placeholder="Buscar unidad, plaza, inquilino…" value="${esc(st.q)}" aria-label="Buscar inmueble">
          <select id="pt-ent" aria-label="Dueño legal"><option value="">Todos los dueños</option>${entidades.map((e) => `<option value="${esc(e)}" ${st.entidad === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div></div>
      <div class="tabla-wrap"><table class="tabla tm">
        <thead><tr><th>Inmueble</th><th>Inquilino (según Rentas)</th><th class="num">m²</th><th class="num">Valor</th><th class="num">Renta/mes</th><th class="num">Rend. anual</th><th class="num">% del total</th></tr></thead>
        <tbody>${grupos.length ? grupos.map((g) => `
          <tr class="pz-grupo"><td colspan="7"><b>${esc(g.p)}</b><span>${g.l.length} · ${corto(g.l.reduce((s, a) => s + valMX(a), 0))} · renta ${corto(g.l.reduce((s, a) => s + rentaDe(a), 0))}/mes</span></td></tr>
          ${g.l.map((a) => {
            const r = rentaDe(a), inq = inquilinos(a), rUsd = a.moneda === 'USD' && r ? r / tc.valor : 0;
            return `<tr class="clic" data-editar="${a.id}" tabindex="0">
              <td data-l="Inmueble"><b>${esc(nombreActivo(a))}</b><small class="sub">${esc([a.tipo_unidad, a.codigo].filter(Boolean).join(' · '))}</small></td>
              <td data-l="Inquilino">${inq.length ? esc(inq.join(', ')) : `<span class="vc-chip aviso">${esc(a.uso_actual && !/^rentado/i.test(a.uso_actual) ? a.uso_actual : 'Sin renta')}</span>`}</td>
              <td data-l="m²" class="num">${a.superficie_m2 ? num(a.superficie_m2).toLocaleString('es-MX') : '—'}</td>
              <td data-l="Valor" class="num">${dinero(a, num(a.valor_comercial))}</td>
              <td data-l="Renta/mes" class="num">${r ? (rUsd ? usd(rUsd) : fmt(r)) : '—'}</td>
              <td data-l="Rend. anual" class="num fuerte">${rend(a) ? pct(rend(a)) : '—'}</td>
              <td data-l="% del total" class="num mut">${total && valMX(a) ? pct(valMX(a) / total) : '—'}</td></tr>`;
          }).join('')}`).join('') : '<tr><td colspan="7" class="vacio">Sin inmuebles para este filtro</td></tr>'}</tbody>
      </table></div>
      <p class="nota">La renta de cada inmueble se toma de su contrato en Rentas. Si un contrato abarca varios locales, se reparte según el valor de cada uno.</p>
    </section>`;
  el.querySelectorAll('[data-plaza]').forEach((b) => b.addEventListener('click', () => { st.plaza = b.dataset.plaza; pintar(); }));
  el.querySelector('#pt-ent').addEventListener('change', (e) => { st.entidad = e.target.value; pintar(); });
  conectarTabla(el, 'activos');
}

// ================= POR COBRAR =================
// Lo que le deben a las empresas: saldos de compra de unidades de Elysium, clientes de obra (MEDCO) y adeudos de renta.
const TIPOS_COBRO = { cartera_vencida: 'Unidades vendidas por terminar de pagar', venta: 'Clientes de obra', adeudo_inicial: 'Rentas atrasadas', otro: 'Otros' };
function pintarCobrar(el) {
  const filas = cobrar.filter((x) => !st.q || normalizar([x.cliente, x.referencia, x.notas, centroDe(x.centro_id)?.nombre].join(' ')).includes(normalizar(st.q)));
  const vivas = filas.filter((x) => num(x.saldo) > 0.5), pagadas = filas.filter((x) => num(x.saldo) <= 0.5);
  const total = vivas.reduce((s, x) => s + aMXN(x.saldo, x.moneda), 0);
  const grupos = Object.keys(TIPOS_COBRO).map((t) => ({ t, l: vivas.filter((x) => (x.tipo || 'otro') === t) })).filter((g) => g.l.length);
  const mayor = [...vivas].sort((a, b) => aMXN(b.saldo, b.moneda) - aMXN(a.saldo, a.moneda))[0];
  const fila = (x) => {
    const r = x.tipo === 'adeudo_inicial';
    return `<tr>
      <td data-l="Quién debe"><b>${esc(x.cliente || '—')}</b><small class="sub">${esc([x.referencia, centroDe(x.centro_id)?.nombre].filter(Boolean).join(' · '))}</small></td>
      <td data-l="Original" class="num mut">${fmt(x.monto_original)}</td>
      <td data-l="Abonado" class="num">${num(x.pagado) ? fmt(x.pagado) : '<span class="mut">—</span>'}</td>
      <td data-l="Saldo" class="num fuerte">${fmt(x.saldo)}</td>
      <td class="acciones">${r ? '<span class="mut">Se cobra en Rentas</span>' : `<button class="btn btn-sm btn-primary" data-abono="${x.id}">Abono</button>`}
        <button class="btn btn-sm btn-ghost" data-cobro="${x.id}">Editar</button></td></tr>`;
  };
  el.innerHTML = `
    <div class="vc-cifras">
      <div class="vc-cifra"><span>Te deben</span><strong>${corto(total)}</strong><small>${vivas.length} cuenta${vivas.length === 1 ? '' : 's'}</small></div>
      ${grupos.slice(0, 2).map((g) => `<div class="vc-cifra"><span>${esc(TIPOS_COBRO[g.t])}</span><strong>${corto(g.l.reduce((s, x) => s + aMXN(x.saldo, x.moneda), 0))}</strong><small>${g.l.length} cuenta${g.l.length === 1 ? '' : 's'}</small></div>`).join('')}
      ${mayor ? `<div class="vc-cifra"><span>La más grande</span><strong>${corto(aMXN(mayor.saldo, mayor.moneda))}</strong><small>${esc(mayor.cliente || '')}</small></div>` : ''}
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h3>Cuentas por cobrar</h3><input type="search" id="pt-q" placeholder="Buscar nombre o unidad…" value="${esc(st.q)}" aria-label="Buscar cuenta"></div>
      <div class="tabla-wrap"><table class="tabla tm">
        <thead><tr><th>Quién debe</th><th class="num">Original</th><th class="num">Abonado</th><th class="num">Saldo</th><th></th></tr></thead>
        <tbody>${grupos.length ? grupos.map((g) => `<tr class="pz-grupo"><td colspan="5"><b>${esc(TIPOS_COBRO[g.t])}</b><span>${g.l.length} · ${corto(g.l.reduce((s, x) => s + aMXN(x.saldo, x.moneda), 0))}</span></td></tr>${g.l.map(fila).join('')}`).join('')
          : '<tr><td colspan="5" class="vacio">Nadie te debe con este filtro.</td></tr>'}</tbody>
      </table></div>
      ${pagadas.length ? `<details class="pz-mas"><summary>${pagadas.length} cuenta${pagadas.length === 1 ? '' : 's'} ya liquidada${pagadas.length === 1 ? '' : 's'}</summary>
        <ul class="pz-liq">${pagadas.map((x) => `<li><span>${esc(x.cliente)} · ${esc(x.referencia || '')}</span><b>${fmt(x.monto_original)}</b></li>`).join('')}</ul></details>` : ''}
      <p class="nota">Lo que te deben no se suma al valor del patrimonio; se muestra aparte. Cada abono registrado aquí baja el saldo y cuenta como ingreso del mes.</p>
    </section>`;
  const q = el.querySelector('#pt-q');
  q.addEventListener('input', (e) => { st.q = e.target.value; const pos = e.target.selectionStart; pintar(); const n = raiz.querySelector('#pt-q'); n.focus(); n.setSelectionRange(pos, pos); });
  el.querySelectorAll('[data-abono]').forEach((b) => b.addEventListener('click', () => abonoCobro(b.dataset.abono)));
  el.querySelectorAll('[data-cobro]').forEach((b) => b.addEventListener('click', () => editarCobro(b.dataset.cobro)));
}

function abonoCobro(id) {
  const x = cobrar.find((c) => c.id === id); if (!x) return;
  const modal = abrirModal({
    titulo: `Abono · ${x.cliente}`,
    cuerpo: `<form class="form" id="ab-f" onsubmit="return false"><p class="sub-meta">${esc(x.referencia || '')} · saldo actual ${fmt(x.saldo)}</p>
      <div class="form-2"><label>Fecha<input type="date" name="fecha" value="${hoyISO()}"></label>
      <label>Monto<input type="number" name="monto" step="0.01" min="0.01" inputmode="decimal" required></label></div>
      <label>Forma de cobro<select name="forma">${FORMAS_COBRO.map((f) => `<option>${f}</option>`).join('')}</select></label>
      <label>Notas<input name="notas" maxlength="200"></label></form>`,
    pie: `<span style="flex:1"></span><button class="btn btn-ghost" id="ab-x">Cancelar</button><button class="btn btn-primary" id="ab-ok">Registrar abono</button>`,
  });
  modal.querySelector('#ab-x').addEventListener('click', cerrarModal);
  modal.querySelector('#ab-ok').addEventListener('click', async (ev) => {
    const f = modal.querySelector('#ab-f'), monto = Number(f.monto.value);
    if (!(monto > 0)) return toast('Escribe el monto del abono', true);
    ev.currentTarget.disabled = true;
    const { error } = await db().from('pagos').insert({ org_id: estado.miembro.org_id, empresa_id: x.empresa_id, centro_id: x.centro_id, cxc_id: x.id,
      concepto: x.tipo === 'venta' ? 'venta' : 'cartera', fecha: f.fecha.value, monto, moneda: x.moneda || 'MXN', forma_pago: f.forma.value,
      notas: [x.referencia, f.notas.value.trim()].filter(Boolean).join(' · ') || null, capturado_por: estado.miembro.nombre });
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo registrar: ' + error.message, true); }
    cerrarModal(); toast('Abono registrado'); cargar();
  });
}

function editarCobro(id) {
  const x = id ? cobrar.find((c) => c.id === id) : { tipo: 'cartera_vencida', moneda: 'MXN' };
  const centros = (estado.centros.length ? estado.centros : estado.todosCentros).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const modal = abrirModal({
    titulo: id ? `Cuenta por cobrar · ${x.cliente}` : 'Nueva cuenta por cobrar',
    cuerpo: `<form class="form" id="cx-f" onsubmit="return false"><div class="form-2">
      <label>Quién debe<input name="cliente" value="${esc(x.cliente || '')}" maxlength="120"></label>
      <label>Unidad o concepto<input name="referencia" value="${esc(x.referencia || '')}" maxlength="120" placeholder="Ej. Departamento 1209"></label>
      <label>Monto que debe (original)<input name="monto" type="number" step="0.01" inputmode="decimal" value="${x.monto_original ?? ''}"></label>
      <label>Tipo<select name="tipo">${Object.entries(TIPOS_COBRO).filter(([t]) => t !== 'adeudo_inicial' || x.tipo === t).map(([t, n]) => `<option value="${t}" ${x.tipo === t ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="ancho">Plaza / obra<select name="centro"><option value="">—</option>${centros.map((c) => `<option value="${c.id}" ${c.id === x.centro_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      <label class="ancho">Notas<textarea name="notas" rows="3">${esc(x.notas || '')}</textarea></label></div>
      ${id && num(x.pagado) ? `<p class="nota">Lleva ${fmt(x.pagado)} abonados; el saldo es el monto original menos los abonos.</p>` : ''}</form>`,
    pie: `${id && !num(x.pagado) ? '<button class="btn btn-ghost peligro" id="cx-borrar">Eliminar</button>' : ''}<span style="flex:1"></span>
      <button class="btn btn-ghost" id="cx-x">Cancelar</button><button class="btn btn-primary" id="cx-ok">Guardar</button>`,
  });
  modal.querySelector('#cx-x').addEventListener('click', cerrarModal);
  modal.querySelector('#cx-ok').addEventListener('click', async (ev) => {
    const f = modal.querySelector('#cx-f');
    const centro = f.centro.value ? centroDe(f.centro.value) : null;
    const datos = { cliente: f.cliente.value.trim(), referencia: f.referencia.value.trim() || null, monto_original: Number(f.monto.value),
      tipo: f.tipo.value, centro_id: centro?.id || null, notas: f.notas.value.trim() || null };
    if (!datos.cliente || !(datos.monto_original > 0)) return toast('Escribe quién debe y cuánto', true);
    const empresa_id = centro?.empresa_id || x.empresa_id || estado.foco || (estado.empresas.find((e) => e.nombre_corto === 'Treme') || estado.empresas[0])?.id;
    ev.currentTarget.disabled = true;
    const { error } = id ? await db().from('cuentas_por_cobrar').update({ ...datos, empresa_id }).eq('id', id)
      : await db().from('cuentas_por_cobrar').insert({ ...datos, empresa_id, org_id: estado.miembro.org_id, moneda: 'MXN', fecha_origen: hoyISO() });
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
    cerrarModal(); toast('Guardado'); cargar();
  });
  modal.querySelector('#cx-borrar')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Toca otra vez'; return; }
    const { error } = await db().from('cuentas_por_cobrar').delete().eq('id', id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    cerrarModal(); toast('Eliminada'); cargar();
  });
}

// ================= DEUDA =================
const empresaDe = (id) => (estado.todasEmpresas.length ? estado.todasEmpresas : estado.empresas).find((e) => e.id === id);
function pintarPasivos(el) {
  const emps = [...new Set(pasivos.map((p) => p.empresa_id))].map(empresaDe).filter(Boolean);
  const filas = pasivos.filter((p) => (!st.empDeuda || p.empresa_id === st.empDeuda) && (!st.q || normalizar([p.acreedor, p.tipo_pasivo, p.activo_ref, p.notas].join(' ')).includes(normalizar(st.q))))
    .sort((a, b) => (costoMes(b) ?? -1) - (costoMes(a) ?? -1) || saldoMX(b) - saldoMX(a));
  const total = filas.reduce((s, p) => s + saldoMX(p), 0), pagos = filas.reduce((s, p) => s + pagoMX(p), 0);
  el.innerHTML = `
    ${emps.length > 1 ? `<div class="cx">${[{ id: '', nombre_corto: 'Todas' }, ...emps].map((e) => {
      const l = pasivos.filter((p) => !e.id || p.empresa_id === e.id);
      return `<button class="cx-chip ${(st.empDeuda || '') === e.id ? 'activo' : ''}" data-empd="${e.id}"><span>${esc(e.nombre_corto)}</span><b>${l.length} · ${corto(l.reduce((s, p) => s + saldoMX(p), 0))}</b></button>`; }).join('')}</div>` : ''}
    <div class="vc-cifras">
      <div class="vc-cifra"><span>Deuda de las empresas</span><strong>${corto(total)}</strong><small>${filas.length} acreedores</small></div>
      <div class="vc-cifra"><span>Pagos al mes</span><strong>${corto(pagos)}</strong><small>${filas.filter((p) => num(p.pago_mensual)).length} con pago registrado</small></div>
      <div class="vc-cifra"><span>Sin calendario</span><strong>${corto(filas.filter((p) => !num(p.pago_mensual)).reduce((s, p) => s + saldoMX(p), 0))}</strong><small>sin pago mensual</small></div>
      <div class="vc-cifra"><span>Las 2 más grandes</span><strong>${total ? pct(filas.map(saldoMX).sort((a, b) => b - a).slice(0, 2).reduce((s, x) => s + x, 0) / total, 0) : '—'}</strong><small>de toda la deuda</small></div>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h3>Orden sugerido para pagar <small class="sub-meta">· primero la más cara</small></h3>
        <input type="search" id="pt-q" placeholder="Buscar acreedor…" value="${esc(st.q)}" aria-label="Buscar deuda"></div>
      <div class="tabla-wrap"><table class="tabla tm">
        <thead><tr><th>#</th><th>Acreedor</th><th>Empresa</th><th>Tipo</th><th class="num">Saldo</th><th>Peso</th><th class="num">Pago mensual</th><th class="num">Costo al mes</th><th>Vence</th></tr></thead>
        <tbody>${filas.length ? filas.map((p, i) => `<tr class="clic" data-editar="${p.id}" tabindex="0">
          <td class="mut" data-l="#">${i + 1}</td>
          <td data-l="Acreedor"><b>${esc(p.acreedor || '—')}</b>${p.activo_ref && p.activo_ref !== 'General/Corporativo' ? `<small class="sub">${esc(p.activo_ref)}</small>` : ''}</td>
          <td data-l="Empresa">${esc(empresaDe(p.empresa_id)?.nombre_corto || '—')}</td>
          <td data-l="Tipo" class="mut">${esc(p.tipo_pasivo || '—')}</td>
          <td data-l="Saldo" class="num fuerte">${p.moneda === 'USD' ? usd(num(p.saldo_actual)) : fmt(p.saldo_actual)}${p.fecha_saldo ? `<small class="sub">al ${fmtFecha(p.fecha_saldo)}</small>` : ''}</td>
          <td data-l="Peso"><div class="pz-pista mini"><span style="width:${total ? saldoMX(p) / total * 100 : 0}%"></span></div><small class="sub">${total ? pct(saldoMX(p) / total, 0) : ''}</small></td>
          <td data-l="Pago mensual" class="num">${p.pago_mensual ? (p.moneda === 'USD' ? usd(num(p.pago_mensual)) : fmt(p.pago_mensual)) : '<span class="mut">Sin pago</span>'}</td>
          <td data-l="Costo al mes" class="num">${costoMes(p) != null ? `<span class="${costoMes(p) >= .015 ? 'neg fuerte' : ''}">${pct(costoMes(p))}</span>` : p.tasa_interes != null ? `<span class="mut">tasa ${tasa(p.tasa_interes)}</span>` : '—'}</td>
          <td data-l="Vence">${p.fecha_vencimiento ? fmtFecha(p.fecha_vencimiento) : '<span class="mut">—</span>'}</td></tr>`).join('')
          : '<tr><td colspan="9" class="vacio">Sin deudas</td></tr>'}</tbody>
      </table></div>
      <p class="nota">Costo al mes = pago mensual ÷ saldo. Incluye capital e intereses; sirve para comparar cuál pesa más en el flujo. La deuda es de las empresas y no se resta del valor del patrimonio.</p>
    </section>`;
  el.querySelectorAll('[data-empd]').forEach((b) => b.addEventListener('click', () => { st.empDeuda = b.dataset.empd; pintar(); }));
  conectarTabla(el, 'pasivos');
}

const tasa = (t) => (num(t) * 100).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '%';

function activar(elem, fn) {
  elem.addEventListener('click', fn);
  elem.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
}

function conectarTabla(el, tipo) {
  const q = el.querySelector('#pt-q');
  q.addEventListener('input', (e) => {
    st.q = e.target.value; const pos = e.target.selectionStart; pintar();
    const n = raiz.querySelector('#pt-q'); n.focus(); n.setSelectionRange(pos, pos);
  });
  el.querySelectorAll('[data-editar]').forEach((tr) => activar(tr, () => editar(tipo, tr.dataset.editar)));
}

// ---------- edición ----------
// contratoInicial: al venir de "Por revisar", el inmueble nuevo ya trae su plaza y su contrato marcado.
function editar(tipo, id, contratoInicial = null) {
  const esActivo = tipo === 'activos';
  const campos = esActivo ? CAMPOS_ACTIVO : CAMPOS_PASIVO;
  const lista = esActivo ? activos : pasivos;
  const kIni = contratoInicial && contratos.find((k) => k.id === contratoInicial);
  const r = id ? lista.find((x) => x.id === id) : { moneda: kIni?.moneda || 'MXN', centro_id: kIni?.centro_id || null };
  const ligadosIni = new Set(id ? enlaces.filter((x) => x.activo_id === id).map((x) => x.contrato_id) : kIni ? [kIni.id] : []);
  if (!id) ligadosIni.clear();
  const marcados = new Set(id ? ligadosIni : kIni ? [kIni.id] : []);
  const partes = new Map(id ? enlaces.filter((x) => x.activo_id === id).map((x) => [x.contrato_id, x.monto ?? null]) : []);
  const valor = (c) => { const v = r[c]; if (v == null) return ''; return c === 'tasa_interes' ? +(num(v) * 100).toFixed(4) : v; };
  const centros = (estado.centros.length ? estado.centros : estado.todosCentros).filter((c) => c.activo !== false || c.id === r.centro_id)
    .slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const datalists = `
    <datalist id="lista-entidades">${[...new Set(activos.map((a) => a.entidad_legal).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
    <datalist id="lista-tipos">${[...new Set(activos.map((a) => a.tipo_unidad).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const campo = ([c, et, t, op]) => {
    if (t === 'textarea') return `<label class="ancho">${et}<textarea name="${c}" rows="2">${esc(valor(c))}</textarea></label>`;
    if (t === 'select') return `<label>${et}<select name="${c}">${op.map((o) => `<option ${valor(c) === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    return `<label>${et}<input name="${c}" type="${t}" ${t === 'number' ? 'step="any" inputmode="decimal"' : ''} ${op ? `list="${op}"` : ''} value="${esc(valor(c))}"></label>`;
  };
  const empresasTodas = estado.todasEmpresas.length ? estado.todasEmpresas : estado.empresas;
  const empCampo = !esActivo ? `<label class="ancho">Empresa que debe<select name="empresa_id">${empresasTodas.map((e) =>
    `<option value="${e.id}" ${e.id === (r.empresa_id || estado.foco || empresasTodas[0]?.id) ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></label>` : '';
  const plazaCampo = esActivo ? `<label class="ancho">Plaza / desarrollo<select name="centro_id"><option value="">Sin plaza</option>
    ${centros.map((c) => `<option value="${c.id}" ${c.id === r.centro_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>` : '';
  const titulo = esActivo ? (id ? nombreLargo(r) : 'Nuevo inmueble') : (id ? `Deuda · ${r.acreedor || ''}` : 'Nueva deuda');
  const modal = abrirModal({
    titulo, ancho: esActivo,
    cuerpo: `<form id="pt-f" class="form" onsubmit="return false"><div class="form-2">${plazaCampo}${empCampo}${campos.map(campo).join('')}</div>
      ${esActivo ? `<div class="pz-ligar"><h4>Contratos en Rentas</h4><p class="sub-meta">La renta de este inmueble se toma de los contratos que marques aquí (se muestran los de la plaza elegida). Si un contrato incluye algo que no es de este inmueble, como un estacionamiento del edificio, escribe solo la parte que le corresponde.</p><div class="pz-cands" id="pt-contratos"></div></div>` : ''}
      ${datalists}</form>`,
    pie: `${id ? '<button class="btn btn-ghost peligro" id="pt-borrar">Eliminar</button>' : ''}<span style="flex:1"></span>
      <button class="btn btn-ghost" id="pt-cancelar">Cancelar</button><button class="btn btn-primary" id="pt-ok">Guardar</button>`,
  });
  modal.querySelector('#pt-cancelar').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#pt-f');
  const pintarContratos = () => {
    const box = modal.querySelector('#pt-contratos'); if (!box) return;
    const plaza = f.centro_id.value;
    const opciones = contratos.filter((k) => marcados.has(k.id) || (plaza && k.centro_id === plaza && k.activo));
    box.innerHTML = opciones.length ? opciones.map((k) => {
      const otros = activosDe(k).filter((a) => a.id !== id);
      const parte = partes.get(k.id);
      return `<div class="pz-cand pz-cand-k ${marcados.has(k.id) ? 'on' : ''}"><label><input type="checkbox" value="${k.id}" ${marcados.has(k.id) ? 'checked' : ''}>
        <span><b>${esc(k.arrendatario)}</b><small>${k.moneda === 'USD' ? usd(num(k.monto)) : fmt(k.monto)}/mes${k.activo ? '' : ' · dado de baja'}${otros.length ? ` · también ${esc(otros.map(nombreActivo).join(', '))}` : ''}</small></span></label>
        <label class="pz-parte">Parte de este inmueble<input type="number" step="any" inputmode="decimal" min="0" data-parte="${k.id}" placeholder="Todo el contrato" value="${parte ?? ''}"></label></div>`;
    }).join('') : `<div class="vacio">${plaza ? 'Esta plaza no tiene contratos activos en Rentas.' : 'Elige la plaza para ver sus contratos.'}</div>`;
    box.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => { c.checked ? marcados.add(c.value) : marcados.delete(c.value); c.closest('.pz-cand').classList.toggle('on', c.checked); }));
    box.querySelectorAll('[data-parte]').forEach((i) => i.addEventListener('input', () => partes.set(i.dataset.parte, i.value === '' ? null : Number(i.value))));
  };
  if (esActivo) { pintarContratos(); f.centro_id.addEventListener('change', pintarContratos); }

  modal.querySelector('#pt-ok').addEventListener('click', async (ev) => {
    const datos = {};
    for (const [c, , t] of campos) {
      const v = f[c].value.trim();
      datos[c] = v === '' ? null : t === 'number' ? Number(v) : v;
    }
    if (datos.tasa_interes != null) datos.tasa_interes = datos.tasa_interes / 100;
    datos.moneda = datos.moneda || 'MXN';
    if (esActivo) {
      if (!datos.identificador) return toast('Escribe cómo se llama la unidad (por ejemplo, Local 21)', true);
      datos.centro_id = f.centro_id.value || null;
      const c = datos.centro_id && centroDe(datos.centro_id);
      if (c?.empresa_id) datos.empresa_id = c.empresa_id;
      // La renta vive en Rentas: el dato viejo de Patrimonio se limpia en cuanto el inmueble queda ligado a un contrato
      if (marcados.size) { datos.ingreso_mensual = null; datos.inquilino = null; }
    } else {
      if (!datos.acreedor) return toast('Escribe el acreedor', true);
      datos.empresa_id = f.empresa_id.value;
    }
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
    const res = id
      ? await db().from(tipo).update(datos).eq('id', id).select('id').single()
      : await db().from(tipo).insert({ ...datos, org_id: estado.miembro.org_id, empresa_id: datos.empresa_id || empresaPara(datos) }).select('id').single();
    if (res.error) { btn.disabled = false; btn.textContent = 'Guardar'; return toast('No se pudo guardar: ' + res.error.message, true); }
    if (esActivo) {
      const aid = res.data.id;
      const quitar = [...ligadosIni].filter((k) => !marcados.has(k)), poner = [...marcados].filter((k) => !ligadosIni.has(k));
      const parteDe_ = (k) => { const v = partes.get(k); return v == null || isNaN(v) ? null : v; };
      const cambiar = [...marcados].filter((k) => ligadosIni.has(k) && parteDe_(k) !== (enlace(aid, k)?.monto == null ? null : num(enlace(aid, k).monto)));
      const ops = [];
      if (quitar.length) ops.push(db().from('activo_contrato').delete().eq('activo_id', aid).in('contrato_id', quitar));
      if (poner.length) ops.push(db().from('activo_contrato').insert(poner.map((k) => ({ org_id: estado.miembro.org_id, activo_id: aid, contrato_id: k, monto: parteDe_(k) }))));
      cambiar.forEach((k) => ops.push(db().from('activo_contrato').update({ monto: parteDe_(k) }).eq('activo_id', aid).eq('contrato_id', k)));
      const e = (await Promise.all(ops)).find((x) => x.error);
      if (e) { btn.disabled = false; btn.textContent = 'Guardar'; return toast('Se guardó el inmueble, pero no sus contratos: ' + e.error.message, true); }
    }
    cerrarModal(); toast('Guardado'); cargar();
  });
  modal.querySelector('#pt-borrar')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Toca otra vez'; return; }
    const { error } = await db().from(tipo).delete().eq('id', id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    cerrarModal(); toast('Eliminado'); cargar();
  });
}

// Empresa a la que se liga un registro nuevo sin plaza: la que coincide con el dueño legal, o Treme
function empresaPara(datos) {
  const ent = normalizar(datos.entidad_legal || '');
  const e = estado.empresas.find((x) => ent && (ent.includes(normalizar(x.nombre_corto)) || normalizar(x.nombre).includes(ent)));
  return (e || estado.empresas.find((x) => x.nombre_corto === 'Treme') || estado.empresas[0])?.id ?? null;
}
