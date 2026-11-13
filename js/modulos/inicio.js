// Inicio: estado de resultados de las dos empresas (lo que hacía el Centro de Control).
// Ingresos = rentas + mantenimiento + luz cobrados + ventas + ingresos capturados a mano.
// Gastos = todos los gastos, menos Casa y Socios (no son gasto de la empresa).
import { MESES, FORMAS_COBRO, MARCA } from '../config.js';
import { db, todo, estado, tieneRol, esAdmin, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';
import { abrirVentanaRecibo } from '../recibo.js';
import { reciboIngreso, reciboDeAbono } from '../recibo-ingreso.js';

const PRIVADOS = [];   // Casa y Socios sí son gasto de la empresa (todo sale de la empresa); Victoria no los ve por la base
const FUENTES = {
  renta:         { t: 'Rentas',          c: '#101216' },
  mantenimiento: { t: 'Mantenimiento',   c: '#6B7079' },
  luz:           { t: 'Luz cobrada',     c: '#C9A227' },
  construccion:  { t: MARCA.titulos.obras || 'Obras y construcción', c: '#23408E' },
  venta:         { t: 'Ventas',          c: '#0F7A4F' },
  manual:        { t: 'Otros ingresos',  c: '#B5B9C0' },
};
const COLOR_EMPRESA = (e, i) => (/treme/i.test(e?.nombre || '') ? '#8B1A1A' : /medco/i.test(e?.nombre || '') ? '#23408E' : e?.color || ['#8B1A1A', '#23408E', '#0F7A4F'][i % 3]);
// Los ingresos capturados a mano se agrupan por su categoría
// Los cobros de clientes en una obra (centro tipo "obra") cuentan como obra/proyecto, no como venta suelta
const esObra = (centroId) => estado.centros.find((c) => c.id === centroId)?.tipo === 'obra';
const fuenteDeCategoria = (c) => ({ 'Obra / construcción': 'construccion', 'Servicio de construcción': 'construccion',
  'Venta': 'venta' }[c] || 'manual');
const CATEGORIAS_INGRESO = ['Obra / construcción', 'Venta', 'Anticipo', 'Comisión', 'Intereses', 'Reembolso', 'Otro'];
const CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

// Junto a Rentas: cuánto se cobró de lo que toca en el mes (contratos activos en pesos de los centros a la vista)
function notaFuente(k, v) {
  if (k !== 'renta') return '';
  const ids = new Set(estado.centros.filter((c) => !st.empresa || c.empresa_id === st.empresa).map((c) => c.id));
  const esp = contratosAct.filter((r) => ids.has(r.centro_id)).reduce((s2, r) => s2 + Number(r.monto), 0);
  return esp ? `${Math.round(v / esp * 100)} % de las rentas del mes (${fmt(esp)})` : '';
}
const st = { anio: new Date().getFullYear(), mes: new Date().getMonth(), empresa: '', fuente: '', q: '', todos: false };
let raiz, ingresos = [], gastos = [], porPagar = [], contratosAct = [];

export async function render(view) {
  raiz = view;
  const anios = [];
  for (let a = new Date().getFullYear() + 1; a >= 2025; a--) anios.push(a);
  view.innerHTML = `
    <div class="ex-controles">
      <div class="segmento ex-emp" role="group" aria-label="Empresa" ${estado.mundo ? 'hidden' : ''}>
        <button type="button" data-emp="">${estado.empresas.length === 2 ? 'Grupo' : 'Todas'}</button>
        ${estado.empresas.map((e) => `<button type="button" data-emp="${e.id}">${esc(e.nombre_corto)}</button>`).join('')}
      </div>
      <div class="filtros">
        <select id="i-mes" aria-label="Mes">${MESES.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select>
        <select id="i-anio" aria-label="Año">${anios.map((a) => `<option>${a}</option>`).join('')}</select>
      </div>
    </div>
    <div id="i-cuerpo"><div class="cargando">Cargando…</div></div>`;
  if (estado.mundo) st.empresa = '';   // la empresa se escoge arriba (Grupo / Treme / MEDCO)
  view.querySelector('#i-mes').value = st.mes;
  view.querySelector('#i-anio').value = st.anio;
  const marcarEmp = () => view.querySelectorAll('[data-emp]').forEach((b) => b.classList.toggle('activo', b.dataset.emp === st.empresa));
  marcarEmp();
  view.querySelector('#i-mes').addEventListener('change', (e) => { st.mes = +e.target.value; cargar(); });
  view.querySelector('#i-anio').addEventListener('change', (e) => { st.anio = +e.target.value; cargar(); });
  view.querySelectorAll('[data-emp]').forEach((b) => b.addEventListener('click', () => { st.empresa = b.dataset.emp; marcarEmp(); pintar(); }));
  estilos();
  document.getElementById('page-actions').innerHTML = tieneRol(['administracion', 'cobranza'])
    ? '<button class="btn btn-primary" id="i-nuevo">Registrar ingreso</button>' : '';
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
    todo(() => db().from('pagos').select('id, empresa_id, centro_id, unidad_id, contrato_id, cxc_id, concepto, periodo, fecha, monto, forma_pago, notas, folio')
      .or(`periodo.gte.${desde},fecha.gte.${desde}`)),
    todo(() => db().from('ingresos').select('id, empresa_id, centro_id, fecha, monto, concepto, cliente, categoria, forma_pago, notas, capturado_por, folio')
      .gte('fecha', desde).lt('fecha', fin)),
    // Gastos ya pagados: cuentan en el mes en que salió el dinero (fecha de pago, o la fecha si se pagó al momento).
    // Los pedidos por pagar se muestran aparte y no restan todavía.
    todo(() => db().from('gastos').select('id, empresa_id, centro_id, fecha, fecha_pago, estado, monto, categoria')
      .or(`fecha.gte.${desde},fecha_pago.gte.${desde}`)),
    db().from('contratos').select('id, arrendatario, monto, moneda, activo, centro_id'),
    db().from('unidades').select('id, identificador'),
    db().from('cuentas_por_cobrar').select('id, cliente'),
  ]);
  const err = p.error || i.error || g.error;
  if (err) { toast('No se pudo cargar: ' + err.message, true); return; }
  const contratos = new Map((c.data || []).map((r) => [r.id, r.arrendatario]));
  contratosAct = (c.data || []).filter((r) => r.activo && Number(r.monto) > 0 && (r.moneda || 'MXN') !== 'USD');
  const unidades = new Map((u.data || []).map((r) => [r.id, r.identificador]));
  const clientes = new Map((x.data || []).map((r) => [r.id, r.cliente]));
  const centroDe = (id) => estado.centros.find((cc) => cc.id === id);

  ingresos = [
    ...p.data.map((r) => {
      // Las cuotas cuentan en el mes que pagan (periodo); las ventas, el día que se cobraron
      const cuando = (r.periodo || r.fecha || '').slice(0, 10);
      const quien = r.concepto === 'renta' ? contratos.get(r.contrato_id)
        : r.cxc_id ? clientes.get(r.cxc_id) : unidades.get(r.unidad_id);
      const titulo = r.concepto === 'venta' && esObra(r.centro_id) ? (MARCA.demo ? 'Pago de proyecto' : 'Pago de obra')
        : ({ renta: 'Renta', mantenimiento: 'Mantenimiento', luz: 'Luz', venta: 'Venta', cartera: 'Abono de compra' }[r.concepto] || r.concepto);
      return { id: r.id, mes: cuando.slice(0, 7), fecha: r.fecha || cuando, empresa_id: r.empresa_id, centro: centroDe(r.centro_id)?.nombre,
        // Las "ventas" de MEDCO son bodegas que construye para sus clientes: cuentan como obra
        fuente: r.concepto === 'venta' && esObra(r.centro_id) ? 'construccion' : (FUENTES[r.concepto] ? r.concepto : 'manual'),
        monto: Number(r.monto),
        concepto: `${titulo}${quien ? ' — ' + quien : ''}`, forma: r.forma_pago, editable: false,
        // Abonos de clientes de obra: se puede volver a sacar su recibo
        recibo: (r.concepto === 'venta' || r.concepto === 'cartera') ? { tabla: 'pagos', id: r.id, empresaId: r.empresa_id, centroId: r.centro_id, folio: r.folio, fecha: r.fecha,
          monto: Number(r.monto), concepto: titulo, cliente: quien || '', forma: r.forma_pago, notas: r.notas || '', abono: !!r.cxc_id } : null };
    }),
    ...i.data.map((r) => ({ id: r.id, mes: r.fecha.slice(0, 7), fecha: r.fecha, empresa_id: r.empresa_id, centro: centroDe(r.centro_id)?.nombre,
      fuente: fuenteDeCategoria(r.categoria), monto: Number(r.monto), concepto: r.concepto + (r.cliente ? ' — ' + r.cliente : ''), forma: r.forma_pago,
      categoria: r.categoria, notas: r.notas, editable: true,
      recibo: { tabla: 'ingresos', id: r.id, empresaId: r.empresa_id, centroId: r.centro_id, folio: r.folio, fecha: r.fecha, monto: Number(r.monto),
        concepto: r.concepto, cliente: r.cliente || '', forma: r.forma_pago, notas: r.notas || '' } })),
  ].filter((r) => r.mes >= desde.slice(0, 7) && r.mes < fin.slice(0, 7));

  const base = g.data.filter((r) => !PRIVADOS.includes(centroDe(r.centro_id)?.tipo))
    .map((r) => ({ ...r, mes: (r.fecha_pago || r.fecha).slice(0, 7), monto: Number(r.monto), centro: centroDe(r.centro_id)?.nombre || 'Sin centro' }));
  gastos = base.filter((r) => r.estado !== 'por_pagar' && r.mes >= desde.slice(0, 7) && r.mes < fin.slice(0, 7));
  const pp = await todo(() => db().from('gastos').select('id, empresa_id, centro_id, monto').eq('estado', 'por_pagar'));
  porPagar = (pp.data || []).filter((r) => !PRIVADOS.includes(centroDe(r.centro_id)?.tipo)).map((r) => ({ ...r, monto: Number(r.monto) }));
  pintar();
}

