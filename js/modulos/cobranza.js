// Cobranza de Torre Elysium: mantenimiento y luz por unidad y por mes.
// Reemplaza la página "Cobranza Elysium".
import { MESES, FORMAS_COBRO } from '../config.js';
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
    db().from('cuotas').select('id, unidad_id, concepto, monto, activo, en_padron').in('concepto', ['mantenimiento', 'luz']),
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
  el.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => pedirRecibo(fila(b.dataset.recibo).u, m)));
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
    pie: `<button class="btn btn-ghost" id="pf-no">Cancelar</button><button class="btn btn-ghost" id="pf-si">Guardar pago</button>
      <button class="btn btn-primary" id="pf-rec">Guardar y ver recibo</button>`,
  });
  const f = modal.querySelector('#pf');
  modal.querySelector('#pf-no').addEventListener('click', cerrarModal);
  const guardar = async (ev, conRecibo) => {
    const btn = ev.currentTarget;
    const monto = Number(f.monto.value);
    if (!(monto > 0)) return toast('Escribe el monto recibido', true);
    if (!f.fecha.value) return toast('Pon la fecha de pago', true);
    const w = conRecibo ? abrirVentana() : null;           // se abre antes de esperar, para que el navegador no la bloquee
    if (conRecibo && !w) return;
    btn.disabled = true; btn.textContent = 'Guardando…';
    const { error } = await db().from('pagos').insert({
      org_id: estado.miembro.org_id, empresa_id: centro.empresa_id, centro_id: centro.id, unidad_id: r.u.id,
      concepto, periodo: `${st.anio}-${String(m + 1).padStart(2, '0')}-01`,
      monto: Math.round(monto * 100) / 100, forma_pago: f.forma.value, fecha: f.fecha.value,
      notas: f.nota.value.trim() || null, capturado_por: estado.miembro.nombre,
    });
    if (error) {
      w?.close(); btn.disabled = false; btn.textContent = conRecibo ? 'Guardar y ver recibo' : 'Guardar pago';
      return toast('No se pudo guardar: ' + error.message, true);
    }
    cerrarModal(); toast('Pago guardado ✓');
    await cargar();
    if (conRecibo) generarRecibo(w, r.u, m, {});
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
  modal.querySelector('#vp-rec').addEventListener('click', () => pedirRecibo(r.u, m));
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
// Un recibo por unidad y mes con lo pagado de mantenimiento y luz. Folio REC-AAAAMM-NNNN,
// se guarda en los pagos para que al volver a imprimirlo salga el mismo.
const DETALLE = {
  mantenimiento: { linea: 'Cuota de Mantenimiento', texto: 'mantenimiento' },
  luz:           { linea: 'Servicio de Electricidad<br><small>(Suministro eléctrico)</small>', texto: 'servicio de luz' },
};
const nombreBonito = (s) => (s && s === s.toUpperCase())
  ? s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase()) : (s || '');
const fechaLarga = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`; };
const pagosDelMes = (unidadId, m) => pagos.filter((p) => p.unidad_id === unidadId && mesDe(p.periodo) === m);

function abrirVentana() {
  const w = window.open('', '_blank');
  if (!w) { toast('Permite ventanas emergentes para ver el recibo', true); return null; }
  w.document.write('<p style="font-family:sans-serif;padding:24px">Generando recibo…</p>');
  return w;
}

function pedirRecibo(u, m) {
  const ps = pagosDelMes(u.id, m);
  if (!ps.length) return toast('Esta unidad no tiene pagos en el mes', true);
  const puede = tieneRol(['administracion', 'cobranza']);
  const ultima = ps.map((p) => p.fecha).sort().pop();
  const suma = (k) => ps.filter((p) => p.concepto === k).reduce((s, p) => s + Number(p.monto), 0);
  const folio = ps.find((p) => p.folio)?.folio;
  const modal = abrirModal({
    titulo: `Recibo · ${etiquetaUnidad(u)} · ${MESES[m]} ${st.anio}`,
    cuerpo: `<form class="form" id="rf" novalidate>
      <label>Recibí de<input name="nombre" maxlength="120" value="${esc(nombreBonito(u.ocupante))}" required></label>
      <div class="form-2">
        <label>Tipo de unidad<select name="tipo">${Object.entries(TIPO_RECIBO).map(([k, v]) =>
          `<option value="${k}" ${u.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Fecha del recibo<input type="date" name="fecha" value="${ultima}" required></label>
      </div>
      <label>Nota <small>(opcional, sale en el recibo)</small><input name="nota" maxlength="200"></label>
      <p class="nota">${['mantenimiento', 'luz'].filter((k) => suma(k) > 0).map((k) => `${CONCEPTOS[k].titulo}: <strong>${fmt(suma(k))}</strong>`).join(' · ')}
        ${folio ? ` · Folio ${esc(folio)}` : ''}${puede ? '<br>El nombre y el tipo de unidad se guardan para la próxima vez.' : ''}</p>
    </form>`,
    pie: `<button class="btn btn-ghost" id="rf-no">Cancelar</button><button class="btn btn-primary" id="rf-si">Ver recibo / PDF</button>`,
  });
  const f = modal.querySelector('#rf');
  modal.querySelector('#rf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#rf-si').addEventListener('click', async () => {
    const nombre = f.nombre.value.trim();
    if (!nombre) return toast('Escribe a nombre de quién va el recibo', true);
    const w = abrirVentana();
    if (!w) return;
    cerrarModal();
    if (puede && (nombre !== nombreBonito(u.ocupante) || f.tipo.value !== u.tipo)) {
      const { error } = await db().from('unidades').update({ ocupante: nombre, tipo: f.tipo.value }).eq('id', u.id);
      if (!error) { u.ocupante = nombre; u.tipo = f.tipo.value; }
    }
    generarRecibo(w, u, m, { nombre, tipo: f.tipo.value, fecha: f.fecha.value, nota: f.nota.value.trim() });
  });
}

