// Bodegas: el material de cada edificio u obra (Bodega #1 de Torre Elysium, bodegas de las obras de MEDCO…).
// Nada se edita a mano: cada cambio es un movimiento con fecha, quién, para qué y foto opcional.
//   entrada (+) · salida (−) · préstamo = salida que regresa (herramientas) · devolución (+, cierra el préstamo) · ajuste (± conteo físico)
// Existencia = suma de los movimientos. Tablas: almacenes, materiales, material_movs (migración 0035).
import { db, todo, estado, tieneRol, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar,
         comprimirImagen, subirArchivo, verFoto } from '../lib.js';

const UNIDADES = ['pza', 'caja', 'juego', 'm', 'kg', 'lt', 'rollo', 'bulto', 'cubeta'];
const TIPO = {
  entrada:    { t: 'Entrada',    c: 'verde' },
  salida:     { t: 'Salida',     c: 'rojo' },
  prestamo:   { t: 'Préstamo',   c: 'ambar' },
  devolucion: { t: 'Regresó',    c: 'verde' },
  ajuste:     { t: 'Conteo',     c: 'gris' },
};
const st = { almacenId: null, vista: 'existencias', q: '', soloBajos: false };
let raiz, almacenes = [], materiales = [], movs = [], personas = [];

const puede = () => tieneRol(['administracion', 'operacion', 'encargado']);
const tipoDe = (x) => x.tipo === 'salida' && x.regresa ? 'prestamo' : x.tipo;
const signo = (x) => x.tipo === 'salida' ? -1 : 1;            // ajuste ya trae su signo
const num = (n) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
const almacen = () => almacenes.find((a) => a.id === st.almacenId);
const centroDe = (id) => (estado.todosCentros || estado.centros).find((c) => c.id === id);

