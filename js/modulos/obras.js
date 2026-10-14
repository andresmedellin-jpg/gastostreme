// Obras de MEDCO: por cada obra, cuánto vale, cuánto ha cobrado, cuánto ha costado (pagado + pedido por pagar)
// y cuánto deja. Una obra es un centro de tipo "obra"; su cliente es una cuenta por cobrar de tipo venta.
import { CATEGORIAS } from '../config.js';
import { db, todo, estado, fmt, fmtFecha, hoyISO, esc, toast } from '../lib.js';

const st = { obra: '' };          // '' = resumen de todas
let raiz, obras = [];

export async function render(view) {
  raiz = view;
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  await cargar();
}

async function cargar() {
  const centros = estado.centros.filter((c) => c.tipo === 'obra');
  if (!centros.length) { raiz.innerHTML = '<div class="vacio">No hay obras registradas.</div>'; return; }
  const ids = centros.map((c) => c.id);
  const [x, p, g] = await Promise.all([
    db().from('cuentas_por_cobrar').select('id, centro_id, cliente, monto_original, notas').eq('tipo', 'venta').in('centro_id', ids),
    todo(() => db().from('pagos').select('id, cxc_id, centro_id, fecha, monto, forma_pago, notas').eq('concepto', 'venta').in('centro_id', ids)),
    todo(() => db().from('gastos').select('id, centro_id, fecha, monto, concepto, proveedor, categoria, estado, fecha_vencimiento, fecha_pago').in('centro_id', ids)),
  ]);
  const err = x.error || p.error || g.error;
  if (err) { toast('No se pudieron cargar las obras: ' + err.message, true); return; }

  obras = centros.map((c) => {
    const cxc = x.data.filter((r) => r.centro_id === c.id);
    const cobros = p.data.filter((r) => r.centro_id === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const gastos = g.data.filter((r) => r.centro_id === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const precio = cxc.reduce((s, r) => s + Number(r.monto_original || 0), 0);
    const cobrado = cobros.reduce((s, r) => s + Number(r.monto), 0);
    const pagado = gastos.filter((r) => r.estado !== 'por_pagar').reduce((s, r) => s + Number(r.monto), 0);
    const porPagar = gastos.filter((r) => r.estado === 'por_pagar').reduce((s, r) => s + Number(r.monto), 0);
    const costo = pagado + porPagar;
    return { c, cxc, cobros, gastos, precio, cobrado, porCobrar: precio - cobrado, pagado, porPagar, costo,
             utilidadHoy: cobrado - costo, utilidadFinal: precio - costo,
             margen: precio ? Math.round((precio - costo) / precio * 100) : null };
  }).sort((a, b) => b.precio - a.precio);
  pintar();
}

const pct = (a, b) => (b ? Math.min(100, Math.round(a / b * 100)) : 0);
const signo = (v) => `<b class="${v >= 0 ? 'pos' : 'neg'}">${fmt(v)}</b>`;

function pintar() {
  raiz.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        <button role="tab" data-obra="">Todas</button>
        ${obras.map((o) => `<button role="tab" data-obra="${o.c.id}">${esc(o.c.nombre)}</button>`).join('')}
      </div>
      <div class="sub-meta">Costo = lo pagado + lo pedido por pagar</div>
    </div>
    <div id="o-cuerpo"></div>`;
  raiz.querySelectorAll('[data-obra]').forEach((b) => {
    b.setAttribute('aria-selected', b.dataset.obra === st.obra);
    b.addEventListener('click', () => { st.obra = b.dataset.obra; pintar(); });
  });
  const el = raiz.querySelector('#o-cuerpo');
  const o = obras.find((x) => x.c.id === st.obra);
  o ? detalle(el, o) : resumen(el);
}

function resumen(el) {
  const t = (k) => obras.reduce((s, o) => s + o[k], 0);
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Valor de las obras</span><strong>${fmt(t('precio'))}</strong><small>${obras.length} obras</small></div>
      <div class="kpi"><span>Cobrado</span><strong class="pos">${fmt(t('cobrado'))}</strong><small>falta cobrar ${fmt(t('porCobrar'))}</small></div>
      <div class="kpi"><span>Costo</span><strong class="neg">${fmt(t('costo'))}</strong><small>${fmt(t('porPagar'))} por pagar a proveedores</small></div>
      <div class="kpi"><span>Utilidad al terminar</span><strong class="${t('utilidadFinal') >= 0 ? 'pos' : 'neg'}">${fmt(t('utilidadFinal'))}</strong><small>valor − costo a hoy</small></div>
    </div>
    <section class="panel">
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Obra</th><th>Cliente</th><th class="num">Valor</th><th class="num">Cobrado</th><th class="num">Por cobrar</th>
          <th class="num">Pagado</th><th class="num">Por pagar</th><th class="num">Utilidad al terminar</th></tr></thead>
        <tbody>${obras.map((o) => `<tr class="clic" data-ir="${o.c.id}" tabindex="0">
          <td data-l="Obra"><b>${esc(o.c.nombre)}</b></td>
          <td data-l="Cliente">${esc(o.cxc.map((r) => r.cliente).join(', ') || '—')}</td>
          <td class="num" data-l="Valor">${o.precio ? fmt(o.precio) : '—'}</td>
          <td class="num pos" data-l="Cobrado">${fmt(o.cobrado)}<small class="sub">${pct(o.cobrado, o.precio)}%</small></td>
          <td class="num" data-l="Por cobrar">${fmt(o.porCobrar)}</td>
          <td class="num" data-l="Pagado">${fmt(o.pagado)}</td>
          <td class="num ${o.porPagar ? 'neg' : 'mut'}" data-l="Por pagar">${fmt(o.porPagar)}</td>
          <td class="num" data-l="Utilidad">${signo(o.utilidadFinal)}${o.margen != null ? `<small class="sub">${o.margen}% de margen</small>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>
    <p class="nota">"Utilidad al terminar" = lo que vale la obra menos lo que lleva costando hoy. Los gastos que todavía falten por hacer la irán bajando.</p>`;
  el.querySelectorAll('[data-ir]').forEach((tr) => {
    const ir = () => { st.obra = tr.dataset.ir; pintar(); };
    tr.addEventListener('click', ir);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
  });
}

function detalle(el, o) {
  const cats = new Map();
  o.gastos.forEach((g) => cats.set(g.categoria || 'General', (cats.get(g.categoria || 'General') || 0) + Number(g.monto)));
  const catFilas = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = catFilas[0]?.[1] || 1;
  const provs = new Map();
  o.gastos.forEach((g) => provs.set(g.proveedor || 'Sin proveedor', (provs.get(g.proveedor || 'Sin proveedor') || 0) + Number(g.monto)));
  const provFilas = [...provs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxProv = provFilas[0]?.[1] || 1;
  const pendientes = o.gastos.filter((g) => g.estado === 'por_pagar');
  const hoy = hoyISO();

  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Valor de la obra</span><strong>${o.precio ? fmt(o.precio) : '—'}</strong><small>${esc(o.cxc.map((r) => r.cliente).join(', ') || 'Sin cliente registrado')}</small></div>
      <div class="kpi"><span>Cobrado</span><strong class="pos">${fmt(o.cobrado)}</strong><small>${pct(o.cobrado, o.precio)}% · faltan ${fmt(o.porCobrar)}</small></div>
      <div class="kpi"><span>Costo a hoy</span><strong class="neg">${fmt(o.costo)}</strong><small>${fmt(o.pagado)} pagado + ${fmt(o.porPagar)} por pagar</small></div>
      <div class="kpi"><span>Utilidad al terminar</span><strong class="${o.utilidadFinal >= 0 ? 'pos' : 'neg'}">${fmt(o.utilidadFinal)}</strong>
        <small>${o.margen != null ? o.margen + '% de margen · ' : ''}hoy: ${fmt(o.utilidadHoy)}</small></div>
    </div>

    <section class="panel">
      <h3>Avance</h3>
      <ul class="barras">
        <li><span class="barra-nombre">Cobrado al cliente</span><span class="barra-pista"><span class="pos" style="width:${pct(o.cobrado, o.precio)}%"></span></span><span class="barra-monto">${pct(o.cobrado, o.precio)}%</span></li>
        <li><span class="barra-nombre">Costo vs. valor</span><span class="barra-pista"><span class="neg" style="width:${pct(o.costo, o.precio)}%"></span></span><span class="barra-monto">${pct(o.costo, o.precio)}%</span></li>
      </ul>
    </section>

    ${pendientes.length ? `<section class="panel">
      <div class="panel-head"><h3>Pedidos por pagar · ${fmt(o.porPagar)}</h3><span class="sub-meta">Se marcan como pagados en Gastos</span></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Vence</th><th>Concepto</th><th>Proveedor</th><th class="num">Monto</th></tr></thead>
        <tbody>${pendientes.map((g) => `<tr>
          <td class="mut nowrap" data-l="Pedido">${fmtFecha(g.fecha)}</td>
          <td class="nowrap ${g.fecha_vencimiento && g.fecha_vencimiento < hoy ? 'neg fuerte' : 'mut'}" data-l="Vence">${g.fecha_vencimiento ? fmtFecha(g.fecha_vencimiento) : '—'}</td>
          <td class="concepto" data-l="Concepto">${esc(g.concepto)}</td>
          <td class="mut" data-l="Proveedor">${esc(g.proveedor || '—')}</td>
          <td class="num fuerte" data-l="Monto">${fmt(g.monto)}</td></tr>`).join('')}</tbody>
      </table></div></section>` : ''}

    <div class="grid-2">
      <section class="panel"><h3>Costo por categoría</h3>
        ${catFilas.length ? `<ul class="barras">${catFilas.map(([k, v]) => `<li><span class="barra-nombre">${CATEGORIAS[k] || '•'} ${esc(k)}</span>
          <span class="barra-pista"><span style="width:${Math.max(2, v / maxCat * 100)}%"></span></span><span class="barra-monto">${fmt(v)}</span></li>`).join('')}</ul>`
          : '<div class="vacio">Sin gastos registrados</div>'}
      </section>
      <section class="panel"><h3>Principales proveedores</h3>
        ${provFilas.length ? `<ul class="barras">${provFilas.map(([k, v]) => `<li><span class="barra-nombre">${esc(k)}</span>
          <span class="barra-pista"><span style="width:${Math.max(2, v / maxProv * 100)}%"></span></span><span class="barra-monto">${fmt(v)}</span></li>`).join('')}</ul>`
          : '<div class="vacio">Sin gastos registrados</div>'}
      </section>
    </div>

    <div class="grid-2">
      <section class="panel"><h3>Cobros del cliente · ${o.cobros.length}</h3>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Forma</th><th class="num">Monto</th></tr></thead>
          <tbody>${o.cobros.map((r) => `<tr><td data-l="Fecha" title="${esc(r.notas || '')}">${fmtFecha(r.fecha)}</td>
            <td class="mut" data-l="Forma">${esc(r.forma_pago || '—')}</td><td class="num pos" data-l="Monto">${fmt(r.monto)}</td></tr>`).join('')
            || '<tr><td colspan="3" class="vacio">Sin cobros</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="panel"><h3>Últimos gastos</h3>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Monto</th></tr></thead>
          <tbody>${o.gastos.slice(0, 15).map((g) => `<tr><td class="mut nowrap" data-l="Fecha">${fmtFecha(g.fecha)}</td>
            <td class="concepto" data-l="Concepto">${esc(g.concepto)}${g.estado === 'por_pagar' ? ' <span class="tag tag-aviso">Por pagar</span>' : ''}<small class="sub">${esc(g.proveedor || '')}</small></td>
            <td class="num fuerte" data-l="Monto">${fmt(g.monto)}</td></tr>`).join('')
            || '<tr><td colspan="3" class="vacio">Sin gastos</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>`;
}
