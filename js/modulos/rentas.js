// Rentas Treme: contratos, cobro mensual por día pactado, adeudos, historial y recibos.
// Reemplaza la página "Rentas — Treme".
import { MESES, FORMAS_COBRO, MARCA } from '../config.js';
import { pintarRecibo, abrirVentanaRecibo } from '../recibo.js';
import { db, todo, estado, tieneRol, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal } from '../lib.js';
import { mesesSinPago, nombreMeses } from '../adeudos-renta.js';

const st = {
  tab: 'rentas',                                   // rentas | ocupacion | adeudos | historial | contratos
  anio: new Date().getFullYear(),
  mes: new Date().getMonth(),
  filtro: 'todos', centro: '', q: '',
  hMes: '', hCentro: '',
};
let contratos = [], pagos = [], adeudos = [], unidades = [], espacios = new Map(), raiz;
// Pagos incompletos (abonos): con MARCA.rentaParcial, una renta con pagos que no suman el monto queda "Abonado" y muestra lo que falta.
// Sin la opción (Treme hoy), cualquier pago marca el mes como pagado, como la página vieja.
const PARCIAL = !!MARCA.rentaParcial;
// Pestaña de ocupación (mapa de unidades por torre): solo si la marca la pide
const OCUPACION = !!MARCA.ocupacion;
const EMISOR = MARCA.reciboEmpresa || 'Grupo Inmobiliario Treme';

const ETQ = { atrasado: 'Atrasado', parcial: 'Abonado', porv: 'Por vencer', pendiente: 'Pendiente', pagado: 'Pagado', sinm: 'Sin monto', inactivo: 'Inactivo' };
const BADGE = { atrasado: 'rojo', parcial: 'ambar', porv: 'ambar', pendiente: 'gris', pagado: 'verde', sinm: 'gris', inactivo: 'gris' };
const ORDEN = { atrasado: 0, parcial: 1, porv: 2, pendiente: 3, pagado: 4, sinm: 5, inactivo: 6 };

