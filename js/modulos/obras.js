// Obras de MEDCO: por cada obra, cuánto vale, cuánto ha cobrado, cuánto ha costado (pagado + pedido por pagar)
// y cuánto deja. Una obra es un centro de tipo "obra"; su cliente es una cuenta por cobrar de tipo venta.
import { CATEGORIAS, MARCA } from '../config.js';
// Cómo se le dice a una obra en esta instalación (Treme/MEDCO: obra; el demo de válvulas: proyecto)
const [OBRA, OBRAS] = MARCA.palabraObra || ['obra', 'obras'];
const may = (t) => t[0].toUpperCase() + t.slice(1);
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
  if (!centros.length) { raiz.innerHTML = `<div class="vacio">No hay ${OBRAS} registradas.</div>`; return; }
  const ids = centros.map((c) => c.id);
  const [x, p, g] = await Promise.all([
    db().from('cuentas_por_cobrar').select('id, centro_id, cliente, monto_original, notas').eq('tipo', 'venta').in('centro_id', ids),
    todo(() => db().from('pagos').select('id, cxc_id, centro_id, fecha, monto, forma_pago, notas').eq('concepto', 'venta').in('centro_id', ids)),
    todo(() => db().from('gastos').select('id, centro_id, fecha, monto, concepto, proveedor, categoria, estado, fecha_vencimiento, fecha_pago').in('centro_id', ids)),
  ]);
  const err = x.error || p.error || g.error;
  if (err) { toast(`No se pudieron cargar las ${OBRAS}: ` + err.message, true); return; }

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

function pintar() {
  // Arriba: en el resumen solo la nota; dentro de una obra, "← Todas" y un selector para brincar a otra
  raiz.innerHTML = `
    <div class="sub-head">
      ${st.obra ? `<div class="filtros"><button class="btn btn-ghost" id="o-volver">← ${OBRA === 'obra' ? 'Todas las' : 'Todos los'} ${OBRAS}</button>
        <select id="o-sel" aria-label="${may(OBRA)}">${obras.map((o) => `<option value="${o.c.id}" ${o.c.id === st.obra ? 'selected' : ''}>${esc(o.c.nombre)}</option>`).join('')}</select></div>`
        : `<div class="sub-meta">${obras.length} ${OBRAS} · toca ${OBRA === 'obra' ? 'una' : 'uno'} para ver su detalle</div>`}
      <div class="sub-meta">Costo = lo pagado + lo pedido por pagar</div>
    </div>
    <div id="o-cuerpo"></div>`;
  raiz.querySelector('#o-volver')?.addEventListener('click', () => { st.obra = ''; pintar(); });
  raiz.querySelector('#o-sel')?.addEventListener('change', (e) => { st.obra = e.target.value; pintar(); });
  const el = raiz.querySelector('#o-cuerpo');
  const o = obras.find((x) => x.c.id === st.obra);
  o ? detalle(el, o) : resumen(el);
}

function resumen(el) {
  const t = (k) => obras.reduce((s, o) => s + o[k], 0);
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Valor de ${OBRA === 'obra' ? 'las' : 'los'} ${OBRAS}</span><strong>${fmt(t('precio'))}</strong><small>${obras.length} ${OBRAS}</small></div>
      <div class="kpi"><span>Cobrado</span><strong class="pos">${fmt(t('cobrado'))}</strong><small>falta cobrar ${fmt(t('porCobrar'))}</small></div>
      <div class="kpi"><span>Costo</span><strong class="neg">${fmt(t('costo'))}</strong><small>${fmt(t('porPagar'))} por pagar a proveedores</small></div>
      <div class="kpi"><span>Utilidad al terminar</span><strong class="${t('utilidadFinal') >= 0 ? 'pos' : 'neg'}">${fmt(t('utilidadFinal'))}</strong><small>valor − costo a hoy</small></div>
    </div>
    <div class="obras-grid">${obras.map((o) => {
      const pc = pct(o.cobrado, o.precio), pk = pct(o.costo, o.precio);
      const [titulo, sub] = o.c.nombre.includes(' · ') ? o.c.nombre.split(' · ') : [o.c.nombre, ''];
      return `<button type="button" class="obra-card" data-ir="${o.c.id}">
        <div class="obra-top"><div><b>${esc(titulo)}</b><small>${esc(o.cxc.map((r) => r.cliente).join(', ') || sub || 'Sin cliente')}</small></div>
          ${pc >= 100 ? '<span class="tag tag-ok">Cobrado</span>' : o.porPagar ? '<span class="tag tag-aviso">Por pagar</span>' : ''}</div>
        <div class="obra-valor">${o.precio ? fmt(o.precio) : '—'}<small>valor</small></div>
        <div class="obra-barra"><span>Cobrado</span><i><em class="pos" style="width:${pc}%"></em></i><b>${pc}%</b></div>
        <div class="obra-barra"><span>Costo</span><i><em class="neg" style="width:${pk}%"></em></i><b>${pk}%</b></div>
        <div class="obra-pie"><span>Utilidad al terminar</span><b class="${o.utilidadFinal >= 0 ? 'pos' : 'neg'}">${fmt(o.utilidadFinal)}</b>${o.margen != null ? `<small>${o.margen}%</small>` : ''}</div>
      </button>`;
    }).join('')}</div>
    <p class="nota">"Utilidad al terminar" = lo que vale ${OBRA === 'obra' ? 'la' : 'el'} ${OBRA} menos lo que lleva costando hoy. Los gastos que todavía falten por hacer la irán bajando.</p>`;
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { st.obra = b.dataset.ir; pintar(); window.scrollTo(0, 0); }));
}

function detalle(el, o) {
  const cats = new Map();
  o.gastos.forEach((g) => cats.set(g.categoria || 'Otros', (cats.get(g.categoria || 'Otros') || 0) + Number(g.monto)));
  const catFilas = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = catFilas[0]?.[1] || 1;
  const provs = new Map();
  // La raya y el IMSS ya aparecen en su categoría (costo por categoría); aquí solo proveedores.
  o.gastos.filter((g) => !['Nómina', 'Seguro social e ISN'].includes(g.categoria))
    .forEach((g) => provs.set(g.proveedor || 'Sin proveedor', (provs.get(g.proveedor || 'Sin proveedor') || 0) + Number(g.monto)));
  const provFilas = [...provs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxProv = provFilas[0]?.[1] || 1;
  const pendientes = o.gastos.filter((g) => g.estado === 'por_pagar');
  const hoy = hoyISO();

  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Valor ${OBRA === 'obra' ? 'de la' : 'del'} ${OBRA}</span><strong>${o.precio ? fmt(o.precio) : '—'}</strong><small>${esc(o.cxc.map((r) => r.cliente).join(', ') || 'Sin cliente registrado')}</small></div>
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
      <section class="panel"><h3>Principales proveedores <small class="sub-meta">sin nómina ni IMSS</small></h3>
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
