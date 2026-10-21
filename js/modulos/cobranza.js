// Cobranza de Torre Elysium: mantenimiento y luz por unidad y por mes.
// Reemplaza la página "Cobranza Elysium".
import { MESES, FORMAS_COBRO } from '../config.js';
import { pintarRecibo, abrirVentanaRecibo } from '../recibo.js';
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal } from '../lib.js';

const CONCEPTOS = {
  mantenimiento: { titulo: 'Mantenimiento', icono: '🏠' },
  luz:           { titulo: 'Luz (CFE)',     icono: '⚡' },
};
const CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const TIPO_UNIDAD = { local: 'Local', loft: 'Loft', depto: 'Depto', oficina: 'Oficina', bodega: 'Bodega', casa: 'Casa', terreno: 'Terreno', otro: '' };
// Cómo se nombra la unidad en el recibo
const TIPO_RECIBO = { local: 'Local', loft: 'Loft', depto: 'Departamento', oficina: 'Oficina', bodega: 'Bodega', casa: 'Casa', terreno: 'Terreno', otro: 'Unidad' };

const st = {
  vista: 'resumen',                       // resumen | mantenimiento | luz | deudores
  anio: new Date().getFullYear(),
  mes: new Date().getMonth(),
  filtro: 'todos',                        // todos | pagados | pendientes
  q: '',
};
let centro, unidades = [], cuotas = [], pagos = [], raiz;

export async function render(view) {
  raiz = view;
  centro = estado.centros.find((c) => c.nombre === 'Torre Elysium');
  if (!centro) { view.innerHTML = '<div class="vacio">No tienes acceso a Torre Elysium.</div>'; return; }
  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        ${[['resumen','Resumen'],['mantenimiento','🏠 Mantenimiento'],['luz','⚡ Luz'],['deudores','Deudores']]
          .map(([id, t]) => `<button role="tab" data-vista="${id}">${t}</button>`).join('')}
      </div>
      <div class="sub-meta">Torre Elysium · cuotas de condominio</div>
    </div>
    <div class="periodo">
      <div class="pills" id="c-meses"></div>
      <select id="c-anio" aria-label="Año">${[st.anio + 1, st.anio, st.anio - 1].filter((a, i, arr) => arr.indexOf(a) === i)
        .map((a) => `<option>${a}</option>`).join('')}</select>
    </div>
    <div id="c-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelector('#c-anio').value = st.anio;
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
    db().from('unidades').select('id, identificador, tipo, ocupante, notas, activo').eq('centro_id', centro.id).eq('activo', true),
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

  document.getElementById('page-actions').innerHTML = CONCEPTOS[st.vista] && tieneRol(['administracion', 'cobranza'])
    ? `<button class="btn btn-ghost" id="c-nueva">＋ Unidad</button>` : '';
  document.getElementById('c-nueva')?.addEventListener('click', () => editarUnidad(null, st.vista));

  const cuerpo = raiz.querySelector('#c-cuerpo');
  if (st.vista === 'resumen') return pintarResumen(cuerpo);
  if (st.vista === 'deudores') return pintarDeudores(cuerpo);
  pintarConcepto(cuerpo, st.vista);
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
    const [k, i] = b.dataset.ir.split(':'); st.vista = k; st.mes = +i; st.q = ''; st.filtro = 'todos'; pintar();
  }));
}

