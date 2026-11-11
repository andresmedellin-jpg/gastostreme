// Cobranza de mantenimiento (y luz donde aplica) por unidad y por mes, de cada edificio que cobra:
// Torre Elysium (Liz), Plaza Hudson y Plaza GM 202 (Barby). Un edificio aparece aquí si tiene unidades;
// cada persona ve solo los suyos (miembros.centros, en la base). Reemplaza la página "Cobranza Elysium".
import { MESES, FORMAS_COBRO, MARCA } from '../config.js';
// El edificio que se abre primero (y el único con reporte mensual): Torre Elysium; otra instalación lo dice en MARCA.condominio
const CONDOMINIO = MARCA.condominio || 'Torre Elysium';
const EMISOR = MARCA.reciboEmpresa || 'Grupo Inmobiliario Treme';
import { pintarRecibo, abrirVentanaRecibo } from '../recibo.js';
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal } from '../lib.js';

const CONCEPTOS = {
  mantenimiento: { titulo: 'Mantenimiento', icono: '' },
  luz:           { titulo: 'Luz (CFE)',     icono: '' },
};
const CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const TIPO_UNIDAD = { local: 'Local', loft: 'Loft', depto: 'Depto', oficina: 'Oficina', bodega: 'Bodega', casa: 'Casa', terreno: 'Terreno', otro: '' };
// Cómo se nombra la unidad en el recibo
const TIPO_RECIBO = { local: 'Local', loft: 'Loft', depto: 'Departamento', oficina: 'Oficina', bodega: 'Bodega', casa: 'Casa', terreno: 'Terreno', otro: 'Unidad' };

const st = {
  vista: 'cuenta',                        // cuenta (estado de cuenta anual) | mes (captura del mes) | deudores
  concepto: 'mantenimiento',
  anio: new Date().getFullYear(),
  mes: new Date().getMonth(),
  filtro: 'todos',                        // todos | pagados | pendientes
  q: '',
  centroId: null,                         // edificio abierto
};
let centro, edificios = [], unidades = [], cuotas = [], pagos = [], raiz;
// ¿Este edificio cobra luz? (Torre Elysium sí; las plazas solo mantenimiento)
const conLuz = () => cuotas.some((c) => c.concepto === 'luz' && c.en_padron);
// La base solo entrega las cuotas que la persona puede ver: Víctor ve la luz, no el mantenimiento
const conMant = () => cuotas.some((c) => c.concepto === 'mantenimiento' && c.en_padron);
const conceptosDe = () => [conMant() && 'mantenimiento', conLuz() && 'luz'].filter(Boolean);
const esCondominio = () => centro?.nombre === CONDOMINIO;

export async function render(view) {
  raiz = view;
  // Edificios con unidades que esta persona puede ver
  if (!edificios.length) {
    // Edificios con cuotas que esta persona puede ver (Víctor: solo los que cobran luz)
    const [uq, cq] = await Promise.all([db().from('unidades').select('id, centro_id').eq('activo', true),
      todo(() => db().from('cuotas').select('unidad_id').eq('en_padron', true).in('concepto', ['mantenimiento', 'luz']))]);
    const error = uq.error || cq.error;
    if (error) { view.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(error.message)}</div>`; return; }
    const conCuota = new Set((cq.data || []).map((x) => x.unidad_id));
    const ids = new Set((uq.data || []).filter((x) => conCuota.has(x.id)).map((x) => x.centro_id));
    edificios = estado.centros.filter((c) => ids.has(c.id))
      .sort((a, b) => (b.nombre === CONDOMINIO) - (a.nombre === CONDOMINIO) || a.nombre.localeCompare(b.nombre, 'es'));
  }
  centro = edificios.find((c) => c.id === st.centroId) || edificios[0];
  if (!centro) { view.innerHTML = '<div class="vacio">No tienes edificios asignados para cobrar mantenimiento.</div>'; return; }
  st.centroId = centro.id;
  if (!esCondominio() && st.vista === 'reporte') st.vista = 'cuenta';
  view.innerHTML = `
    ${edificios.length > 1 ? `<div class="segmento cb-edif" role="tablist" aria-label="Edificio">${edificios.map((c) =>
      `<button class="${c.id === centro.id ? 'activo' : ''}" data-edif="${c.id}">${esc(c.nombre)}</button>`).join('')}</div>` : ''}
    <div class="sub-head">
      <div class="tabs" role="tablist">
        ${[['cuenta','Estado de cuenta'],['mes','Pagos del mes'],['deudores','Deudores'], ...(tieneRol(['administracion']) && esCondominio() ? [['reporte','Reporte mensual']] : [])]
          .map(([id, t]) => `<button role="tab" data-vista="${id}">${t}</button>`).join('')}
      </div>

    </div>
    <div class="periodo">
      <div class="pills" id="c-meses"></div>
      <select id="c-anio" aria-label="Año">${[st.anio + 1, st.anio, st.anio - 1].filter((a, i, arr) => arr.indexOf(a) === i)
        .map((a) => `<option>${a}</option>`).join('')}</select>
    </div>
    <div id="c-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelector('#c-anio').value = st.anio;
  view.querySelectorAll('[data-edif]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.edif === st.centroId) return;
    st.centroId = b.dataset.edif; st.q = ''; st.filtro = 'todos'; st.concepto = 'mantenimiento';
    render(view);
  }));
  view.querySelector('#c-anio').addEventListener('change', (e) => { st.anio = +e.target.value; cargar(); });
  view.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    if (st.vista !== b.dataset.vista) { st.q = ''; st.filtro = 'todos'; }
    st.vista = b.dataset.vista; pintar();
  }));
  await cargar();
}

async function cargar() {
  const desde = `${st.anio}-01-01`, hasta = `${st.anio + 1}-01-01`;
  const [u, c, p] = await Promise.all([
    db().from('unidades').select('id, identificador, tipo, ocupante, notas, activo, telefono').eq('centro_id', centro.id).eq('activo', true),
    db().from('cuotas').select('id, unidad_id, concepto, monto, activo, en_padron, pagador').in('concepto', ['mantenimiento', 'luz']),
    todo(() => db().from('pagos').select('id, unidad_id, concepto, periodo, monto, forma_pago, fecha, notas, folio, capturado_por')
      .eq('centro_id', centro.id).in('concepto', ['mantenimiento', 'luz'])
      .gte('periodo', desde).lt('periodo', hasta)),
  ]);
  const err = u.error || c.error || p.error;
  if (err) { toast('No se pudo cargar la cobranza: ' + err.message, true); return; }
  unidades = u.data;
  const ids = new Set(unidades.map((x) => x.id));
  cuotas = c.data.filter((x) => ids.has(x.unidad_id));
  pagos = p.data;
  pintar();
}

// ---------- cálculo ----------
const mesDe = (periodo) => +periodo.slice(5, 7) - 1;
const orden = (a, b) => a.identificador.localeCompare(b.identificador, 'es', { numeric: true });

