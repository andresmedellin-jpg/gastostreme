// Rentas Treme: contratos, cobro mensual por día pactado, adeudos, historial y recibos.
// Reemplaza la página "Rentas — Treme".
import { MESES, FORMAS_COBRO } from '../config.js';
import { db, todo, estado, tieneRol, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal } from '../lib.js';

const st = {
  tab: 'rentas',                                   // rentas | adeudos | historial | contratos
  anio: new Date().getFullYear(),
  mes: new Date().getMonth(),
  filtro: 'todos', centro: '', q: '',
  hMes: '', hCentro: '',
};
let contratos = [], pagos = [], adeudos = [], raiz;

const ETQ = { atrasado: 'Atrasado', porv: 'Por vencer', pendiente: 'Pendiente', pagado: 'Pagado', sinm: 'Sin monto', inactivo: 'Inactivo' };
const BADGE = { atrasado: 'rojo', porv: 'ambar', pendiente: 'gris', pagado: 'verde', sinm: 'gris', inactivo: 'gris' };
const ORDEN = { atrasado: 0, porv: 1, pendiente: 2, pagado: 3, sinm: 4, inactivo: 5 };

const money = (n, cur = 'MXN') => new Intl.NumberFormat('es-MX', { style: 'currency', currency: cur === 'USD' ? 'USD' : 'MXN',
  currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(Number(n || 0)) + (cur === 'USD' ? ' USD' : '');
const periodo = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const nombreCentro = (id) => estado.centros.find((c) => c.id === id)?.nombre || '—';
const puedeCobrar = () => tieneRol(['administracion', 'cobranza']);

export async function render(view) {
  raiz = view;
  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        ${[['rentas','Rentas del mes'],['adeudos','Adeudos'],['historial','Historial y recibos'],['contratos','Contratos']]
          .map(([id, t]) => `<button role="tab" data-tab="${id}">${t}</button>`).join('')}
      </div>
    </div>
    <div id="r-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; pintar(); }));
  await cargar();
}

async function cargar() {
  const [c, p, a] = await Promise.all([
    db().from('contratos').select('id, centro_id, unidad_id, arrendatario, monto, moneda, dia_pago, fecha_fin, telefono, email, notas, activo')
      .order('arrendatario'),
    todo(() => db().from('pagos').select('id, contrato_id, periodo, monto, moneda, forma_pago, fecha, folio, notas, capturado_por, creado_en')
      .eq('concepto', 'renta').order('fecha', { ascending: false })),
    db().from('cuentas_por_cobrar').select('id, contrato_id, meses, monto_original, notas, creado_en').eq('tipo', 'adeudo_inicial'),
  ]);
  const err = c.error || p.error || a.error;
  if (err) { toast('No se pudieron cargar las rentas: ' + err.message, true); return; }
  contratos = c.data; pagos = p.data; adeudos = a.data;
  pintar();
}

// ---------- estado de cada renta (misma regla que la página vieja) ----------
function estadoDe(r, y, m) {
  if (!r.activo) return 'inactivo';
  if (!Number(r.monto)) return 'sinm';
  if (pagos.some((p) => p.contrato_id === r.id && p.periodo === periodo(y, m))) return 'pagado';
  const hoy = new Date(), dp = r.dia_pago || 1;
  if (hoy.getFullYear() === y && hoy.getMonth() === m) {
    const d = hoy.getDate();
    if (d > dp) return 'atrasado';
    if (d >= dp - 3) return 'porv';
    return 'pendiente';
  }
  return new Date(y, m, dp) < hoy ? 'atrasado' : 'pendiente';
}

function vigencia(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha + 'T12:00:00'), dias = (d - new Date()) / 864e5;
  const txt = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  if (dias < 0) return { txt: `Contrato vencido (${txt})`, cls: 'bajo' };
  if (dias < 90) return { txt: `Vence pronto: ${txt}`, cls: 'medio' };
  return { txt: `Vigente hasta ${txt}`, cls: 'ok' };
}

// ---------- pintar ----------
function pintar() {
  raiz.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === st.tab));
  const acciones = document.getElementById('page-actions');
  acciones.innerHTML = !puedeCobrar() ? '' : st.tab === 'contratos'
    ? `<button class="btn btn-primary" id="r-nuevo">＋ Contrato</button>`
    : `<button class="btn btn-primary" id="r-cobrar">＋ Registrar pago</button>`;
  acciones.querySelector('#r-nuevo')?.addEventListener('click', () => editarContrato(null));
  acciones.querySelector('#r-cobrar')?.addEventListener('click', () => cobrar(null));
  const el = raiz.querySelector('#r-cuerpo');
  ({ rentas: pintarRentas, adeudos: pintarAdeudos, historial: pintarHistorial, contratos: pintarContratos })[st.tab](el);
}