const deEmpresa = (r) => !st.empresa || r.empresa_id === st.empresa;
const suma = (l) => l.reduce((s, r) => s + r.monto, 0);
const nombreEmpresa = (id) => estado.empresas.find((e) => e.id === id)?.nombre_corto || '—';

function pintar() {
  const clave = iso(st.anio, st.mes).slice(0, 7);
  const tendencia = ventana().map((w) => {
    const ing = suma(ingresos.filter((r) => r.mes === w.clave && deEmpresa(r))), gas = suma(gastos.filter((r) => r.mes === w.clave && deEmpresa(r)));
    return { ...w, ing, gas, util: ing - gas };
  });
  const act = tendencia[tendencia.length - 1], ant = { ...tendencia[tendencia.length - 2] };
  // Mes en curso: se compara contra el mismo periodo del mes anterior (del 1 al día de hoy), no contra el mes completo
  const hoy = new Date(), enCurso = st.anio === hoy.getFullYear() && st.mes === hoy.getMonth();
  if (enCurso) {
    const dia = hoy.getDate(), hasta = (f) => Number(String(f || '').slice(8, 10)) <= dia;
    ant.ing = suma(ingresos.filter((r) => r.mes === ant.clave && deEmpresa(r) && hasta(r.fecha)));
    ant.gas = suma(gastos.filter((r) => r.mes === ant.clave && deEmpresa(r) && hasta(r.fecha_pago || r.fecha)));
    ant.util = ant.ing - ant.gas;
  }
  const ing = ingresos.filter((r) => r.mes === clave && deEmpresa(r));
  const gas = gastos.filter((r) => r.mes === clave && deEmpresa(r));
  const tIng = act.ing, tGas = act.gas, util = act.util;
  const margen = tIng ? Math.round(util / tIng * 100) : 0;
  const pp = porPagar.filter(deEmpresa), tPP = suma(pp);
  const nomMes = MESES[st.mes].toLowerCase(), nomAnt = (enCurso ? `el 1 al ${hoy.getDate()} de ` : '') + MESES[ant.m].toLowerCase();

  const porFuente = Object.keys(FUENTES).map((k) => [k, suma(ing.filter((r) => r.fuente === k))]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  const porCentro = {};
  gas.forEach((r) => { porCentro[r.centro] = (porCentro[r.centro] || 0) + r.monto; });
  let centros = Object.entries(porCentro).sort((a, b) => b[1] - a[1]);
  if (centros.length > 7) centros = [...centros.slice(0, 6), ['Otros centros', centros.slice(6).reduce((s2, [, v]) => s2 + v, 0)]];
  const maxC = Math.max(1, ...centros.map(([, v]) => v));

  const filas = ing.filter((r) => (!st.fuente || r.fuente === st.fuente)
    && (!st.q || normalizar(`${r.concepto} ${r.centro || ''}`).includes(normalizar(st.q))))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const visibles = st.todos ? filas.slice(0, 400) : filas.slice(0, 8);

  const cuerpo = raiz.querySelector('#i-cuerpo');
  cuerpo.innerHTML = `
    <section class="ex-hero">
      <div class="ex-util">
        <span class="ex-eti">Utilidad neta · ${esc(nomMes)} ${st.anio}</span>
        <strong class="ex-grande">${fmt(util)}</strong>
        <div class="ex-util-pie">
          <span>${tIng ? `Margen <b>${margen}%</b>` : 'Ingresos − egresos'}</span>
          ${delta(util, ant.util, nomAnt)}
        </div>
        ${chispa(tendencia.map((t) => t.util), '#FFFFFF')}
      </div>
      <div class="ex-mini">
        ${kpi('Ingresos', tIng, ant.ing, nomAnt, `${ing.length} cobros y registros`, tendencia.map((t) => t.ing), '#0F7A4F')}
        ${kpi('Egresos', tGas, ant.gas, nomAnt, `${gas.length} gastos pagados`, tendencia.map((t) => t.gas), '#8B1A1A', true)}
        <div class="ex-kpi"><span class="ex-eti">Por pagar a proveedores</span><strong>${fmt(tPP)}</strong>
          <small>${pp.length ? `${pp.length} pedido${pp.length !== 1 ? 's' : ''} pendiente${pp.length !== 1 ? 's' : ''}; cuenta${pp.length !== 1 ? 'n' : ''} al pagarse` : 'Sin pedidos pendientes'}</small>
          ${tPP ? `<a class="ex-liga" href="#/gastos">Ver en Gastos →</a>` : ''}</div>
        <div class="ex-kpi"><span class="ex-eti">Promedio 6 meses</span><strong>${fmt(tendencia.reduce((s2, t) => s2 + t.util, 0) / tendencia.length)}</strong>
          <small>Utilidad mensual promedio</small></div>
      </div>
    </section>

    <section class="panel ex-flujo">
      <div class="panel-head"><div><h3>Flujo de los últimos seis meses</h3><span class="ex-sub">Ingresos y egresos por mes, con la utilidad de cada uno</span></div>
        <div class="ex-leyenda"><span><i style="background:#101216"></i>Ingresos</span><span><i style="background:#8B1A1A"></i>Egresos</span><span><i class="ex-util-ley"></i>Utilidad</span></div></div>
      ${flujo(tendencia, clave)}
    </section>

    ${!st.empresa && estado.empresas.length > 1 ? `<section class="ex-empresas">${estado.empresas.map((e, k) => {
      const iE = suma(ing.filter((r) => r.empresa_id === e.id)), gE = suma(gas.filter((r) => r.empresa_id === e.id)), uE = iE - gE;
      const mE = iE ? Math.round(uE / iE * 100) : 0;
      return `<button type="button" class="ex-empresa" data-ir-emp="${e.id}" style="--c:${COLOR_EMPRESA(e, k)}">
        <span class="ex-empresa-nom"><i></i>${esc(e.nombre)}</span>
        <strong>${fmt(uE)}</strong><span class="ex-sub">Utilidad · ${iE ? `margen ${mE}%` : 'sin ingresos este mes'}</span>
        <dl><div><dt>Ingresos</dt><dd>${fmt(iE)}</dd></div><div><dt>Egresos</dt><dd>${fmt(gE)}</dd></div></dl>
        <span class="ex-margen"><span style="width:${Math.max(0, Math.min(100, mE))}%"></span></span>
        <span class="ex-ver">Ver solo ${esc(e.nombre_corto)} →</span></button>`;
    }).join('')}</section>` : ''}

    <div class="grid-2">
      <section class="panel"><div class="panel-head"><div><h3>De dónde vino el ingreso</h3><span class="ex-sub">${fmt(tIng)} cobrados en ${esc(nomMes)}</span></div></div>
        ${porFuente.length ? `<div class="ex-pila" role="img" aria-label="Composición de los ingresos">${porFuente.map(([k, v]) => `<span style="flex:${v};background:${FUENTES[k].c}" title="${FUENTES[k].t}: ${fmt(v)}"></span>`).join('')}</div>
          <ul class="ex-lista">${porFuente.map(([k, v]) => `<li class="clic ${st.fuente === k ? 'activa' : ''}" data-fuente="${k}" tabindex="0" role="button" title="Filtrar los movimientos">
            <span><i style="background:${FUENTES[k].c}"></i>${FUENTES[k].t}${notaFuente(k, v) ? `<small class="ex-nota">${notaFuente(k, v)}</small>` : ''}</span><em></em><b>${fmt(v)}</b></li>`).join('')}</ul>`
          : '<div class="vacio">Sin ingresos registrados en el periodo.</div>'}
      </section>
      <section class="panel"><div class="panel-head"><div><h3>En qué centro se gastó</h3><span class="ex-sub">${fmt(tGas)} gastados en ${esc(nomMes)}</span></div></div>
        ${centros.length ? `<ul class="ex-lista ex-barras">${centros.map(([n, v]) => `<li><span>${esc(n)}</span><em></em><b>${fmt(v)}</b>
          <span class="ex-pista"><span style="width:${Math.max(2, v / maxC * 100)}%"></span></span></li>`).join('')}</ul>`
          : '<div class="vacio">Sin egresos registrados en el periodo.</div>'}
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div><h3>Movimientos de ingreso</h3><span class="ex-sub">${filas.length} registro${filas.length !== 1 ? 's' : ''} · ${fmt(suma(filas))}${st.fuente ? ` · ${FUENTES[st.fuente].t}` : ''}</span></div>
        <div class="filtros filtros-sm">
          <select id="i-fte" aria-label="Fuente"><option value="">Todas las fuentes</option>
            ${Object.entries(FUENTES).map(([k, f]) => `<option value="${k}" ${st.fuente === k ? 'selected' : ''}>${f.t}</option>`).join('')}</select>
          <input type="search" id="i-q" placeholder="Buscar concepto o centro" value="${esc(st.q)}" aria-label="Buscar ingreso">
        </div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Empresa</th><th>Concepto</th><th>Fuente</th><th>Forma</th><th class="num">Monto</th><th></th></tr></thead>
        <tbody>${visibles.length ? visibles.map((r) => `<tr>
          <td data-l="Fecha" class="nowrap">${fmtFecha(r.fecha)}</td>
          <td data-l="Empresa">${esc(nombreEmpresa(r.empresa_id))}${r.centro ? `<small class="sub">${esc(r.centro)}</small>` : ''}</td>
          <td data-l="Concepto">${esc(r.concepto)}</td>
          <td data-l="Fuente"><span class="ex-fuente"><i style="background:${FUENTES[r.fuente].c}"></i>${FUENTES[r.fuente].t}</span></td>
          <td data-l="Forma">${esc(r.forma || '—')}</td>
          <td data-l="Monto" class="num fuerte">${fmt(r.monto)}</td>
          <td class="acciones">${r.recibo && esAdmin() ? `<button class="btn btn-ghost btn-sm" data-recibo="${r.id}" title="Recibo en PDF">Recibo</button>` : ''}${r.editable && esAdmin() ? `<button class="icon-btn peligro" data-borrar="${r.id}" aria-label="Eliminar ingreso" title="Eliminar">${X}</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="vacio">Sin movimientos para este filtro.</td></tr>'}</tbody>
      </table></div>
      ${filas.length > 8 ? `<div class="ex-mas"><button type="button" class="btn btn-ghost btn-sm" id="i-todos">${st.todos ? 'Mostrar solo los más recientes' : `Ver los ${Math.min(filas.length, 400)} movimientos`}</button></div>` : ''}
    </section>`;

  cuerpo.querySelector('#i-fte').addEventListener('change', (e) => { st.fuente = e.target.value; pintar(); });
  cuerpo.querySelector('#i-todos')?.addEventListener('click', () => { st.todos = !st.todos; pintar(); });
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
  cuerpo.querySelectorAll('[data-ir-emp]').forEach((b) => b.addEventListener('click', () => {
    const e = estado.empresas.find((x) => x.id === b.dataset.irEmp);
    if (estado.mundo && e) { location.hash = `#/${/medco/i.test(e.nombre + e.nombre_corto) ? 'medco' : 'treme'}/inicio`; return; }
    raiz.querySelector(`[data-emp="${b.dataset.irEmp}"]`)?.click();
  }));
  cuerpo.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', () => borrar(b.dataset.borrar)));
  cuerpo.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => volverARecibo(b.dataset.recibo)));
}