// Filas del padrón de un concepto, con lo pagado en cada mes
function padron(concepto) {
  return cuotas.filter((c) => c.concepto === concepto && c.en_padron).map((c) => {
    const u = unidades.find((x) => x.id === c.unidad_id);
    const porMes = Array.from({ length: 12 }, () => []);
    pagos.filter((p) => p.unidad_id === c.unidad_id && p.concepto === concepto).forEach((p) => porMes[mesDe(p.periodo)].push(p));
    return { u, cuota: c, exento: !c.activo, porMes, pagado: (m) => porMes[m].reduce((s, p) => s + Number(p.monto), 0) };
  }).filter((r) => r.u).sort((a, b) => orden(a.u, b.u));
}

function stats(filas, m) {
  const cobran = filas.filter((r) => !r.exento);
  const completos = cobran.filter((r) => r.pagado(m) > 0);
  const esperado = cobran.reduce((s, r) => s + Number(r.cuota.monto), 0);
  const cobrado = filas.reduce((s, r) => s + r.pagado(m), 0);
  const pendiente = cobran.filter((r) => !(r.pagado(m) > 0)).reduce((s, r) => s + Number(r.cuota.monto), 0);
  return { n: cobran.length, pagaron: completos.length, esperado, cobrado, pendiente,
           pct: cobran.length ? Math.round(completos.length / cobran.length * 100) : 0 };
}
// Igual que la página vieja: una unidad debe el mes si no tiene ningún pago registrado en él
const debe = (r, m) => !r.exento && !(r.pagado(m) > 0);

const etiquetaUnidad = (u) => `${TIPO_UNIDAD[u.tipo] ? TIPO_UNIDAD[u.tipo] + ' ' : ''}${u.identificador}`;
const colorPct = (p) => p >= 80 ? 'ok' : p >= 50 ? 'medio' : 'bajo';

// ---------- pintar ----------
function pintar() {
  raiz.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-selected', b.dataset.vista === st.vista));
  raiz.querySelector('#c-meses').innerHTML = CORTO.map((m, i) =>
    `<button class="pill ${i === st.mes ? 'activa' : ''}" data-mes="${i}">${m}</button>`).join('');
  raiz.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { st.mes = +b.dataset.mes; pintar(); }));
  const activa = raiz.querySelector('.pill.activa');                 // en celular, que el mes elegido quede a la vista
  const fila = raiz.querySelector('#c-meses');
  if (activa && fila.scrollWidth > fila.clientWidth) fila.scrollLeft = activa.offsetLeft - fila.clientWidth / 2 + activa.clientWidth / 2;

  document.getElementById('page-actions').innerHTML = st.vista === 'mes' && tieneRol(['administracion', 'cobranza'])
    ? `<button class="btn btn-ghost" id="c-nueva">＋ Unidad</button>` : '';
  document.getElementById('c-nueva')?.addEventListener('click', () => editarUnidad(null, st.concepto));
  raiz.querySelector('.periodo').hidden = st.vista === 'cuenta' || st.vista === 'reporte';

  const cuerpo = raiz.querySelector('#c-cuerpo');
  // El reporte mensual vive aquí mismo (antes era otra opción del menú)
  if (st.vista === 'reporte') { cuerpo.innerHTML = '<div class="cargando">Cargando…</div>'; import('./reportes.js').then((m) => m.render(cuerpo, { mes: st.mes, anio: st.anio })); return; }
  if (st.vista === 'cuenta') return pintarCuenta(cuerpo);
  if (st.vista === 'deudores') return pintarDeudores(cuerpo);
  pintarConcepto(cuerpo, st.concepto);
}

