// Obras de MEDCO: por cada obra, cuánto vale, cuánto ha cobrado, cuánto ha costado (pagado + pedido por pagar)
// y cuánto deja. Una obra es un centro de tipo "obra"; su cliente es una cuenta por cobrar de tipo venta.
import { CATEGORIAS, MARCA , catIco } from '../config.js';
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
    </div>
    <div id="o-cuerpo"></div>`;
  raiz.querySelector('#o-volver')?.addEventListener('click', () => { st.obra = ''; pintar(); });
  raiz.querySelector('#o-sel')?.addEventListener('change', (e) => { st.obra = e.target.value; pintar(); });
  const el = raiz.querySelector('#o-cuerpo');
  const o = obras.find((x) => x.c.id === st.obra);
  o ? detalle(el, o) : resumen(el);
}

// Curva acumulada de una obra: lo cobrado contra lo que ha costado, mes a mes
function curva(o, w = 300, h = 84) {
  const fechas = [...o.cobros.map((r) => r.fecha), ...o.gastos.map((g) => g.fecha)].filter(Boolean).sort();
  if (!fechas.length) return '<div class="ob-sin">Sin movimientos</div>';
  const ini = new Date(fechas[0].slice(0, 7) + '-01T12:00:00'), fin = new Date();
  const meses = []; for (let d = new Date(ini); d <= fin; d.setMonth(d.getMonth() + 1)) meses.push(d.toISOString().slice(0, 7));
  let c = 0, k = 0;
  const serie = meses.map((mm) => {
    c += o.cobros.filter((r) => r.fecha.slice(0, 7) === mm).reduce((s2, r) => s2 + Number(r.monto), 0);
    k += o.gastos.filter((g) => g.fecha.slice(0, 7) === mm).reduce((s2, g) => s2 + Number(g.monto), 0);
    return [c, k];
  });
  const max = Math.max(o.precio, ...serie.flat(), 1), n = Math.max(1, serie.length - 1);
  const pts = (i) => serie.map((v, j) => `${(j / n * w).toFixed(1)},${(h - v[i] / max * (h - 6) - 3).toFixed(1)}`).join(' ');
  const yv = (h - o.precio / max * (h - 6) - 3).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" class="ob-curva" preserveAspectRatio="none" aria-hidden="true">
    ${o.precio ? `<line x1="0" x2="${w}" y1="${yv}" y2="${yv}" class="ob-v"/>` : ''}
    <polyline points="0,${h} ${pts(0)} ${w},${h}" class="ob-ca"/><polyline points="${pts(0)}" class="ob-c"/><polyline points="${pts(1)}" class="ob-k"/></svg>
    <div class="ob-ejes"><span>${fmtFecha(meses[0] + '-01').slice(3)}</span><span>hoy</span></div>`;
}

function resumen(el) {
  const t = (k) => obras.reduce((s, o) => s + o[k], 0);
  const caja = t('cobrado') - t('pagado');
  el.innerHTML = `
    <section class="ob-hero">
      <div><span>Valor de ${OBRA === 'obra' ? 'las' : 'los'} ${OBRAS}</span><strong>${fmt(t('precio'))}</strong><small>${obras.length} ${OBRAS} en curso</small></div>
      <div><span>Utilidad esperada</span><strong class="${t('utilidadFinal') >= 0 ? 'pos' : 'neg'}">${fmt(t('utilidadFinal'))}</strong><small>${t('precio') ? Math.round(t('utilidadFinal') / t('precio') * 100) + ' % de margen' : ''} · si no hay más costos</small></div>
      <div><span>Falta cobrar</span><strong>${fmt(t('porCobrar'))}</strong><small>de ${fmt(t('precio'))}</small></div>
      <div><span>Por pagar a proveedores</span><strong class="${t('porPagar') ? 'neg' : ''}">${fmt(t('porPagar'))}</strong><small>pedidos ya hechos</small></div>
      <div><span>Caja de las ${OBRAS}</span><strong class="${caja >= 0 ? 'pos' : 'neg'}">${fmt(caja)}</strong><small>${caja >= 0 ? 'el cliente va adelante de lo gastado' : 'MEDCO está poniendo dinero'}</small></div>
    </section>
    <div class="ob-lista">${obras.map((o) => {
      const [titulo, sub] = o.c.nombre.includes(' · ') ? o.c.nombre.split(' · ') : [o.c.nombre, ''];
      const pc = pct(o.cobrado, o.precio), pp = pct(o.pagado, o.precio), pk = pct(o.porPagar, o.precio);
      const cj = o.cobrado - o.pagado;
      const ult = [...o.cobros, ...o.gastos].map((x) => x.fecha).sort().pop();
      return `<article class="ob-fila" data-ir="${o.c.id}" tabindex="0" role="button">
        <div class="ob-nom"><b>${esc(titulo)}</b><small>${esc(o.cxc.map((r) => r.cliente).join(', ') || sub || 'Sin cliente')}</small>
          <span class="ob-marg ${o.margen == null ? '' : o.margen < 15 ? 'mal' : o.margen < 30 ? 'aviso' : 'ok'}">${o.margen == null ? 'Sin valor' : `Margen ${o.margen} %`}</span>
          ${ult ? `<small>Último movimiento ${fmtFecha(ult)}</small>` : ''}</div>
        <div class="ob-mid">
          <div class="ob-bar-t"><span>Valor ${fmt(o.precio)}</span><span>${pc} % cobrado</span></div>
          <div class="ob-bar"><i class="c" style="width:${pc}%"></i></div>
          <div class="ob-bar k"><i class="p" style="width:${pp}%"></i><i class="pp" style="width:${pk}%"></i></div>
          <div class="ob-bar-t"><span>Costo ${fmt(o.costo)}</span><span>${pct(o.costo, o.precio)} % del valor</span></div>
          <div class="ob-ley"><span><i class="c"></i>Cobrado</span><span><i class="p"></i>Pagado</span><span><i class="pp"></i>Por pagar</span></div>
        </div>
        <div class="ob-graf">${curva(o)}</div>
        <dl class="ob-num">
          <div><dt>Utilidad esperada</dt><dd class="${o.utilidadFinal >= 0 ? 'pos' : 'neg'}">${fmt(o.utilidadFinal)}</dd></div>
          <div><dt>Falta cobrar</dt><dd>${fmt(o.porCobrar)}</dd></div>
          <div><dt>Caja de la obra</dt><dd class="${cj >= 0 ? '' : 'neg'}">${fmt(cj)}</dd></div>
        </dl>
      </article>`;
    }).join('')}</div>
    <p class="nota">Utilidad esperada = valor de la ${OBRA} − costo a hoy (pagado + pedidos por pagar); los costos que falten la irán bajando. Caja = lo cobrado − lo pagado. En la gráfica: verde lo cobrado acumulado, negro el costo acumulado y la línea punteada el valor.</p>`;
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
        ${catFilas.length ? `<ul class="barras">${catFilas.map(([k, v]) => `<li><span class="barra-nombre">${catIco(k)}${esc(k)}</span>
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