function navMes() {
  return `<div class="nav-mes">
    <button class="icon-btn" data-nav="-1" aria-label="Mes anterior">‹</button>
    <strong>${MESES[st.mes]} ${st.anio}</strong>
    <button class="icon-btn" data-nav="1" aria-label="Mes siguiente">›</button>
    ${st.anio !== new Date().getFullYear() || st.mes !== new Date().getMonth() ? '<button class="btn btn-sm btn-ghost" data-nav="0">Hoy</button>' : ''}
  </div>`;
}
function enlazarNav(el) {
  el.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const d = +b.dataset.nav;
    if (d === 0) { st.anio = new Date().getFullYear(); st.mes = new Date().getMonth(); }
    else { const f = new Date(st.anio, st.mes + d, 1); st.anio = f.getFullYear(); st.mes = f.getMonth(); }
    pintar();
  }));
}

function pintarRentas(el) {
  const y = st.anio, m = st.mes, per = periodo(y, m);
  const activas = contratos.filter((r) => r.activo && Number(r.monto) > 0);
  let esperado = 0, cobrado = 0, cobradoUsd = 0, atrasados = 0, pagadas = 0;
  activas.forEach((r) => {
    if (r.moneda !== 'USD') esperado += Number(r.monto);
    const ps = pagos.filter((p) => p.contrato_id === r.id && p.periodo === per);
    if (ps.length) {
      pagadas++;
      ps.forEach((p) => (r.moneda === 'USD' ? (cobradoUsd += Number(p.monto)) : (cobrado += Number(p.monto))));
    } else if (estadoDe(r, y, m) === 'atrasado') atrasados++;
  });

  // Esta semana (solo en el mes actual)
  const hoy = new Date();
  let semana = '';
  if (hoy.getFullYear() === y && hoy.getMonth() === m) {
    const ini = hoy.getDate(), fin = Math.min(ini + 6, new Date(y, m + 1, 0).getDate());
    const cuenta = {};
    activas.filter((r) => r.dia_pago >= ini && r.dia_pago <= fin).forEach((r) => {
      const e = estadoDe(r, y, m); cuenta[e] = (cuenta[e] || 0) + 1;
    });
    semana = `<div class="semana"><div><strong>Esta semana</strong> <span class="mut">· días ${ini}–${fin}</span></div>
      <div class="chips">${Object.keys(cuenta).length ? Object.entries(cuenta).map(([e, n]) =>
        `<button class="badge ${BADGE[e]}" data-filtro="${e}">${n} ${ETQ[e].toLowerCase()}</button>`).join('')
        : '<span class="mut">Sin cobros esta semana</span>'}</div></div>`;
  }

  const centros = [...new Set(contratos.map((r) => r.centro_id))].sort((a, b) => nombreCentro(a).localeCompare(nombreCentro(b)));
  const lista = contratos.filter((r) => {
    if (!r.activo && st.filtro !== 'todos') return false;
    if (st.centro && r.centro_id !== st.centro) return false;
    if (st.q && !`${r.arrendatario} ${nombreCentro(r.centro_id)}`.toLowerCase().includes(st.q)) return false;
    if (st.filtro !== 'todos' && estadoDe(r, y, m) !== st.filtro) return false;
    return st.filtro !== 'todos' || r.activo;
  }).sort((a, b) => (ORDEN[estadoDe(a, y, m)] - ORDEN[estadoDe(b, y, m)]) || (a.dia_pago - b.dia_pago));
  const grupos = {};
  lista.forEach((r) => (grupos[r.centro_id] ||= []).push(r));

  el.innerHTML = `
    <div class="periodo">${navMes()}</div>
    <div class="kpis">
      <div class="kpi"><span>Esperado (MXN)</span><strong>${money(esperado)}</strong><small>${activas.length} rentas activas</small></div>
      <div class="kpi"><span>Cobrado</span><strong class="pos">${money(cobrado)}</strong><small>${cobradoUsd ? '+ ' + money(cobradoUsd, 'USD') : '&nbsp;'}</small></div>
      <div class="kpi"><span>Pendiente (MXN)</span><strong class="neg">${money(Math.max(0, esperado - cobrado))}</strong><small>&nbsp;</small></div>
      <div class="kpi"><span>${atrasados ? 'Atrasadas' : 'Al corriente'}</span><strong class="${atrasados ? 'neg' : 'pos'}">${atrasados || `${pagadas}/${activas.length}`}</strong><small>${atrasados ? 'rentas sin pago' : 'rentas pagadas'}</small></div>
    </div>
    ${semana}
    <section class="panel">
      <div class="panel-head">
        <div class="segmento">${[['todos','Todas'],['atrasado','Atrasadas'],['porv','Por vencer'],['pendiente','Pendientes'],['pagado','Pagadas']]
          .map(([id, t]) => `<button data-filtro="${id}" class="${st.filtro === id ? 'activo' : ''}">${t}</button>`).join('')}</div>
        <div class="filtros filtros-sm">
          <select id="r-centro" aria-label="Desarrollo"><option value="">Todos los desarrollos</option>
            ${centros.map((c) => `<option value="${c}" ${st.centro === c ? 'selected' : ''}>${esc(nombreCentro(c))}</option>`).join('')}</select>
          <input type="search" id="r-q" placeholder="Buscar arrendatario" value="${esc(st.q)}" aria-label="Buscar">
        </div>
      </div>
      ${lista.length ? Object.entries(grupos).map(([cid, rs]) => `
        <h4 class="grupo">${esc(nombreCentro(cid))}</h4>
        <div class="rentas">${rs.map((r) => tarjeta(r, y, m)).join('')}</div>`).join('')
        : '<div class="vacio">No hay rentas que coincidan</div>'}
    </section>`;

  enlazarNav(el);
  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { st.filtro = b.dataset.filtro; pintar(); }));
  el.querySelector('#r-centro').addEventListener('change', (e) => { st.centro = e.target.value; pintar(); });
  const q = el.querySelector('#r-q');
  q.addEventListener('input', () => { st.q = q.value.toLowerCase(); pintar(); const n = raiz.querySelector('#r-q'); n.focus(); n.setSelectionRange(99, 99); });
  el.querySelectorAll('[data-detalle]').forEach((b) => b.addEventListener('click', () => detalle(contratos.find((r) => r.id === b.dataset.detalle))));
  el.querySelectorAll('[data-cobrar]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); cobrar(contratos.find((r) => r.id === b.dataset.cobrar)); }));
}

