// Patrimonio: activos (inmuebles) y pasivos (deudas), para decidir. Solo el dueño y los socios lo ven.
import { db, estado, fmt, fmtFecha, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';

const st = { vista: 'panorama', entidad: '', q: '' };
let raiz, activos = [], pasivos = [];

// Campos editables: [columna, etiqueta, tipo, opciones]
const CAMPOS_ACTIVO = [
  ['codigo', 'Código', 'text'], ['entidad_legal', 'Dueño legal', 'text', 'lista-entidades'],
  ['tipo_unidad', 'Tipo', 'text', 'lista-tipos'], ['identificador', 'Unidad / nombre', 'text'],
  ['direccion', 'Dirección', 'text'], ['ciudad', 'Ciudad', 'text'],
  ['superficie_m2', 'Superficie (m²)', 'number'], ['clave_catastral', 'Clave catastral', 'text'],
  ['valor_comercial', 'Valor comercial', 'number'], ['moneda', 'Moneda', 'select', ['MXN', 'USD']],
  ['fecha_valuacion', 'Valuación (fecha o fuente)', 'text'], ['costo_adquisicion', 'Costo de adquisición', 'number'],
  ['fecha_adquisicion', 'Fecha de adquisición', 'date'], ['uso_actual', 'Uso actual', 'text'],
  ['inquilino', 'Inquilino', 'text'], ['ingreso_mensual', 'Renta mensual', 'number'],
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

// Tres vistas: Panorama (para decidir: rendimiento, deuda cara, capital parado y simulador de venta),
// Inmuebles y Deuda (registros, con su rendimiento y su costo).
export async function render(view) {
  raiz = view;
  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        <button role="tab" data-vista="panorama">Panorama</button><button role="tab" data-vista="activos">Inmuebles</button><button role="tab" data-vista="pasivos">Deuda</button>
      </div>
      <div class="sub-meta">Solo lo ven el dueño y los socios</div>
    </div>
    <div id="pt-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    if (st.vista !== b.dataset.vista) { st.q = ''; st.entidad = ''; }
    st.vista = b.dataset.vista; pintar();
  }));
  await cargar();
}

async function cargar() {
  const [a, p] = await Promise.all([
    db().from('activos').select('*').order('codigo'),
    db().from('pasivos').select('*').order('saldo_actual', { ascending: false }),
  ]);
  const err = a.error || p.error;
  if (err) { toast('No se pudo cargar el patrimonio: ' + err.message, true); return; }
  activos = a.data; pasivos = p.data;
  pintar();
}

const num = (v) => Number(v || 0);
const sumaPor = (lista, campo, moneda) => lista.filter((r) => (r.moneda || 'MXN') === moneda).reduce((s, r) => s + num(r[campo]), 0);
const usd = (v) => '$' + Math.round(v).toLocaleString('es-MX') + ' USD';
const corto = (v) => {
  const a = Math.abs(v);
  return (v < 0 ? '−' : '') + (a >= 1e6 ? `$${(a / 1e6).toFixed(1)} M` : a >= 1e4 ? `$${Math.round(a / 1e3)} mil` : fmt(a));
};
const pct = (v, d = 1) => (v * 100).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %';
// Rendimiento anual bruto de un inmueble: renta × 12 / valor
const rend = (a) => num(a.valor_comercial) && num(a.ingreso_mensual) ? num(a.ingreso_mensual) * 12 / num(a.valor_comercial) : 0;
const rentado = (a) => num(a.ingreso_mensual) > 0;
// Costo de una deuda: lo que se paga al mes como % del saldo (si no hay pago registrado, la tasa guardada)
const costoMes = (p) => num(p.saldo_actual) && num(p.pago_mensual) ? num(p.pago_mensual) / num(p.saldo_actual) : null;
const nombreActivo = (a) => [a.tipo_unidad, a.identificador].filter(Boolean).join(' · ') || a.codigo || 'Inmueble';

function pintar() {
  raiz.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-selected', b.dataset.vista === st.vista));
  document.getElementById('page-actions').innerHTML = st.vista === 'panorama' ? ''
    : `<button class="btn btn-primary" id="pt-nuevo">＋ ${st.vista === 'activos' ? 'Inmueble' : 'Deuda'}</button>`;
  document.getElementById('pt-nuevo')?.addEventListener('click', () => editar(st.vista, null));
  const el = raiz.querySelector('#pt-cuerpo');
  ({ panorama: pintarPanorama, activos: pintarActivos, pasivos: pintarPasivos })[st.vista](el);
}