async function generarRecibo(w, u, m, op) {
  const ps = pagosDelMes(u.id, m);
  if (!ps.length) { w.close(); return toast('No hay pagos para el recibo', true); }
  // Folio: el que ya tenga el mes, o uno nuevo
  let folio = ps.find((p) => p.folio)?.folio;
  const periodo = `${st.anio}-${String(m + 1).padStart(2, '0')}-01`;
  if (!folio && tieneRol(['administracion', 'cobranza'])) {
    const { data, error } = await db().rpc('siguiente_folio_cuota', { p_org: estado.miembro.org_id, p_periodo: periodo });
    if (!error && data) {
      folio = data;
      const sinFolio = ps.filter((p) => !p.folio).map((p) => p.id);
      const { error: e2 } = await db().from('pagos').update({ folio }).in('id', sinFolio);
      if (!e2) ps.forEach((p) => { p.folio = folio; });
    }
  }
  const nombre = op.nombre || nombreBonito(u.ocupante) || '—';
  const tipo = TIPO_RECIBO[op.tipo || u.tipo] || 'Unidad';
  const unidad = `${tipo} #${u.identificador}`;
  const fecha = fechaLarga(op.fecha || ps.map((p) => p.fecha).sort().pop());
  const per = `${MESES[m]} ${st.anio}`;
  const conceptos = ['mantenimiento', 'luz'].filter((k) => ps.some((p) => p.concepto === k));
  const lineas = conceptos.map((k) => {
    const monto = ps.filter((p) => p.concepto === k).reduce((s, p) => s + Number(p.monto), 0);
    const cuota = cuotas.find((c) => c.unidad_id === u.id && c.concepto === k);
    return { k, monto, completo: !cuota || !(Number(cuota.monto) > 0) || monto >= Number(cuota.monto) };
  });
  const total = lineas.reduce((s, l) => s + l.monto, 0);
  const formas = [...new Set(ps.map((p) => formaLegible(p.forma_pago)).filter(Boolean))].join(' / ') || '—';
  const textoConcepto = 'Pago de ' + conceptos.map((k) => DETALLE[k].texto).join(' y ');
  const liquidado = lineas.every((l) => l.completo);
  const notas = [op.nota, ...new Set(ps.map((p) => p.notas).filter(Boolean))].filter(Boolean).join(' · ');
  const img = await logoTreme();
  const $ = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(nombre)} - ${esc(unidad)} - ${esc(per)}</title>