function tarjeta(r, y, m) {
  const e = estadoDe(r, y, m);
  const ps = pagos.filter((p) => p.contrato_id === r.id && p.periodo === periodo(y, m));
  const total = ps.reduce((s, p) => s + Number(p.monto), 0);
  const v = vigencia(r.fecha_fin);
  return `<div class="renta ${e}" data-detalle="${r.id}" role="button" tabindex="0">
    <div class="dia"><strong>${r.dia_pago || '—'}</strong><small>día</small></div>
    <div class="renta-info"><strong>${esc(r.arrendatario)}</strong>${v ? `<small class="${v.cls}">${v.txt}</small>` : ''}</div>
    <div class="renta-der">
      <div class="num"><strong>${Number(r.monto) ? money(r.monto, r.moneda) : '—'}</strong></div>
      <span class="badge ${BADGE[e]}">${ETQ[e]}</span>
      ${e === 'pagado' ? `<span class="pos fuerte">✓ ${money(total, r.moneda)}</span>`
        : e !== 'sinm' && e !== 'inactivo' && puedeCobrar() ? `<button class="btn btn-sm btn-primary" data-cobrar="${r.id}">Cobrar</button>` : ''}
    </div></div>`;
}

// ---------- detalle ----------
function detalle(r) {
  const ps = pagos.filter((p) => p.contrato_id === r.id).sort((a, b) => b.periodo.localeCompare(a.periodo));
  const v = vigencia(r.fecha_fin);
  const modal = abrirModal({
    titulo: r.arrendatario,
    cuerpo: `<p class="nota">${esc(nombreCentro(r.centro_id))} · día ${r.dia_pago || '—'} de cada mes</p>
      <dl class="datos">
        <dt>Renta mensual</dt><dd><strong>${money(r.monto, r.moneda)}</strong></dd>
        ${r.telefono ? `<dt>Teléfono</dt><dd><a href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a></dd>` : ''}
        ${r.email ? `<dt>Correo</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd>` : ''}
        ${v ? `<dt>Contrato</dt><dd class="${v.cls}">${v.txt}</dd>` : ''}
        ${r.notas ? `<dt>Notas</dt><dd>${esc(r.notas)}</dd>` : ''}
      </dl>
      <h4 class="grupo">Pagos</h4>
      ${ps.length ? `<ul class="lista-pagos">${ps.slice(0, 12).map((p) => filaPago(p, r)).join('')}</ul>` : '<div class="vacio">Sin pagos registrados</div>'}`,
    pie: puedeCobrar() ? `<button class="btn btn-ghost" id="d-editar">Editar contrato</button>${r.activo ? '<button class="btn btn-primary" id="d-cobrar">Cobrar</button>' : ''}` : '',
  });
  modal.querySelector('#d-editar')?.addEventListener('click', () => editarContrato(r));
  modal.querySelector('#d-cobrar')?.addEventListener('click', () => cobrar(r));
  enlazarPagos(modal);
}