const money = (n, cur = 'MXN') => new Intl.NumberFormat('es-MX', { style: 'currency', currency: cur === 'USD' ? 'USD' : 'MXN',
  currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(Number(n || 0)) + (cur === 'USD' ? ' USD' : '');
const periodo = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const nombreCentro = (id) => estado.centros.find((c) => c.id === id)?.nombre || '—';
// Unidad del contrato: la del mapa de ocupación, o el nombre de los inmuebles ligados en Patrimonio (p. ej. "Local 21, Local 22")
const unidadDe = (r) => (r?.unidad_id && unidades.find((u) => u.id === r.unidad_id))
  || (r && espacios.has(r.id) ? { identificador: espacios.get(r.id) } : null);
const puedeCobrar = () => tieneRol(['administracion', 'cobranza']);

export async function render(view) {
  raiz = view;
  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        ${[['rentas','Rentas del mes'], ...(OCUPACION ? [['ocupacion','Ocupación']] : []),['adeudos','Adeudos'],['historial','Historial y recibos'],['contratos','Contratos']]
          .map(([id, t]) => `<button role="tab" data-tab="${id}">${t}</button>`).join('')}
      </div>
    </div>
    <div id="r-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; pintar(); }));
  await cargar();
}

async function cargar() {
  const [c, p, a, u, e] = await Promise.all([
    db().from('contratos').select('id, centro_id, unidad_id, arrendatario, monto, moneda, dia_pago, fecha_inicio, fecha_fin, telefono, email, notas, activo')
      .order('arrendatario'),
    todo(() => db().from('pagos').select('id, contrato_id, periodo, monto, moneda, forma_pago, fecha, folio, notas, capturado_por, creado_en')
      .eq('concepto', 'renta').order('fecha', { ascending: false })),
    db().from('cuentas_por_cobrar').select('id, contrato_id, meses, monto_original, notas, creado_en, fecha_origen').eq('tipo', 'adeudo_inicial'),
    OCUPACION ? todo(() => db().from('unidades').select('id, centro_id, identificador, tipo, superficie_m2, activo')) : { data: [] },
    Promise.resolve(db().rpc('espacios_contratos')).catch(() => ({ data: [] })),
  ]);
  const err = c.error || p.error || a.error;
  if (err) { toast('No se pudieron cargar las rentas: ' + err.message, true); return; }
  contratos = c.data; pagos = p.data; adeudos = a.data; unidades = u.data || [];
  espacios = new Map((e?.error ? [] : e?.data || []).map((x) => [x.contrato_id, x.espacio]));
  pintar();
}

// ---------- estado de cada renta (misma regla que la página vieja) ----------
function estadoDe(r, y, m) {
  if (!r.activo) return 'inactivo';
  if (!Number(r.monto)) return 'sinm';
  // Meses antes de que empiece el contrato no se cobran
  if (r.fecha_inicio && periodo(y, m) < String(r.fecha_inicio).slice(0, 7) + '-01') return 'inactivo';
  const ps = pagos.filter((p) => p.contrato_id === r.id && p.periodo === periodo(y, m));
  if (ps.length) {
    if (!PARCIAL || abonado(r, y, m) >= Number(r.monto) - 1) return 'pagado';
    return 'parcial';
  }
  const hoy = new Date(), dp = r.dia_pago || 1;
  if (hoy.getFullYear() === y && hoy.getMonth() === m) {
    const d = hoy.getDate();
    if (d > dp) return 'atrasado';
    if (d >= dp - 3) return 'porv';
    return 'pendiente';
  }
  return new Date(y, m, dp) < hoy ? 'atrasado' : 'pendiente';
}

const abonado = (r, y, m) => pagos.filter((p) => p.contrato_id === r.id && p.periodo === periodo(y, m)).reduce((s, p) => s + Number(p.monto), 0);

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
  ({ rentas: pintarRentas, ocupacion: pintarOcupacion, adeudos: pintarAdeudos, historial: pintarHistorial, contratos: pintarContratos })[st.tab](el);
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

// Rentas del mes: una hoja de cobranza (una fila por renta, con su historial de 6 meses) y a un lado
// el avance por desarrollo y los contratos vencidos o por vencer.
function pintarRentas(el) {
  const y = st.anio, m = st.mes, per = periodo(y, m);
  const activas = contratos.filter((r) => r.activo && Number(r.monto) > 0);
  let esperado = 0, cobrado = 0, esperadoUsd = 0, cobradoUsd = 0;
  const cuenta = {};
  activas.forEach((r) => {
    const ps = pagos.filter((p) => p.contrato_id === r.id && p.periodo === per).reduce((s2, p) => s2 + Number(p.monto), 0);
    if (r.moneda === 'USD') { esperadoUsd += Number(r.monto); cobradoUsd += ps; } else { esperado += Number(r.monto); cobrado += ps; }
    const e = estadoDe(r, y, m); cuenta[e] = (cuenta[e] || 0) + 1;
  });
  const atrasadoMx = activas.filter((r) => r.moneda !== 'USD' && ['atrasado', 'parcial'].includes(estadoDe(r, y, m)))
    .reduce((s2, r) => s2 + Number(r.monto) - abonado(r, y, m), 0);
  const pctC = esperado ? Math.min(100, cobrado / esperado * 100) : 0;

  const centros = [...new Set(activas.map((r) => r.centro_id))].sort((a2, b2) => nombreCentro(a2).localeCompare(nombreCentro(b2), 'es'));
  if (st.centro && !centros.includes(st.centro)) st.centro = '';
  const lista = contratos.filter((r) => {
    if (!r.activo) return false;
    if (st.centro && r.centro_id !== st.centro) return false;
    if (st.q && !`${r.arrendatario} ${nombreCentro(r.centro_id)} ${unidadDe(r)?.identificador || ''}`.toLowerCase().includes(st.q)) return false;
    return st.filtro === 'todos' || estadoDe(r, y, m) === st.filtro;
  }).sort((a2, b2) => (ORDEN[estadoDe(a2, y, m)] - ORDEN[estadoDe(b2, y, m)]) || ((a2.dia_pago || 99) - (b2.dia_pago || 99)));

  // últimos 6 meses de cada renta (el actual al final)
  const meses6 = Array.from({ length: 6 }, (_, i) => { const f = new Date(y, m - 5 + i, 1); return [f.getFullYear(), f.getMonth()]; });
  const historial = (r) => meses6.map(([yy, mm]) => {
    const ini = r.fecha_inicio && r.fecha_inicio > periodo(yy, mm).slice(0, 7) + '-31';
    const e = ini ? 'na' : estadoDe(r, yy, mm);
    return `<i class="rt-h ${e}" title="${MESES[mm]} ${yy}: ${ini ? 'antes del contrato' : ETQ[e] || ''}"></i>`;
  }).join('');
  const porCentro = centros.map((c) => {
    const rs = activas.filter((r) => r.centro_id === c && r.moneda !== 'USD');
    const esp = rs.reduce((s2, r) => s2 + Number(r.monto), 0), cob = rs.reduce((s2, r) => s2 + Math.min(Number(r.monto), abonado(r, y, m)), 0);
    const usd = activas.filter((r) => r.centro_id === c && r.moneda === 'USD');
    return { c, esp, cob, n: rs.length + usd.length, usd };
  }).sort((a2, b2) => b2.esp - a2.esp);
  const contratosAviso = contratos.filter((r) => r.activo && r.fecha_fin && (new Date(r.fecha_fin + 'T12:00:00') - new Date()) / 864e5 < 90)
    .sort((a2, b2) => a2.fecha_fin.localeCompare(b2.fecha_fin));
  const sinFecha = contratos.filter((r) => r.activo && Number(r.monto) && !r.fecha_fin).length;

  el.innerHTML = `
    <div class="rt-top">${navMes()}
      <div class="rt-filtros"><div class="segmento">${[['todos', 'Todas'], ['atrasado', 'Atrasadas'], ...(PARCIAL ? [['parcial', 'Abonadas']] : []), ['porv', 'Por vencer'], ['pendiente', 'Pendientes'], ['pagado', 'Pagadas']]
        .map(([id, t]) => `<button data-filtro="${id}" class="${st.filtro === id ? 'activo' : ''}">${t}${id !== 'todos' && cuenta[id] ? ` <b>${cuenta[id]}</b>` : ''}</button>`).join('')}</div>
        <input type="search" id="r-q" placeholder="Buscar inquilino o unidad" value="${esc(st.q)}" aria-label="Buscar"></div></div>
    <section class="rt-resumen">
      <div class="rt-c"><span>Rentas de ${MESES[m].toLowerCase()}</span><strong>${money(esperado)}</strong><small>${activas.length} rentas${esperadoUsd ? ` · + ${money(esperadoUsd, 'USD')}` : ''}</small></div>
      <div class="rt-c"><span>Cobrado</span><strong class="pos">${money(cobrado)}</strong><small>${cuenta.pagado || 0} pagadas${cobradoUsd ? ` · + ${money(cobradoUsd, 'USD')}` : ''}</small></div>
      <div class="rt-c"><span>Atrasado</span><strong class="${atrasadoMx ? 'neg' : ''}">${money(atrasadoMx)}</strong><small>${(cuenta.atrasado || 0) + (cuenta.parcial || 0)} rentas ya pasaron su día</small></div>
      <div class="rt-c"><span>Por cobrar</span><strong>${money(Math.max(0, esperado - cobrado - atrasadoMx))}</strong><small>${(cuenta.pendiente || 0) + (cuenta.porv || 0)} aún no llegan a su día</small></div>
      <div class="rt-av"><div class="ry-pista"><span style="width:${pctC}%"></span></div><small>${Math.round(pctC)} % cobrado del mes</small></div>
    </section>
    <div class="rt-grid">
      <section class="panel rt-hoja">
        <div class="tabla-wrap"><table class="tabla rt-tabla">
          <thead><tr><th class="num">Día</th><th>Inquilino</th><th>Desarrollo</th><th class="num">Renta</th><th>Estado</th><th>Últimos 6 meses</th><th></th></tr></thead>
          <tbody>${lista.length ? lista.map((r) => {
            const e = estadoDe(r, y, m), ps = pagos.filter((p) => p.contrato_id === r.id && p.periodo === per), tot = ps.reduce((s2, p) => s2 + Number(p.monto), 0);
            const v = vigencia(r.fecha_fin);
            return `<tr class="clic rt-${e}" data-detalle="${r.id}" tabindex="0">
              <td class="num rt-dia" data-l="Día">${r.dia_pago || '—'}</td>
              <td data-l="Inquilino"><strong>${esc(r.arrendatario)}</strong><small class="sub">${esc(unidadDe(r)?.identificador || '')}${v && v.cls !== 'ok' ? `${unidadDe(r) ? ' · ' : ''}<span class="${v.cls === 'bajo' ? 'neg' : 'aviso'}">${v.cls === 'bajo' ? 'contrato vencido' : 'contrato por vencer'}</span>` : ''}</small></td>
              <td class="mut" data-l="Desarrollo">${esc(nombreCentro(r.centro_id))}</td>
              <td class="num fuerte" data-l="Renta">${Number(r.monto) ? money(r.monto, r.moneda) : '—'}</td>
              <td data-l="Estado"><span class="rt-est ${e}">${ETQ[e]}</span>${e === 'pagado' && ps[0] ? `<small class="sub">${fmtFecha(ps[0].fecha)}${ps[0].forma_pago ? ' · ' + esc(ps[0].forma_pago) : ''}</small>`
                : e === 'parcial' ? `<small class="sub">faltan ${money(Number(r.monto) - tot, r.moneda)}</small>` : e === 'atrasado' ? `<small class="sub">${diasAtraso(r, y, m)}</small>` : ''}</td>
              <td data-l="6 meses"><span class="rt-hist">${historial(r)}</span></td>
              <td class="acciones">${e !== 'pagado' && e !== 'sinm' && puedeCobrar() ? `<button class="btn btn-sm btn-primary" data-cobrar="${r.id}">Cobrar</button>` : ''}</td></tr>`; }).join('')
            : '<tr><td colspan="7" class="vacio">No hay rentas que coincidan</td></tr>'}</tbody></table></div>
      </section>
      <aside class="rt-lado">
        <section class="panel"><h3>Por desarrollo</h3>
          <ul class="rt-des">
            <li class="${!st.centro ? 'activo' : ''}" data-centro=""><span>Todos</span><b>${activas.length}</b></li>
            ${porCentro.map((x) => `<li class="${st.centro === x.c ? 'activo' : ''}" data-centro="${x.c}"><span>${esc(nombreCentro(x.c))}</span>
              <b>${x.esp ? `${Math.round(x.cob / x.esp * 100)} %` : x.usd.length ? 'USD' : '—'}</b>
              <div class="ry-pista"><span style="width:${x.esp ? x.cob / x.esp * 100 : 0}%"></span></div>
              <small>${x.esp ? `${money(x.cob)} de ${money(x.esp)}` : ''}${x.usd.length ? `${x.esp ? ' · ' : ''}${x.usd.length} en dólares` : ''}</small></li>`).join('')}
          </ul></section>
        <section class="panel"><h3>Contratos que atender</h3>
          ${contratosAviso.length ? `<ul class="rt-con">${contratosAviso.slice(0, 8).map((r) => { const v = vigencia(r.fecha_fin);
            return `<li data-editarc="${r.id}"><div><strong>${esc(r.arrendatario)}</strong><small>${esc(nombreCentro(r.centro_id))}</small></div>
              <span class="rt-est ${v.cls === 'bajo' ? 'atrasado' : 'porv'}">${v.cls === 'bajo' ? 'Vencido' : 'Por vencer'}</span><small class="rt-f">${fmtFecha(r.fecha_fin)}</small></li>`; }).join('')}</ul>${contratosAviso.length > 8 ? `<button class="link-btn" data-ir-contratos>Ver los ${contratosAviso.length} en Contratos</button>` : ''}`
            : '<p class="sub-meta">Ningún contrato vencido ni por vencer en 90 días.</p>'}
          ${sinFecha ? `<p class="sub-meta" style="margin-top:10px">${sinFecha} contrato${sinFecha === 1 ? '' : 's'} sin fecha de término.</p>` : ''}
        </section>
      </aside>
    </div>`;

  enlazarNav(el);
  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { st.filtro = b.dataset.filtro; pintar(); }));
  el.querySelectorAll('[data-centro]').forEach((b) => b.addEventListener('click', () => { st.centro = b.dataset.centro; pintar(); }));
  el.querySelector('[data-ir-contratos]')?.addEventListener('click', () => { st.tab = 'contratos'; pintar(); });
  el.querySelectorAll('[data-editarc]').forEach((b) => b.addEventListener('click', () => editarContrato(contratos.find((r) => r.id === b.dataset.editarc))));
  const q = el.querySelector('#r-q');
  q.addEventListener('input', () => { st.q = q.value.toLowerCase(); pintar(); const n = raiz.querySelector('#r-q'); n.focus(); n.setSelectionRange(99, 99); });
  el.querySelectorAll('[data-detalle]').forEach((b) => b.addEventListener('click', () => detalle(contratos.find((r) => r.id === b.dataset.detalle))));
  el.querySelectorAll('[data-cobrar]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); cobrar(contratos.find((r) => r.id === b.dataset.cobrar)); }));
}
const diasAtraso = (r, y, m) => {
  const d = Math.floor((new Date() - new Date(y, m, r.dia_pago || 1)) / 864e5);
  return d > 0 ? `${d} día${d === 1 ? '' : 's'} de atraso` : '';
};

function tarjeta(r, y, m) {
  const e = estadoDe(r, y, m);
  const ps = pagos.filter((p) => p.contrato_id === r.id && p.periodo === periodo(y, m));
  const total = ps.reduce((s, p) => s + Number(p.monto), 0);
  const v = vigencia(r.fecha_fin);
  return `<div class="renta ${e}" data-detalle="${r.id}" role="button" tabindex="0">
    <div class="dia"><strong>${r.dia_pago || '—'}</strong><small>día</small></div>
    <div class="renta-info"><strong>${esc(r.arrendatario)}</strong>${unidadDe(r) ? `<small>${esc(unidadDe(r).identificador)}</small>` : ''}${v ? `<small class="${v.cls}">${v.txt}</small>` : ''}</div>
    <div class="renta-der">
      <div class="num"><strong>${Number(r.monto) ? money(r.monto, r.moneda) : '—'}</strong></div>
      <span class="badge ${BADGE[e]}">${ETQ[e]}</span>
      ${e === 'parcial' ? `<span class="mut">abonó ${money(total, r.moneda)} · <b class="neg">faltan ${money(Number(r.monto) - total, r.moneda)}</b></span>` : ''}
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
    if (c && !f.monto.dataset.tocado) {
      const [yy, mm] = (f.periodo.value || mesDefault).split('-').map(Number);
      const ya = PARCIAL ? abonado(c, yy, mm - 1) : 0;
      f.monto.value = Math.max(0, (Number(c.monto) || 0) - ya) || Number(c.monto) || '';
      if (ya) modal.querySelector('#cf-info').textContent += ` · ya abonó ${money(ya, c.moneda)} de este mes`;
    }
  };
  f.contrato.addEventListener('change', alCambiar);
  f.periodo.addEventListener('change', () => { f.periodo.dataset.tocado = '1'; alCambiar(); });
  // Si cambian la fecha de pago a otro mes y no han tocado el periodo, el periodo la sigue
  f.fecha.addEventListener('change', () => {
    if (!f.periodo.dataset.tocado && /^\d{4}-\d{2}/.test(f.fecha.value)) { f.periodo.value = f.fecha.value.slice(0, 7); alCambiar(); }
  });
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
    const yaPagado = pagos.filter((p) => p.contrato_id === c.id && p.periodo === per).reduce((s, p) => s + Number(p.monto), 0);
    if (yaPagado && !(PARCIAL && yaPagado < Number(c.monto) - 1) &&
        !confirm('Esta renta ya tiene un pago en ese periodo. ¿Registrar otro?')) return;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const { data: folio, error: e1 } = await db().rpc('siguiente_folio_renta', { p_org: estado.miembro.org_id });
      if (e1) throw e1;
      const { data, error } = await db().from('pagos').insert({
        org_id: estado.miembro.org_id, empresa_id: estado.centros.find((x) => x.id === c.centro_id)?.empresa_id
          || (estado.empresas.find((e) => e.nombre_corto === 'Treme') || estado.empresas[0])?.id,
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

// ---------- ocupación ----------
const TIPOS_U = { depto: 'Departamentos', local: 'Locales', oficina: 'Oficinas', bodega: 'Bodegas', casa: 'Casas', loft: 'Lofts', terreno: 'Terrenos', otro: 'Otros' };
function pintarOcupacion(el) {
  const y = new Date().getFullYear(), m = new Date().getMonth();
  const activos = contratos.filter((r) => r.activo && r.unidad_id);
  const contratoDe = (u) => activos.find((r) => r.unidad_id === u.id);
  const us = unidades.filter((u) => u.activo !== false);
  const ocup = us.filter(contratoDe);
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const renta = activos.reduce((s, r) => s + (r.moneda === 'USD' ? 0 : Number(r.monto || 0)), 0);
  const porTipo = Object.keys(TIPOS_U).map((t) => ({ t, tot: us.filter((u) => u.tipo === t).length, oc: ocup.filter((u) => u.tipo === t).length })).filter((x) => x.tot);
  const centros = [...new Set(us.map((u) => u.centro_id))].sort((a, b) => nombreCentro(a).localeCompare(nombreCentro(b)));
  const clase = (u) => {
    const r = contratoDe(u);
    if (!r) return 'libre';
    const e = estadoDe(r, y, m);
    return e === 'atrasado' ? 'rojo' : ['parcial', 'porv'].includes(e) ? 'ambar' : 'verde';
  };
  const corto = (id) => id.replace(/^(Depto\.?|Departamento|Local|Oficina|Of\.)\s*/i, '');
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Ocupación</span><strong>${pct(ocup.length, us.length)}%</strong><small>${ocup.length} de ${us.length} unidades rentadas</small></div>
      <div class="kpi"><span>Disponibles</span><strong class="${us.length - ocup.length ? 'neg' : 'pos'}">${us.length - ocup.length}</strong><small>unidades sin rentar</small></div>
      <div class="kpi"><span>Renta contratada</span><strong>${money(renta)}</strong><small>al mes, contratos activos</small></div>
      <div class="kpi"><span>Por tipo</span>${porTipo.map((x) => `<div class="kpi-linea">${TIPOS_U[x.t]}<b>${x.oc}/${x.tot} · ${pct(x.oc, x.tot)}%</b></div>`).join('')}</div>
    </div>
    <div class="leyenda-ocup"><span><i class="verde"></i>Al corriente</span><span><i class="ambar"></i>Abonado o por vencer</span><span><i class="rojo"></i>Atrasado</span><span><i class="libre"></i>Disponible</span></div>
    ${centros.map((cid) => {
      const del = us.filter((u) => u.centro_id === cid), oc = del.filter(contratoDe).length;
      const tipos = Object.keys(TIPOS_U).filter((t) => del.some((u) => u.tipo === t));
      return `<section class="panel"><div class="panel-head"><h3>${esc(nombreCentro(cid))}</h3><span class="sub-meta">${oc} de ${del.length} rentadas · ${pct(oc, del.length)}%</span></div>
        ${tipos.map((t) => {
          const l = del.filter((u) => u.tipo === t).sort((a, b) => a.identificador.localeCompare(b.identificador, 'es', { numeric: true }));
          return `<h4 class="grupo">${TIPOS_U[t]} · ${l.filter(contratoDe).length}/${l.length}</h4>
            <div class="ocup-grid">${l.map((u) => { const r = contratoDe(u);
              return `<button type="button" class="ocup ${clase(u)}" data-u="${u.id}" title="${esc(u.identificador)}${r ? ' · ' + esc(r.arrendatario) + ' · ' + money(r.monto, r.moneda) : ' · disponible'}">${esc(corto(u.identificador))}</button>`; }).join('')}</div>`;
        }).join('')}</section>`;
    }).join('') || '<div class="vacio">No hay unidades registradas.</div>'}
    <p class="nota">Toca una unidad rentada para ver su contrato y pagos; una disponible, para hacerle contrato.</p>`;
  el.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => {
    const u = us.find((x) => x.id === b.dataset.u), r = contratoDe(u);
    if (r) detalle(r); else if (puedeCobrar()) editarContrato(null, u.id);
  }));
}