function pintarResumen(el) {
  const m = st.mes;
  const fm = padron('mantenimiento'), fl = padron('luz');
  const sm = stats(fm, m), sl = stats(fl, m);
  const anual = (f) => f.reduce((s, r) => s + r.porMes.flat().reduce((a, p) => a + Number(p.monto), 0), 0);
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Mantenimiento · ${MESES[m]}</span><strong>${fmt(sm.cobrado)}</strong><small>${sm.pagaron} de ${sm.n} unidades · ${sm.pct}%</small></div>
      <div class="kpi"><span>Luz · ${MESES[m]}</span><strong>${fmt(sl.cobrado)}</strong><small>${sl.pagaron} de ${sl.n} unidades · ${sl.pct}%</small></div>
      <div class="kpi"><span>Mantenimiento ${st.anio}</span><strong class="pos">${fmt(anual(fm))}</strong><small>acumulado del año</small></div>
      <div class="kpi"><span>Luz ${st.anio}</span><strong class="pos">${fmt(anual(fl))}</strong><small>acumulado del año</small></div>
    </div>
    ${['mantenimiento', 'luz'].map((k) => {
      const filas = k === 'mantenimiento' ? fm : fl;
      return `<section class="panel"><h3>${CONCEPTOS[k].icono} ${CONCEPTOS[k].titulo} por mes</h3>
        <div class="meses-grid">${CORTO.map((nom, i) => {
          const s = stats(filas, i);
          return `<button class="mes-caja" data-ir="${k}:${i}">
            <span class="mes-nom">${nom}</span><strong class="${colorPct(s.pct)}">${s.pct}%</strong>
            <small>${s.pagaron}/${s.n}</small><span class="mini-barra"><span class="${colorPct(s.pct)}" style="width:${s.pct}%"></span></span></button>`;
        }).join('')}</div></section>`;
    }).join('')}`;
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => {
    const [k, i] = b.dataset.ir.split(':'); st.vista = 'mes'; st.concepto = k; st.mes = +i; st.q = ''; st.filtro = 'todos'; pintar();
  }));
}

// Estado de cuenta del año: una fila por unidad y una columna por mes; cada mes con dos marcas
// (arriba mantenimiento, abajo luz). Tocar un mes abre el pago de ese mes.
function pintarCuenta(el) {
  const fm = padron('mantenimiento'), fl = padron('luz'), luz = conLuz(), mant = conMant(), dos = mant && luz;
  const hoy = new Date(), mesHoy = st.anio < hoy.getFullYear() ? 11 : st.anio > hoy.getFullYear() ? -1 : hoy.getMonth();
  const ids = [...new Set([...fm, ...fl].map((r) => r.u.id))];
  const filas = ids.map((id) => ({ u: unidades.find((x) => x.id === id), m: fm.find((r) => r.u.id === id), l: fl.find((r) => r.u.id === id) }))
    .filter((f) => f.u && (!st.q || `${f.u.identificador} ${f.u.ocupante || ''}`.toLowerCase().includes(st.q)))
    .sort((a, b) => orden(a.u, b.u));
  const marca = (r, i) => !r ? 'na' : r.exento ? 'na' : r.pagado(i) > 0 ? 'ok' : i > mesHoy ? 'fut' : 'no';
  const adeudo = (r) => { if (!r || r.exento) return 0; let t = 0; for (let i = 0; i <= mesHoy; i++) if (debe(r, i)) t += Number(r.cuota.monto); return t; };
  const conAdeudo = filas.filter((f) => adeudo(f.m) + adeudo(f.l) > 0);
  if (st.soloDeben && !conAdeudo.length) st.soloDeben = false;
  const lista = st.soloDeben ? conAdeudo : filas;
  const sm = stats(fm, Math.max(0, mesHoy)), sl = stats(fl, Math.max(0, mesHoy));
  const sp = mant ? sm : sl, nomP = mant ? 'Mantenimiento' : 'Luz';          // concepto principal del edificio
  const anual = (f) => f.reduce((s2, r) => s2 + r.porMes.flat().reduce((a, p) => a + Number(p.monto), 0), 0);
  const totalAdeudo = filas.reduce((s2, f) => s2 + adeudo(f.m) + adeudo(f.l), 0);
  const nomMes = mesHoy >= 0 ? MESES[mesHoy].toLowerCase() : '';
  el.innerHTML = `
    <section class="cb-resumen">
      <div><span>${nomP} · ${nomMes}</span><strong>${sp.pct} %</strong><small>${sp.pagaron} de ${sp.n} unidades · ${fmt(sp.cobrado)}</small><div class="ry-pista"><span style="width:${sp.pct}%"></span></div></div>
      ${dos ? `<div><span>Luz · ${nomMes}</span><strong>${sl.pct} %</strong><small>${sl.pagaron} de ${sl.n} unidades · ${fmt(sl.cobrado)}</small><div class="ry-pista"><span style="width:${sl.pct}%"></span></div></div>`
        : `<div><span>Por cobrar · ${nomMes}</span><strong class="${sp.pendiente ? 'neg' : 'pos'}">${fmt(sp.pendiente)}</strong><small>${sp.n - sp.pagaron} unidad${sp.n - sp.pagaron === 1 ? '' : 'es'} sin pago</small></div>`}
      <div><span>Cobrado en ${st.anio}</span><strong>${fmt(anual(fm) + anual(fl))}</strong><small>${dos ? `${fmt(anual(fm))} mantenimiento · ${fmt(anual(fl))} luz` : nomP.toLowerCase()}</small></div>
      <div><span>Adeudo del año</span><strong class="${totalAdeudo ? 'neg' : 'pos'}">${fmt(totalAdeudo)}</strong><small>${conAdeudo.length} unidad${conAdeudo.length === 1 ? '' : 'es'} con meses sin pago</small></div>
    </section>
    <section class="panel cb-hoja">
      <div class="panel-head">
        <div class="cb-ctl"><button class="icon-btn" data-anio="-1" aria-label="Año anterior">‹</button><strong>${st.anio}</strong><button class="icon-btn" data-anio="1" aria-label="Año siguiente">›</button>
          <div class="segmento"><button data-sd="0" class="${!st.soloDeben ? 'activo' : ''}">Todas · ${filas.length}</button><button data-sd="1" class="${st.soloDeben ? 'activo' : ''}">Con adeudo · ${conAdeudo.length}</button></div></div>
        <div class="cb-ctl"><span class="cb-ley"><i class="ok"></i>Pagado <i class="no"></i>Sin pago <i class="na"></i>No aplica${dos ? ' · arriba mantenimiento, abajo luz' : ''}</span>
          <input type="search" id="c-q" placeholder="Buscar unidad u ocupante" value="${esc(st.q)}" aria-label="Buscar"></div>
      </div>
      <div class="tabla-wrap"><table class="tabla cb-tabla">
        <thead><tr><th>Unidad</th>${CORTO.map((m, i) => `<th class="cb-m ${i === mesHoy ? 'hoy' : ''}">${m}</th>`).join('')}<th class="num">Cuota</th><th class="num">Adeudo</th><th class="cb-rec-ancho"></th></tr></thead>
        <tbody>${lista.map((f) => { const ad = adeudo(f.m) + adeudo(f.l);
          return `<tr>
            <td data-l="Unidad"><strong>${esc(etiquetaUnidad(f.u))}</strong><small class="sub">${esc(f.u.ocupante || '—')}</small>${ultimoPagado(f.u.id) >= 0 ? `<button class="btn btn-sm btn-ghost cb-rec-movil" data-rec="${f.u.id}">Recibo</button>` : ''}</td>
            ${CORTO.map((nm, i) => `<td class="cb-m ${i === mesHoy ? 'hoy' : ''}"><button class="cb-cel" data-cel="${f.u.id}|${i}" title="${nm}:${mant ? ` mantenimiento ${({ ok: 'pagado', no: 'sin pago', na: 'no aplica', fut: '—' })[marca(f.m, i)]}` : ''}${luz ? ` · luz ${({ ok: 'pagado', no: 'sin pago', na: 'no aplica', fut: '—' })[marca(f.l, i)]}` : ''}">
              ${mant ? `<i class="${marca(f.m, i)}"></i>` : ''}${luz ? `<i class="${marca(f.l, i)}"></i>` : ''}</button></td>`).join('')}
            <td class="num mut" data-l="Cuota">${mant ? (f.m && !f.m.exento ? fmt(f.m.cuota.monto) : '—') : ''}${f.l && !f.l.exento ? `<small class="sub">luz ${fmt(f.l.cuota.monto)}</small>` : (mant ? '' : '—')}</td>
            <td class="num ${ad ? 'neg fuerte' : 'mut'}" data-l="Adeudo">${ad ? fmt(ad) : 'Al corriente'}</td>
            <td class="acciones cb-rec-ancho">${ultimoPagado(f.u.id) >= 0 ? `<button class="btn btn-sm btn-ghost" data-rec="${f.u.id}" title="Recibo de pago de esta unidad">Recibo</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="16" class="vacio">Sin unidades</td></tr>'}</tbody>
      </table></div>
    </section>
    <p class="nota">Un mes cuenta como pagado si tiene al menos un pago. El adeudo se estima con la cuota de cada unidad, hasta el mes en curso. Toca un mes para registrar o ver su pago; el botón Recibo de cada unidad genera el recibo del mes que elijas.</p>`;
  el.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => {
    const u = unidades.find((x) => x.id === b.dataset.rec);
    pedirRecibo(u, ultimoPagado(u.id), 'mantenimiento');
  }));
  el.querySelectorAll('[data-anio]').forEach((b) => b.addEventListener('click', () => { st.anio += +b.dataset.anio; const s2 = raiz.querySelector('#c-anio'); if (s2) s2.value = st.anio; cargar(); }));
  el.querySelectorAll('[data-sd]').forEach((b) => b.addEventListener('click', () => { st.soloDeben = b.dataset.sd === '1'; pintar(); }));
  const q = el.querySelector('#c-q');
  q.addEventListener('input', () => { st.q = q.value.toLowerCase(); pintar(); const n = raiz.querySelector('#c-q'); n.focus(); n.setSelectionRange(99, 99); });
  const puede = tieneRol(['administracion', 'cobranza']);
  el.querySelectorAll('[data-cel]').forEach((b) => b.addEventListener('click', () => {
    const [uid, i] = b.dataset.cel.split('|'); const m = +i;
    const f = filas.find((x) => x.u.id === uid);
    const opciones = [['mantenimiento', f.m], ['luz', f.l]].filter(([, r]) => r && !r.exento);
    if (!opciones.length) return;
    const pend = opciones.filter(([, r]) => debe(r, m));
    // un solo concepto pendiente: se abre directo; si no, se elige
    if (opciones.length === 1) { const [k, r] = opciones[0]; if (debe(r, m)) return puede ? registrarPago(r, k, m) : null; }
    const modal = abrirModal({ titulo: `${etiquetaUnidad(f.u)} · ${MESES[m]} ${st.anio}`,
      cuerpo: `<ul class="cb-op">${opciones.map(([k, r]) => `<li><div><strong>${CONCEPTOS[k].titulo}</strong><small>${debe(r, m) ? `Sin pago · cuota ${fmt(r.cuota.monto)}` : `Pagado ${fmt(r.pagado(m))}`}</small></div>
        ${debe(r, m) ? (puede ? `<button class="btn btn-sm btn-primary" data-op="pagar:${k}">Registrar pago</button>` : '') : `<button class="btn btn-sm btn-ghost" data-op="ver:${k}">Ver pago</button>`}</li>`).join('')}</ul>
        ${opciones.some(([, r]) => !debe(r, m)) ? '<button class="btn btn-primary" data-op="recibo:">Recibo de este mes</button>' : ''}`,
      pie: `${pend.length === 2 && puede ? '' : ''}<button class="btn btn-ghost" id="cb-x">Cerrar</button>` });
    modal.querySelector('#cb-x').addEventListener('click', cerrarModal);
    modal.querySelectorAll('[data-op]').forEach((x) => x.addEventListener('click', () => {
      const [acc, k] = x.dataset.op.split(':'); const r = k === 'luz' ? f.l : f.m;
      cerrarModal();
      if (acc === 'pagar') registrarPago(r, k, m); else if (acc === 'ver') verPagos(r, k, m); else pedirRecibo(f.u, m, 'mantenimiento');
    }));
  }));
}

function pintarConcepto(el, concepto) {
  if (!conceptosDe().includes(concepto)) concepto = st.concepto = conceptosDe()[0] || 'mantenimiento';
  const m = st.mes;
  const todas = padron(concepto);
  const s = stats(todas, m);
  const filas = todas.filter((r) => {
    if (st.filtro === 'pagados' && (r.exento || debe(r, m))) return false;
    if (st.filtro === 'pendientes' && !debe(r, m)) return false;
    if (st.q && !`${r.u.identificador} ${r.u.ocupante || ''}`.toLowerCase().includes(st.q)) return false;
    return true;
  });
  const puedeCapturar = tieneRol(['administracion', 'cobranza']);
  el.innerHTML = `
    <div class="segmento cb-conc" ${conceptosDe().length > 1 ? '' : 'hidden'}>${Object.entries(CONCEPTOS).filter(([k]) => conceptosDe().includes(k)).map(([k, c]) => `<button data-conc="${k}" class="${k === concepto ? 'activo' : ''}">${c.titulo}</button>`).join('')}</div>
    <div class="kpis">
      <div class="kpi"><span>Unidades que pagan</span><strong>${s.n}</strong><small>${MESES[m]} ${st.anio}</small></div>
      <div class="kpi"><span>Pagaron</span><strong class="pos">${s.pagaron}</strong><small>${fmt(s.cobrado)} cobrado</small></div>
      <div class="kpi"><span>Pendientes</span><strong class="neg">${s.n - s.pagaron}</strong><small>${fmt(s.pendiente)} por cobrar</small></div>
      <div class="kpi"><span>% de cobranza</span><strong>${s.pct}%</strong><small>unidades al corriente</small></div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <div class="segmento">${[['todos','Todas'],['pagados','Pagadas'],['pendientes','Pendientes']]
          .map(([id, t]) => `<button data-filtro="${id}" class="${st.filtro === id ? 'activo' : ''}">${t}</button>`).join('')}</div>
        <input type="search" id="c-q" placeholder="Buscar unidad u ocupante" value="${esc(st.q)}" aria-label="Buscar">
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Unidad</th><th>Ocupante</th><th class="num">Cuota</th><th class="num">Pagado</th><th>Forma</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
        <tbody>${filas.length ? filas.map((r) => filaConcepto(r, m, puedeCapturar)).join('')
          : `<tr><td colspan="8" class="vacio">Sin unidades para este filtro</td></tr>`}</tbody>
      </table></div>
    </section>`;

  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { st.filtro = b.dataset.filtro; pintar(); }));
  el.querySelectorAll('[data-conc]').forEach((b) => b.addEventListener('click', () => { st.concepto = b.dataset.conc; pintar(); }));
  const q = el.querySelector('#c-q');
  q.addEventListener('input', () => { st.q = q.value.toLowerCase(); pintar(); el.querySelector('#c-q').focus(); el.querySelector('#c-q').setSelectionRange(99, 99); });
  const fila = (id) => todas.find((r) => r.cuota.id === id);
  el.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => registrarPago(fila(b.dataset.pagar), concepto, m)));
  el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verPagos(fila(b.dataset.ver), concepto, m)));
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarUnidad(fila(b.dataset.editar), concepto)));
  el.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => pedirRecibo(fila(b.dataset.recibo).u, m, concepto)));
  el.querySelectorAll('[data-wa]').forEach((b) => b.addEventListener('click', () => cobrarWhatsApp(fila(b.dataset.wa), concepto, m)));
  // ✕ Eliminar pago: con un solo pago en el mes se borra aquí (con confirmación); con varios se abre la lista para elegir cuál
  el.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
    const r = fila(b.dataset.quitar), pagos = r.porMes[m] || [];
    if (pagos.length !== 1) return verPagos(r, concepto, m);
    const p = pagos[0];
    if (!confirm(`¿Eliminar el pago de ${fmt(p.monto)} de ${etiquetaUnidad(r.u)} (${MESES[m].toLowerCase()})?\nQueda registrado en la bitácora.`)) return;
    const { error } = await db().from('pagos').delete().eq('id', p.id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    toast('Pago eliminado'); cargar();
  }));
}

function filaConcepto(r, m, puedeCapturar) {
  const pagos = r.porMes[m];
  const pagado = r.pagado(m);
  const cuota = Number(r.cuota.monto);
  const ultimo = pagos[pagos.length - 1];
  const estado = r.exento ? '<span class="badge gris">Sin cobro</span>'
    : pagado > 0 ? '<span class="badge verde">Pagado</span>'
    : '<span class="badge rojo">Pendiente</span>';
  const formas = [...new Set(pagos.map((p) => formaLegible(p.forma_pago)).filter(Boolean))].join(', ');
  return `<tr class="${r.exento ? 'inactivo' : ''}">
    <td data-l="Unidad"><strong>${esc(etiquetaUnidad(r.u))}</strong></td>
    <td class="mut corto" data-l="Ocupante" title="${esc(r.u.ocupante || '')}">${esc(r.u.ocupante || '—')}</td>
    <td class="num mut" data-l="Cuota">${r.exento ? '—' : fmt(cuota)}</td>
    <td class="num fuerte" data-l="Pagado">${pagado ? fmt(pagado) : '<span class="mut">—</span>'}</td>
    <td class="mut" data-l="Forma">${esc(formas || '—')}</td>
    <td class="mut nowrap" data-l="Fecha">${ultimo ? fmtFecha(ultimo.fecha) : '—'}</td>
    <td data-l="Estado">${estado}</td>
    <td class="acciones">
      ${!r.exento && puedeCapturar && !pagado ? `<button class="btn btn-sm btn-primary" data-pagar="${r.cuota.id}">＋ Registrar pago</button>` : ''}
      ${!r.exento && !pagado ? `<button class="btn btn-sm btn-ghost" data-wa="${r.cuota.id}" title="Mandar el cobro por WhatsApp">WhatsApp</button>` : ''}
      ${pagos.length ? `<button class="btn btn-sm btn-ghost" data-ver="${r.cuota.id}">${pagos.length > 1 ? pagos.length + ' pagos' : 'Ver'}</button>` : ''}
      ${pagos.length ? `<button class="btn btn-sm btn-ghost" data-recibo="${r.cuota.id}" title="Recibo de mantenimiento y luz de este mes">Recibo</button>` : ''}
      ${puedeCapturar && pagos.length ? `<button class="icon-btn peligro" data-quitar="${r.cuota.id}" title="Eliminar pago" aria-label="Eliminar pago">✕</button>` : ''}
      ${puedeCapturar ? `<button class="icon-btn" data-editar="${r.cuota.id}" title="Editar unidad" aria-label="Editar unidad">✎</button>` : ''}
    </td></tr>`;
}

// "ene–oct" o "ene, mar, jun–ago"
const rangoMeses = (lst) => {
  const g = []; lst.forEach((i) => { const u = g[g.length - 1]; if (u && u[1] === i - 1) u[1] = i; else g.push([i, i]); });
  return g.map(([a, b]) => a === b ? CORTO[a].toLowerCase() : `${CORTO[a].toLowerCase()}–${CORTO[b].toLowerCase()}`).join(', ');
};
const formaLegible = (f) => ({ Transfer: 'Transferencia' }[f] || f || '');

function pintarDeudores(el) {
  const m = st.mes;
  const bloques = conceptosDe().map((k) => {
    const deben = padron(k).filter((r) => debe(r, m)).map((r) => {
      const atrasados = [];
      let total = 0;
      for (let i = 0; i <= m; i++) if (debe(r, i)) { atrasados.push(i); total += Number(r.cuota.monto); }
      return { r, atrasados, total };
    }).sort((a, b) => b.total - a.total);
    const suma = deben.reduce((s, d) => s + d.total, 0);
    return `<section class="panel">
      <div class="panel-head"><h3>${CONCEPTOS[k].icono} ${CONCEPTOS[k].titulo}</h3>
        ${deben.length ? `<span class="mut">${deben.length} unidad${deben.length === 1 ? '' : 'es'} · adeudo estimado <strong>${fmt(suma)}</strong></span>` : ''}</div>
      ${deben.length ? `<div class="tabla-wrap"><table class="tabla tm">
        <thead><tr><th>Unidad</th><th>Ocupante</th><th>Meses sin pago</th><th class="num">Cuota</th><th class="num">Adeudo</th><th></th></tr></thead>
        <tbody>${deben.map(({ r, atrasados, total }) => `<tr>
          <td data-l="Unidad"><strong>${esc(etiquetaUnidad(r.u))}</strong></td>
          <td class="mut" data-l="Ocupante">${esc(r.u.ocupante || '—')}</td>
          <td data-l="Meses"><strong>${atrasados.length}</strong> <span class="mut">${rangoMeses(atrasados)}</span></td>
          <td class="num mut" data-l="Cuota">${fmt(r.cuota.monto)}</td>
          <td class="num neg fuerte" data-l="Adeudo">${fmt(total)}</td>
          <td class="acciones"><button class="btn btn-sm btn-ghost" data-wa="${k}|${r.cuota.id}" title="Mandar el cobro por WhatsApp">WhatsApp</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="vacio">Todas las unidades pagaron ${MESES[m].toLowerCase()}</div>`}
    </section>`;
  });
  el.innerHTML = `<p class="nota">Unidades sin pago en ${MESES[m].toLowerCase()} ${st.anio}, con los meses de este año que no tienen ningún pago. El adeudo se estima con la cuota registrada. El botón WhatsApp abre el mensaje de cobro ya escrito.</p>${bloques.join('')}`;
  el.querySelectorAll('[data-wa]').forEach((b) => b.addEventListener('click', () => {
    const [k, id] = b.dataset.wa.split('|');
    cobrarWhatsApp(padron(k).find((r) => r.cuota.id === id), k, m);
  }));
}

// ---------- cobro por WhatsApp ----------
// Abre WhatsApp con el mensaje de cobro ya escrito (meses sin pago del año hasta el mes elegido).
// Si la unidad no tiene teléfono, se pide una vez y se guarda en la unidad.
const telWa = (t) => {
  const d = String(t || '').replace(/\D/g, '');
  return d.length === 10 ? '52' + d : (d.length === 12 && d.startsWith('52')) || (d.length === 13 && d.startsWith('521')) ? d : null;
};
// "octubre", "octubre y noviembre", "enero a noviembre" (seguidos) o "marzo, junio y agosto"
const listaMeses = (ms) => {
  const n = (i) => MESES[i].toLowerCase();
  if (ms.length === 1) return n(ms[0]);
  if (ms.length > 2 && ms.every((x, k) => !k || x === ms[k - 1] + 1)) return `${n(ms[0])} a ${n(ms.at(-1))}`;
  return ms.slice(0, -1).map(n).join(', ') + ' y ' + n(ms.at(-1));
};
function mensajeCobro(r, concepto, m) {
  const ms = []; let total = 0;
  for (let i = 0; i <= m; i++) if (debe(r, i)) { ms.push(i); total += Number(r.cuota.monto); }
  const tipo = TIPO_RECIBO[r.u.tipo] || 'Unidad';
  const art = ['Oficina', 'Bodega', 'Casa', 'Unidad'].includes(tipo) ? 'la' : 'el';
  const nombre = pagadorDe(r.u, concepto) || '';
  const que = concepto === 'luz' ? 'luz' : 'mantenimiento';
  return `Buen día${nombre ? ', ' + nombre : ''}. Le saluda ${estado.miembro.nombre}, de la administración de ${centro.nombre}. `
    + `Le recordamos que ${art} ${tipo.toLowerCase()} ${r.u.identificador} tiene pendiente el pago de ${que} de ${listaMeses(ms.length ? ms : [m])} de ${st.anio}, `
    + `por ${fmt(total || r.cuota.monto)}. Al recibir su pago le enviamos su recibo. Muchas gracias.`;
}
function cobrarWhatsApp(r, concepto, m) {
  if (!r) return;
  const abrir = (tel) => window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeCobro(r, concepto, m))}`, '_blank');
  const tel = telWa(r.u.telefono);
  if (tel) return abrir(tel);
  const modal = abrirModal({
    titulo: `WhatsApp · ${etiquetaUnidad(r.u)}`,
    cuerpo: `<form class="form" id="wf" novalidate>
      <p class="nota">Esta unidad no tiene teléfono. Escríbelo una vez y queda guardado para la próxima.</p>
      <label>Teléfono de ${esc(pagadorDe(r.u, concepto) || 'quien paga')} <small>(10 dígitos)</small><input name="tel" type="tel" inputmode="tel" maxlength="20" required></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="wf-no">Cancelar</button><button class="btn btn-primary" id="wf-si">Guardar y abrir WhatsApp</button>`,
  });
  modal.querySelector('#wf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#wf-si').addEventListener('click', () => {
    const valor = modal.querySelector('[name=tel]').value.trim();
    const n = telWa(valor);
    if (!n) return toast('Escribe un teléfono de 10 dígitos', true);
    abrir(n);                                       // primero WhatsApp (el navegador lo permite solo dentro del clic)
    cerrarModal();
    r.u.telefono = valor;
    if (tieneRol(['administracion', 'cobranza'])) db().from('unidades').update({ telefono: valor }).eq('id', r.u.id)
      .then(({ error }) => { if (error) toast('No se guardó el teléfono: ' + error.message, true); });
  });
}

// ---------- acciones ----------
function registrarPago(r, concepto, m) {
  const cuota = Number(r.cuota.monto) || 0;
  const modal = abrirModal({
    titulo: `${CONCEPTOS[concepto].titulo} · ${etiquetaUnidad(r.u)}`,
    cuerpo: `<form class="form" id="pf" novalidate>
      <p class="nota" id="pf-info"></p>
      <div class="form-2">
        <label>Mes que paga<select name="mes">${MESES.map((t, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${t} ${st.anio}</option>`).join('')}</select></label>
        <label>¿Cuántos meses paga?<select name="n">${[1, 2, 3, 4, 5, 6].map((n) => `<option>${n}</option>`).join('')}</select></label>
      </div>
      <div class="form-2">
        <label>Monto recibido <small id="pf-reparto"></small><input type="number" name="monto" min="0.01" step="0.01" inputmode="decimal" required></label>
        <label>Fecha de pago<input type="date" name="fecha" value="${hoyISO()}" required></label>
      </div>
      <label>Forma de pago<select name="forma">${FORMAS_COBRO.map((f) => `<option>${f}</option>`).join('')}</select></label>
      <label>Nota <small>(opcional)</small><input name="nota" maxlength="200"></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="pf-no">Cancelar</button><button class="btn btn-ghost" id="pf-si">Guardar pago</button>
      <button class="btn btn-primary" id="pf-rec">Guardar y ver recibo</button>`,
  });
  const f = modal.querySelector('#pf');
  const meses = () => { const a = +f.mes.value; return Array.from({ length: Math.min(+f.n.value, 12 - a) }, (_, i) => a + i); };
  const actualizar = () => {
    const ms = meses(), ya = ms.filter((i) => r.pagado(i) > 0);
    f.n.querySelectorAll('option').forEach((o) => { o.disabled = +f.mes.value + +o.value > 12; });
    if (!f.monto.dataset.tocado) f.monto.value = ya.length ? '' : (cuota * ms.length || '');
    modal.querySelector('#pf-info').innerHTML = `${esc(r.u.ocupante || '')} · paga <strong>${ms.length === 1 ? MESES[ms[0]] : `${MESES[ms[0]]} a ${MESES[ms.at(-1)]}`}</strong>`
      + (ya.length ? ` · <span style="color:var(--neg)">ya hay pago en ${ya.map((i) => MESES[i].toLowerCase()).join(', ')}</span>` : '');
    modal.querySelector('#pf-reparto').textContent = ms.length > 1 ? `(se reparte en ${ms.length} meses)` : '';
  };
  f.mes.addEventListener('change', () => { f.mes.dataset.tocado = '1'; actualizar(); });
  f.n.addEventListener('change', actualizar);
  f.monto.addEventListener('input', () => { f.monto.dataset.tocado = '1'; actualizar(); });
  // Si cambian la fecha a otro mes del mismo año y no han tocado "Mes que paga", el mes la sigue
  f.fecha.addEventListener('change', () => {
    const [y, mm] = (f.fecha.value || '').split('-').map(Number);
    if (!f.mes.dataset.tocado && y === st.anio && mm) { f.mes.value = String(mm - 1); actualizar(); }
  });
  actualizar();
  modal.querySelector('#pf-no').addEventListener('click', cerrarModal);
  const guardar = async (ev, conRecibo) => {
    const btn = ev.currentTarget;
    const monto = Number(f.monto.value);
    if (!(monto > 0)) return toast('Escribe el monto recibido', true);
    if (!f.fecha.value) return toast('Pon la fecha de pago', true);
    const ms = meses();
    if (ms.some((i) => r.pagado(i) > 0) && !confirm('Alguno de esos meses ya tiene pago. ¿Registrar otro de todos modos?')) return;
    const w = conRecibo ? abrirVentana() : null;           // se abre antes de esperar, para que el navegador no la bloquee
    if (conRecibo && !w) return;
    btn.disabled = true; btn.textContent = 'Guardando…';
    // Varios meses: un pago por mes, repartido en partes iguales (el último ajusta los centavos)
    const parte = Math.floor(monto / ms.length * 100) / 100;
    const { error } = await db().from('pagos').insert(ms.map((i, k) => ({
      org_id: estado.miembro.org_id, empresa_id: centro.empresa_id, centro_id: centro.id, unidad_id: r.u.id,
      concepto, periodo: `${st.anio}-${String(i + 1).padStart(2, '0')}-01`,
      monto: k === ms.length - 1 ? Math.round((monto - parte * (ms.length - 1)) * 100) / 100 : parte,
      forma_pago: f.forma.value, fecha: f.fecha.value,
      notas: f.nota.value.trim() || null, capturado_por: estado.miembro.nombre,
    })));
    if (error) {
      w?.close(); btn.disabled = false; btn.textContent = conRecibo ? 'Guardar y ver recibo' : 'Guardar pago';
      return toast('No se pudo guardar: ' + error.message, true);
    }
    cerrarModal(); toast(ms.length > 1 ? `Pago guardado en ${ms.length} meses ✓` : `Pago guardado en ${MESES[ms[0]].toLowerCase()} ✓`);
    await cargar();
    if (conRecibo) generarRecibo(w, r.u, ms[0], { conceptos: [concepto], meses: ms });   // solo lo que se acaba de cobrar; juntos se saca con el botón Recibo
  };
  modal.querySelector('#pf-si').addEventListener('click', (ev) => guardar(ev, false));
  modal.querySelector('#pf-rec').addEventListener('click', (ev) => guardar(ev, true));
}

function verPagos(r, concepto, m) {
  const puedeBorrar = tieneRol(['administracion', 'cobranza']);
  const modal = abrirModal({
    titulo: `${etiquetaUnidad(r.u)} · ${CONCEPTOS[concepto].titulo} · ${MESES[m]}`,
    cuerpo: `<ul class="lista-pagos">${r.porMes[m].map((p) => `<li>
        <div><strong>${fmt(p.monto)}</strong> <span class="mut">${esc(formaLegible(p.forma_pago))} · ${fmtFecha(p.fecha)}</span>
          ${p.notas ? `<small>${esc(p.notas)}</small>` : ''}<small>Capturó: ${esc(p.capturado_por || '—')}</small></div>
        ${puedeBorrar ? `<button class="btn btn-sm btn-ghost peligro" data-borrar="${p.id}">Eliminar</button>` : ''}</li>`).join('')}</ul>`,
    pie: `<button class="btn btn-ghost" id="vp-rec">Recibo</button>${puedeBorrar
      ? `<button class="btn btn-ghost" id="vp-otro">＋ Registrar otro pago</button><button class="btn btn-primary" id="vp-ok">Listo</button>` : ''}`,
  });
  modal.querySelector('#vp-ok')?.addEventListener('click', cerrarModal);
  modal.querySelector('#vp-rec').addEventListener('click', () => pedirRecibo(r.u, m, concepto));
  modal.querySelector('#vp-otro')?.addEventListener('click', () => registrarPago(r, concepto, m));
  modal.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    const p = r.porMes[m].find((x) => x.id === b.dataset.borrar);
    if (!confirm(`¿Eliminar el pago de ${fmt(p.monto)}?\nQueda registrado en la bitácora.`)) return;
    const { error } = await db().from('pagos').delete().eq('id', p.id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    cerrarModal(); toast('Pago eliminado'); cargar();
  }));
}