function filaPago(p, r) {
  return `<li><div><strong>${money(p.monto, r?.moneda || p.moneda)}</strong>
      <span class="mut">${MESES[+p.periodo.slice(5, 7) - 1]} ${p.periodo.slice(0, 4)} · pagado ${fmtFecha(p.fecha)}${p.folio ? ' · ' + esc(p.folio) : ''}</span>
      ${p.notas ? `<small>${esc(p.notas)}</small>` : ''}</div>
    <div class="acciones">
      <button class="btn btn-sm btn-ghost" data-recibo="${p.id}">Recibo</button>
      ${puedeCobrar() ? `<button class="icon-btn peligro" data-borrar="${p.id}" aria-label="Eliminar pago">✕</button>` : ''}
    </div></li>`;
}

function enlazarPagos(cont) {
  cont.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => {
    const p = pagos.find((x) => x.id === b.dataset.recibo);
    recibo(p, contratos.find((r) => r.id === p.contrato_id));
  }));
  cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    const p = pagos.find((x) => x.id === b.dataset.borrar);
    const r = contratos.find((x) => x.id === p.contrato_id);
    if (!confirm(`¿Eliminar el pago de ${money(p.monto, r?.moneda)} de ${r?.arrendatario}?\nQueda registrado en la bitácora.`)) return;
    const { error } = await db().from('pagos').delete().eq('id', p.id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    cerrarModal(); toast('Pago eliminado'); cargar();
  }));
}

// ---------- cobrar ----------
function cobrar(r) {
  const activos = contratos.filter((x) => x.activo).sort((a, b) => a.arrendatario.localeCompare(b.arrendatario));
  const mesDefault = `${st.anio}-${String(st.mes + 1).padStart(2, '0')}`;
  const modal = abrirModal({
    titulo: 'Registrar pago de renta',
    cuerpo: `<form class="form" id="cf" novalidate>
      <label>Renta<select name="contrato" required><option value="">Elige…</option>
        ${activos.map((x) => `<option value="${x.id}" ${r?.id === x.id ? 'selected' : ''}>${esc(x.arrendatario)} · ${esc(nombreCentro(x.centro_id))}</option>`).join('')}</select></label>
      <p class="nota" id="cf-info"></p>
      <div class="form-2">
        <label>Periodo que paga<input type="month" name="periodo" value="${mesDefault}" required></label>
        <label>Fecha de pago<input type="date" name="fecha" value="${hoyISO()}" required></label>
      </div>
      <div class="form-2">
        <label>Monto recibido<input type="number" name="monto" min="0.01" step="0.01" inputmode="decimal" required></label>
        <label>Forma de pago<select name="forma">${FORMAS_COBRO.map((f) => `<option>${f}</option>`).join('')}</select></label>
      </div>
      <label>Notas <small>(opcional, salen en el recibo)</small><input name="notas" maxlength="200"></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="cf-no">Cancelar</button><button class="btn btn-primary" id="cf-si">Guardar y ver recibo</button>`,
  });
  const f = modal.querySelector('#cf');
  const alCambiar = () => {
    const c = contratos.find((x) => x.id === f.contrato.value);
    modal.querySelector('#cf-info').textContent = c ? `Renta de ${money(c.monto, c.moneda)} · día ${c.dia_pago || '—'}${c.telefono ? ' · ' + c.telefono : ''}` : '';
    if (c && !f.monto.dataset.tocado) f.monto.value = Number(c.monto) || '';
  };
  f.contrato.addEventListener('change', alCambiar);
  f.monto.addEventListener('input', () => (f.monto.dataset.tocado = '1'));
  alCambiar();
  modal.querySelector('#cf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#cf-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const c = contratos.find((x) => x.id === f.contrato.value);
    const monto = Number(f.monto.value);
    if (!c) return toast('Elige la renta', true);
    if (!f.periodo.value) return toast('Elige el periodo', true);
    if (!f.fecha.value) return toast('Pon la fecha de pago', true);
    if (!(monto > 0)) return toast('Escribe el monto', true);
    const per = f.periodo.value + '-01';
    if (pagos.some((p) => p.contrato_id === c.id && p.periodo === per) &&
        !confirm('Esta renta ya tiene un pago en ese periodo. ¿Registrar otro?')) return;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const { data: folio, error: e1 } = await db().rpc('siguiente_folio_renta', { p_org: estado.miembro.org_id });
      if (e1) throw e1;
      const { data, error } = await db().from('pagos').insert({
        org_id: estado.miembro.org_id, empresa_id: estado.centros.find((x) => x.id === c.centro_id)?.empresa_id
          || estado.empresas.find((e) => e.nombre_corto === 'Treme')?.id,
        centro_id: c.centro_id, contrato_id: c.id, concepto: 'renta', periodo: per,
        monto: Math.round(monto * 100) / 100, moneda: c.moneda, forma_pago: f.forma.value, fecha: f.fecha.value,
        folio, notas: f.notas.value.trim() || null, capturado_por: estado.miembro.nombre,
      }).select('id, contrato_id, periodo, monto, moneda, forma_pago, fecha, folio, notas').single();
      if (error) throw error;
      cerrarModal(); toast(`Pago registrado · ${folio}`);
      await cargar();
      recibo(data, c);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Guardar y ver recibo';
      toast('No se pudo guardar: ' + e.message, true);
    }
  });
}