// ================= PANORAMA =================
function pintarPanorama(el) {
  const mx = activos.filter((a) => (a.moneda || 'MXN') === 'MXN');
  const val = sumaPor(activos, 'valor_comercial', 'MXN'), valUSD = sumaPor(activos, 'valor_comercial', 'USD');
  const deuda = sumaPor(pasivos, 'saldo_actual', 'MXN');
  const renta = sumaPor(activos, 'ingreso_mensual', 'MXN'), pagos = sumaPor(pasivos, 'pago_mensual', 'MXN');
  const ltv = val ? deuda / val : 0;
  const conRenta = mx.filter((a) => rentado(a) && num(a.valor_comercial));
  const rendProm = conRenta.reduce((s, a) => s + num(a.valor_comercial), 0) ? conRenta.reduce((s, a) => s + num(a.ingreso_mensual) * 12, 0) / conRenta.reduce((s, a) => s + num(a.valor_comercial), 0) : 0;
  const parados = mx.filter((a) => !rentado(a) && num(a.valor_comercial));
  const valParado = parados.reduce((s, a) => s + num(a.valor_comercial), 0);
  const caras = pasivos.filter((p) => costoMes(p) != null).sort((a, b) => costoMes(b) - costoMes(a));
  const sinPago = pasivos.filter((p) => costoMes(p) == null);
  const costoProm = caras.reduce((s, p) => s + num(p.saldo_actual), 0) ? caras.reduce((s, p) => s + num(p.pago_mensual), 0) / caras.reduce((s, p) => s + num(p.saldo_actual), 0) : 0;
  const bajo = conRenta.filter((a) => rend(a) < rendProm * 0.7).sort((a, b) => rend(a) - rend(b));

  // Rendimiento por inmueble (rentados, en pesos), del mejor al peor
  const ranking = [...conRenta].sort((a, b) => rend(b) - rend(a));
  const maxR = Math.max(0.0001, ...ranking.map(rend));
  // Concentración por tipo y por dueño legal
  const grupoPor = (fn) => {
    const m = new Map();
    mx.forEach((a) => { const k = fn(a) || 'Sin asignar'; const x = m.get(k) || { k, val: 0, renta: 0, n: 0 }; x.val += num(a.valor_comercial); x.renta += num(a.ingreso_mensual); x.n++; m.set(k, x); });
    return [...m.values()].sort((a, b) => b.val - a.val);
  };
  const COLS = ['#101216', '#8B1A1A', '#23408E', '#A15C07', '#0F7A4F', '#8A8F98', '#5B4B8A'];
  const barra = (lista) => `<div class="pz-stack">${lista.map((x, i) => `<span style="width:${val ? x.val / val * 100 : 0}%;background:${COLS[i % COLS.length]}" title="${esc(x.k)} · ${corto(x.val)}"></span>`).join('')}</div>
    <ul class="pz-ley">${lista.map((x, i) => `<li><i style="background:${COLS[i % COLS.length]}"></i><span>${esc(x.k)}</span><b>${val ? pct(x.val / val, 0) : '—'}</b>
      <small>${x.n} · ${corto(x.val)} · ${x.renta ? `renta ${corto(x.renta)}/mes · ${pct(x.renta * 12 / Math.max(1, x.val))}` : 'sin renta'}</small></li>`).join('')}</ul>`;

  // Lecturas para decidir (reglas simples, con números)
  const ideas = [];
  if (caras.length && rendProm && costoProm * 12 > rendProm) ideas.push({ c: 'mal', t: 'La deuda pesa más en el flujo de lo que rinden los inmuebles',
    d: `Los pagos de la deuda con pago registrado equivalen a ${pct(costoProm)} del saldo al mes (${pct(costoProm * 12, 0)} al año), y los inmuebles rentados rinden ${pct(rendProm)} al año. Vender un inmueble de bajo rendimiento para bajar la deuda más cara mejora el flujo del mes (pruébalo en el simulador).` });
  if (caras[0]) ideas.push({ c: 'aviso', t: `Deuda más cara: ${caras[0].acreedor}`,
    d: `${corto(num(caras[0].saldo_actual))} con pago de ${fmt(caras[0].pago_mensual)} al mes (${pct(costoMes(caras[0]))} del saldo). Es la primera que conviene liquidar o refinanciar.` });
  if (parados.length) ideas.push({ c: 'aviso', t: `${corto(valParado)} en inmuebles sin renta`,
    d: `${parados.length} inmueble${parados.length === 1 ? '' : 's'} no genera${parados.length === 1 ? '' : 'n'} ingreso (${pct(val ? valParado / val : 0, 0)} del valor). Rentados al rendimiento promedio darían unos ${fmt(valParado * rendProm / 12)} al mes.` });
  if (bajo.length) ideas.push({ c: '', t: `${bajo.length} inmueble${bajo.length === 1 ? '' : 's'} rinde${bajo.length === 1 ? '' : 'n'} muy por debajo del promedio`,
    d: `${bajo.slice(0, 3).map((a) => `${esc(nombreActivo(a))} (${pct(rend(a))})`).join(', ')}${bajo.length > 3 ? '…' : ''}. Candidatos a subir renta, cambiar de inquilino o vender.` });
  if (sinPago.length) ideas.push({ c: '', t: `${sinPago.length} deuda${sinPago.length === 1 ? '' : 's'} sin pago mensual ni plazo`,
    d: `${corto(sinPago.reduce((s, p) => s + num(p.saldo_actual), 0))} sin calendario (${sinPago.slice(0, 4).map((p) => esc(p.acreedor)).join(', ')}${sinPago.length > 4 ? '…' : ''}). Conviene fijarles pago y fecha para planear el flujo.` });
  if (!activos.some((a) => num(a.renta_mercado_estimada))) ideas.push({ c: '', t: 'Falta la renta de mercado',
    d: 'Si capturas la renta de mercado estimada de cada inmueble, aquí verás cuánto se está dejando de cobrar contra el mercado.' });

  el.innerHTML = `
    <section class="pz-hero">
      <div class="pz-neto"><span>Patrimonio neto</span><strong>${corto(val - deuda)}</strong><small>${corto(val)} en inmuebles − ${corto(deuda)} de deuda${valUSD ? ` · aparte ${usd(valUSD)}` : ''}</small></div>
      <div class="pz-m"><span>Deuda / valor</span><strong>${pct(ltv, 0)}</strong><div class="pz-pista"><span style="width:${Math.min(100, ltv * 100)}%" class="${ltv > .5 ? 'mal' : ltv > .3 ? 'aviso' : ''}"></span></div><small>${ltv <= .3 ? 'Nivel sano' : ltv <= .5 ? 'Moderado' : 'Alto'}</small></div>
      <div class="pz-m"><span>Flujo mensual</span><strong class="${renta - pagos >= 0 ? 'pos' : 'neg'}">${corto(renta - pagos)}</strong><small>${corto(renta)} rentas − ${corto(pagos)} pagos de deuda</small></div>
      <div class="pz-m"><span>Rendimiento de inmuebles</span><strong>${pct(rendProm)}</strong><small>anual bruto de los ${conRenta.length} rentados</small></div>
      <div class="pz-m"><span>Costo de la deuda</span><strong>${costoProm ? pct(costoProm) : '—'}</strong><small>pago mensual / saldo, ${caras.length} con pago</small></div>
    </section>

    <div class="pz-grid">
      <section class="panel pz-ideas"><h3>Lectura para decidir</h3>
        <ul>${ideas.map((i) => `<li class="${i.c}"><strong>${i.t}</strong><p>${i.d}</p></li>`).join('') || '<li>Sin alertas.</li>'}</ul></section>
      <section class="panel pz-sim" id="pz-sim"></section>
    </div>

    <section class="panel"><div class="panel-head"><h3>Rendimiento por inmueble</h3><span class="sub-meta">renta anual ÷ valor · línea = promedio ${pct(rendProm)}</span></div>
      <ul class="pz-rank">${ranking.map((a) => `<li class="clic" data-editar="${a.id}" tabindex="0">
        <span class="pz-rn"><b>${esc(nombreActivo(a))}</b><small>${esc(a.entidad_legal || '')}${a.inquilino ? ' · ' + esc(a.inquilino) : ''}</small></span>
        <span class="pz-rb"><span class="${rend(a) < rendProm * .7 ? 'bajo' : rend(a) > rendProm * 1.3 ? 'alto' : ''}" style="width:${rend(a) / maxR * 100}%"></span><i style="left:${rendProm / maxR * 100}%"></i></span>
        <span class="pz-rv"><b>${pct(rend(a))}</b><small>${corto(num(a.ingreso_mensual))}/mes · ${corto(num(a.valor_comercial))}</small></span></li>`).join('')}</ul>
      ${parados.length ? `<h4 class="pz-sub">Sin renta · ${corto(valParado)}</h4><ul class="pz-parados">${parados.sort((a, b) => num(b.valor_comercial) - num(a.valor_comercial)).map((a) =>
        `<li class="clic" data-editar="${a.id}" tabindex="0"><b>${esc(nombreActivo(a))}</b><span>${esc(a.uso_actual || 'Sin uso definido')}</span><strong>${corto(num(a.valor_comercial))}</strong></li>`).join('')}</ul>` : ''}
    </section>

    <div class="grid-2">
      <section class="panel"><h3>Por tipo de inmueble</h3>${barra(grupoPor((a) => a.tipo_unidad))}</section>
      <section class="panel"><h3>Por dueño legal</h3>${barra(grupoPor((a) => a.entidad_legal))}</section>
    </div>`;
  el.querySelectorAll('[data-editar]').forEach((tr) => activar(tr, () => editar('activos', tr.dataset.editar)));
  simulador(el.querySelector('#pz-sim'), { mx, caras, sinPago, renta, pagos, val, deuda });
}