<style>
  @page{size:letter;margin:0} *{box-sizing:border-box}
  body{margin:0;background:#eef0f3;font-family:'Times New Roman',Times,Georgia,serif;color:#1a1a1a}
  .barra{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:12px;background:#1a1a1a;font-family:Arial,Helvetica,sans-serif}
  .barra button{font:600 14px Arial,Helvetica,sans-serif;padding:9px 16px;border-radius:4px;border:0;cursor:pointer}
  .hoja{width:8.5in;min-height:11in;max-width:100%;margin:24px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.1);display:flex;flex-direction:column}
  .topbar{height:10px;background:#8B1A1A}
  .c{padding:30px 50px 36px;flex:1;display:flex;flex-direction:column}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:16px;margin-bottom:20px;gap:16px}
  .head img{width:230px;max-width:45%;height:auto;object-fit:contain}
  .t{text-align:right} .t h1{font-size:22px;margin:0 0 4px;letter-spacing:1px} .t div{font-size:13px;margin:2px 0} .t b{color:#8B1A1A}
  .st{color:#8B1A1A;font-weight:bold;font-size:13px;margin:18px 0 6px;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse}
  .info td{border:1px solid #ccc;padding:8px 12px;font-size:13px} .info td.l{background:#f5f5f5;font-weight:bold;width:24%}
  .det th{background:#1a1a1a;color:#fff;padding:8px 10px;font-size:12px;text-align:left}
  .det td{border:1px solid #ccc;padding:8px 10px;font-size:13px} .det small{color:#555}
  .r{text-align:right} .ce{text-align:center}
  .det tr.s td{border:none;text-align:right;padding:5px 10px}
  .det tr.tot td{background:#1a1a1a;color:#fff;font-weight:bold;text-align:right;font-size:14px}
  .letra{font-size:12px;font-style:italic;text-align:right;margin-top:6px;color:#444}
  .estado{border:1px solid #8B1A1A;border-left:4px solid #8B1A1A;text-align:center;padding:10px;font-weight:bold;font-size:14px;letter-spacing:1px;margin:24px 0}
  .nota{font-size:12px;margin-bottom:16px} 
  .aviso{font-size:11px;font-style:italic;color:#444;border-top:1px solid #ccc;padding-top:10px;text-align:center;line-height:1.5}
  .pie{margin-top:auto;padding-top:40px;text-align:center;font-size:10px;color:#777}
  .pie div{border-top:1px solid #ccc;padding-top:10px}
  @media print{body{background:#fff}.barra{display:none}.hoja{margin:0;box-shadow:none;width:100%;min-height:auto;height:11in}}
  @media (max-width:640px){.c{padding:20px 16px}.head{flex-direction:column}.head img{max-width:70%}.t{text-align:left}}
</style></head><body>
<div class="barra"><button onclick="print()" style="background:#8B1A1A;color:#fff">Descargar PDF / Imprimir</button><button onclick="close()">Cerrar</button></div>
<div class="hoja"><div class="topbar"></div><div class="c">
  <div class="head">${img ? `<img src="${img}" alt="Grupo Inmobiliario Treme">` : '<strong style="font-size:26px">Grupo Inmobiliario Treme</strong>'}
    <div class="t"><h1>RECIBO DE PAGO</h1><div>Folio: <b>${esc(folio || '—')}</b></div><div>Fecha: ${fecha}</div></div></div>
  <div class="st">INFORMACIÓN DE PAGO</div>
  <table class="info">
    <tr><td class="l">Recibí de:</td><td>${esc(nombre)}</td></tr>
    <tr><td class="l">${esc(tipo)}:</td><td>#${esc(u.identificador)} · Torre Elysium</td></tr>
    <tr><td class="l">Concepto:</td><td>${textoConcepto}</td></tr>
    <tr><td class="l">Periodo:</td><td>${per}</td></tr>
    <tr><td class="l">Recibido por:</td><td>Administración — Grupo Inmobiliario Treme</td></tr>
    <tr><td class="l">Método de pago:</td><td>${esc(formas)}</td></tr>
  </table>
  <div class="st">DETALLE DE CONCEPTOS</div>
  <table class="det">
    <tr><th style="width:6%">#</th><th>Concepto</th><th class="ce" style="width:14%">Cantidad</th><th class="r" style="width:16%">Precio Unit.</th><th class="r" style="width:16%">Subtotal</th></tr>
    ${lineas.map((l, i) => `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${DETALLE[l.k].linea}</td><td class="ce">1 mes</td>
      <td class="r">${$(l.monto)}</td><td class="r">${$(l.monto)}</td></tr>`).join('')}
    <tr class="s"><td colspan="5">Subtotal: &nbsp; ${$(total)}</td></tr>
    <tr class="s"><td colspan="5">IVA (incluido): &nbsp; $0.00</td></tr>
    <tr class="tot"><td colspan="5">TOTAL PAGADO: &nbsp; ${$(total)}</td></tr>
  </table>
  <div class="letra">(${montoLetra(total)})</div>
  <div class="estado">${liquidado ? 'PAGO RECIBIDO — LIQUIDADO EN SU TOTALIDAD' : 'PAGO RECIBIDO'}</div>
  ${notas ? `<div class="nota"><b>Notas:</b> ${esc(notas)}</div>` : ''}
  <div class="aviso">Este recibo ampara el pago de ${conceptos.map((k) => k === 'luz' ? 'el servicio de electricidad' : 'la cuota de mantenimiento').join(' y ')}
    correspondiente${conceptos.length > 1 ? 's' : ''} al periodo indicado, para ${['Oficina','Bodega','Casa','Unidad'].includes(tipo) ? 'la' : 'el'} ${esc(unidad)} de Torre Elysium, recibido a nombre de ${esc(nombre)}.
    Para cualquier aclaración, comuníquese con el departamento de administración de Grupo Inmobiliario Treme.</div>
  <div class="pie"><div>Grupo Inmobiliario Treme · Torre Elysium, Av. Fundadores 103, Lomas de Montecristo, Monterrey, N.L.<br>
    Este recibo es comprobante de pago válido • Consérvelo para sus registros</div></div>
</div></div></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  if (folio) pintar();
}

// Monto con letra (pesos)
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
  const t = Math.floor(n / 1e6), r = n % 1e6; return (t === 1 ? 'UN MILLÓN' : numLetra(t) + ' MILLONES') + (r ? ' ' + numLetra(r) : '');
}
const montoLetra = (m) => { const e = Math.floor(m), c = Math.round((m - e) * 100); return `${numLetra(e)} PESOS ${String(c).padStart(2, '0')}/100 M.N.`; };

// El logo va incrustado para que también salga al guardar como PDF
let logoUrl = null;
async function logoTreme() {
  if (logoUrl !== null) return logoUrl;
  try {
    const blob = await (await fetch(new URL('img/logo-treme.png', location.href))).blob();
    logoUrl = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
  } catch { logoUrl = ''; }
  return logoUrl;
}