// ---------- adeudos ----------
function pintarAdeudos(el) {
  const activos = contratos.filter((r) => r.activo && Number(r.monto) > 0);
  const con = adeudos.map((a) => ({ a, r: contratos.find((r) => r.id === a.contrato_id) })).filter((x) => x.r)
    .sort((x, y) => Number(y.a.monto_original) - Number(x.a.monto_original));
  const sin = activos.filter((r) => !adeudos.some((a) => a.contrato_id === r.id));
  const total = con.reduce((s, x) => s + Number(x.a.monto_original), 0);
  const hoy = new Date();
  const atrasoAuto = (r) => [0, 1, 2].filter((i) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return estadoDe(r, d.getFullYear(), d.getMonth()) === 'atrasado'; }).length;
  el.innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h3>Adeudos registrados</h3><p class="nota">Lo que te deben, registrado a mano; el monto es editable.</p></div>
        ${con.length ? `<div class="num"><small class="mut">Total adeudado</small><br><strong class="neg">${money(total)}</strong></div>` : ''}</div>
      ${con.length ? `<div class="deudores">${con.map(({ a, r }) => `
        <button class="deudor clic" data-adeudo="${r.id}">
          <div class="deudor-top"><strong>${esc(r.arrendatario)}</strong><strong class="neg">${money(a.monto_original, r.moneda)}</strong></div>
          <div class="mut">${esc(nombreCentro(r.centro_id))} · ${a.meses ?? '?'} mes${a.meses === 1 ? '' : 'es'}</div>
          ${a.notas ? `<small class="mut">${esc(a.notas)}</small>` : ''}
        </button>`).join('')}</div>` : '<div class="vacio">Sin adeudos registrados. ¡Todo al corriente!</div>'}
    </section>
    ${puedeCobrar() && sin.length ? `<section class="panel"><h3>Agregar adeudo</h3>
      <div class="tabla-wrap"><table class="tabla"><tbody>${sin.map((r) => {
        const auto = atrasoAuto(r);
        return `<tr><td data-l="Renta"><strong>${esc(r.arrendatario)}</strong> <span class="mut">· ${esc(nombreCentro(r.centro_id))}</span></td>
          <td class="mut" data-l="Atraso">${auto ? `<span class="badge rojo">${auto} mes${auto === 1 ? '' : 'es'} sin pago</span>` : ''}</td>
          <td class="acciones"><button class="btn btn-sm btn-ghost" data-adeudo="${r.id}">＋ Registrar adeudo</button></td></tr>`;
      }).join('')}</tbody></table></div></section>` : ''}`;
  el.querySelectorAll('[data-adeudo]').forEach((b) => b.addEventListener('click', () => {
    if (puedeCobrar()) editarAdeudo(contratos.find((r) => r.id === b.dataset.adeudo), atrasoAuto);
  }));
}

function editarAdeudo(r, atrasoAuto) {
  const a = adeudos.find((x) => x.contrato_id === r.id);
  const sugeridos = atrasoAuto(r);
  const modal = abrirModal({
    titulo: `Adeudo · ${r.arrendatario}`,
    cuerpo: `<form class="form" id="af" novalidate>
      <div class="form-2">
        <label>Meses de atraso<input type="number" name="meses" min="0" step="1" value="${a?.meses ?? sugeridos}"></label>
        <label>Monto adeudado<input type="number" name="monto" min="0" step="0.01" value="${a ? Number(a.monto_original) : sugeridos * Number(r.monto)}"></label>
      </div>
      <label>Notas<input name="notas" maxlength="200" value="${esc(a?.notas || '')}"></label>
      <p class="nota">Para darlo por saldado, deja meses y monto en 0.</p>
    </form>`,
    pie: `<button class="btn btn-ghost" id="af-no">Cancelar</button><button class="btn btn-primary" id="af-si">Guardar</button>`,
  });
  const f = modal.querySelector('#af');
  modal.querySelector('#af-no').addEventListener('click', cerrarModal);
  modal.querySelector('#af-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const meses = parseInt(f.meses.value) || 0, monto = Number(f.monto.value) || 0, notas = f.notas.value.trim() || null;
    let res;
    if (!meses && !monto) res = a ? await db().from('cuentas_por_cobrar').delete().eq('id', a.id) : { error: null };
    else if (a) res = await db().from('cuentas_por_cobrar').update({ meses, monto_original: monto, notas }).eq('id', a.id);
    else res = await db().from('cuentas_por_cobrar').insert({
      org_id: estado.miembro.org_id, empresa_id: estado.centros.find((x) => x.id === r.centro_id)?.empresa_id
        || estado.empresas.find((e) => e.nombre_corto === 'Treme')?.id,
      centro_id: r.centro_id, contrato_id: r.id, tipo: 'adeudo_inicial', cliente: r.arrendatario,
      meses, monto_original: monto, moneda: r.moneda, notas });
    if (res.error) { btn.disabled = false; return toast('No se pudo guardar: ' + res.error.message, true); }
    cerrarModal(); toast(!meses && !monto ? 'Adeudo saldado ✓' : 'Adeudo guardado ✓'); cargar();
  });
}

// ---------- historial ----------
function pintarHistorial(el) {
  const periodos = [...new Set(pagos.map((p) => p.periodo))].sort().reverse();
  const centros = [...new Set(contratos.map((r) => r.centro_id))];
  let lista = pagos.filter((p) => (!st.hMes || p.periodo === st.hMes) &&
    (!st.hCentro || contratos.find((r) => r.id === p.contrato_id)?.centro_id === st.hCentro));
  const tot = (cur) => lista.filter((p) => (p.moneda === 'USD') === (cur === 'USD')).reduce((s, p) => s + Number(p.monto), 0);
  el.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div class="filtros filtros-sm">
          <select id="h-mes" aria-label="Periodo"><option value="">Todos los periodos</option>
            ${periodos.map((p) => `<option value="${p}" ${st.hMes === p ? 'selected' : ''}>${MESES[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}</option>`).join('')}</select>
          <select id="h-centro" aria-label="Desarrollo"><option value="">Todos los desarrollos</option>
            ${centros.map((c) => `<option value="${c}" ${st.hCentro === c ? 'selected' : ''}>${esc(nombreCentro(c))}</option>`).join('')}</select>
        </div>
        <span class="mut">${lista.length} pagos · <strong>${money(tot('MXN'))}</strong>${tot('USD') ? ' + <strong>' + money(tot('USD'), 'USD') + '</strong>' : ''}</span>
      </div>
      ${lista.length ? `<ul class="lista-pagos">${lista.slice(0, 300).map((p) => {
        const r = contratos.find((x) => x.id === p.contrato_id);
        return filaPago(p, r).replace('<div><strong>', `<div><span class="fuerte">${esc(r?.arrendatario || '—')}</span> <span class="mut">· ${esc(nombreCentro(r?.centro_id))}</span><strong>`);
      }).join('')}</ul>` : '<div class="vacio">Sin pagos</div>'}
    </section>`;
  el.querySelector('#h-mes').addEventListener('change', (e) => { st.hMes = e.target.value; pintar(); });
  el.querySelector('#h-centro').addEventListener('change', (e) => { st.hCentro = e.target.value; pintar(); });
  enlazarPagos(el);
}

