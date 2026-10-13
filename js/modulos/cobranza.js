// Cobranza de Torre Elysium: mantenimiento y luz por unidad y por mes.
// Reemplaza la página "Cobranza Elysium".
import { MESES, FORMAS_COBRO } from '../config.js';
import { db, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal } from '../lib.js';

const CONCEPTOS = {
  mantenimiento: { titulo: 'Mantenimiento', icono: '🏠' },
  luz:           { titulo: 'Luz (CFE)',     icono: '⚡' },
};
const CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const TIPO_UNIDAD = { local: 'Local', depto: 'Depto', oficina: 'Oficina', bodega: 'Bodega', casa: 'Casa', terreno: 'Terreno', otro: '' };

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
    db().from('cuotas').select('id, unidad_id, concepto, monto, activo, en_padron').in('concepto', ['mantenimiento', 'luz']),
    db().from('pagos').select('id, unidad_id, concepto, periodo, monto, forma_pago, fecha, notas, capturado_por')
      .eq('centro_id', centro.id).in('concepto', ['mantenimiento', 'luz'])
      .gte('periodo', desde).lt('periodo', hasta).limit(10000),
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
  const sugerido = r.pagado(m) > 0 ? '' : Number(r.cuota.monto);
  const modal = abrirModal({
    titulo: `${CONCEPTOS[concepto].titulo} · ${etiquetaUnidad(r.u)} · ${MESES[m]}`,
    cuerpo: `<form class="form" id="pf" novalidate>
      <p class="nota">${esc(r.u.ocupante || '')}${r.pagado(m) ? ` · ya tiene ${fmt(r.pagado(m))} registrado este mes` : ''}</p>
      <div class="form-2">
        <label>Monto recibido<input type="number" name="monto" min="0.01" step="0.01" inputmode="decimal" value="${sugerido}" required></label>
        <label>Fecha de pago<input type="date" name="fecha" value="${hoyISO()}" required></label>
      </div>
      <label>Forma de pago<select name="forma">${FORMAS_COBRO.map((f) => `<option>${f}</option>`).join('')}</select></label>
      <label>Nota <small>(opcional)</small><input name="nota" maxlength="200"></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="pf-no">Cancelar</button><button class="btn btn-primary" id="pf-si">Guardar pago</button>`,
  });
  const f = modal.querySelector('#pf');
  modal.querySelector('#pf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#pf-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const monto = Number(f.monto.value);
    if (!(monto > 0)) return toast('Escribe el monto recibido', true);
    if (!f.fecha.value) return toast('Pon la fecha de pago', true);
    btn.disabled = true; btn.textContent = 'Guardando…';
    const { error } = await db().from('pagos').insert({
      org_id: estado.miembro.org_id, empresa_id: centro.empresa_id, centro_id: centro.id, unidad_id: r.u.id,
      concepto, periodo: `${st.anio}-${String(m + 1).padStart(2, '0')}-01`,
      monto: Math.round(monto * 100) / 100, forma_pago: f.forma.value, fecha: f.fecha.value,
      notas: f.nota.value.trim() || null, capturado_por: estado.miembro.nombre,
    });
    if (error) { btn.disabled = false; btn.textContent = 'Guardar pago'; return toast('No se pudo guardar: ' + error.message, true); }
    cerrarModal(); toast('Pago guardado ✓'); cargar();
  });
}

function verPagos(r, concepto, m) {
  const puedeBorrar = tieneRol(['administracion', 'cobranza']);
  const modal = abrirModal({
    titulo: `${etiquetaUnidad(r.u)} · ${CONCEPTOS[concepto].titulo} · ${MESES[m]}`,
    cuerpo: `<ul class="lista-pagos">${r.porMes[m].map((p) => `<li>
        <div><strong>${fmt(p.monto)}</strong> <span class="mut">${esc(formaLegible(p.forma_pago))} · ${fmtFecha(p.fecha)}</span>
          ${p.notas ? `<small>${esc(p.notas)}</small>` : ''}<small>Capturó: ${esc(p.capturado_por || '—')}</small></div>
        ${puedeBorrar ? `<button class="btn btn-sm btn-ghost peligro" data-borrar="${p.id}">Eliminar</button>` : ''}</li>`).join('')}</ul>`,
    pie: puedeBorrar ? `<button class="btn btn-ghost" id="vp-otro">＋ Registrar otro pago</button><button class="btn btn-primary" id="vp-ok">Listo</button>` : '',
  });
  modal.querySelector('#vp-ok')?.addEventListener('click', cerrarModal);
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