const X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const compacto = (v) => {
  const a = Math.abs(v), s2 = v < 0 ? '−' : '';
  return a >= 1e6 ? `${s2}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s2}$${Math.round(a / 1e3)}k` : `${s2}$${Math.round(a)}`;
};
// Variación contra el mes anterior; en egresos, subir es malo
function delta(v, prev, nomAnt, inverso) {
  if (!prev) return `<span class="ex-delta">Sin comparación con ${esc(nomAnt)}</span>`;
  const p = Math.round((v - prev) / Math.abs(prev) * 100);
  const bueno = inverso ? p <= 0 : p >= 0;
  const txt = Math.abs(p) > 300 ? `${(Math.abs(v - prev) / Math.abs(prev) + (p > 0 ? 1 : 0)).toFixed(1)}×` : `${Math.abs(p)}%`;
  return `<span class="ex-delta ${p === 0 ? '' : bueno ? 'sube' : 'baja'}">${p > 0 ? '▲' : p < 0 ? '▼' : '='} ${txt} <span>vs. ${esc(nomAnt)}</span></span>`;
}
function kpi(t, v, prev, nomAnt, sub, serie, color, inverso) {
  return `<div class="ex-kpi"><span class="ex-eti">${t}</span><strong>${fmt(v)}</strong>${delta(v, prev, nomAnt, inverso)}<small>${sub}</small>${chispa(serie, color)}</div>`;
}
// Línea pequeña de seis puntos
function chispa(serie, color) {
  const W = 160, H = 36, mx = Math.max(...serie), mn = Math.min(0, ...serie), rango = mx - mn || 1;
  const P = serie.map((v, i) => [(i / (serie.length - 1)) * W, H - 3 - ((v - mn) / rango) * (H - 6)]);
  const d = P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="ex-chispa" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d} L${W} ${H} L0 ${H} Z" fill="${color}" opacity=".08"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${P[P.length - 1][0]}" cy="${P[P.length - 1][1]}" r="2.6" fill="${color}"/></svg>`;
}
// Flujo de seis meses: líneas de ingresos y egresos, columna de utilidad y el mes elegido marcado
function flujo(T, clave) {
  const W = 1000, H = 240, pad = 34, max = Math.max(1, ...T.flatMap((t) => [t.ing, t.gas])) * 1.12;
  const X = (i) => pad + (i / (T.length - 1)) * (W - pad * 2), Y = (v) => H - 26 - (v / max) * (H - 50);
  const curva = (k) => { const P = T.map((t, i) => [X(i), Y(Math.max(0, t[k]))]); let d = `M${P[0][0]} ${P[0][1]}`;
    for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], c = (x1 - x0) / 2; d += ` C${x0 + c} ${y0} ${x1 - c} ${y1} ${x1} ${y1}`; } return { d, P }; };
  const ci = curva('ing'), cg = curva('gas');
  const base = H - 26, maxU = Math.max(1, ...T.map((t) => Math.abs(t.util)));
  const rejilla = [0.25, 0.5, 0.75, 1].map((k) => `<line x1="${pad}" x2="${W - pad}" y1="${Y(max / 1.12 * k)}" y2="${Y(max / 1.12 * k)}" class="ex-reja"/><text x="${W - pad + 6}" y="${Y(max / 1.12 * k) + 3}" class="ex-eje">${compacto(max / 1.12 * k)}</text>`).join('');
  return `<div class="ex-flujo-g"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y egresos de los últimos seis meses">
    <defs><linearGradient id="ex-ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101216" stop-opacity=".09"/><stop offset="1" stop-color="#101216" stop-opacity="0"/></linearGradient></defs>
    ${rejilla}
    ${T.map((t, i) => t.clave === clave ? `<rect x="${X(i) - 46}" y="8" width="92" height="${H - 10}" rx="10" class="ex-actual"/>` : '').join('')}
    ${T.map((t, i) => { const h = Math.abs(t.util) / maxU * 34; return `<rect x="${X(i) - 9}" y="${t.util >= 0 ? base - h : base}" width="18" height="${Math.max(1.5, h)}" rx="3" class="${t.util >= 0 ? 'ex-u-pos' : 'ex-u-neg'}"><title>Utilidad ${MESES[t.m]}: ${fmt(t.util)}</title></rect>`; }).join('')}
    <path d="${ci.d} L${X(T.length - 1)} ${base} L${X(0)} ${base} Z" fill="url(#ex-ar)"/>
    <path d="${cg.d}" fill="none" stroke="#8B1A1A" stroke-width="2.2" stroke-dasharray="1 0" vector-effect="non-scaling-stroke"/>
    <path d="${ci.d}" fill="none" stroke="#101216" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
    ${ci.P.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" class="ex-p-ing"><title>Ingresos ${MESES[T[i].m]}: ${fmt(T[i].ing)}</title></circle>`).join('')}
    ${cg.P.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="ex-p-gas"><title>Egresos ${MESES[T[i].m]}: ${fmt(T[i].gas)}</title></circle>`).join('')}
    <line x1="${pad}" x2="${W - pad}" y1="${base}" y2="${base}" class="ex-base"/>
  </svg>
  <div class="ex-meses">${T.map((t, i) => `<div class="${t.clave === clave ? 'actual' : ''}" style="left:${X(i) / W * 100}%"><b>${CORTO[t.m]}</b><span>${compacto(t.ing)} · ${compacto(t.gas)}</span><em class="${t.util >= 0 ? 'pos' : 'neg'}">${compacto(t.util)}</em></div>`).join('')}</div></div>`;
}

function estilos() {
  if (document.getElementById('ex-inicio')) return;
  const e = document.createElement('style'); e.id = 'ex-inicio';
  e.textContent = `
  .ex-controles { display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; }
  .ex-controles .filtros select { min-width:0; }
  .ex-meta { margin-left:auto; font-size:10.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--text-3); }
  .ex-eti { font-size:10.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); }
  .ex-sub { display:block; font-size:12.5px; color:var(--text-3); margin-top:2px; font-weight:400; }
  .ex-hero { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1.9fr); gap:14px; }
  .ex-util { position:relative; overflow:hidden; border-radius:16px; padding:24px 26px 20px; color:#fff; display:flex; flex-direction:column; gap:10px;
    background:radial-gradient(520px 260px at 100% 0%, color-mix(in srgb, var(--primary) 60%, transparent), transparent 60%), linear-gradient(160deg, #1B1E24, #0C0D10); box-shadow:0 24px 50px -28px rgba(16,18,22,.7); }
  .ex-util .ex-eti { color:rgba(255,255,255,.6); }
  .ex-grande { font-size:clamp(34px,3.6vw,46px); font-weight:600; letter-spacing:-.035em; line-height:1.05; font-feature-settings:"tnum"; }
  .ex-util-pie { display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center; font-size:13px; color:rgba(255,255,255,.72); }
  .ex-util-pie b { color:#fff; }
  .ex-util .ex-delta.sube { color:#6EE7B7; } .ex-util .ex-delta.baja { color:#FCA5A5; } .ex-util .ex-delta span { color:rgba(255,255,255,.5); }
  .ex-util .ex-chispa { margin-top:auto; height:54px; opacity:.9; }
  .ex-mini { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
  .ex-kpi { background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--shadow); padding:16px 18px 12px; display:flex; flex-direction:column; gap:4px; min-width:0; }
  .ex-kpi strong { font-size:24px; font-weight:600; letter-spacing:-.03em; font-feature-settings:"tnum"; }
  .ex-kpi small { font-size:12px; }
  .ex-kpi .ex-chispa { height:32px; margin-top:auto; }
  .ex-liga { font-size:12.5px; font-weight:600; color:var(--text); text-decoration:none; margin-top:6px; } .ex-liga:hover { text-decoration:underline; }
  .ex-delta { font-size:12.5px; font-weight:600; color:var(--text-2); font-feature-settings:"tnum"; } .ex-delta span { font-weight:400; color:var(--text-3); }
  .ex-delta.sube { color:var(--ok); } .ex-delta.baja { color:var(--neg); }
  .ex-chispa { width:100%; display:block; }
  .ex-leyenda { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; color:var(--text-2); } .ex-leyenda i { display:inline-block; width:14px; height:3px; border-radius:2px; margin-right:7px; vertical-align:middle; }
  .ex-leyenda i.ex-util-ley { width:8px; height:10px; background:#C9CDD3; border-radius:2px; }
  .ex-flujo-g { position:relative; padding-bottom:46px; }
  .ex-flujo-g svg { width:100%; height:auto; display:block; overflow:visible; }
  .ex-reja { stroke:#EFEDE7; } .ex-base { stroke:#D9D5CB; } .ex-eje { font:500 10px var(--f-texto); fill:var(--text-3); }
  .ex-actual { fill:#F7F6F2; stroke:#E6E3DB; }
  .ex-u-pos { fill:#C9CDD3; } .ex-u-neg { fill:#E8B4B4; }
  .ex-p-ing { fill:#fff; stroke:#101216; stroke-width:2; } .ex-p-gas { fill:#fff; stroke:#8B1A1A; stroke-width:2; }
  .ex-meses { position:absolute; left:0; right:0; bottom:0; height:44px; }
  .ex-meses div { position:absolute; transform:translateX(-50%); display:grid; justify-items:center; gap:1px; font-size:11px; color:var(--text-3); white-space:nowrap; }
  .ex-meses b { font-size:11px; letter-spacing:.1em; color:var(--text-2); font-weight:600; } .ex-meses div.actual b { color:var(--text); }
  .ex-meses em { font-style:normal; font-weight:600; font-size:11.5px; } .ex-meses em.pos { color:var(--ok); } .ex-meses em.neg { color:var(--neg); }
  .ex-empresas { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
  .ex-empresa { text-align:left; font:inherit; color:inherit; cursor:pointer; background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--shadow); padding:18px 20px;
    display:grid; gap:4px; position:relative; overflow:hidden; transition:border-color .15s, box-shadow .15s, transform .15s; }
  .ex-empresa::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--c); }
  .ex-empresa:hover { border-color:var(--border-2); box-shadow:var(--shadow-2); transform:translateY(-1px); }
  .ex-empresa-nom { display:flex; align-items:center; gap:8px; font-weight:600; font-size:13.5px; } .ex-empresa-nom i { width:8px; height:8px; border-radius:2px; background:var(--c); }
  .ex-empresa strong { font-size:26px; font-weight:600; letter-spacing:-.03em; margin-top:6px; font-feature-settings:"tnum"; }
  .ex-empresa dl { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0 2px; } .ex-empresa dt { font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); font-weight:600; }
  .ex-empresa dd { margin:2px 0 0; font-weight:600; font-feature-settings:"tnum"; }
  .ex-margen { height:4px; background:#EFEDE7; border-radius:99px; overflow:hidden; margin-top:6px; } .ex-margen span { display:block; height:100%; background:var(--c); border-radius:99px; }
  .ex-ver { font-size:12px; color:var(--text-3); margin-top:8px; } .ex-empresa:hover .ex-ver { color:var(--text); }
  .ex-pila { display:flex; height:10px; border-radius:99px; overflow:hidden; gap:2px; margin:2px 0 16px; } .ex-pila span { display:block; }
  .ex-lista { list-style:none; margin:0; padding:0; display:grid; }
  .ex-lista li { display:grid; grid-template-columns:minmax(0,1fr) 48px auto; align-items:center; gap:12px; padding:9px 0; border-top:1px solid #EFEDE7; font-size:13.5px; }
  .ex-lista li:first-child { border-top:0; }
  .ex-lista li > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .ex-lista li i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:9px; }
  .ex-lista em { font-style:normal; color:var(--text-3); text-align:right; font-size:12.5px; font-feature-settings:"tnum"; }
  .ex-lista b { font-weight:600; font-feature-settings:"tnum"; text-align:right; }
  .ex-lista li.clic { cursor:pointer; border-radius:8px; } .ex-lista li.clic:hover > span:first-child, .ex-lista li.activa > span:first-child { text-decoration:underline; text-underline-offset:3px; }
  .ex-barras li { grid-template-columns:minmax(0,1fr) 48px auto; row-gap:6px; }
  .ex-pista { grid-column:1 / -1; height:4px; background:#EFEDE7; border-radius:99px; overflow:hidden; } .ex-pista span { display:block; height:100%; background:#8B1A1A; border-radius:99px; opacity:.85; }
  .ex-fuente { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--text-2); white-space:nowrap; } .ex-fuente i { width:7px; height:7px; border-radius:2px; }
  .ex-mas { display:flex; justify-content:center; padding:16px 0 0; margin-top:16px; border-top:1px solid #EFEDE7; }
  @media (max-width:1100px) { .ex-hero { grid-template-columns:minmax(0,1fr); } }
  @media (max-width:760px) {
    .ex-meta { display:none; } .ex-controles .segmento { width:100%; } .ex-controles .segmento button { flex:1; } .ex-controles .filtros { width:100%; }
    .ex-mini { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .ex-kpi { padding:12px 14px 10px; } .ex-kpi strong { font-size:18px; }
    .ex-meses span { display:none; } .ex-flujo-g { padding-bottom:34px; }
    .ex-util { padding:20px; }
  }`;
  document.head.appendChild(e);
}

// ---------- captura ----------
function nuevoIngreso() {
  const emps = estado.empresas;
  const opcCentros = (empId) => estado.centros.filter((c) => c.empresa_id === empId && !['socio', 'personal'].includes(c.tipo))
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
      <div id="ing-cxc"></div>
      <label>Concepto<input name="concepto" required maxlength="200" placeholder="Ej. Anticipo de obra"></label>
      <label>Cliente<input name="cliente" maxlength="120"></label>
      <div class="form-2">
        <label>Categoría<select name="categoria">${CATEGORIAS_INGRESO.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <label>Forma de cobro<select name="forma">${FORMAS_COBRO.map((f) => `<option>${f}</option>`).join('')}</select></label>
      </div>
      <label>Notas<textarea name="notas" rows="2"></textarea></label>
      <label class="check-linea"><input type="checkbox" name="recibo" checked> Generar recibo en PDF al guardar</label>
    </form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="ing-ok">Guardar ingreso</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#f-ing');
  if (st.empresa) { f.empresa.value = st.empresa; f.centro.innerHTML = `<option value="">— General —</option>${opcCentros(st.empresa)}`; }
  // Si el centro es una obra con cliente (cuenta por cobrar de venta), el cobro se abona a esa cuenta:
  // así baja el saldo del cliente en Obras y no queda como ingreso suelto.
  let cuentas = [];
  const verCuentas = async () => {
    const caja = modal.querySelector('#ing-cxc');
    cuentas = [];
    caja.innerHTML = '';
    if (!f.centro.value) return;
    const { data } = await db().from('v_saldos_cxc').select('id, cliente, saldo, monto_original').eq('centro_id', f.centro.value).eq('tipo', 'venta');
    cuentas = data || [];
    if (!cuentas.length) return;
    caja.innerHTML = `<label>Abonar a la cuenta de<select name="cxc">${cuentas.map((c) =>
        `<option value="${c.id}">${esc(c.cliente)} · le falta ${fmt(c.saldo)}</option>`).join('')}
        <option value="">No, es otro ingreso (no abona a la obra)</option></select></label>
      <p class="nota">Se registra como pago del cliente: baja su saldo en Obras y cuenta como ingreso de "Obras y construcción".</p>`;
    if (!f.concepto.value) f.concepto.value = 'Pago de obra';
    if (!f.cliente.value) f.cliente.value = cuentas[0].cliente;
    f.cxc.addEventListener('change', () => { const c = cuentas.find((x) => x.id === f.cxc.value); if (c) f.cliente.value = c.cliente; });
  };
  f.empresa.addEventListener('change', () => { f.centro.innerHTML = `<option value="">— General —</option>${opcCentros(f.empresa.value)}`; verCuentas(); });
  f.centro.addEventListener('change', verCuentas);
  modal.querySelector('#ing-ok').addEventListener('click', async (ev) => {
    if (!f.reportValidity()) return;
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
    const cxc = f.cxc?.value;
    // La ventana del recibo se abre al tocar el botón (si no, el navegador la bloquea) y se llena al guardar
    const ventana = f.recibo.checked ? abrirVentanaRecibo() : null;
    const folio = f.recibo.checked ? (await db().rpc('siguiente_folio_empresa', { p_empresa: f.empresa.value, p_fecha: f.fecha.value })).data || null : null;
    const { error } = cxc ? await db().from('pagos').insert({
      org_id: estado.miembro.org_id, empresa_id: f.empresa.value, centro_id: f.centro.value, cxc_id: cxc, concepto: 'venta',
      fecha: f.fecha.value, monto: Number(f.monto.value), forma_pago: f.forma.value,
      notas: [f.concepto.value.trim(), f.notas.value.trim()].filter(Boolean).join(' · ') || null, capturado_por: estado.miembro.nombre, folio,
    }) : await db().from('ingresos').insert({
      org_id: estado.miembro.org_id, empresa_id: f.empresa.value, centro_id: f.centro.value || null,
      fecha: f.fecha.value, monto: Number(f.monto.value), concepto: f.concepto.value.trim(),
      cliente: f.cliente.value.trim() || null, categoria: f.categoria.value, forma_pago: f.forma.value,
      notas: f.notas.value.trim() || null, creado_por: estado.user.id, capturado_por: estado.miembro.nombre, folio,
    });
    btn.disabled = false; btn.textContent = 'Guardar ingreso';
    if (error) { ventana?.close(); return toast('No se pudo guardar: ' + error.message, true); }
    if (f.recibo.checked) {
      if (ventana) {
        const cuenta = cxc && cuentas.find((c) => c.id === cxc);
        reciboIngreso(ventana, {
          empresaId: f.empresa.value, centroId: f.centro.value, folio, fecha: f.fecha.value, monto: Number(f.monto.value),
          concepto: f.concepto.value.trim(), cliente: f.cliente.value.trim() || cuenta?.cliente || '', forma: f.forma.value,
          notas: f.notas.value.trim(), saldo: cuenta ? Math.max(0, Number(cuenta.saldo) - Number(f.monto.value)) : null,
        });
      } else toast('El navegador bloqueó la ventana del recibo. Permite ventanas emergentes para app.medco.mx.', true);
    }
    cerrarModal(); toast(cxc ? 'Abono registrado en la cuenta del cliente' : 'Ingreso registrado');
    const d = f.fecha.value; st.anio = +d.slice(0, 4); st.mes = +d.slice(5, 7) - 1;
    raiz.querySelector('#i-mes').value = st.mes; raiz.querySelector('#i-anio').value = st.anio;
    cargar();
  });
}

// Recibo de un ingreso ya guardado: usa su folio, o le asigna uno la primera vez
async function volverARecibo(id) {
  const r = ingresos.find((x) => x.id === id)?.recibo;
  if (!r) return;
  if (r.tabla === 'pagos' && r.abono) return reciboDeAbono(r.id);
  const w = abrirVentanaRecibo();
  if (!w) return toast('El navegador bloqueó la ventana del recibo. Permite ventanas emergentes para app.medco.mx.', true);
  if (!r.folio) {
    const { data } = await db().rpc('siguiente_folio_empresa', { p_empresa: r.empresaId, p_fecha: r.fecha });
    if (data) { r.folio = data; await db().from(r.tabla).update({ folio: data }).eq('id', r.id); }
  }
  reciboIngreso(w, { ...r, saldo: null });
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
