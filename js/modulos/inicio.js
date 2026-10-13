// Inicio: estado de resultados de las dos empresas (lo que hacía el Centro de Control).
// Ingresos = rentas + mantenimiento + luz cobrados + ventas + ingresos capturados a mano.
// Gastos = todos los gastos, menos Casa y Socios (no son gasto de la empresa).
import { MESES, FORMAS_COBRO } from '../config.js';
import { db, estado, tieneRol, esAdmin, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';

const PRIVADOS = ['socio', 'personal'];
const FUENTES = {
  renta:         { t: 'Rentas',          i: '🏢' },
  mantenimiento: { t: 'Mantenimiento',   i: '🏠' },
  luz:           { t: 'Luz cobrada',     i: '⚡' },
  construccion:  { t: 'Obras y construcción', i: '🏗' },
  venta:         { t: 'Ventas',          i: '🏷' },
  manual:        { t: 'Otros ingresos',  i: '💰' },
};
// Los ingresos capturados a mano se agrupan por su categoría
const fuenteDeCategoria = (c) => ({ 'Obra / construcción': 'construccion', 'Servicio de construcción': 'construccion',
  'Venta': 'venta' }[c] || 'manual');
const CATEGORIAS_INGRESO = ['Obra / construcción', 'Venta', 'Anticipo', 'Comisión', 'Intereses', 'Reembolso', 'Otro'];
const CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

const st = { anio: new Date().getFullYear(), mes: new Date().getMonth(), empresa: '', fuente: '', q: '' };
let raiz, ingresos = [], gastos = [];

export async function render(view) {
  raiz = view;
  const anios = [];
  for (let a = new Date().getFullYear() + 1; a >= 2025; a--) anios.push(a);
  view.innerHTML = `
    <div class="sub-head">
      <div class="filtros">
        <select id="i-mes" aria-label="Mes">${MESES.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select>
        <select id="i-anio" aria-label="Año">${anios.map((a) => `<option>${a}</option>`).join('')}</select>
        <select id="i-emp" aria-label="Empresa"><option value="">Las dos empresas</option>
          ${estado.empresas.map((e) => `<option value="${e.id}">${esc(e.nombre_corto)}</option>`).join('')}</select>
      </div>
      <div class="sub-meta">Estado de resultados · sin Casa ni Socios</div>
    </div>
    <div id="i-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelector('#i-mes').value = st.mes;
  view.querySelector('#i-anio').value = st.anio;
  view.querySelector('#i-emp').value = st.empresa;
  view.querySelector('#i-mes').addEventListener('change', (e) => { st.mes = +e.target.value; cargar(); });
  view.querySelector('#i-anio').addEventListener('change', (e) => { st.anio = +e.target.value; cargar(); });
  view.querySelector('#i-emp').addEventListener('change', (e) => { st.empresa = e.target.value; pintar(); });
  document.getElementById('page-actions').innerHTML = tieneRol(['administracion', 'cobranza'])
    ? '<button class="btn btn-primary" id="i-nuevo">＋ Ingreso</button>' : '';
  document.getElementById('i-nuevo')?.addEventListener('click', nuevoIngreso);
  await cargar();
}

const iso = (a, m) => `${a}-${String(m + 1).padStart(2, '0')}-01`;
// Clave de mes (AAAA-MM) de los últimos 6 meses, terminando en el elegido
function ventana() {
  const r = [];
  for (let k = 5; k >= 0; k--) {
    let m = st.mes - k, a = st.anio;
    while (m < 0) { m += 12; a--; }
    r.push({ a, m, clave: iso(a, m).slice(0, 7) });
  }
  return r;
}

async function cargar() {
  const meses = ventana();
  const desde = iso(meses[0].a, meses[0].m);
  const fin = st.mes === 11 ? iso(st.anio + 1, 0) : iso(st.anio, st.mes + 1);
  const [p, i, g, c, u, x] = await Promise.all([
    db().from('pagos').select('id, empresa_id, centro_id, unidad_id, contrato_id, cxc_id, concepto, periodo, fecha, monto, forma_pago, notas')
      .or(`periodo.gte.${desde},fecha.gte.${desde}`).limit(20000),
    db().from('ingresos').select('id, empresa_id, centro_id, fecha, monto, concepto, cliente, categoria, forma_pago, notas, capturado_por')
      .gte('fecha', desde).lt('fecha', fin).limit(5000),
    db().from('gastos').select('empresa_id, centro_id, fecha, monto, categoria')
      .gte('fecha', desde).lt('fecha', fin).limit(20000),
    db().from('contratos').select('id, arrendatario'),
    db().from('unidades').select('id, identificador'),
    db().from('cuentas_por_cobrar').select('id, cliente'),
  ]);
  const err = p.error || i.error || g.error;
  if (err) { toast('No se pudo cargar: ' + err.message, true); return; }
  const contratos = new Map((c.data || []).map((r) => [r.id, r.arrendatario]));
  const unidades = new Map((u.data || []).map((r) => [r.id, r.identificador]));
  const clientes = new Map((x.data || []).map((r) => [r.id, r.cliente]));
  const centroDe = (id) => estado.centros.find((cc) => cc.id === id);

  ingresos = [
    ...p.data.map((r) => {
      // Las cuotas cuentan en el mes que pagan (periodo); las ventas, el día que se cobraron
      const cuando = (r.periodo || r.fecha || '').slice(0, 10);
      const quien = r.concepto === 'renta' ? contratos.get(r.contrato_id)
        : r.concepto === 'venta' ? clientes.get(r.cxc_id) : unidades.get(r.unidad_id);
      const titulo = { renta: 'Renta', mantenimiento: 'Mantenimiento', luz: 'Luz', venta: 'Venta' }[r.concepto] || r.concepto;
      return { id: r.id, mes: cuando.slice(0, 7), fecha: r.fecha || cuando, empresa_id: r.empresa_id, centro: centroDe(r.centro_id)?.nombre,
        fuente: FUENTES[r.concepto] ? r.concepto : 'manual', monto: Number(r.monto),
        concepto: `${titulo}${quien ? ' — ' + quien : ''}`, forma: r.forma_pago, editable: false };
    }),
    ...i.data.map((r) => ({ id: r.id, mes: r.fecha.slice(0, 7), fecha: r.fecha, empresa_id: r.empresa_id, centro: centroDe(r.centro_id)?.nombre,
      fuente: fuenteDeCategoria(r.categoria), monto: Number(r.monto), concepto: r.concepto + (r.cliente ? ' — ' + r.cliente : ''), forma: r.forma_pago,
      categoria: r.categoria, notas: r.notas, editable: true })),
  ].filter((r) => r.mes >= desde.slice(0, 7) && r.mes < fin.slice(0, 7));

  gastos = g.data.filter((r) => !PRIVADOS.includes(centroDe(r.centro_id)?.tipo))
    .map((r) => ({ ...r, mes: r.fecha.slice(0, 7), monto: Number(r.monto), centro: centroDe(r.centro_id)?.nombre || 'Sin centro' }));
  pintar();
}

const deEmpresa = (r) => !st.empresa || r.empresa_id === st.empresa;
const suma = (l) => l.reduce((s, r) => s + r.monto, 0);
const nombreEmpresa = (id) => estado.empresas.find((e) => e.id === id)?.nombre_corto || '—';

function pintar() {
  const clave = iso(st.anio, st.mes).slice(0, 7);
  const ing = ingresos.filter((r) => r.mes === clave && deEmpresa(r));
  const gas = gastos.filter((r) => r.mes === clave && deEmpresa(r));
  const tIng = suma(ing), tGas = suma(gas), util = tIng - tGas;
  const margen = tIng ? Math.round(util / tIng * 100) : 0;

  // Por fuente
  const porFuente = Object.keys(FUENTES).map((k) => [k, suma(ing.filter((r) => r.fuente === k))]).filter(([, v]) => v);
  const maxF = Math.max(1, ...porFuente.map(([, v]) => v));
  // Por centro (gasto)
  const porCentro = {};
  gas.forEach((r) => { porCentro[r.centro] = (porCentro[r.centro] || 0) + r.monto; });
  const centros = Object.entries(porCentro).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...centros.map(([, v]) => v));
  // Tendencia de 6 meses
  const tendencia = ventana().map((w) => ({
    ...w, ing: suma(ingresos.filter((r) => r.mes === w.clave && deEmpresa(r))), gas: suma(gastos.filter((r) => r.mes === w.clave && deEmpresa(r))),
  }));
  const maxT = Math.max(1, ...tendencia.flatMap((t) => [t.ing, t.gas]));
  const promedio = tendencia.reduce((s, t) => s + t.ing - t.gas, 0) / tendencia.length;

  // Tabla filtrada
  const filas = ing.filter((r) => (!st.fuente || r.fuente === st.fuente)
    && (!st.q || normalizar(`${r.concepto} ${r.centro || ''}`).includes(normalizar(st.q))))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const cuerpo = raiz.querySelector('#i-cuerpo');
  cuerpo.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Ingresos · ${MESES[st.mes]}</span><strong class="pos">${fmt(tIng)}</strong><small>${ing.length} cobros y registros</small></div>
      <div class="kpi"><span>Gastos · ${MESES[st.mes]}</span><strong class="neg">${fmt(tGas)}</strong><small>${gas.length} gastos</small></div>
      <div class="kpi"><span>Utilidad neta</span><strong class="${util >= 0 ? 'pos' : 'neg'}">${fmt(util)}</strong><small>${tIng ? margen + '% de margen' : 'ingresos − gastos'}</small></div>
      ${st.empresa ? `<div class="kpi"><span>Promedio 6 meses</span><strong>${fmt(promedio)}</strong><small>utilidad mensual</small></div>`
        : `<div class="kpi"><span>Por empresa</span><div class="emp-util">${estado.empresas.map((e) => {
          const u = suma(ing.filter((r) => r.empresa_id === e.id)) - suma(gas.filter((r) => r.empresa_id === e.id));
          return `<div><span>${esc(e.nombre_corto)}</span><b class="${u >= 0 ? 'pos' : 'neg'}">${fmt(u)}</b></div>`;
        }).join('')}</div></div>`}
    </div>

    <section class="panel">
      <h3>Últimos 6 meses</h3>
      <div class="tendencia" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">
        ${tendencia.map((t) => `<div class="t-mes ${t.clave === clave ? 'actual' : ''}" title="${MESES[t.m]} ${t.a}: ingresos ${fmt(t.ing)}, gastos ${fmt(t.gas)}">
          <div class="t-barras"><span class="t-ing" style="height:${t.ing / maxT * 100}%"></span><span class="t-gas" style="height:${t.gas / maxT * 100}%"></span></div>
          <small class="${t.ing - t.gas >= 0 ? 'pos' : 'neg'}">${compacto(t.ing - t.gas)}</small>
          <span class="t-nom">${CORTO[t.m]}</span></div>`).join('')}
      </div>
      <div class="leyenda"><span><i class="t-ing"></i>Ingresos</span><span><i class="t-gas"></i>Gastos</span><span>· número = utilidad del mes</span></div>
    </section>

    <div class="grid-2">
      <section class="panel"><h3>Ingresos por fuente</h3>
        ${porFuente.length ? `<ul class="barras">${porFuente.map(([k, v]) => barra(`${FUENTES[k].i} ${FUENTES[k].t}`, v, maxF, 'pos', k)).join('')}</ul>` : '<div class="vacio">Sin ingresos este mes</div>'}
      </section>
      <section class="panel"><h3>Gastos por centro</h3>
        ${centros.length ? `<ul class="barras">${centros.map(([n, v]) => barra(esc(n), v, maxC, 'neg')).join('')}</ul>` : '<div class="vacio">Sin gastos este mes</div>'}
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h3>${filas.length} ingreso${filas.length !== 1 ? 's' : ''} · ${fmt(suma(filas))}</h3>
        <div class="filtros filtros-sm">
          <select id="i-fte" aria-label="Fuente"><option value="">Todas las fuentes</option>
            ${Object.entries(FUENTES).map(([k, f]) => `<option value="${k}" ${st.fuente === k ? 'selected' : ''}>${f.t}</option>`).join('')}</select>
          <input type="search" id="i-q" placeholder="Buscar" value="${esc(st.q)}" aria-label="Buscar ingreso">
        </div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Empresa</th><th>Concepto</th><th>Fuente</th><th>Forma</th><th class="num">Monto</th><th></th></tr></thead>
        <tbody>${filas.length ? filas.slice(0, 400).map((r) => `<tr>
          <td data-l="Fecha">${fmtFecha(r.fecha)}</td>
          <td data-l="Empresa">${esc(nombreEmpresa(r.empresa_id))}${r.centro ? `<small class="sub">${esc(r.centro)}</small>` : ''}</td>
          <td data-l="Concepto">${esc(r.concepto)}</td>
          <td data-l="Fuente"><span class="chip neutro">${FUENTES[r.fuente].t}</span></td>
          <td data-l="Forma">${esc(r.forma || '—')}</td>
          <td data-l="Monto" class="num pos">${fmt(r.monto)}</td>
          <td>${r.editable && esAdmin() ? `<button class="icon-btn" data-borrar="${r.id}" aria-label="Eliminar ingreso">✕</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="vacio">Sin ingresos para este filtro</td></tr>'}</tbody>
      </table></div>
      ${filas.length > 400 ? '<p class="sub-meta">Se muestran los 400 más recientes.</p>' : ''}
    </section>`;

  cuerpo.querySelector('#i-fte').addEventListener('change', (e) => { st.fuente = e.target.value; pintar(); });
  const q = cuerpo.querySelector('#i-q');
  q.addEventListener('input', (e) => {
    st.q = e.target.value; const pos = e.target.selectionStart; pintar();
    const n = raiz.querySelector('#i-q'); n.focus(); n.setSelectionRange(pos, pos);
  });
  cuerpo.querySelectorAll('[data-fuente]').forEach((b) => {
    const ir = () => { st.fuente = st.fuente === b.dataset.fuente ? '' : b.dataset.fuente; pintar(); };
    b.addEventListener('click', ir);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
  });
  cuerpo.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', () => borrar(b.dataset.borrar)));
}

const compacto = (v) => {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)}k` : `${s}$${Math.round(a)}`;
};

function barra(nombre, v, max, clase, fuente) {
  const extra = fuente ? ` class="clic ${st.fuente === fuente ? 'activa' : ''}" data-fuente="${fuente}" tabindex="0" role="button" title="Filtrar la tabla"` : '';
  return `<li${extra}><span class="barra-nombre">${nombre}</span>
    <span class="barra-pista"><span class="${clase}" style="width:${Math.max(2, v / max * 100)}%"></span></span>
    <span class="barra-monto">${fmt(v)}</span></li>`;
}

// ---------- captura ----------
function nuevoIngreso() {
  const emps = estado.empresas;
  const opcCentros = (empId) => estado.centros.filter((c) => c.empresa_id === empId && !PRIVADOS.includes(c.tipo))
    .map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  const modal = abrirModal({
    titulo: 'Nuevo ingreso',
    cuerpo: `<form id="f-ing" class="form">
      <p class="sub-meta">Rentas, mantenimiento y luz se registran en sus módulos; aquí van los demás ingresos.</p>
      <div class="form-2">
        <label>Empresa<select name="empresa">${emps.map((e) => `<option value="${e.id}">${esc(e.nombre_corto)}</option>`).join('')}</select></label>
        <label>Centro<select name="centro"><option value="">— General —</option>${opcCentros(emps[0]?.id)}</select></label>
      </div>
      <div class="form-2">
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label>
        <label>Monto<input type="number" name="monto" min="0.01" step="0.01" inputmode="decimal" required></label>
      </div>
      <label>Concepto<input name="concepto" required maxlength="200" placeholder="Ej. Anticipo obra Escobedo"></label>
      <label>Cliente<input name="cliente" maxlength="120"></label>
      <div class="form-2">
        <label>Categoría<select name="categoria">${CATEGORIAS_INGRESO.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <label>Forma de cobro<select name="forma">${FORMAS_COBRO.map((f) => `<option>${f}</option>`).join('')}</select></label>
      </div>
      <label>Notas<textarea name="notas" rows="2"></textarea></label>
    </form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="ing-ok">Guardar ingreso</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#f-ing');
  if (st.empresa) { f.empresa.value = st.empresa; f.centro.innerHTML = `<option value="">— General —</option>${opcCentros(st.empresa)}`; }
  f.empresa.addEventListener('change', () => { f.centro.innerHTML = `<option value="">— General —</option>${opcCentros(f.empresa.value)}`; });
  modal.querySelector('#ing-ok').addEventListener('click', async (ev) => {
    if (!f.reportValidity()) return;
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
    const { error } = await db().from('ingresos').insert({
      org_id: estado.miembro.org_id, empresa_id: f.empresa.value, centro_id: f.centro.value || null,
      fecha: f.fecha.value, monto: Number(f.monto.value), concepto: f.concepto.value.trim(),
      cliente: f.cliente.value.trim() || null, categoria: f.categoria.value, forma_pago: f.forma.value,
      notas: f.notas.value.trim() || null, creado_por: estado.user.id, capturado_por: estado.miembro.nombre,
    });
    btn.disabled = false; btn.textContent = 'Guardar ingreso';
    if (error) return toast('No se pudo guardar: ' + error.message, true);
    cerrarModal(); toast('Ingreso registrado');
    const d = f.fecha.value; st.anio = +d.slice(0, 4); st.mes = +d.slice(5, 7) - 1;
    raiz.querySelector('#i-mes').value = st.mes; raiz.querySelector('#i-anio').value = st.anio;
    cargar();
  });
}

async function borrar(id) {
  const r = ingresos.find((x) => x.id === id);
  if (!r) return;
  const modal = abrirModal({
    titulo: 'Eliminar ingreso',
    cuerpo: `<p>¿Eliminar <b>${esc(r.concepto)}</b> por <b>${fmt(r.monto)}</b>?</p>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary btn-peligro" id="b-ok">Eliminar</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  modal.querySelector('#b-ok').addEventListener('click', async () => {
    const { error } = await db().from('ingresos').delete().eq('id', id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    cerrarModal(); toast('Ingreso eliminado'); cargar();
  });
}