// ¿Qué pasa si vendo…? Se eligen inmuebles; el dinero paga primero la deuda más cara.
function simulador(el, { mx, caras, sinPago, renta, pagos, val, deuda }) {
  st.venta ||= new Set();
  const candidatos = [...mx].filter((a) => num(a.valor_comercial)).sort((a, b) => (rentado(a) - rentado(b)) || rend(a) - rend(b));
  const pintarSim = () => {
    const elegidos = candidatos.filter((a) => st.venta.has(a.id));
    const descuento = (st.descVenta ?? 10) / 100;
    let caja = elegidos.reduce((s, a) => s + num(a.valor_comercial), 0) * (1 - descuento);
    const bruto = caja;
    const rentaPerdida = elegidos.reduce((s, a) => s + num(a.ingreso_mensual), 0);
    let pagosAhorro = 0; const liquida = [];
    for (const p of [...caras, ...sinPago]) {
      if (caja <= 0) break;
      const s = num(p.saldo_actual), usa = Math.min(s, caja);
      caja -= usa;
      if (costoMes(p) != null) pagosAhorro += num(p.pago_mensual) * (usa / s);
      liquida.push({ p, usa, total: usa >= s - 0.5 });
    }
    const nuevoFlujo = renta - rentaPerdida - (pagos - pagosAhorro);
    const nuevaDeuda = deuda - (bruto - caja), nuevoVal = val - elegidos.reduce((s, a) => s + num(a.valor_comercial), 0);
    el.innerHTML = `<div class="panel-head"><h3>¿Qué pasa si vendo…?</h3><label class="pz-desc">Vender con descuento de <input type="number" id="pz-d" min="0" max="50" step="1" value="${st.descVenta ?? 10}"> %</label></div>
      <p class="sub-meta">Elige inmuebles; lo que se obtenga paga primero la deuda más cara.</p>
      <div class="pz-cands">${candidatos.slice(0, 14).map((a) => `<label class="pz-cand ${st.venta.has(a.id) ? 'on' : ''}"><input type="checkbox" value="${a.id}" ${st.venta.has(a.id) ? 'checked' : ''}>
        <span><b>${esc(nombreActivo(a))}</b><small>${rentado(a) ? `rinde ${pct(rend(a))}` : 'sin renta'} · ${corto(num(a.valor_comercial))}</small></span></label>`).join('')}</div>
      ${elegidos.length ? `<div class="pz-res">
        <div><span>Se obtiene</span><strong>${corto(bruto)}</strong></div>
        <div><span>Flujo mensual</span><strong class="${nuevoFlujo - (renta - pagos) >= 0 ? 'pos' : 'neg'}">${nuevoFlujo - (renta - pagos) >= 0 ? '+' : ''}${corto(nuevoFlujo - (renta - pagos))}</strong><small>pasa a ${corto(nuevoFlujo)}</small></div>
        <div><span>Deuda / valor</span><strong>${nuevoVal ? pct(Math.max(0, nuevaDeuda) / nuevoVal, 0) : '—'}</strong><small>antes ${val ? pct(deuda / val, 0) : '—'}</small></div></div>
        <ul class="pz-liq">${liquida.map((x) => `<li><span>${esc(x.p.acreedor)}</span><b>${x.total ? 'Se liquida' : 'Abono ' + corto(x.usa)}</b></li>`).join('')}
          ${caja > 0.5 ? `<li><span>Sobra en caja</span><b>${corto(caja)}</b></li>` : ''}</ul>
        <p class="nota">Se deja de cobrar ${fmt(rentaPerdida)} de renta y se dejan de pagar ${fmt(pagosAhorro)} al mes de deuda. Estimación sin impuestos ni comisiones de venta.</p>`
      : '<div class="vacio">Elige uno o varios inmuebles para ver el efecto.</div>'}`;
    el.querySelectorAll('.pz-cand input').forEach((c) => c.addEventListener('change', () => { c.checked ? st.venta.add(c.value) : st.venta.delete(c.value); pintarSim(); }));
    el.querySelector('#pz-d').addEventListener('change', (e) => { st.descVenta = Math.max(0, Math.min(50, Number(e.target.value) || 0)); pintarSim(); });
  };
  pintarSim();
}

