// Patrimonio: inmuebles y deuda. Solo el dueño y los socios lo ven.
// La renta de cada inmueble NO se captura aquí: sale de los contratos de Rentas ligados al inmueble (tabla activo_contrato),
// así Patrimonio y Rentas siempre dicen lo mismo. Los dólares se convierten a pesos con el tipo de cambio del día.
// La deuda es de las empresas: se muestra aparte y no se resta del valor del patrimonio.
import { db, estado, fmt, fmtFecha, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';

const st = { vista: 'panorama', plaza: '', entidad: '', q: '' };
let raiz, activos = [], pasivos = [], contratos = [], enlaces = [];
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
        <button role="tab" data-vista="panorama">Panorama</button><button role="tab" data-vista="activos">Inmuebles</button><button role="tab" data-vista="pasivos">Deuda</button>
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
  const [a, p, k, e] = await Promise.all([
    db().from('activos').select('*').order('codigo'),
    db().from('pasivos').select('*').order('saldo_actual', { ascending: false }),
    db().from('contratos').select('id, centro_id, arrendatario, monto, moneda, activo').order('arrendatario'),
    db().from('activo_contrato').select('activo_id, contrato_id'),
  ]);
  const err = a.error || p.error || k.error || e.error;
  if (err) { toast('No se pudo cargar el patrimonio: ' + err.message, true); return false; }
  activos = a.data; pasivos = p.data; contratos = k.data; enlaces = e.data;
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
// Renta mensual del inmueble según Rentas, en pesos. Si un contrato cubre varios inmuebles se reparte según su valor.
function rentaDe(a) {
  return contratosDe(a).filter((k) => k.activo).reduce((s, k) => {
    const grupo = activosDe(k), total = grupo.reduce((t, x) => t + valMX(x), 0);
    const parte = total ? valMX(a) / total : 1 / Math.max(1, grupo.length);
    return s + aMXN(k.monto, k.moneda) * parte;
  }, 0);
}
const inquilinos = (a) => contratosDe(a).filter((k) => k.activo && num(k.monto)).map((k) => k.arrendatario);
const rentado = (a) => rentaDe(a) > 0;
const rend = (a) => valMX(a) && rentaDe(a) ? rentaDe(a) * 12 / valMX(a) : 0;
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
    : `<button class="btn btn-primary" id="pt-nuevo">＋ ${st.vista === 'activos' ? 'Inmueble' : 'Deuda'}</button>`;
  document.getElementById('pt-nuevo')?.addEventListener('click', () => editar(st.vista, null));
  const el = raiz.querySelector('#pt-cuerpo');
  ({ panorama: pintarPanorama, activos: pintarActivos, pasivos: pintarPasivos })[st.vista](el);
}