// ---------- adeudos ----------
function pintarAdeudos(el) {
  const activos = contratos.filter((r) => r.activo && Number(r.monto) > 0);
  const con = adeudos.map((a) => ({ a, r: contratos.find((r) => r.id === a.contrato_id) })).filter((x) => x.r)
    .sort((x, y) => Number(y.a.monto_original) - Number(x.a.monto_original));
  const sin = activos.filter((r) => !adeudos.some((a) => a.contrato_id === r.id));
  const total = con.reduce((s, x) => s + Number(x.a.monto_original), 0);
  // Misma regla que Patrimonio > Por cobrar (js/adeudos-renta.js): meses vencidos sin pago, desde el inicio del contrato
  // y después de lo que ya quedó dentro del adeudo registrado
  const adeudoDe = (r) => adeudos.find((a) => a.contrato_id === r.id);
  const atrasoAuto = (r) => mesesSinPago(r, pagos, adeudoDe(r)).length;
  const sugeridos = activos.map((r) => ({ r, ms: mesesSinPago(r, pagos, adeudoDe(r)) })).filter((x) => x.ms.length)
    .map((x) => ({ ...x, n: x.ms.length, falta: x.ms.reduce((s, m) => s + m.monto, 0) })).sort((x, y) => y.falta - x.falta);
  const totalMeses = sugeridos.filter((x) => x.r.moneda !== 'USD').reduce((s, x) => s + x.falta, 0);
  el.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h3>Adeudos registrados <small class="sub-meta">· ${con.length} · ${money(total)}</small></h3>
        ${puedeCobrar() && sin.length ? `<div class="filtros filtros-sm"><select id="ad-nuevo" aria-label="Agregar adeudo"><option value="">Agregar adeudo a…</option>
          ${sin.map((r) => `<option value="${r.id}">${esc(r.arrendatario)} · ${esc(nombreCentro(r.centro_id))}</option>`).join('')}</select></div>` : ''}</div>
      ${con.length ? `<div class="tabla-wrap"><table class="tabla tm">
        <thead><tr><th>Inquilino</th><th>Desarrollo</th><th class="num">Meses</th><th>Nota</th><th class="num">Adeudo</th></tr></thead>
        <tbody>${con.map(({ a, r }) => `<tr class="clic" data-adeudo="${r.id}" tabindex="0">
          <td data-l="Inquilino"><strong>${esc(r.arrendatario)}</strong></td>
          <td class="mut" data-l="Desarrollo">${esc(nombreCentro(r.centro_id))}${unidadDe(r) ? `<small class="sub">${esc(unidadDe(r).identificador)}</small>` : ''}</td>
          <td class="num" data-l="Meses">${a.meses ?? '—'}</td>
          <td class="mut" data-l="Nota">${esc(a.notas || '')}</td>
          <td class="num neg fuerte" data-l="Adeudo">${money(a.monto_original, r.moneda)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="vacio">Sin adeudos registrados.</div>'}
    </section>
    ${sugeridos.length ? `<section class="panel"><div class="panel-head"><h3>Meses vencidos sin pago <small class="sub-meta">· ${sugeridos.length} · ${money(totalMeses)}</small></h3></div>
      <div class="tabla-wrap"><table class="tabla tm"><tbody>${sugeridos.map(({ r, n, ms, falta }) => `<tr>
        <td data-l="Inquilino"><strong>${esc(r.arrendatario)}</strong> <span class="mut">· ${esc(nombreCentro(r.centro_id))}</span>${adeudoDe(r) ? '<small class="sub">además del adeudo registrado</small>' : ''}</td>
        <td data-l="Atraso"><span class="rt-est atrasado">${n} mes${n === 1 ? '' : 'es'}: ${nombreMeses(ms)}</span></td>
        <td data-l="Debe" class="num neg fuerte">${money(falta, r.moneda)}</td>
        <td class="acciones">${puedeCobrar() ? `<button class="btn btn-sm btn-ghost" data-adeudo="${r.id}">${adeudoDe(r) ? 'Editar adeudo' : 'Registrar adeudo'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="nota">Se revisan los últimos 3 meses. Lo mismo aparece en Patrimonio, en Por cobrar.</p></section>` : ''}`;
  el.querySelector('#ad-nuevo')?.addEventListener('change', (e) => { const r = contratos.find((x) => x.id === e.target.value); if (r) editarAdeudo(r, atrasoAuto); e.target.value = ''; });
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
    else if (a) res = await db().from('cuentas_por_cobrar').update({ meses, monto_original: monto, notas, fecha_origen: new Date().toLocaleDateString('en-CA') }).eq('id', a.id);
    else res = await db().from('cuentas_por_cobrar').insert({
      org_id: estado.miembro.org_id, empresa_id: estado.centros.find((x) => x.id === r.centro_id)?.empresa_id
        || (estado.empresas.find((e) => e.nombre_corto === 'Treme') || estado.empresas[0])?.id,
      centro_id: r.centro_id, contrato_id: r.id, tipo: 'adeudo_inicial', cliente: r.arrendatario,
      meses, monto_original: monto, moneda: r.moneda, notas, fecha_origen: new Date().toLocaleDateString('en-CA') });
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
      ${lista.length ? `<div class="tabla-wrap"><table class="tabla tm">
        <thead><tr><th>Pagado el</th><th>Inquilino</th><th>Desarrollo</th><th>Mes que paga</th><th>Folio</th><th>Forma</th><th class="num">Monto</th><th></th></tr></thead>
        <tbody>${lista.slice(0, 300).map((p) => { const r = contratos.find((x) => x.id === p.contrato_id);
          return `<tr><td class="mut nowrap" data-l="Pagado el">${fmtFecha(p.fecha)}</td>
            <td data-l="Inquilino"><strong>${esc(r?.arrendatario || '—')}</strong>${p.notas ? `<small class="sub">${esc(p.notas)}</small>` : ''}</td>
            <td class="mut" data-l="Desarrollo">${esc(nombreCentro(r?.centro_id))}</td>
            <td class="nowrap" data-l="Mes">${MESES[+p.periodo.slice(5, 7) - 1]} ${p.periodo.slice(0, 4)}</td>
            <td class="mut nowrap" data-l="Folio">${esc(p.folio || '—')}</td>
            <td class="mut" data-l="Forma">${esc(p.forma_pago || '—')}</td>
            <td class="num fuerte" data-l="Monto">${money(p.monto, r?.moneda || p.moneda)}</td>
            <td class="acciones nowrap"><button class="btn btn-sm btn-ghost" data-recibo="${p.id}">Recibo</button>${puedeCobrar() ? `<button class="icon-btn peligro" data-borrar="${p.id}" aria-label="Eliminar pago">✕</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="vacio">Sin pagos</div>'}
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
          <td class="mut" data-l="Desarrollo">${esc(nombreCentro(r.centro_id))}${unidadDe(r) ? `<small class="sub">${esc(unidadDe(r).identificador)}</small>` : ''}</td>
          <td class="num fuerte" data-l="Renta">${Number(r.monto) ? money(r.monto, r.moneda) : '—'}</td>
          <td class="mut" data-l="Día">${r.dia_pago || '—'}</td>
          <td data-l="Contrato">${v ? `<span class="${v.cls}">${v.txt}</span>` : '<span class="mut">Sin fecha</span>'}</td>
          <td class="acciones">${puedeCobrar() ? `<button class="btn btn-sm btn-ghost" data-editar="${r.id}">Editar</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarContrato(contratos.find((r) => r.id === b.dataset.editar))));
}

function editarContrato(r, preUnidad = null) {
  const treme = estado.empresas.find((e) => e.nombre_corto === 'Treme')?.id;
  // Treme: sus desarrollos, como siempre. Otra instalación: los centros que tienen unidades para rentar.
  const centros = treme ? estado.centros.filter((c) => c.empresa_id === treme && !['socio', 'personal'].includes(c.tipo))
    : estado.centros.filter((c) => unidades.some((u) => u.centro_id === c.id) || c.id === r?.centro_id);
  const modal = abrirModal({
    titulo: r ? `Editar · ${r.arrendatario}` : 'Nuevo contrato',
    cuerpo: `<form class="form" id="kf" novalidate>
      <label>Arrendatario / negocio<input name="arrendatario" required maxlength="120" value="${esc(r?.arrendatario || '')}"></label>
      <label>Desarrollo<select name="centro" required><option value="">Elige…</option>
        ${centros.map((c) => `<option value="${c.id}" ${r?.centro_id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      ${OCUPACION ? '<label>Unidad<select name="unidad"></select></label>' : ''}
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
  // Unidades libres del desarrollo elegido (más la del propio contrato)
  const verUnidades = () => {
    if (!f.unidad) return;
    const ocupadas = new Set(contratos.filter((x) => x.activo && x.id !== r?.id).map((x) => x.unidad_id));
    const libres = unidades.filter((u) => u.centro_id === f.centro.value && (!ocupadas.has(u.id) || u.id === r?.unidad_id))
      .sort((a, b) => a.identificador.localeCompare(b.identificador, 'es', { numeric: true }));
    f.unidad.innerHTML = '<option value="">— Sin unidad —</option>' + libres.map((u) =>
      `<option value="${u.id}" ${u.id === (r?.unidad_id || preUnidad) ? 'selected' : ''}>${esc(u.identificador)}</option>`).join('');
  };
  if (preUnidad && !r) f.centro.value = unidades.find((u) => u.id === preUnidad)?.centro_id || '';
  f.centro.addEventListener('change', verUnidades);
  verUnidades();
  modal.querySelector('#kf-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const dia = parseInt(f.dia.value);
    if (!f.arrendatario.value.trim()) return toast('Escribe el arrendatario', true);
    if (!f.centro.value) return toast('Elige el desarrollo', true);
    if (!(dia >= 1 && dia <= 31)) return toast('El día de pago va de 1 a 31', true);
    btn.disabled = true;
    const datos = { arrendatario: f.arrendatario.value.trim(), centro_id: f.centro.value, monto: Number(f.monto.value) || 0,
      moneda: f.moneda.value, dia_pago: dia, fecha_fin: f.fin.value || null, telefono: f.telefono.value.trim() || null,
      email: f.email.value.trim() || null, notas: f.notas.value.trim() || null, activo: f.activo.checked,
      ...(f.unidad ? { unidad_id: f.unidad.value || null } : {}) };
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
  const w = abrirVentanaRecibo();                    // se abre antes de esperar, para que el navegador no la bloquee
  if (!w) return toast('Permite ventanas emergentes para ver el recibo', true);
  const per = `${MESES[+p.periodo.slice(5, 7) - 1]} ${p.periodo.slice(0, 4)}`;
  const desarrollo = nombreCentro(r.centro_id);
  const moneda = r.moneda || 'MXN';
  const forma = p.forma_pago === 'Transfer' ? 'Transferencia' : p.forma_pago || '—';
  await pintarRecibo(w, {
    titulo: `${r.arrendatario} - Renta ${per}`,
    folio: p.folio, fecha: p.fecha,
    info: [['Recibí de', r.arrendatario], ['Inmueble', unidadDe(r) ? `${unidadDe(r).identificador} · ${desarrollo}` : `${tipoEspacio(r.arrendatario)} · ${desarrollo}`], ['Concepto', 'Renta mensual'],
      ['Periodo', per], ['Recibido por', 'Administración — ' + EMISOR], ['Método de pago', forma],
      ...(r.dia_pago ? [['Día de pago pactado', `Día ${r.dia_pago} de cada mes`]] : []),
      ...(() => { const falta = PARCIAL ? Number(r.monto) - abonado(r, +p.periodo.slice(0, 4), +p.periodo.slice(5, 7) - 1) : 0;
        return falta > 1 ? [['Saldo pendiente del mes', money(falta, moneda)]] : []; })()],
    lineas: [{ concepto: 'Renta mensual', detalle: `${per} · ${desarrollo}`, cantidad: 1, precio: Number(p.monto), subtotal: Number(p.monto) }],
    total: Number(p.monto), moneda, notas: p.notas,
    liquidado: !PARCIAL || abonado(r, +p.periodo.slice(0, 4), +p.periodo.slice(5, 7) - 1) >= Number(r.monto) - 1,
    aviso: `Este recibo ampara el pago de la renta correspondiente al periodo indicado, por el inmueble arrendado en ${desarrollo}, recibido a nombre de ${r.arrendatario}.`,
  });
}