// ================= INMUEBLES =================
function pintarActivos(el) {
  const val = sumaPor(activos, 'valor_comercial', 'MXN');
  const entidades = [...new Set(activos.map((a) => a.entidad_legal || 'Sin asignar'))].sort();
  st.orden ||= 'rend';
  const filas = activos.filter((a) => (!st.entidad || (a.entidad_legal || 'Sin asignar') === st.entidad)
    && (!st.q || normalizar([a.codigo, a.identificador, a.tipo_unidad, a.ciudad, a.inquilino, a.uso_actual].join(' ')).includes(normalizar(st.q))))
    .sort((a, b) => st.orden === 'valor' ? num(b.valor_comercial) - num(a.valor_comercial) : st.orden === 'codigo' ? String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true }) : rend(b) - rend(a));
  el.innerHTML = `
    <div class="cx">${['', ...entidades].map((e) => {
      const l = activos.filter((a) => !e || (a.entidad_legal || 'Sin asignar') === e);
      return `<button class="cx-chip ${st.entidad === e ? 'activo' : ''}" data-entidad="${esc(e)}"><span>${esc(e || 'Todos')}</span><b>${l.length} · ${corto(sumaPor(l, 'valor_comercial', 'MXN'))}</b></button>`; }).join('')}</div>
    <section class="panel">
      <div class="panel-head"><h3>${filas.length} inmueble${filas.length !== 1 ? 's' : ''}</h3>
        <div class="filtros filtros-sm"><input type="search" id="pt-q" placeholder="Buscar código, unidad, inquilino…" value="${esc(st.q)}" aria-label="Buscar inmueble">
          <select id="pt-orden" aria-label="Ordenar"><option value="rend">Por rendimiento</option><option value="valor">Por valor</option><option value="codigo">Por código</option></select></div></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Código</th><th>Inmueble</th><th>Uso / inquilino</th><th class="num">m²</th><th class="num">Valor</th><th class="num">Renta/mes</th><th class="num">Rend. anual</th><th class="num">% del total</th></tr></thead>
        <tbody>${filas.length ? filas.map((a) => {
          const v = num(a.valor_comercial), ren = num(a.ingreso_mensual);
          const dinero = (x) => x ? (a.moneda === 'USD' ? usd(x) : fmt(x)) : '—';
          return `<tr class="clic" data-editar="${a.id}" tabindex="0">
            <td data-l="Código"><b>${esc(a.codigo || '—')}</b></td>
            <td data-l="Inmueble">${esc(a.tipo_unidad || '—')}${a.identificador ? ' · ' + esc(a.identificador) : ''}<small class="sub">${esc(a.ciudad || '')}</small></td>
            <td data-l="Uso">${ren ? esc(a.uso_actual || 'Rentado') : `<span class="vc-chip aviso">${esc(a.uso_actual || 'Sin renta')}</span>`}${a.inquilino ? `<small class="sub">${esc(a.inquilino)}</small>` : ''}</td>
            <td data-l="m²" class="num">${a.superficie_m2 ? num(a.superficie_m2).toLocaleString('es-MX') : '—'}</td>
            <td data-l="Valor" class="num">${dinero(v)}</td>
            <td data-l="Renta/mes" class="num">${dinero(ren)}</td>
            <td data-l="Rend. anual" class="num fuerte">${rend(a) ? pct(rend(a)) : '—'}</td>
            <td data-l="% del total" class="num mut">${a.moneda !== 'USD' && val && v ? pct(v / val) : '—'}</td></tr>`;
        }).join('') : '<tr><td colspan="8" class="vacio">Sin inmuebles para este filtro</td></tr>'}</tbody>
      </table></div>
    </section>`;
  el.querySelector('#pt-orden').value = st.orden;
  el.querySelector('#pt-orden').addEventListener('change', (e) => { st.orden = e.target.value; pintar(); });
  el.querySelectorAll('[data-entidad]').forEach((b) => b.addEventListener('click', () => { st.entidad = b.dataset.entidad; pintar(); }));
  conectarTabla(el, 'activos');
}