function editarUnidad(r, concepto) {
  const nueva = !r;
  const modal = abrirModal({
    titulo: nueva ? `Nueva unidad · ${CONCEPTOS[concepto].titulo}` : `Editar ${etiquetaUnidad(r.u)}`,
    cuerpo: `<form class="form" id="uf" novalidate>
      <div class="form-2">
        <label>Unidad<input name="identificador" required maxlength="40" value="${esc(r?.u.identificador || '')}" placeholder="Ej. 1205"></label>
        <label>Tipo<select name="tipo">${Object.entries(TIPO_UNIDAD).map(([k, v]) => `<option value="${k}" ${r?.u.tipo === k ? 'selected' : ''}>${v || 'Otro'}</option>`).join('')}</select></label>
      </div>
      <div class="form-2">
        <label>Ocupante / propietario<input name="ocupante" maxlength="120" value="${esc(r?.u.ocupante || '')}"></label>
        <label>Teléfono <small>(WhatsApp)</small><input name="telefono" type="tel" inputmode="tel" maxlength="20" value="${esc(r?.u.telefono || '')}"></label>
      </div>
      <div class="form-2">
        <label>Cuota de ${CONCEPTOS[concepto].titulo.toLowerCase()}<input type="number" name="monto" min="0" step="0.01" value="${r ? Number(r.cuota.monto) : ''}" required></label>
        <label>Estado<select name="cobra"><option value="1">Cobra normal</option><option value="0" ${r?.exento ? 'selected' : ''}>Sin cobro (exento)</option></select></label>
      </div>
      ${nueva ? '' : '<p class="nota">Cambiar el nombre de la unidad no afecta sus pagos: el historial se queda con ella.</p>'}
    </form>`,
    pie: `<button class="btn btn-ghost" id="uf-no">Cancelar</button><button class="btn btn-primary" id="uf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#uf');
  modal.querySelector('#uf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#uf-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const identificador = f.identificador.value.trim();
    const monto = Number(f.monto.value);
    if (!identificador) return toast('Escribe la unidad', true);
    if (!(monto >= 0) || f.monto.value === '') return toast('Escribe la cuota', true);
    btn.disabled = true;
    try {
      let unidadId = r?.u.id;
      const datos = { identificador, tipo: f.tipo.value, ocupante: f.ocupante.value.trim() || null, telefono: f.telefono.value.trim() || null };
      if (nueva) {
        const existente = unidades.find((u) => u.identificador.toLowerCase() === identificador.toLowerCase());
        if (existente) unidadId = existente.id;
        else {
          const { data, error } = await db().from('unidades')
            .insert({ ...datos, org_id: estado.miembro.org_id, centro_id: centro.id }).select('id').single();
          if (error) throw error;
          unidadId = data.id;
        }
      } else {
        const { error } = await db().from('unidades').update(datos).eq('id', unidadId);
        if (error) throw error;
      }
      const cuota = { monto: Math.round(monto * 100) / 100, activo: f.cobra.value === '1', en_padron: true, actualizado_en: new Date().toISOString() };
      const { error: e2 } = r
        ? await db().from('cuotas').update(cuota).eq('id', r.cuota.id)
        : await db().from('cuotas').upsert({ ...cuota, org_id: estado.miembro.org_id, unidad_id: unidadId, concepto }, { onConflict: 'unidad_id,concepto' });
      if (e2) throw e2;
      cerrarModal(); toast('Unidad guardada ✓'); cargar();
    } catch (e) {
      btn.disabled = false;
      toast(e.code === '23505' ? 'Ya existe una unidad con ese nombre' : 'No se pudo guardar: ' + e.message, true);
    }
  });
}

// ---------- recibo de mantenimiento y luz ----------
// Formato Treme (js/recibo.js). Se puede sacar junto (mantenimiento + luz) o uno por concepto, porque
// normalmente el dueño paga el mantenimiento y el inquilino la luz. Cada concepto recuerda quién lo paga
// (cuotas.pagador). Folio REC-AAAAMM-NNNN guardado en los pagos: al reimprimir sale el mismo.
const NOMBRE_LINEA = { mantenimiento: 'Mantenimiento mensual', luz: 'Luz' };
const NOMBRE_CORTO = { mantenimiento: 'Mantenimiento', luz: 'Luz' };
const nombreBonito = (s) => (s && s === s.toUpperCase())
  ? s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase()) : (s || '');
const pagosDelMes = (unidadId, m, k) => pagos.filter((p) => p.unidad_id === unidadId && mesDe(p.periodo) === m && (!k || p.concepto === k));
const cuotaDe = (unidadId, k) => cuotas.find((c) => c.unidad_id === unidadId && c.concepto === k);
const pagadorDe = (u, k) => cuotaDe(u.id, k)?.pagador || nombreBonito(u.ocupante);

// Juntos si los dos conceptos están pagados en el mes y los paga la misma persona; si no, solo el de la pestaña
function conceptosPorDefecto(u, m, concepto) {
  const pagados = ['mantenimiento', 'luz'].filter((k) => pagosDelMes(u.id, m, k).length);
  if (pagados.length === 2 && pagadorDe(u, 'mantenimiento') === pagadorDe(u, 'luz')) return pagados;
  return pagados.includes(concepto) ? [concepto] : pagados.slice(0, 1);
}

function abrirVentana() {
  const w = abrirVentanaRecibo();
  if (!w) toast('Permite ventanas emergentes para ver el recibo', true);
  return w;
}

// Último mes del año con algún pago de la unidad (el del recibo por omisión); -1 si no hay
function ultimoPagado(unidadId) {
  return pagos.filter((p) => p.unidad_id === unidadId).reduce((a, p) => Math.max(a, mesDe(p.periodo)), -1);
}

function pedirRecibo(u, m, concepto) {
  const pagados = ['mantenimiento', 'luz'].filter((k) => pagosDelMes(u.id, m, k).length);
  if (!pagados.length) {
    const otro = ultimoPagado(u.id);
    if (otro >= 0 && otro !== m) return pedirRecibo(u, otro, concepto);
    return toast('Esta unidad no tiene pagos registrados en ' + st.anio, true);
  }
  const mesesConPago = [...new Set(pagos.filter((p) => p.unidad_id === u.id).map((p) => mesDe(p.periodo)))].sort((a, b) => a - b);
  const puede = tieneRol(['administracion', 'cobranza']);
  const suma = (k) => pagosDelMes(u.id, m, k).reduce((s, p) => s + Number(p.monto), 0);
  const ultima = (ks) => pagos.filter((p) => p.unidad_id === u.id && mesDe(p.periodo) === m && ks.includes(p.concepto)).map((p) => p.fecha).sort().pop();
  const def = conceptosPorDefecto(u, m, concepto);
  const opciones = [
    ...(pagados.length === 2 ? [['juntos', `Juntos: mantenimiento + luz (${fmt(suma('mantenimiento') + suma('luz'))})`]] : []),
    ...pagados.map((k) => [k, `Solo ${NOMBRE_CORTO[k].toLowerCase()} (${fmt(suma(k))})`]),
  ];
  const elegido = def.length === 2 ? 'juntos' : def[0];
  const modal = abrirModal({
    titulo: `Recibo · ${etiquetaUnidad(u)} · ${MESES[m]} ${st.anio}`,
    cuerpo: `<form class="form" id="rf" novalidate>
      ${mesesConPago.length > 1 ? `<label>Mes<select name="mes">${mesesConPago.map((i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${MESES[i]} ${st.anio}</option>`).join('')}</select></label>` : ''}
      <label>¿Qué recibo?<select name="cual">${opciones.map(([v, t]) => `<option value="${v}" ${v === elegido ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Recibí de<input name="nombre" maxlength="120" required></label>
      <div class="form-2">
        <label>Tipo de unidad<select name="tipo">${Object.entries(TIPO_RECIBO).map(([k, v]) =>
          `<option value="${k}" ${u.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Fecha del recibo<input type="date" name="fecha" required></label>
      </div>
      <label>Nota <small>(opcional, sale en el recibo)</small><input name="nota" maxlength="200"></label>
      ${puede ? '<p class="nota">Quién paga cada concepto y el tipo de unidad se guardan para la próxima vez.</p>' : ''}
    </form>`,
    pie: `<button class="btn btn-ghost" id="rf-no">Cancelar</button><button class="btn btn-primary" id="rf-si">Ver recibo / PDF</button>`,
  });
  const f = modal.querySelector('#rf');
  const ks = () => f.cual.value === 'juntos' ? ['mantenimiento', 'luz'] : [f.cual.value];
  const llenar = () => { f.nombre.value = pagadorDe(u, ks()[0]); f.fecha.value = ultima(ks()); };
  llenar();
  f.cual.addEventListener('change', llenar);
  // Otro mes: se vuelve a abrir la ventana con los pagos de ese mes
  f.mes?.addEventListener('change', () => pedirRecibo(u, +f.mes.value, concepto));
  modal.querySelector('#rf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#rf-si').addEventListener('click', async () => {
    const nombre = f.nombre.value.trim();
    if (!nombre) return toast('Escribe a nombre de quién va el recibo', true);
    const w = abrirVentana();
    if (!w) return;
    const conceptos = ks(), tipo = f.tipo.value, fecha = f.fecha.value, nota = f.nota.value.trim();
    cerrarModal();
    if (puede) {
      if (tipo !== u.tipo) {
        const { error } = await db().from('unidades').update({ tipo }).eq('id', u.id);
        if (!error) u.tipo = tipo;
      }
      for (const k of conceptos) {
        const c = cuotaDe(u.id, k);
        if (c && (c.pagador || nombreBonito(u.ocupante)) !== nombre) {
          const { error } = await db().from('cuotas').update({ pagador: nombre }).eq('id', c.id);
          if (!error) c.pagador = nombre;
        }
      }
    }
    generarRecibo(w, u, m, { conceptos, nombre, tipo, fecha, nota });
  });
}

async function generarRecibo(w, u, m, op) {
  const ms = op.meses || [m];
  const conceptos = op.conceptos.filter((k) => ms.some((i) => pagosDelMes(u.id, i, k).length));
  const ps = pagos.filter((p) => p.unidad_id === u.id && ms.includes(mesDe(p.periodo)) && conceptos.includes(p.concepto));
  if (!ps.length) { w.close(); return toast('No hay pagos para el recibo', true); }
  // Folio: si todos los pagos ya comparten uno, se reusa; si no, uno nuevo para este recibo
  const folios = [...new Set(ps.map((p) => p.folio))];
  let folio = folios.length === 1 ? folios[0] : null;
  if (!folio && tieneRol(['administracion', 'cobranza'])) {
    const periodo = `${st.anio}-${String(m + 1).padStart(2, '0')}-01`;
    const { data, error } = await db().rpc('siguiente_folio_cuota', { p_org: estado.miembro.org_id, p_periodo: periodo });
    if (!error && data) {
      const { error: e2 } = await db().from('pagos').update({ folio: data }).in('id', ps.map((p) => p.id));
      if (!e2) { folio = data; ps.forEach((p) => { p.folio = data; }); }
    }
  }
  const nombre = op.nombre || pagadorDe(u, conceptos[0]) || '—';
  const tipo = TIPO_RECIBO[op.tipo || u.tipo] || 'Unidad';
  const per = ms.length === 1 ? `${MESES[m]} ${st.anio}` : `${MESES[ms[0]]} a ${MESES[ms.at(-1)]} ${st.anio}`;
  const lineas = ms.flatMap((i) => conceptos.map((k) => {
    const monto = pagosDelMes(u.id, i, k).reduce((s, p) => s + Number(p.monto), 0);
    const cuota = Number(cuotaDe(u.id, k)?.monto || 0);
    return { k, concepto: NOMBRE_LINEA[k], detalle: `${MESES[i]} ${st.anio}`, cantidad: 1, precio: monto, subtotal: monto, completo: !(cuota > 0) || monto >= cuota };
  })).filter((l) => l.subtotal > 0);
  const textoConcepto = conceptos.map((k) => NOMBRE_CORTO[k]).join(' + ');
  const formas = [...new Set(ps.map((p) => formaLegible(p.forma_pago)).filter(Boolean))].join(' / ') || '—';
  const notas = [op.nota, ...new Set(ps.map((p) => p.notas).filter(Boolean))].filter(Boolean).join(' · ');
  const art = ['Oficina', 'Bodega', 'Casa', 'Unidad'].includes(tipo) ? 'la' : 'el';
  await pintarRecibo(w, {
    titulo: `${nombre} - ${tipo} ${u.identificador} - ${textoConcepto} ${per}`,
    folio, fecha: op.fecha || ps.map((p) => p.fecha).sort().pop(),
    info: [['Recibí de', nombre], [tipo, `${u.identificador} · ${centro.nombre}`], ['Concepto', textoConcepto], ['Periodo', per],
      ['Recibido por', 'Administración — ' + EMISOR], ['Método de pago', formas]],
    lineas, total: lineas.reduce((s, l) => s + l.subtotal, 0), moneda: 'MXN',
    liquidado: lineas.every((l) => l.completo), notas,
    aviso: `Este recibo ampara el pago de ${textoConcepto} correspondiente al periodo indicado, para ${art} ${tipo} ${u.identificador} de ${centro.nombre}, recibido a nombre de ${nombre}.`,
  });
  pintar();
}