export async function render(view) {
  raiz = view;
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  const ids = estado.centros.map((c) => c.id);
  const { data, error } = await db().from('almacenes').select('id, empresa_id, centro_id, nombre, notas').eq('activo', true)
    .in('centro_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('nombre');
  if (error) { view.innerHTML = `<div class="vacio">No se pudieron cargar las bodegas: ${esc(error.message)}</div>`; return; }
  almacenes = data.sort((a, b) => (centroDe(a.centro_id)?.nombre || '').localeCompare(centroDe(b.centro_id)?.nombre || '', 'es') || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  if (!almacenes.some((a) => a.id === st.almacenId)) st.almacenId = almacenes[0]?.id || null;
  // Nombres del personal para "¿quién se lo lleva?" (si no los puede ver, se escribe a mano)
  if (!personas.length) {
    const { data: emp } = await db().from('empleados').select('nombre').eq('activo', true).order('nombre');
    personas = (emp || []).map((e) => e.nombre);
  }
  acciones();
  if (!almacenes.length) {
    view.innerHTML = `<div class="vacio">Todavía no hay bodegas.${puede() ? '<br><button class="btn btn-primary" id="b-prim">＋ Crear la primera bodega</button>' : ''}</div>`;
    view.querySelector('#b-prim')?.addEventListener('click', nuevaBodega);
    return;
  }
  await cargar();
}

function acciones() {
  document.getElementById('page-actions').innerHTML = puede()
    ? `<button class="btn btn-ghost" id="b-bod">＋ Bodega</button>${almacenes.length ? '<button class="btn btn-primary" id="b-mat">＋ Material</button>' : ''}` : '';
  document.getElementById('b-bod')?.addEventListener('click', nuevaBodega);
  document.getElementById('b-mat')?.addEventListener('click', () => editarMaterial(null));
}

async function cargar() {
  const a = almacen();
  const [m, v] = await Promise.all([
    db().from('materiales').select('id, nombre, unidad, minimo, herramienta, notas').eq('almacen_id', a.id).eq('activo', true).order('nombre'),
    todo(() => db().from('material_movs').select('id, material_id, tipo, cantidad, quien, motivo, destino, regresa, prestamo_id, foto, fecha, capturado_por, creado_en')
      .eq('almacen_id', a.id).order('fecha', { ascending: false }).order('creado_en', { ascending: false })),
  ]);
  const err = m.error || v.error;
  if (err) { raiz.innerHTML = `<div class="vacio">No se pudo cargar la bodega: ${esc(err.message)}</div>`; return; }
  materiales = m.data;
  movs = v.data;
  pintar();
}

// ---------- cálculo ----------
const existencia = (mid) => movs.filter((x) => x.material_id === mid).reduce((s, x) => s + signo(x) * Number(x.cantidad), 0);
// Préstamos que no han regresado completos
function prestamosAbiertos(mid) {
  return movs.filter((x) => x.tipo === 'salida' && x.regresa && (!mid || x.material_id === mid)).map((p) => {
    const regreso = movs.filter((d) => d.tipo === 'devolucion' && d.prestamo_id === p.id).reduce((s, d) => s + Number(d.cantidad), 0);
    return { p, falta: Number(p.cantidad) - regreso };
  }).filter((x) => x.falta > 0);
}
const ultimoMov = (mid) => movs.find((x) => x.material_id === mid);
const bajo = (mat) => mat.minimo != null && existencia(mat.id) <= Number(mat.minimo);
const diasDesde = (iso) => Math.max(0, Math.round((new Date(hoyISO() + 'T12:00') - new Date(iso + 'T12:00')) / 864e5));
const hace = (iso) => { const d = diasDesde(iso); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };

// ---------- pintar ----------
function pintar() {
  const a = almacen();
  const varios = new Set(almacenes.map((x) => x.centro_id)).size > 1;
  const abiertos = prestamosAbiertos();
  const mes = hoyISO().slice(0, 7);
  const salidasMes = movs.filter((x) => x.tipo === 'salida' && x.fecha.startsWith(mes));
  const bajos = materiales.filter(bajo);
  raiz.innerHTML = `
    ${almacenes.length > 1 ? `<div class="segmento bd-bodegas" role="tablist" aria-label="Bodega">${almacenes.map((x) =>
      `<button class="${x.id === a.id ? 'activo' : ''}" data-alm="${x.id}">${esc(varios ? `${centroDe(x.centro_id)?.nombre || ''} · ${x.nombre}` : x.nombre)}</button>`).join('')}</div>` : ''}
    <div class="kpis">
      <div class="kpi"><span>${esc(a.nombre)}</span><strong>${materiales.length}</strong><small>${esc(centroDe(a.centro_id)?.nombre || '')} · artículos</small></div>
      <div class="kpi"><span>Salidas del mes</span><strong>${salidasMes.length}</strong><small>${salidasMes.length ? 'última ' + hace(salidasMes[0].fecha) : 'ninguna'}</small></div>
      <div class="kpi"><span>Prestado afuera</span><strong class="${abiertos.length ? 'neg' : ''}">${abiertos.length}</strong><small>${abiertos.length ? 'herramienta sin regresar' : 'todo está en la bodega'}</small></div>
      <div class="kpi"><span>Por surtir</span><strong class="${bajos.length ? 'neg' : ''}">${bajos.length}</strong><small>en su mínimo o abajo</small></div>
    </div>
    <div class="sub-head"><div class="tabs" role="tablist">
      ${[['existencias', 'Existencias'], ['movs', 'Movimientos'], ['afuera', `Prestado${abiertos.length ? ' · ' + abiertos.length : ''}`]]
        .map(([id, t]) => `<button role="tab" data-v="${id}" aria-selected="${st.vista === id}">${t}</button>`).join('')}
    </div></div>
    <div id="b-cuerpo"></div>`;
  raiz.querySelectorAll('[data-alm]').forEach((b) => b.addEventListener('click', () => { st.almacenId = b.dataset.alm; st.q = ''; cargar(); }));
  raiz.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.v; pintar(); }));
  const el = raiz.querySelector('#b-cuerpo');
  if (st.vista === 'movs') return pintarMovs(el);
  if (st.vista === 'afuera') return pintarAfuera(el, abiertos);
  pintarExistencias(el);
}