// ================= DEUDA =================
function pintarPasivos(el) {
  const filas = pasivos.filter((p) => !st.q || normalizar([p.acreedor, p.tipo_pasivo, p.activo_ref, p.notas].join(' ')).includes(normalizar(st.q)))
    .sort((a, b) => (costoMes(b) ?? -1) - (costoMes(a) ?? -1) || num(b.saldo_actual) - num(a.saldo_actual));
  const total = sumaPor(filas, 'saldo_actual', 'MXN'), pagos = sumaPor(filas, 'pago_mensual', 'MXN');
  el.innerHTML = `
    <div class="vc-cifras">
      <div class="vc-cifra"><span>Deuda total</span><strong>${corto(total)}</strong><small>${filas.length} acreedores</small></div>
      <div class="vc-cifra"><span>Pagos al mes</span><strong>${corto(pagos)}</strong><small>${filas.filter((p) => num(p.pago_mensual)).length} con pago registrado</small></div>
      <div class="vc-cifra"><span>Sin calendario</span><strong>${corto(filas.filter((p) => !num(p.pago_mensual)).reduce((s, p) => s + num(p.saldo_actual), 0))}</strong><small>sin pago mensual</small></div>
      <div class="vc-cifra"><span>Las 2 más grandes</span><strong>${total ? pct(filas.map((p) => num(p.saldo_actual)).sort((a, b) => b - a).slice(0, 2).reduce((s, x) => s + x, 0) / total, 0) : '—'}</strong><small>de toda la deuda</small></div>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h3>Orden sugerido para pagar <small class="sub-meta">· primero la más cara</small></h3>
        <input type="search" id="pt-q" placeholder="Buscar acreedor…" value="${esc(st.q)}" aria-label="Buscar deuda"></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>#</th><th>Acreedor</th><th>Tipo</th><th class="num">Saldo</th><th>Peso</th><th class="num">Pago mensual</th><th class="num">Costo al mes</th><th>Vence</th></tr></thead>
        <tbody>${filas.length ? filas.map((p, i) => `<tr class="clic" data-editar="${p.id}" tabindex="0">
          <td class="mut" data-l="#">${i + 1}</td>
          <td data-l="Acreedor"><b>${esc(p.acreedor || '—')}</b>${p.activo_ref && p.activo_ref !== 'General/Corporativo' ? `<small class="sub">${esc(p.activo_ref)}</small>` : ''}</td>
          <td data-l="Tipo" class="mut">${esc(p.tipo_pasivo || '—')}</td>
          <td data-l="Saldo" class="num fuerte">${p.moneda === 'USD' ? usd(num(p.saldo_actual)) : fmt(p.saldo_actual)}${p.fecha_saldo ? `<small class="sub">al ${fmtFecha(p.fecha_saldo)}</small>` : ''}</td>
          <td data-l="Peso"><div class="pz-pista mini"><span style="width:${total ? num(p.saldo_actual) / total * 100 : 0}%"></span></div><small class="sub">${total ? pct(num(p.saldo_actual) / total, 0) : ''}</small></td>
          <td data-l="Pago mensual" class="num">${p.pago_mensual ? fmt(p.pago_mensual) : '<span class="mut">Sin pago</span>'}</td>
          <td data-l="Costo al mes" class="num">${costoMes(p) != null ? `<span class="${costoMes(p) >= .015 ? 'neg fuerte' : ''}">${pct(costoMes(p))}</span>` : p.tasa_interes != null ? `<span class="mut">tasa ${tasa(p.tasa_interes)}</span>` : '—'}</td>
          <td data-l="Vence">${p.fecha_vencimiento ? fmtFecha(p.fecha_vencimiento) : '<span class="mut">—</span>'}</td></tr>`).join('')
          : '<tr><td colspan="8" class="vacio">Sin deudas</td></tr>'}</tbody>
      </table></div>
      <p class="nota">Costo al mes = pago mensual ÷ saldo. Incluye capital e intereses; sirve para comparar cuál pesa más en el flujo.</p>
    </section>`;
  conectarTabla(el, 'pasivos');
}