// ================= PANORAMA =================
function pintarPanorama(el) {
  const mx = activos.filter((a) => (a.moneda || 'MXN') !== 'USD'), us = activos.filter((a) => a.moneda === 'USD');
  const valMxn = mx.reduce((s, a) => s + num(a.valor_comercial), 0), valUsd = us.reduce((s, a) => s + num(a.valor_comercial), 0);
  const total = valMxn + valUsd * tc.valor;
  const renta = activos.reduce((s, a) => s + rentaDe(a), 0);
  const rentaUsd = contratos.filter((k) => k.activo && k.moneda === 'USD' && activosDe(k).length).reduce((s, k) => s + num(k.monto), 0);
  const conRenta = activos.filter((a) => rentado(a) && valMX(a));
  const valRentado = conRenta.reduce((s, a) => s + valMX(a), 0);
  const rendProm = valRentado ? conRenta.reduce((s, a) => s + rentaDe(a) * 12, 0) / valRentado : 0;
  const parados = activos.filter((a) => !rentado(a) && valMX(a));
  const valParado = parados.reduce((s, a) => s + valMX(a), 0);
  const deuda = pasivos.reduce((s, p) => s + saldoMX(p), 0), pagos = pasivos.reduce((s, p) => s + pagoMX(p), 0);
  const caras = pasivos.filter((p) => costoMes(p) != null).sort((a, b) => costoMes(b) - costoMes(a));
  const sinPago = pasivos.filter((p) => costoMes(p) == null);
  const bajo = conRenta.filter((a) => rend(a) < rendProm * 0.7).sort((a, b) => rend(a) - rend(b));
  const rev = porRevisar();
  const nRev = rev.sinInmueble.length + rev.sinContrato.length + rev.contratoBaja.length + rev.sinPlaza.length;

  const ranking = [...conRenta].sort((a, b) => rend(b) - rend(a));
  const maxR = Math.max(0.0001, ...ranking.map(rend));
  const grupoPor = (fn) => {
    const m = new Map();
    activos.forEach((a) => { const k = fn(a) || 'Sin asignar'; const x = m.get(k) || { k, val: 0, renta: 0, n: 0 }; x.val += valMX(a); x.renta += rentaDe(a); x.n++; m.set(k, x); });
    return [...m.values()].sort((a, b) => b.val - a.val);
  };
  const COLS = ['#101216', '#8B1A1A', '#23408E', '#A15C07', '#0F7A4F', '#8A8F98', '#5B4B8A', '#B5651D', '#2E7D7A', '#C2B8A3'];
  const barra = (lista) => `<div class="pz-stack">${lista.map((x, i) => `<span style="width:${total ? x.val / total * 100 : 0}%;background:${COLS[i % COLS.length]}" title="${esc(x.k)} · ${corto(x.val)}"></span>`).join('')}</div>
    <ul class="pz-ley">${lista.map((x, i) => `<li><i style="background:${COLS[i % COLS.length]}"></i><span>${esc(x.k)}</span><b>${total ? pct(x.val / total, 0) : '—'}</b>
      <small>${x.n} inmueble${x.n === 1 ? '' : 's'} · ${corto(x.val)} · ${x.renta ? `renta ${corto(x.renta)}/mes · ${pct(x.renta * 12 / Math.max(1, x.val))}` : 'sin renta'}</small></li>`).join('')}</ul>`;

  const ideas = [];
  if (nRev) ideas.push({ c: 'mal', t: `${nRev} diferencia${nRev === 1 ? '' : 's'} entre Patrimonio y Rentas`, d: 'Revísalas en el apartado "Por revisar" para que las dos pantallas digan lo mismo.' });
  if (parados.length) ideas.push({ c: 'aviso', t: `${corto(valParado)} en inmuebles sin renta`,
    d: `${parados.length} inmueble${parados.length === 1 ? '' : 's'} no genera${parados.length === 1 ? '' : 'n'} ingreso (${pct(total ? valParado / total : 0, 0)} del valor). Rentados al rendimiento promedio darían unos ${fmt(valParado * rendProm / 12)} al mes.` });
  if (bajo.length) ideas.push({ c: '', t: `${bajo.length} inmueble${bajo.length === 1 ? '' : 's'} rinde${bajo.length === 1 ? '' : 'n'} muy por debajo del promedio`,
    d: `${bajo.slice(0, 3).map((a) => `${esc(nombreLargo(a))} (${pct(rend(a))})`).join(', ')}${bajo.length > 3 ? '…' : ''}. Candidatos a subir renta, cambiar de inquilino o vender.` });
  if (caras[0]) ideas.push({ c: '', t: `Deuda más cara: ${esc(caras[0].acreedor)}`,
    d: `${corto(saldoMX(caras[0]))} con pago de ${fmt(pagoMX(caras[0]))} al mes (${pct(costoMes(caras[0]))} del saldo). Es la primera que conviene liquidar o refinanciar.` });
  if (!activos.some((a) => num(a.renta_mercado_estimada))) ideas.push({ c: '', t: 'Falta la renta de mercado',
    d: 'Si capturas la renta de mercado estimada de cada inmueble, aquí verás cuánto se está dejando de cobrar contra el mercado.' });

  el.innerHTML = `
    <section class="pz-hero">
      <div class="pz-neto"><span>Valor total del patrimonio</span><strong>${corto(total)}</strong>
        <small>${corto(valMxn)} en México${valUsd ? ` + ${usd(valUsd)} en Estados Unidos (${corto(valUsd * tc.valor)})` : ''}</small></div>
      <div class="pz-m"><span>Renta mensual</span><strong>${corto(renta)}</strong><small>según Rentas${rentaUsd ? ` · incluye ${usd(rentaUsd)}` : ''}</small></div>
      <div class="pz-m"><span>Rendimiento anual</span><strong>${pct(rendProm)}</strong><small>de los ${conRenta.length} inmuebles rentados</small></div>
      <div class="pz-m"><span>Sin renta</span><strong>${corto(valParado)}</strong><small>${parados.length} inmueble${parados.length === 1 ? '' : 's'}</small></div>
      <div class="pz-m"><span>Deuda de las empresas</span><strong>${corto(deuda)}</strong><small>aparte, no se resta · pagos ${corto(pagos)}/mes</small></div>
    </section>

    ${nRev ? revisarHTML(rev) : ''}

    <div class="pz-grid">
      <section class="panel pz-ideas"><h3>Lectura para decidir</h3>
        <ul>${ideas.map((i) => `<li class="${i.c}"><strong>${i.t}</strong><p>${i.d}</p></li>`).join('') || '<li>Sin alertas.</li>'}</ul></section>
      <section class="panel pz-sim" id="pz-sim"></section>
    </div>

    <div class="grid-2">
      <section class="panel"><h3>Por plaza</h3>${barra(grupoPor(plazaDe))}</section>
      <section class="panel"><h3>Por dueño legal</h3>${barra(grupoPor((a) => a.entidad_legal))}</section>
    </div>

    <section class="panel" style="margin-top:16px"><div class="panel-head"><h3>Rendimiento por inmueble</h3><span class="sub-meta">renta anual ÷ valor · línea = promedio ${pct(rendProm)}</span></div>
      <ul class="pz-rank">${ranking.map((a) => `<li class="clic" data-editar="${a.id}" tabindex="0">
        <span class="pz-rn"><b>${esc(nombreActivo(a))}</b><small>${esc(plazaDe(a))}${inquilinos(a).length ? ' · ' + esc(inquilinos(a).join(', ')) : ''}</small></span>
        <span class="pz-rb"><span class="${rend(a) < rendProm * .7 ? 'bajo' : rend(a) > rendProm * 1.3 ? 'alto' : ''}" style="width:${rend(a) / maxR * 100}%"></span><i style="left:${rendProm / maxR * 100}%"></i></span>
        <span class="pz-rv"><b>${pct(rend(a))}</b><small>${corto(rentaDe(a))}/mes · ${corto(valMX(a))}</small></span></li>`).join('')}</ul>
      ${parados.length ? `<h4 class="pz-sub">Sin renta · ${corto(valParado)}</h4><ul class="pz-parados">${parados.sort((a, b) => valMX(b) - valMX(a)).map((a) =>
        `<li class="clic" data-editar="${a.id}" tabindex="0"><b>${esc(nombreActivo(a))}</b><span>${esc(plazaDe(a))} · ${esc(a.uso_actual && !/^rentado/i.test(a.uso_actual) ? a.uso_actual : 'Sin uso definido')}</span><strong>${corto(valMX(a))}</strong></li>`).join('')}</ul>` : ''}
    </section>
    <p class="nota">Los valores y rentas en dólares se convierten a pesos con el tipo de cambio indicado arriba. La deuda pertenece a las empresas y se muestra aparte.</p>`;
  el.querySelectorAll('[data-editar]').forEach((tr) => activar(tr, () => editar('activos', tr.dataset.editar)));
  el.querySelectorAll('[data-nuevo-contrato]').forEach((b) => b.addEventListener('click', () => ligarContrato(b.dataset.nuevoContrato)));
  el.querySelectorAll('[data-ligar]').forEach((b) => b.addEventListener('click', () => editar('activos', b.dataset.ligar)));
  simulador(el.querySelector('#pz-sim'), { caras, sinPago, renta });
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
  return `<section class="panel pz-rev"><div class="panel-head"><h3>Por revisar</h3><span class="sub-meta">Diferencias entre Patrimonio y Rentas</span></div>${bloques.join('')}</section>`;
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

// ================= DEUDA =================
function pintarPasivos(el) {
  const filas = pasivos.filter((p) => !st.q || normalizar([p.acreedor, p.tipo_pasivo, p.activo_ref, p.notas].join(' ')).includes(normalizar(st.q)))
    .sort((a, b) => (costoMes(b) ?? -1) - (costoMes(a) ?? -1) || saldoMX(b) - saldoMX(a));
  const total = filas.reduce((s, p) => s + saldoMX(p), 0), pagos = filas.reduce((s, p) => s + pagoMX(p), 0);
  el.innerHTML = `
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
        <thead><tr><th>#</th><th>Acreedor</th><th>Tipo</th><th class="num">Saldo</th><th>Peso</th><th class="num">Pago mensual</th><th class="num">Costo al mes</th><th>Vence</th></tr></thead>
        <tbody>${filas.length ? filas.map((p, i) => `<tr class="clic" data-editar="${p.id}" tabindex="0">
          <td class="mut" data-l="#">${i + 1}</td>
          <td data-l="Acreedor"><b>${esc(p.acreedor || '—')}</b>${p.activo_ref && p.activo_ref !== 'General/Corporativo' ? `<small class="sub">${esc(p.activo_ref)}</small>` : ''}</td>
          <td data-l="Tipo" class="mut">${esc(p.tipo_pasivo || '—')}</td>
          <td data-l="Saldo" class="num fuerte">${p.moneda === 'USD' ? usd(num(p.saldo_actual)) : fmt(p.saldo_actual)}${p.fecha_saldo ? `<small class="sub">al ${fmtFecha(p.fecha_saldo)}</small>` : ''}</td>
          <td data-l="Peso"><div class="pz-pista mini"><span style="width:${total ? saldoMX(p) / total * 100 : 0}%"></span></div><small class="sub">${total ? pct(saldoMX(p) / total, 0) : ''}</small></td>
          <td data-l="Pago mensual" class="num">${p.pago_mensual ? (p.moneda === 'USD' ? usd(num(p.pago_mensual)) : fmt(p.pago_mensual)) : '<span class="mut">Sin pago</span>'}</td>
          <td data-l="Costo al mes" class="num">${costoMes(p) != null ? `<span class="${costoMes(p) >= .015 ? 'neg fuerte' : ''}">${pct(costoMes(p))}</span>` : p.tasa_interes != null ? `<span class="mut">tasa ${tasa(p.tasa_interes)}</span>` : '—'}</td>
          <td data-l="Vence">${p.fecha_vencimiento ? fmtFecha(p.fecha_vencimiento) : '<span class="mut">—</span>'}</td></tr>`).join('')
          : '<tr><td colspan="8" class="vacio">Sin deudas</td></tr>'}</tbody>
      </table></div>
      <p class="nota">Costo al mes = pago mensual ÷ saldo. Incluye capital e intereses; sirve para comparar cuál pesa más en el flujo. La deuda es de las empresas y no se resta del valor del patrimonio.</p>
    </section>`;
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
  const plazaCampo = esActivo ? `<label class="ancho">Plaza / desarrollo<select name="centro_id"><option value="">Sin plaza</option>
    ${centros.map((c) => `<option value="${c.id}" ${c.id === r.centro_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>` : '';
  const titulo = esActivo ? (id ? nombreLargo(r) : 'Nuevo inmueble') : (id ? `Deuda · ${r.acreedor || ''}` : 'Nueva deuda');
  const modal = abrirModal({
    titulo, ancho: esActivo,
    cuerpo: `<form id="pt-f" class="form" onsubmit="return false"><div class="form-2">${plazaCampo}${campos.map(campo).join('')}</div>
      ${esActivo ? `<div class="pz-ligar"><h4>Contratos en Rentas</h4><p class="sub-meta">La renta de este inmueble se toma de los contratos que marques aquí. Se muestran los de la plaza elegida.</p><div class="pz-cands" id="pt-contratos"></div></div>` : ''}
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
      return `<label class="pz-cand ${marcados.has(k.id) ? 'on' : ''}"><input type="checkbox" value="${k.id}" ${marcados.has(k.id) ? 'checked' : ''}>
        <span><b>${esc(k.arrendatario)}</b><small>${k.moneda === 'USD' ? usd(num(k.monto)) : fmt(k.monto)}/mes${k.activo ? '' : ' · dado de baja'}${otros.length ? ` · también ${esc(otros.map(nombreActivo).join(', '))}` : ''}</small></span></label>`;
    }).join('') : `<div class="vacio">${plaza ? 'Esta plaza no tiene contratos activos en Rentas.' : 'Elige la plaza para ver sus contratos.'}</div>`;
    box.querySelectorAll('input').forEach((c) => c.addEventListener('change', () => { c.checked ? marcados.add(c.value) : marcados.delete(c.value); c.closest('.pz-cand').classList.toggle('on', c.checked); }));
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
    } else if (!datos.acreedor) return toast('Escribe el acreedor', true);
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
    const res = id
      ? await db().from(tipo).update(datos).eq('id', id).select('id').single()
      : await db().from(tipo).insert({ ...datos, org_id: estado.miembro.org_id, empresa_id: datos.empresa_id || empresaPara(datos) }).select('id').single();
    if (res.error) { btn.disabled = false; btn.textContent = 'Guardar'; return toast('No se pudo guardar: ' + res.error.message, true); }
    if (esActivo) {
      const aid = res.data.id;
      const quitar = [...ligadosIni].filter((k) => !marcados.has(k)), poner = [...marcados].filter((k) => !ligadosIni.has(k));
      const ops = [];
      if (quitar.length) ops.push(db().from('activo_contrato').delete().eq('activo_id', aid).in('contrato_id', quitar));
      if (poner.length) ops.push(db().from('activo_contrato').insert(poner.map((k) => ({ org_id: estado.miembro.org_id, activo_id: aid, contrato_id: k }))));
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