function pintarExistencias(el) {
  const q = normalizar(st.q);
  const lista = materiales.filter((m) => (!q || normalizar(m.nombre).includes(q)) && (!st.soloBajos || bajo(m)));
  el.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div class="segmento"><button data-bj="0" class="${!st.soloBajos ? 'activo' : ''}">Todo · ${materiales.length}</button><button data-bj="1" class="${st.soloBajos ? 'activo' : ''}">Por surtir · ${materiales.filter(bajo).length}</button></div>
        <input type="search" id="b-q" placeholder="Buscar material" value="${esc(st.q)}" aria-label="Buscar material">
      </div>
      <div class="tabla-wrap"><table class="tabla bd-tabla">
        <thead><tr><th>Material</th><th class="num">Hay</th><th>Último movimiento</th><th></th></tr></thead>
        <tbody>${lista.map((m) => {
          const hay = existencia(m.id), u = ultimoMov(m.id), afuera = prestamosAbiertos(m.id).reduce((s, x) => s + x.falta, 0);
          return `<tr>
            <td data-l="Material"><button class="link-fila" data-hist="${m.id}"><strong>${esc(m.nombre)}</strong></button>
              ${m.herramienta ? '<span class="tag tag-suave">herramienta</span>' : ''}${bajo(m) ? '<span class="tag tag-aviso">por surtir</span>' : ''}</td>
            <td class="num fuerte" data-l="Hay">${num(hay)} <small class="mut">${esc(m.unidad)}</small>${afuera ? `<small class="sub">${num(afuera)} prestado</small>` : ''}${m.minimo != null ? `<small class="sub">mínimo ${num(m.minimo)}</small>` : ''}</td>
            <td class="mut" data-l="Último">${u ? `${TIPO[tipoDe(u)].t} · ${fmtFecha(u.fecha)}${u.quien ? ' · ' + esc(u.quien) : ''}${u.motivo ? `<small class="sub">${esc(u.motivo)}</small>` : ''}` : '—'}</td>
            <td class="acciones nowrap">${puede() ? `<button class="btn btn-sm btn-primary" data-sacar="${m.id}" ${hay > 0 ? '' : 'disabled'}>Sacar</button>
              <button class="btn btn-sm btn-ghost" data-meter="${m.id}">Meter</button>` : ''}
              <button class="btn btn-sm btn-ghost" data-hist="${m.id}">Historial</button></td></tr>`;
        }).join('') || `<tr><td colspan="4" class="vacio">${materiales.length ? 'Nada con ese filtro' : 'Esta bodega no tiene material. Agrégalo con ＋ Material.'}</td></tr>`}</tbody>
      </table></div>
    </section>
    <p class="nota">Para sacar algo se anota quién se lo lleva y para qué. Las herramientas salen como préstamo y quedan en "Prestado" hasta que regresan.</p>`;
  el.querySelectorAll('[data-bj]').forEach((b) => b.addEventListener('click', () => { st.soloBajos = b.dataset.bj === '1'; pintar(); }));
  const inp = el.querySelector('#b-q');
  inp.addEventListener('input', () => { st.q = inp.value; pintar(); const n = raiz.querySelector('#b-q'); n.focus(); n.setSelectionRange(99, 99); });
  const mat = (id) => materiales.find((m) => m.id === id);
  el.querySelectorAll('[data-sacar]').forEach((b) => b.addEventListener('click', () => sacar(mat(b.dataset.sacar))));
  el.querySelectorAll('[data-meter]').forEach((b) => b.addEventListener('click', () => meter(mat(b.dataset.meter))));
  el.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => historial(mat(b.dataset.hist))));
}

function filaMov(x, conMaterial) {
  const m = materiales.find((y) => y.id === x.material_id);
  const t = TIPO[tipoDe(x)];
  const cant = x.tipo === 'ajuste' ? (Number(x.cantidad) > 0 ? '+' : '') + num(x.cantidad) : (signo(x) < 0 ? '−' : '+') + num(x.cantidad);
  return `<tr>
    <td class="nowrap mut" data-l="Fecha">${fmtFecha(x.fecha)}</td>
    ${conMaterial ? `<td data-l="Material"><strong>${esc(m?.nombre || '—')}</strong></td>` : ''}
    <td data-l="Movimiento"><span class="badge ${t.c}">${t.t}</span> <strong>${cant}</strong> <small class="mut">${esc(m?.unidad || '')}</small></td>
    <td data-l="Quién">${esc(x.quien || '—')}</td>
    <td class="mut" data-l="Para qué">${esc(x.motivo || '—')}${x.destino ? `<small class="sub">${esc(x.destino)}</small>` : ''}</td>
    <td class="mut" data-l="Anotó">${esc(x.capturado_por || '—')}</td>
    <td class="acciones nowrap">${x.foto ? `<button class="btn btn-sm btn-ghost" data-foto="${x.id}">Foto</button>` : ''}${tieneRol(['administracion']) ? `<button class="icon-btn peligro" data-borrar="${x.id}" title="Eliminar movimiento" aria-label="Eliminar movimiento">✕</button>` : ''}</td></tr>`;
}
function ligarMovs(el) {
  el.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => verFoto(movs.find((x) => x.id === b.dataset.foto)?.foto)));
  el.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    const x = movs.find((y) => y.id === b.dataset.borrar);
    if (movs.some((d) => d.prestamo_id === x.id)) return toast('Primero elimina la devolución de este préstamo', true);
    if (!confirm('¿Eliminar este movimiento? La existencia se recalcula. Queda registrado en la bitácora.')) return;
    const { error } = await db().from('material_movs').delete().eq('id', x.id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    cerrarModal(); toast('Movimiento eliminado'); cargar();
  }));
}

function pintarMovs(el) {
  const q = normalizar(st.q);
  const lista = movs.filter((x) => !q || normalizar(`${materiales.find((m) => m.id === x.material_id)?.nombre} ${x.quien} ${x.motivo} ${x.destino}`).includes(q)).slice(0, 300);
  el.innerHTML = `<section class="panel">
      <div class="panel-head"><h3>Todo lo que entró y salió</h3><input type="search" id="b-q" placeholder="Buscar material, persona o motivo" value="${esc(st.q)}" aria-label="Buscar"></div>
      <div class="tabla-wrap"><table class="tabla bd-tabla">
        <thead><tr><th>Fecha</th><th>Material</th><th>Movimiento</th><th>Quién</th><th>Para qué</th><th>Anotó</th><th></th></tr></thead>
        <tbody>${lista.map((x) => filaMov(x, true)).join('') || '<tr><td colspan="7" class="vacio">Sin movimientos</td></tr>'}</tbody>
      </table></div></section>`;
  const inp = el.querySelector('#b-q');
  inp.addEventListener('input', () => { st.q = inp.value; pintar(); const n = raiz.querySelector('#b-q'); n.focus(); n.setSelectionRange(99, 99); });
  ligarMovs(el);
}

function pintarAfuera(el, abiertos) {
  el.innerHTML = `<section class="panel">
      <div class="panel-head"><h3>Herramienta y material prestado</h3></div>
      ${abiertos.length ? `<div class="tabla-wrap"><table class="tabla bd-tabla">
        <thead><tr><th>Material</th><th class="num">Afuera</th><th>Lo tiene</th><th>Desde</th><th>Para qué</th><th></th></tr></thead>
        <tbody>${abiertos.map(({ p, falta }) => { const m = materiales.find((y) => y.id === p.material_id); const d = diasDesde(p.fecha);
          return `<tr>
            <td data-l="Material"><strong>${esc(m?.nombre || '—')}</strong></td>
            <td class="num fuerte" data-l="Afuera">${num(falta)} <small class="mut">${esc(m?.unidad || '')}</small></td>
            <td data-l="Lo tiene">${esc(p.quien || '—')}</td>
            <td class="nowrap ${d > 7 ? 'neg' : 'mut'}" data-l="Desde">${fmtFecha(p.fecha)} <small class="sub">${hace(p.fecha)}</small></td>
            <td class="mut" data-l="Para qué">${esc(p.motivo || '—')}${p.destino ? `<small class="sub">${esc(p.destino)}</small>` : ''}</td>
            <td class="acciones">${puede() ? `<button class="btn btn-sm btn-primary" data-reg="${p.id}">Regresó</button>` : ''}</td></tr>`; }).join('')}</tbody>
      </table></div>` : '<div class="vacio">No hay nada prestado: todo está en la bodega.</div>'}
    </section>`;
  el.querySelectorAll('[data-reg]').forEach((b) => b.addEventListener('click', () => regreso(abiertos.find((x) => x.p.id === b.dataset.reg))));
}

// ---------- historial de un material ----------
function historial(m) {
  const hay = existencia(m.id);
  const propios = movs.filter((x) => x.material_id === m.id);
  const salidas = propios.filter((x) => x.tipo === 'salida').reduce((s, x) => s + Number(x.cantidad), 0);
  const modal = abrirModal({
    titulo: m.nombre, ancho: true,
    cuerpo: `<div class="kpis bd-mini">
        <div class="kpi"><span>Hay</span><strong>${num(hay)}</strong><small>${esc(m.unidad)}${m.minimo != null ? ' · mínimo ' + num(m.minimo) : ''}</small></div>
        <div class="kpi"><span>Han salido</span><strong>${num(salidas)}</strong><small>en ${propios.filter((x) => x.tipo === 'salida').length} salida(s)</small></div>
      </div>
      <div class="tabla-wrap"><table class="tabla bd-tabla">
        <thead><tr><th>Fecha</th><th>Movimiento</th><th>Quién</th><th>Para qué</th><th>Anotó</th><th></th></tr></thead>
        <tbody>${propios.map((x) => filaMov(x, false)).join('') || '<tr><td colspan="6" class="vacio">Sin movimientos</td></tr>'}</tbody>
      </table></div>`,
    pie: puede() ? `<button class="btn btn-ghost" id="h-edit">Editar</button><button class="btn btn-ghost" id="h-contar">Contar</button>
      <button class="btn btn-ghost" id="h-meter">Meter</button><button class="btn btn-primary" id="h-sacar" ${hay > 0 ? '' : 'disabled'}>Sacar</button>`
      : '<button class="btn btn-primary" id="h-ok">Cerrar</button>',
  });
  modal.querySelector('#h-ok')?.addEventListener('click', cerrarModal);
  modal.querySelector('#h-sacar')?.addEventListener('click', () => sacar(m));
  modal.querySelector('#h-meter')?.addEventListener('click', () => meter(m));
  modal.querySelector('#h-contar')?.addEventListener('click', () => contar(m));
  modal.querySelector('#h-edit')?.addEventListener('click', () => editarMaterial(m));
  ligarMovs(modal);
}

// ---------- capturas ----------
const campoFoto = `<label>Foto <small>(opcional)</small><input type="file" name="foto" accept="image/*" capture="environment"></label>`;
const listaPersonas = () => `<datalist id="b-personas">${personas.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`;
async function fotoDe(f) {
  const file = f.foto?.files?.[0];
  if (!file) return null;
  try { return await subirArchivo(await comprimirImagen(file), 'bodegas'); }
  catch (e) { toast('No se pudo subir la foto; se guarda sin ella', true); return null; }
}
async function guardarMov(btn, datos) {
  btn.disabled = true; btn.textContent = 'Guardando…';
  const a = almacen();
  const { error } = await db().from('material_movs').insert({ org_id: estado.miembro.org_id, almacen_id: a.id, capturado_por: estado.miembro.nombre, ...datos });
  if (error) { btn.disabled = false; btn.textContent = 'Guardar'; toast('No se pudo guardar: ' + error.message, true); return false; }
  cerrarModal(); await cargar(); return true;
}

function sacar(m) {
  const hay = existencia(m.id);
  const modal = abrirModal({
    titulo: `Sacar · ${m.nombre}`,
    cuerpo: `<form class="form" id="bf" novalidate>
      <p class="nota">Hay <strong>${num(hay)} ${esc(m.unidad)}</strong> en ${esc(almacen().nombre)}.</p>
      <div class="form-2">
        <label>¿Cuántos?<input type="number" name="cant" min="0.01" step="any" max="${hay}" value="1" inputmode="decimal" required></label>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label>
      </div>
      <label>¿Quién se lo lleva?<input name="quien" list="b-personas" maxlength="80" required placeholder="Nombre"></label>${listaPersonas()}
      <label>¿Para qué?<input name="motivo" maxlength="200" required placeholder="Ej. cambiar la tubería del baño del piso 5"></label>
      <label>¿Dónde se va a usar? <small>(opcional)</small><input name="destino" maxlength="120" placeholder="Unidad, área u obra"></label>
      <label class="check-linea"><input type="checkbox" name="regresa" ${m.herramienta ? 'checked' : ''}> Es préstamo: lo va a regresar</label>
      ${campoFoto}
    </form>`,
    pie: `<button class="btn btn-ghost" id="bf-no">Cancelar</button><button class="btn btn-primary" id="bf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#bf');
  modal.querySelector('#bf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#bf-si').addEventListener('click', async (ev) => {
    const cant = Number(f.cant.value);
    if (!(cant > 0)) return toast('Escribe cuántos', true);
    if (cant > hay) return toast(`Solo hay ${num(hay)} en la bodega`, true);
    if (!f.quien.value.trim()) return toast('Escribe quién se lo lleva', true);
    if (!f.motivo.value.trim()) return toast('Escribe para qué', true);
    const btn = ev.currentTarget; btn.disabled = true;
    const foto = await fotoDe(f);
    const ok = await guardarMov(btn, { material_id: m.id, tipo: 'salida', cantidad: cant, quien: f.quien.value.trim(), motivo: f.motivo.value.trim(),
      destino: f.destino.value.trim() || null, regresa: f.regresa.checked, foto, fecha: f.fecha.value || hoyISO() });
    if (ok) toast(f.regresa.checked ? 'Préstamo anotado ✓' : 'Salida anotada ✓');
  });
}

function meter(m) {
  const modal = abrirModal({
    titulo: `Meter · ${m.nombre}`,
    cuerpo: `<form class="form" id="bf" novalidate>
      <div class="form-2">
        <label>¿Cuántos?<input type="number" name="cant" min="0.01" step="any" value="1" inputmode="decimal" required></label>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label>
      </div>
      <label>¿De dónde viene?<select name="motivo"><option>Compra</option><option>Sobró de un trabajo</option><option>Lo trajeron de otra bodega u obra</option><option>Otro</option></select></label>
      <label>Detalle <small>(opcional: proveedor, factura, trabajo…)</small><input name="detalle" maxlength="160"></label>
      <label>¿Quién lo trajo? <small>(opcional)</small><input name="quien" list="b-personas" maxlength="80"></label>${listaPersonas()}
      ${campoFoto}
    </form>`,
    pie: `<button class="btn btn-ghost" id="bf-no">Cancelar</button><button class="btn btn-primary" id="bf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#bf');
  modal.querySelector('#bf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#bf-si').addEventListener('click', async (ev) => {
    const cant = Number(f.cant.value);
    if (!(cant > 0)) return toast('Escribe cuántos', true);
    const btn = ev.currentTarget; btn.disabled = true;
    const foto = await fotoDe(f);
    const motivo = f.motivo.value + (f.detalle.value.trim() ? ': ' + f.detalle.value.trim() : '');
    if (await guardarMov(btn, { material_id: m.id, tipo: 'entrada', cantidad: cant, quien: f.quien.value.trim() || null, motivo, foto, fecha: f.fecha.value || hoyISO() }))
      toast('Entrada anotada ✓');
  });
}

function regreso({ p, falta }) {
  const m = materiales.find((y) => y.id === p.material_id);
  const modal = abrirModal({
    titulo: `Regresó · ${m?.nombre || ''}`,
    cuerpo: `<form class="form" id="bf" novalidate>
      <p class="nota">${esc(p.quien || 'Alguien')} se llevó ${num(p.cantidad)} el ${fmtFecha(p.fecha)} para: ${esc(p.motivo || '—')}.</p>
      <div class="form-2">
        <label>¿Cuántos regresaron?<input type="number" name="cant" min="0.01" step="any" max="${falta}" value="${falta}" inputmode="decimal" required></label>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label>
      </div>
      <label>Nota <small>(opcional: cómo regresó, si falta algo)</small><input name="nota" maxlength="160"></label>
      ${campoFoto}
    </form>`,
    pie: `<button class="btn btn-ghost" id="bf-no">Cancelar</button><button class="btn btn-primary" id="bf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#bf');
  modal.querySelector('#bf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#bf-si').addEventListener('click', async (ev) => {
    const cant = Number(f.cant.value);
    if (!(cant > 0) || cant > falta) return toast(`Escribe una cantidad de 1 a ${num(falta)}`, true);
    const btn = ev.currentTarget; btn.disabled = true;
    const foto = await fotoDe(f);
    if (await guardarMov(btn, { material_id: p.material_id, tipo: 'devolucion', cantidad: cant, quien: p.quien, prestamo_id: p.id,
      motivo: 'Regresó' + (f.nota.value.trim() ? ': ' + f.nota.value.trim() : ''), foto, fecha: f.fecha.value || hoyISO() }))
      toast('Regreso anotado ✓');
  });
}

function contar(m) {
  const hay = existencia(m.id);
  const modal = abrirModal({
    titulo: `Contar · ${m.nombre}`,
    cuerpo: `<form class="form" id="bf" novalidate>
      <p class="nota">Según el sistema hay <strong>${num(hay)} ${esc(m.unidad)}</strong>. Cuenta lo que hay físicamente en la bodega.</p>
      <label>¿Cuántos hay realmente?<input type="number" name="real" min="0" step="any" value="${hay}" inputmode="decimal" required></label>
      <label>¿Por qué no cuadra? <small>(si hay diferencia)</small><input name="motivo" maxlength="200"></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="bf-no">Cancelar</button><button class="btn btn-primary" id="bf-si">Guardar conteo</button>`,
  });
  const f = modal.querySelector('#bf');
  modal.querySelector('#bf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#bf-si').addEventListener('click', async (ev) => {
    if (f.real.value === '' || Number(f.real.value) < 0) return toast('Escribe cuántos hay', true);
    const dif = Math.round((Number(f.real.value) - hay) * 100) / 100;
    if (!dif) { cerrarModal(); return toast('Cuadra: no hubo cambios'); }
    if (!f.motivo.value.trim()) return toast('Anota por qué no cuadra', true);
    if (await guardarMov(ev.currentTarget, { material_id: m.id, tipo: 'ajuste', cantidad: dif, motivo: 'Conteo: ' + f.motivo.value.trim(), fecha: hoyISO() }))
      toast(`Conteo guardado (${dif > 0 ? '+' : ''}${num(dif)}) ✓`);
  });
}

function editarMaterial(m) {
  const nuevo = !m;
  const modal = abrirModal({
    titulo: nuevo ? `Nuevo material · ${almacen().nombre}` : `Editar · ${m.nombre}`,
    cuerpo: `<form class="form" id="bf" novalidate>
      <label>Nombre<input name="nombre" maxlength="120" required value="${esc(m?.nombre || '')}" placeholder="Ej. Codos 90° 1&quot; Tuboplus"></label>
      <div class="form-2">
        <label>Se cuenta en<select name="unidad">${UNIDADES.map((u) => `<option ${u === (m?.unidad || 'pza') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label>Mínimo <small>(avisa al llegar aquí; opcional)</small><input type="number" name="minimo" min="0" step="any" value="${m?.minimo ?? ''}" inputmode="decimal"></label>
      </div>
      ${nuevo ? '<label>¿Cuántos hay hoy?<input type="number" name="cant" min="0" step="any" value="1" inputmode="decimal"></label>' : ''}
      <label class="check-linea"><input type="checkbox" name="herr" ${m?.herramienta ? 'checked' : ''}> Es herramienta (se presta y se regresa)</label>
      ${!nuevo && tieneRol(['administracion']) ? '<label class="check-linea"><input type="checkbox" name="baja"> Dar de baja (ya no se usa; su historial se conserva)</label>' : ''}
    </form>`,
    pie: `<button class="btn btn-ghost" id="bf-no">Cancelar</button><button class="btn btn-primary" id="bf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#bf');
  modal.querySelector('#bf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#bf-si').addEventListener('click', async (ev) => {
    const nombre = f.nombre.value.trim();
    if (!nombre) return toast('Escribe el nombre', true);
    const btn = ev.currentTarget; btn.disabled = true;
    const datos = { nombre, unidad: f.unidad.value, minimo: f.minimo.value === '' ? null : Number(f.minimo.value), herramienta: f.herr.checked };
    if (nuevo) {
      const { data, error } = await db().from('materiales').insert({ ...datos, org_id: estado.miembro.org_id, almacen_id: almacen().id }).select('id').single();
      if (error) { btn.disabled = false; return toast(error.code === '23505' ? 'Ya existe un material con ese nombre en esta bodega' : 'No se pudo guardar: ' + error.message, true); }
      const cant = Number(f.cant.value);
      if (cant > 0) await db().from('material_movs').insert({ org_id: estado.miembro.org_id, almacen_id: almacen().id, material_id: data.id,
        tipo: 'entrada', cantidad: cant, motivo: 'Alta en el inventario', capturado_por: estado.miembro.nombre, fecha: hoyISO() });
    } else {
      const { error } = await db().from('materiales').update({ ...datos, ...(f.baja?.checked ? { activo: false } : {}) }).eq('id', m.id);
      if (error) { btn.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
    }
    cerrarModal(); toast('Material guardado ✓'); cargar();
  });
}

function nuevaBodega() {
  const lugares = estado.centros.filter((c) => !['personal', 'socio'].includes(c.tipo));
  const modal = abrirModal({
    titulo: 'Nueva bodega',
    cuerpo: `<form class="form" id="bf" novalidate>
      <label>¿De qué edificio u obra?<select name="centro">${lugares.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></label>
      <label>Nombre de la bodega<input name="nombre" maxlength="80" required placeholder="Ej. Bodega #2, Cuarto de máquinas, Almacén de obra"></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="bf-no">Cancelar</button><button class="btn btn-primary" id="bf-si">Crear</button>`,
  });
  const f = modal.querySelector('#bf');
  modal.querySelector('#bf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#bf-si').addEventListener('click', async (ev) => {
    const nombre = f.nombre.value.trim();
    if (!nombre) return toast('Escribe el nombre de la bodega', true);
    const c = lugares.find((x) => x.id === f.centro.value);
    ev.currentTarget.disabled = true;
    const { data, error } = await db().from('almacenes').insert({ org_id: estado.miembro.org_id, empresa_id: c.empresa_id, centro_id: c.id, nombre }).select('id').single();
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo crear: ' + error.message, true); }
    st.almacenId = data.id; cerrarModal(); toast('Bodega creada ✓'); render(raiz);
  });
}