// La tasa se guarda como fracción (0.025 = 2.5%)
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
function editar(tipo, id) {
  const campos = tipo === 'activos' ? CAMPOS_ACTIVO : CAMPOS_PASIVO;
  const lista = tipo === 'activos' ? activos : pasivos;
  const r = id ? lista.find((x) => x.id === id) : { moneda: 'MXN' };
  const valor = (c) => {
    const v = r[c];
    if (v == null) return '';
    return c === 'tasa_interes' ? +(num(v) * 100).toFixed(4) : v;
  };
  const datalists = `
    <datalist id="lista-entidades">${[...new Set(activos.map((a) => a.entidad_legal).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
    <datalist id="lista-tipos">${[...new Set(activos.map((a) => a.tipo_unidad).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const campo = ([c, et, t, op]) => {
    if (t === 'textarea') return `<label class="ancho">${et}<textarea name="${c}" rows="2">${esc(valor(c))}</textarea></label>`;
    if (t === 'select') return `<label>${et}<select name="${c}">${op.map((o) => `<option ${valor(c) === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    return `<label>${et}<input name="${c}" type="${t}" ${t === 'number' ? 'step="any" inputmode="decimal"' : ''} ${op ? `list="${op}"` : ''} value="${esc(valor(c))}"></label>`;
  };
  const titulo = tipo === 'activos' ? (id ? `Activo ${r.codigo || ''}` : 'Nuevo activo') : (id ? `Pasivo · ${r.acreedor || ''}` : 'Nuevo pasivo');
  const modal = abrirModal({
    titulo,
    cuerpo: `<form id="pt-f" class="form"><div class="form-2">${campos.map(campo).join('')}</div>${datalists}</form>`,
    pie: `${id ? '<button class="btn btn-ghost peligro" id="pt-borrar">Eliminar</button>' : ''}<span style="flex:1"></span>
      <button class="btn btn-ghost" id="pt-cancelar">Cancelar</button><button class="btn btn-primary" id="pt-ok">Guardar</button>`,
  });
  modal.querySelector('#pt-cancelar').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#pt-f');
  modal.querySelector('#pt-ok').addEventListener('click', async (ev) => {
    const datos = {};
    for (const [c, , t] of campos) {
      const v = f[c].value.trim();
      datos[c] = v === '' ? null : t === 'number' ? Number(v) : v;
    }
    if (datos.tasa_interes != null) datos.tasa_interes = datos.tasa_interes / 100;
    if (tipo === 'activos' && !datos.codigo && !datos.identificador) return toast('Escribe al menos el código o la unidad', true);
    if (tipo === 'pasivos' && !datos.acreedor) return toast('Escribe el acreedor', true);
    datos.moneda = datos.moneda || 'MXN';
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
    const { error } = id
      ? await db().from(tipo).update(datos).eq('id', id)
      : await db().from(tipo).insert({ ...datos, org_id: estado.miembro.org_id, empresa_id: empresaPara(datos) });
    btn.disabled = false; btn.textContent = 'Guardar';
    if (error) return toast('No se pudo guardar: ' + error.message, true);
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

// Empresa a la que se liga un registro nuevo: la que coincide con el dueño legal, o Treme
function empresaPara(datos) {
  const ent = normalizar(datos.entidad_legal || '');
  const e = estado.empresas.find((x) => ent && (ent.includes(normalizar(x.nombre_corto)) || normalizar(x.nombre).includes(ent)));
  return (e || estado.empresas.find((x) => x.nombre_corto === 'Treme') || estado.empresas[0])?.id ?? null;
}