function pintarConcepto(el, concepto) {
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
    <div class="kpis">
      <div class="kpi"><span>Unidades que pagan</span><strong>${s.n}</strong><small>${MESES[m]} ${st.anio}</small></div>
      <div class="kpi"><span>Pagaron</span><strong class="pos">${s.pagaron}</strong><small>${fmt(s.cobrado)} cobrado</small></div>
      <div class="kpi"><span>Pendientes</span><strong class="neg">${s.n - s.pagaron}</strong><small>${fmt(s.pendiente)} por cobrar</small></div>
      <div class="kpi"><span>% de cobranza</span><strong>${s.pct}%</strong><small>unidades al corriente</small></div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <div class="segmento">${[['todos','Todas'],['pagados','✓ Pagadas'],['pendientes','✗ Pendientes']]
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
  const q = el.querySelector('#c-q');
  q.addEventListener('input', () => { st.q = q.value.toLowerCase(); pintar(); el.querySelector('#c-q').focus(); el.querySelector('#c-q').setSelectionRange(99, 99); });
  const fila = (id) => todas.find((r) => r.cuota.id === id);
  el.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => registrarPago(fila(b.dataset.pagar), concepto, m)));
  el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verPagos(fila(b.dataset.ver), concepto, m)));
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarUnidad(fila(b.dataset.editar), concepto)));
  el.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => pedirRecibo(fila(b.dataset.recibo).u, m, concepto)));
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
      ${pagos.length ? `<button class="btn btn-sm btn-ghost" data-ver="${r.cuota.id}">${pagos.length > 1 ? pagos.length + ' pagos' : 'Ver'}</button>` : ''}
      ${pagos.length ? `<button class="btn btn-sm btn-ghost" data-recibo="${r.cuota.id}" title="Recibo de mantenimiento y luz de este mes">Recibo</button>` : ''}
      ${puedeCapturar ? `<button class="icon-btn" data-editar="${r.cuota.id}" title="Editar unidad" aria-label="Editar unidad">✎</button>` : ''}
    </td></tr>`;
}

const formaLegible = (f) => ({ Transfer: 'Transferencia' }[f] || f || '');

function pintarDeudores(el) {
  const m = st.mes;
  const bloques = ['mantenimiento', 'luz'].map((k) => {
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
      ${deben.length ? `<div class="deudores">${deben.map(({ r, atrasados, total }) => `
        <div class="deudor">
          <div class="deudor-top"><strong>${esc(etiquetaUnidad(r.u))}</strong><span class="mut">${fmt(r.cuota.monto)}/mes</span></div>
          <div class="mut corto">${esc(r.u.ocupante || 'Sin nombre')}</div>
          <div class="chips">${atrasados.map((i) => `<span class="chip">${CORTO[i]}</span>`).join('')}</div>
          <div class="deudor-total">Debe aprox. <strong>${fmt(total)}</strong></div>
        </div>`).join('')}</div>`
        : `<div class="vacio">✅ Todas las unidades pagaron ${MESES[m].toLowerCase()}</div>`}
    </section>`;
  });
  el.innerHTML = `<p class="nota">Unidades sin pago en ${MESES[m].toLowerCase()} ${st.anio}, con los meses de este año que no tienen ningún pago. El adeudo se estima con la cuota registrada.</p>${bloques.join('')}`;
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
      <label>Ocupante / propietario<input name="ocupante" maxlength="120" value="${esc(r?.u.ocupante || '')}"></label>
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
      const datos = { identificador, tipo: f.tipo.value, ocupante: f.ocupante.value.trim() || null };
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

function pedirRecibo(u, m, concepto) {
  const pagados = ['mantenimiento', 'luz'].filter((k) => pagosDelMes(u.id, m, k).length);
  if (!pagados.length) return toast('Esta unidad no tiene pagos en el mes', true);
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
    info: [['Recibí de', nombre], [tipo, `${u.identificador} · Torre Elysium`], ['Concepto', textoConcepto], ['Periodo', per],
      ['Recibido por', 'Administración — Grupo Inmobiliario Treme'], ['Método de pago', formas]],
    lineas, total: lineas.reduce((s, l) => s + l.subtotal, 0), moneda: 'MXN',
    liquidado: lineas.every((l) => l.completo), notas,
    aviso: `Este recibo ampara el pago de ${textoConcepto} correspondiente al periodo indicado, para ${art} ${tipo} ${u.identificador} de Torre Elysium, recibido a nombre de ${nombre}.`,
  });
  pintar();
}