// ---------- contratos ----------
function pintarContratos(el) {
  const grupos = {};
  [...contratos].sort((a, b) => (b.activo - a.activo) || a.arrendatario.localeCompare(b.arrendatario))
    .forEach((r) => (grupos[r.centro_id] ||= []).push(r));
  el.innerHTML = `<section class="panel">
    <div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Arrendatario</th><th>Desarrollo</th><th class="num">Renta</th><th>Día</th><th>Contrato</th><th></th></tr></thead>
      <tbody>${Object.entries(grupos).sort((a, b) => nombreCentro(a[0]).localeCompare(nombreCentro(b[0]))).flatMap(([, rs]) => rs).map((r) => {
        const v = vigencia(r.fecha_fin);
        return `<tr class="${r.activo ? '' : 'inactivo'}">
          <td data-l="Arrendatario"><strong>${esc(r.arrendatario)}</strong>${r.activo ? '' : ' <span class="tag tag-suave">inactivo</span>'}</td>
          <td class="mut" data-l="Desarrollo">${esc(nombreCentro(r.centro_id))}</td>
          <td class="num fuerte" data-l="Renta">${Number(r.monto) ? money(r.monto, r.moneda) : '—'}</td>
          <td class="mut" data-l="Día">${r.dia_pago || '—'}</td>
          <td data-l="Contrato">${v ? `<span class="${v.cls}">${v.txt}</span>` : '<span class="mut">Sin fecha</span>'}</td>
          <td class="acciones">${puedeCobrar() ? `<button class="btn btn-sm btn-ghost" data-editar="${r.id}">Editar</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarContrato(contratos.find((r) => r.id === b.dataset.editar))));
}

function editarContrato(r) {
  const treme = estado.empresas.find((e) => e.nombre_corto === 'Treme')?.id;
  const centros = estado.centros.filter((c) => c.empresa_id === treme && !['socio', 'personal'].includes(c.tipo));
  const modal = abrirModal({
    titulo: r ? `Editar · ${r.arrendatario}` : 'Nuevo contrato',
    cuerpo: `<form class="form" id="kf" novalidate>
      <label>Arrendatario / negocio<input name="arrendatario" required maxlength="120" value="${esc(r?.arrendatario || '')}"></label>
      <label>Desarrollo<select name="centro" required><option value="">Elige…</option>
        ${centros.map((c) => `<option value="${c.id}" ${r?.centro_id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      <div class="form-2">
        <label>Renta mensual<input type="number" name="monto" min="0" step="0.01" value="${r ? Number(r.monto) : ''}"></label>
        <label>Moneda<select name="moneda"><option>MXN</option><option ${r?.moneda === 'USD' ? 'selected' : ''}>USD</option></select></label>
      </div>
      <div class="form-2">
        <label>Día de pago<input type="number" name="dia" min="1" max="31" value="${r?.dia_pago || ''}" required></label>
        <label>Vence el contrato<input type="date" name="fin" value="${r?.fecha_fin || ''}"></label>
      </div>
      <div class="form-2">
        <label>Teléfono<input name="telefono" maxlength="30" value="${esc(r?.telefono || '')}"></label>
        <label>Correo<input type="email" name="email" maxlength="120" value="${esc(r?.email || '')}"></label>
      </div>
      <label>Notas<textarea name="notas" rows="2">${esc(r?.notas || '')}</textarea></label>
      <label class="opcion opcion-linea"><input type="checkbox" name="activo" ${!r || r.activo ? 'checked' : ''}> Activo (se cobra cada mes)</label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="kf-no">Cancelar</button><button class="btn btn-primary" id="kf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#kf');
  modal.querySelector('#kf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#kf-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const dia = parseInt(f.dia.value);
    if (!f.arrendatario.value.trim()) return toast('Escribe el arrendatario', true);
    if (!f.centro.value) return toast('Elige el desarrollo', true);
    if (!(dia >= 1 && dia <= 31)) return toast('El día de pago va de 1 a 31', true);
    btn.disabled = true;
    const datos = { arrendatario: f.arrendatario.value.trim(), centro_id: f.centro.value, monto: Number(f.monto.value) || 0,
      moneda: f.moneda.value, dia_pago: dia, fecha_fin: f.fin.value || null, telefono: f.telefono.value.trim() || null,
      email: f.email.value.trim() || null, notas: f.notas.value.trim() || null, activo: f.activo.checked };
    const { error } = r ? await db().from('contratos').update(datos).eq('id', r.id)
      : await db().from('contratos').insert({ ...datos, org_id: estado.miembro.org_id });
    if (error) { btn.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
    cerrarModal(); toast('Contrato guardado ✓'); cargar();
  });
}

// ---------- recibo ----------
function numLetra(n) {
  const u = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE',
    'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const d = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const h = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const veinti = ['', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  if (n === 0) return 'CERO';
  if (n < 20) return u[n];
  if (n < 30) return n === 20 ? 'VEINTE' : veinti[n - 20];
  if (n < 100) { const t = Math.floor(n / 10), r = n % 10; return r ? `${d[t]} Y ${u[r]}` : d[t]; }
  if (n < 1000) { const t = Math.floor(n / 100), r = n % 100; return (t === 1 ? (r ? 'CIENTO' : 'CIEN') : h[t]) + (r ? ' ' + numLetra(r) : ''); }
  if (n < 1e6) { const t = Math.floor(n / 1000), r = n % 1000; return (t === 1 ? 'MIL' : numLetra(t) + ' MIL') + (r ? ' ' + numLetra(r) : ''); }
  if (n < 1e9) { const t = Math.floor(n / 1e6), r = n % 1e6; return (t === 1 ? 'UN MILLÓN' : numLetra(t) + ' MILLONES') + (r ? ' ' + numLetra(r) : ''); }
  return String(n);
}
const montoLetra = (m, cur) => {
  const e = Math.floor(m), c = Math.round((m - e) * 100);
  return `${numLetra(e)} ${cur === 'USD' ? 'DÓLARES' : 'PESOS'} ${String(c).padStart(2, '0')}/100 ${cur === 'USD' ? 'USD' : 'M.N.'}`;
};
function tipoEspacio(n) {
  const s = (n || '').toLowerCase();
  if (/depto|departamento|suite/.test(s)) return 'Departamento';
  if (/oficina|despacho/.test(s)) return 'Oficina';
  if (/bodega/.test(s)) return 'Bodega';
  return 'Local comercial';
}

// El logo va incrustado en el recibo para que siempre salga, también al guardar como PDF
let logoDataUrl = null;
async function logo() {
  if (logoDataUrl) return logoDataUrl;
  try {
    const blob = await (await fetch(new URL('img/logo-treme.jpg', location.href))).blob();
    logoDataUrl = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
  } catch { logoDataUrl = ''; }
  return logoDataUrl;
}

async function recibo(p, r) {
  if (!p || !r) return;
  const w = window.open('', '_blank');               // se abre antes de esperar, para que el navegador no la bloquee
  if (!w) return toast('Permite ventanas emergentes para ver el recibo', true);
  w.document.write('<p style="font-family:sans-serif;padding:24px">Generando recibo…</p>');
  const per = `${MESES[+p.periodo.slice(5, 7) - 1]} ${p.periodo.slice(0, 4)}`;
  const fp = new Date(p.fecha + 'T12:00:00');
  const fecha = `${fp.getDate()} de ${MESES[fp.getMonth()].toLowerCase()} de ${fp.getFullYear()}`;
  const imgLogo = await logo();
  const campo = (k, v, grande) => `<div class="c"><div class="k">${k}</div><div class="v${grande ? ' g' : ''}">${v}</div></div>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(p.folio || 'Recibo')} · ${esc(r.arrendatario)}</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#eef0f3;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a}
  .barra{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:12px;background:#0f172a}
  .barra button{font:600 14px Arial,Helvetica,sans-serif;padding:9px 16px;border-radius:8px;border:0;cursor:pointer}
  .doc{width:680px;max-width:100%;margin:24px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .top{display:flex;align-items:center;justify-content:space-between;padding:24px 32px 16px;border-bottom:3px solid #1A1D2E}
  .top img{height:52px} .top div{text-align:right;font-size:11px;color:#555;line-height:1.8}
  .franja{background:#1A1D2E;color:#fff;padding:9px 32px;display:flex;justify-content:space-between;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase}
  .cuerpo{padding:24px 32px} .cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .caja{border:1px solid #e0e0e0;border-radius:6px} .caja h5{margin:0;background:#f5f5f5;padding:7px 14px;font-size:9.5px;color:#555;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid #e0e0e0}
  .caja .in{padding:12px 14px;display:grid;gap:8px} .k{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px} .v{font-size:12px;font-weight:600;margin-top:2px} .v.g{font-size:13px;font-weight:700}
  .ok{display:inline-block;background:#e8f8ef;color:#1a7a3c;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;border:1px solid #b7dfc8}
  .total{background:#1A1D2E;border-radius:6px;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;color:#fff}
  .total .l{font-size:10px;font-style:italic;color:rgba(255,255,255,.6);max-width:60%} .total .m{font-size:26px;font-weight:800}
  .nota{background:#fefcf0;border:1px solid #e8dfa0;border-radius:6px;padding:10px 14px;margin-top:16px;font-size:11px;color:#555}
  .pie{border-top:1px solid #ddd;padding:12px 32px;display:flex;justify-content:space-between;background:#f9f9f9;font-size:9px;color:#999}
  @media print{body{background:#fff}.barra{display:none}.doc{margin:0;box-shadow:none;width:100%}@page{size:A4;margin:12mm}}
  @media (max-width:600px){.cols{grid-template-columns:1fr}.top,.cuerpo,.franja,.pie{padding-left:16px;padding-right:16px}}
</style></head><body>
<div class="barra"><button onclick="print()" style="background:#5b9bd5;color:#fff">Descargar PDF / Imprimir</button><button onclick="close()">Cerrar</button></div>
<div class="doc">
  <div class="top">${imgLogo ? `<img src="${imgLogo}" alt="Treme">` : '<strong style="font-size:22px">Treme</strong>'}<div><strong>Grupo Inmobiliario Treme</strong><br>admin@medco.mx<br>Tel. 813 403 1022</div></div>
  <div class="franja"><span>Recibo de pago de arrendamiento</span><span>Folio: ${esc(p.folio || '—')}</span></div>
  <div class="cuerpo">
    <div class="cols">
      <div class="caja"><h5>Datos del arrendatario</h5><div class="in">
        ${campo('Nombre / razón social', esc(r.arrendatario), true)}${campo('Tipo de espacio', tipoEspacio(r.arrendatario))}
        ${campo('Desarrollo', esc(nombreCentro(r.centro_id)))}${r.telefono ? campo('Teléfono', esc(r.telefono)) : ''}</div></div>
      <div class="caja"><h5>Datos del pago</h5><div class="in">
        ${campo('Periodo cubierto', per, true)}${campo('Fecha de pago', fecha)}
        ${campo('Día pactado de pago', `Día ${r.dia_pago || '—'} de cada mes`)}${campo('Forma de pago', esc(p.forma_pago === 'Transfer' ? 'Transferencia' : p.forma_pago || '—'))}
        <div class="c"><div class="k">Estatus</div><div style="margin-top:4px"><span class="ok">✓ PAGADO</span></div></div></div></div>
    </div>
    <div class="total"><div><div class="k" style="color:rgba(255,255,255,.5)">Total recibido</div><div class="l">${montoLetra(Number(p.monto), r.moneda)}</div></div>
      <div class="m">${money(p.monto, r.moneda)}</div></div>
    ${p.notas ? `<div class="nota"><strong>Notas:</strong> ${esc(p.notas)}</div>` : ''}
  </div>
  <div class="pie"><span>Grupo Inmobiliario Treme · admin@medco.mx · 813 403 1022</span><span>${esc(p.folio || '')}</span></div>
</div></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}
