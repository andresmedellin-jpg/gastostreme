import { CATEGORIAS, FORMAS_PAGO, MESES, BUCKET_COMPROBANTES } from '../config.js';
import { sb, db, todo, estado, esAdmin, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal,
         comprimirImagen, blobADataURL, abrirComprobante } from '../lib.js';

const PRIVADOS = ['socio', 'personal'];   // Casa y Socios: fuera de "Todos" (como en el Centro de Control)

const f = {                                // filtros vigentes
  mes: new Date().getMonth(),
  anio: new Date().getFullYear(),
  centro: 'todos',                         // 'todos' | 'emp:<id>' | <centro_id>
  categoria: '', forma: '', q: '',
};
let datos = [];                            // gastos del mes (todos los centros visibles)
let porPagar = [];                         // pedidos a proveedores sin pagar (cualquier mes)
const CAMPOS = 'id, fecha, monto, concepto, proveedor, categoria, forma_pago, comprobante_path, notas, centro_id, empresa_id, capturado_por, estado, fecha_vencimiento, fecha_pago';
let raiz;

export async function render(view) {
  raiz = view;
  document.getElementById('page-actions').innerHTML =
    `<button class="btn btn-primary" id="g-nuevo">＋ Nuevo gasto</button>`;
  document.getElementById('g-nuevo').addEventListener('click', () => abrirFormulario());

  view.innerHTML = `
    <div class="filtros">
      <select id="g-mes" aria-label="Mes">${MESES.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select>
      <select id="g-anio" aria-label="Año">${aniosDisponibles().map((a) => `<option>${a}</option>`).join('')}</select>
      <select id="g-centro" aria-label="Centro">${opcionesCentro(true)}</select>
    </div>
    <div class="kpis" id="g-kpis"></div>
    <section class="panel" id="g-porpagar" hidden></section>
    <div class="grid-2">
      <section class="panel"><h3>Por categoría</h3><div id="g-cats"></div></section>
      <section class="panel"><h3>Por centro</h3><div id="g-centros"></div></section>
    </div>
    <section class="panel">
      <div class="panel-head">
        <h3 id="g-titulo-tabla">Gastos</h3>
        <div class="filtros filtros-sm">
          <input type="search" id="g-q" placeholder="Buscar concepto o proveedor" aria-label="Buscar">
          <select id="g-cat" aria-label="Categoría"><option value="">Todas las categorías</option>
            ${Object.keys(CATEGORIAS).map((c) => `<option>${c}</option>`).join('')}</select>
          <select id="g-forma" aria-label="Forma de pago"><option value="">Todas las formas</option>
            ${FORMAS_PAGO.map((x) => `<option>${x}</option>`).join('')}</select>
        </div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Centro</th><th>Concepto</th><th>Proveedor</th><th>Categoría</th>
          <th>Forma</th><th class="num">Monto</th><th></th></tr></thead>
        <tbody id="g-tbody"></tbody>
        <tfoot id="g-tfoot"></tfoot>
      </table></div>
    </section>`;

  const sel = (id) => view.querySelector('#' + id);
  sel('g-mes').value = f.mes; sel('g-anio').value = f.anio; sel('g-centro').value = f.centro;
  sel('g-q').value = f.q; sel('g-cat').value = f.categoria; sel('g-forma').value = f.forma;

  sel('g-mes').addEventListener('change', (e) => { f.mes = +e.target.value; cargar(); });
  sel('g-anio').addEventListener('change', (e) => { f.anio = +e.target.value; cargar(); });
  sel('g-centro').addEventListener('change', (e) => { f.centro = e.target.value; pintar(); });
  sel('g-q').addEventListener('input', (e) => { f.q = e.target.value.toLowerCase(); pintarTabla(); });
  sel('g-cat').addEventListener('change', (e) => { f.categoria = e.target.value; pintarTabla(); });
  sel('g-forma').addEventListener('change', (e) => { f.forma = e.target.value; pintarTabla(); });

  await cargar();
}

function aniosDisponibles() {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2];
}

const nombreEmpresa = (id) => estado.empresas.find((e) => e.id === id)?.nombre_corto || '';
const centro = (id) => estado.centros.find((c) => c.id === id);

function opcionesCentro(conAgrupadores) {
  const porEmpresa = estado.empresas.map((e) => {
    const cs = estado.centros.filter((c) => c.empresa_id === e.id);
    if (!cs.length) return '';
    return `<optgroup label="${esc(e.nombre_corto)}">
      ${conAgrupadores ? `<option value="emp:${e.id}">Todo ${esc(e.nombre_corto)}</option>` : ''}
      ${cs.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</optgroup>`;
  }).join('');
  return (conAgrupadores ? '<option value="todos">Todos los centros</option>' : '<option value="">Elige…</option>') + porEmpresa;
}

async function cargar() {
  const desde = new Date(f.anio, f.mes, 1);
  const hasta = new Date(f.anio, f.mes + 1, 1);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  raiz.querySelector('#g-tbody').innerHTML = `<tr><td colspan="8" class="vacio">Cargando…</td></tr>`;
  const { data, error } = await todo(() => db().from('gastos')
    .select(CAMPOS)
    .gte('fecha', iso(desde)).lt('fecha', iso(hasta))
    .order('fecha', { ascending: false }));
  if (error) { toast('No se pudieron cargar los gastos: ' + error.message, true); datos = []; }
  else datos = data;
  // Pedidos por pagar de cualquier mes
  const pp = await todo(() => db().from('gastos').select(CAMPOS).eq('estado', 'por_pagar'));
  porPagar = pp.error ? [] : pp.data;
  pintar();
}

// Gastos que entran según el selector de centro
function filtrados() {
  return datos.filter((g) => {
    if (f.centro === 'todos') return !PRIVADOS.includes(centro(g.centro_id)?.tipo);
    if (f.centro.startsWith('emp:')) return g.empresa_id === f.centro.slice(4) && !PRIVADOS.includes(centro(g.centro_id)?.tipo);
    return g.centro_id === f.centro;
  });
}

function pintar() { pintarKPIs(); pintarPorPagar(); pintarCategorias(); pintarCentros(); pintarTabla(); }

const suma = (arr) => arr.reduce((s, g) => s + Number(g.monto || 0), 0);

function pintarKPIs() {
  const d = filtrados();
  const total = suma(d);
  const porEmpresa = estado.empresas.map((e) => ({
    e, t: suma(datos.filter((g) => g.empresa_id === e.id && !PRIVADOS.includes(centro(g.centro_id)?.tipo))),
  }));
  const cats = agrupar(d, (g) => g.categoria || 'General');
  const top = cats[0];
  raiz.querySelector('#g-kpis').innerHTML = `
    <div class="kpi"><span>Total del mes</span><strong class="neg">${fmt(total)}</strong><small>${d.length} gasto${d.length === 1 ? '' : 's'}${
      d.some((g) => g.estado === 'por_pagar') ? ` · incluye ${fmt(suma(d.filter((g) => g.estado === 'por_pagar')))} por pagar` : ''}</small></div>
    <div class="kpi"><span>Promedio por gasto</span><strong>${d.length ? fmt(total / d.length) : '—'}</strong><small>${MESES[f.mes]} ${f.anio}</small></div>
    <div class="kpi"><span>Por empresa</span>${porEmpresa.map(({ e, t }) =>
      `<div class="kpi-linea"><i style="background:${e.color || '#888'}"></i>${esc(e.nombre_corto)}<b>${fmt(t)}</b></div>`).join('')}
      <small>sin Casa ni Socios</small></div>
    <div class="kpi"><span>Mayor categoría</span><strong class="sm">${top ? `${CATEGORIAS[top.k] || '•'} ${esc(top.k)}` : '—'}</strong><small>${top ? fmt(top.t) : ''}</small></div>`;
}

function agrupar(arr, clave) {
  const m = new Map();
  arr.forEach((g) => { const k = clave(g); const x = m.get(k) || { k, t: 0, n: 0 }; x.t += Number(g.monto || 0); x.n++; m.set(k, x); });
  return [...m.values()].sort((a, b) => b.t - a.t);
}

function barras(filas, etiqueta, alClic) {
  if (!filas.length) return '<div class="vacio">Sin gastos en este periodo</div>';
  const max = filas[0].t || 1;
  return `<ul class="barras">${filas.map((r) => `
    <li ${alClic ? `data-k="${esc(r.k)}" class="clic"` : ''}>
      <span class="barra-nombre">${etiqueta(r)}</span>
      <span class="barra-pista"><span style="width:${Math.max(2, Math.round(r.t / max * 100))}%"></span></span>
      <span class="barra-monto">${fmt(r.t)}</span>
    </li>`).join('')}</ul>`;
}

function pintarCategorias() {
  const filas = agrupar(filtrados(), (g) => g.categoria || 'General');
  raiz.querySelector('#g-cats').innerHTML = barras(filas, (r) => `${CATEGORIAS[r.k] || '•'} ${esc(r.k)}`);
}

function pintarCentros() {
  const visibles = f.centro === 'todos' ? datos
    : f.centro.startsWith('emp:') ? datos.filter((g) => g.empresa_id === f.centro.slice(4)) : filtrados();
  const filas = agrupar(visibles, (g) => g.centro_id);
  const cont = raiz.querySelector('#g-centros');
  cont.innerHTML = barras(filas, (r) => {
    const c = centro(r.k);
    return `${esc(c?.nombre || '—')} <em>${esc(nombreEmpresa(c?.empresa_id))}${PRIVADOS.includes(c?.tipo) ? ' · privado' : ''}</em>`;
  }, true);
  cont.querySelectorAll('li.clic').forEach((li) => li.addEventListener('click', () => {
    f.centro = li.dataset.k;
    raiz.querySelector('#g-centro').value = f.centro;
    pintar();
  }));
}

function pintarTabla() {
  let d = filtrados();
  if (f.categoria) d = d.filter((g) => (g.categoria || 'General') === f.categoria);
  if (f.forma) d = d.filter((g) => g.forma_pago === f.forma);
  if (f.q) d = d.filter((g) => (g.concepto || '').toLowerCase().includes(f.q) || (g.proveedor || '').toLowerCase().includes(f.q));

  raiz.querySelector('#g-titulo-tabla').textContent = `${d.length} gasto${d.length === 1 ? '' : 's'}`;
  const tbody = raiz.querySelector('#g-tbody');
  if (!d.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="vacio">Sin gastos para este filtro</td></tr>`;
    raiz.querySelector('#g-tfoot').innerHTML = '';
    return;
  }
  const admin = esAdmin();
  tbody.innerHTML = d.map((g) => {
    const c = centro(g.centro_id);
    return `<tr>
      <td class="mut nowrap" data-l="Fecha">${fmtFecha(g.fecha)}</td>
      <td data-l="Centro"><span class="tag">${esc(c?.nombre || '—')}</span></td>
      <td class="concepto" data-l="Concepto" title="${esc(g.notas || g.concepto)}">${esc(g.concepto)}</td>
      <td class="mut corto" data-l="Proveedor" title="${esc(g.proveedor || '')}">${esc(g.proveedor || '—')}</td>
      <td data-l="Categoría"><span class="tag tag-suave">${CATEGORIAS[g.categoria] || '•'} ${esc(g.categoria || 'General')}</span></td>
      <td class="mut" data-l="Forma">${g.estado === 'por_pagar' ? '<span class="tag tag-aviso">Por pagar</span>' : esc(g.forma_pago || '—')}</td>
      <td class="num fuerte" data-l="Monto">${fmt(g.monto)}</td>
      <td class="acciones">
        ${g.comprobante_path ? `<button class="icon-btn" data-ver="${g.id}" title="Ver comprobante" aria-label="Ver comprobante">📎</button>` : ''}
        ${admin ? `<button class="icon-btn peligro" data-borrar="${g.id}" aria-label="Eliminar gasto">✕</button>` : ''}
      </td></tr>`;
  }).join('');
  raiz.querySelector('#g-tfoot').innerHTML =
    `<tr><td colspan="6">${d.length} registro${d.length === 1 ? '' : 's'}</td><td class="num fuerte">${fmt(suma(d))}</td><td></td></tr>`;

  tbody.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () =>
    abrirComprobante(datos.find((g) => g.id === b.dataset.ver)?.comprobante_path)));
  tbody.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', () => borrar(b.dataset.borrar)));
}

// ================= POR PAGAR =================
function visibleEnFiltro(g) {
  if (f.centro === 'todos') return !PRIVADOS.includes(centro(g.centro_id)?.tipo);
  if (f.centro.startsWith('emp:')) return g.empresa_id === f.centro.slice(4) && !PRIVADOS.includes(centro(g.centro_id)?.tipo);
  return g.centro_id === f.centro;
}

function pintarPorPagar() {
  const el = raiz.querySelector('#g-porpagar');
  const lista = porPagar.filter(visibleEnFiltro)
    .sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999') || a.fecha.localeCompare(b.fecha));
  el.hidden = !lista.length;
  if (!lista.length) { el.innerHTML = ''; return; }
  const hoy = hoyISO();
  const vencidos = lista.filter((g) => g.fecha_vencimiento && g.fecha_vencimiento < hoy);
  const porProv = agrupar(lista, (g) => g.proveedor || 'Sin proveedor');
  el.innerHTML = `
    <div class="panel-head">
      <h3>Por pagar a proveedores · ${fmt(suma(lista))}</h3>
      <span class="sub-meta">${lista.length} pedido${lista.length === 1 ? '' : 's'}${vencidos.length ? ` · <b class="neg">${vencidos.length} vencido${vencidos.length === 1 ? '' : 's'}</b>` : ''}
        · ${porProv.slice(0, 3).map((p) => `${esc(p.k)} ${fmt(p.t)}`).join(' · ')}</span>
    </div>
    <div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Pedido</th><th>Vence</th><th>Centro</th><th>Concepto</th><th>Proveedor</th><th class="num">Monto</th><th></th></tr></thead>
      <tbody>${lista.map((g) => `<tr>
        <td class="mut nowrap" data-l="Pedido">${fmtFecha(g.fecha)}</td>
        <td class="nowrap ${g.fecha_vencimiento && g.fecha_vencimiento < hoy ? 'neg fuerte' : 'mut'}" data-l="Vence">${g.fecha_vencimiento ? fmtFecha(g.fecha_vencimiento) : '—'}</td>
        <td data-l="Centro"><span class="tag">${esc(centro(g.centro_id)?.nombre || '—')}</span></td>
        <td class="concepto" data-l="Concepto">${esc(g.concepto)}</td>
        <td class="mut corto" data-l="Proveedor">${esc(g.proveedor || '—')}</td>
        <td class="num fuerte" data-l="Monto">${fmt(g.monto)}</td>
        <td class="acciones"><button class="btn btn-sm btn-primary" data-pagar="${g.id}">Marcar pagado</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  el.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => marcarPagado(b.dataset.pagar)));
}

function marcarPagado(id) {
  const g = porPagar.find((x) => x.id === id);
  if (!g) return;
  const modal = abrirModal({
    titulo: 'Marcar como pagado',
    cuerpo: `
      <form id="mp" class="form" novalidate>
        <p><b>${esc(g.concepto)}</b>${g.proveedor ? ` · ${esc(g.proveedor)}` : ''}<br><span class="mut">${esc(centro(g.centro_id)?.nombre || '')} · pedido el ${fmtFecha(g.fecha)}</span></p>
        <div class="form-2">
          <label>Monto pagado<input type="number" name="monto" required min="0.01" step="0.01" inputmode="decimal" value="${Number(g.monto)}"></label>
          <label>Fecha de pago<input type="date" name="fecha_pago" required value="${hoyISO()}"></label>
        </div>
        <label>Forma de pago<select name="forma_pago">${FORMAS_PAGO.map((x) => `<option>${x}</option>`).join('')}</select></label>
        <label class="archivo">Factura o comprobante <small>(opcional)</small>
          <input type="file" name="archivo" accept="image/*,application/pdf">
          <span class="archivo-estado" id="mp-archivo">${g.comprobante_path ? 'Ya tiene un archivo; si subes otro, lo reemplaza' : 'Sin archivo'}</span>
        </label>
      </form>`,
    pie: `<button class="btn btn-ghost" data-cerrar-btn>Cancelar</button><button class="btn btn-primary" id="mp-ok">Guardar pago</button>`,
  });
  modal.querySelector('[data-cerrar-btn]').addEventListener('click', cerrarModal);
  const form = modal.querySelector('#mp');
  let archivo = null;
  form.archivo.addEventListener('change', async () => {
    archivo = await leerArchivo(form.archivo.files[0], modal.querySelector('#mp-archivo'));
  });
  modal.querySelector('#mp-ok').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const monto = Number(form.monto.value);
    if (!(monto > 0)) return toast('El monto debe ser mayor a cero', true);
    if (!form.fecha_pago.value) return toast('Pon la fecha de pago', true);
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const cambios = { estado: 'pagado', fecha_pago: form.fecha_pago.value, forma_pago: form.forma_pago.value,
                        monto: Math.round(monto * 100) / 100 };
      if (archivo) cambios.comprobante_path = await subirComprobante(archivo, form.fecha_pago.value);
      const { error } = await db().from('gastos').update(cambios).eq('id', id);
      if (error) throw error;
      cerrarModal(); toast('Pago registrado ✓'); cargar();
    } catch (e) {
      toast('No se pudo guardar: ' + (e.message || e), true);
      btn.disabled = false; btn.textContent = 'Guardar pago';
    }
  });
}

async function leerArchivo(file, lbl) {
  if (!file) { lbl.textContent = 'Sin archivo'; return null; }
  try {
    if (file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) throw new Error('El PDF pesa más de 10 MB');
      lbl.textContent = '✓ ' + file.name;
      return { blob: file, nombre: file.name, tipo: 'application/pdf', ext: 'pdf' };
    }
    lbl.textContent = 'Procesando foto…';
    const r = { blob: await comprimirImagen(file), nombre: file.name, tipo: 'image/jpeg', ext: 'jpg' };
    lbl.textContent = '✓ ' + file.name;
    return r;
  } catch (e) { lbl.textContent = 'Sin archivo'; toast(e.message, true); return null; }
}

async function borrar(id) {
  const g = datos.find((x) => x.id === id);
  if (!confirm(`¿Eliminar "${g?.concepto}" por ${fmt(g?.monto)}?\nQueda registrado en la bitácora.`)) return;
  const { error } = await db().from('gastos').delete().eq('id', id);
  if (error) return toast('No se pudo eliminar: ' + error.message, true);
  datos = datos.filter((x) => x.id !== id);
  porPagar = porPagar.filter((x) => x.id !== id);
  pintar();
  toast('Gasto eliminado');
}

// ================= ALTA DE GASTO =================
function abrirFormulario() {
  const centroInicial = f.centro && !f.centro.startsWith('emp:') && f.centro !== 'todos' ? f.centro : '';
  const modal = abrirModal({
    titulo: 'Nuevo gasto',
    cuerpo: `
      <form id="gf" class="form" novalidate>
        <fieldset class="opciones"><legend>¿Ya se pagó?</legend><div class="form-2">
          <label class="opcion opcion-linea"><input type="radio" name="estado" value="pagado" checked> Sí, ya se pagó</label>
          <label class="opcion opcion-linea"><input type="radio" name="estado" value="por_pagar"> No, es un pedido por pagar</label>
        </div></fieldset>
        <label>Centro<select name="centro_id" required>${opcionesCentro(false)}</select></label>
        <div class="form-2">
          <label><span id="gf-lbl-fecha">Fecha</span><input type="date" name="fecha" required value="${hoyISO()}"></label>
          <label>Monto<input type="number" name="monto" required min="0.01" step="0.01" inputmode="decimal" placeholder="0.00"></label>
        </div>
        <label>Concepto<input name="concepto" required maxlength="200" placeholder="¿En qué se gastó?"></label>
        <label>Proveedor <small>(opcional)</small><input name="proveedor" maxlength="120"></label>
        <div class="form-2">
          <label>Categoría<select name="categoria">${Object.keys(CATEGORIAS).map((c) => `<option>${c}</option>`).join('')}</select></label>
          <label id="gf-forma">Forma de pago<select name="forma_pago">${FORMAS_PAGO.map((x) => `<option>${x}</option>`).join('')}</select></label>
          <label id="gf-vence" hidden>Vence <small>(opcional)</small><input type="date" name="fecha_vencimiento"></label>
        </div>
        <label>Notas <small>(opcional)</small><textarea name="notas" rows="2"></textarea></label>
        <label class="archivo">Comprobante <small>(foto o PDF)</small>
          <input type="file" name="archivo" accept="image/*,application/pdf" capture="environment">
          <span class="archivo-estado" id="gf-archivo">Sin comprobante</span>
        </label>
      </form>`,
    pie: `<button class="btn btn-ghost" data-cerrar-btn>Cancelar</button>
          <button class="btn btn-primary" id="gf-guardar">Guardar gasto</button>`,
  });
  const form = modal.querySelector('#gf');
  form.centro_id.value = centroInicial;
  modal.querySelector('[data-cerrar-btn]').addEventListener('click', cerrarModal);
  const alCambiarEstado = () => {
    const pendiente = form.estado.value === 'por_pagar';
    modal.querySelector('#gf-forma').hidden = pendiente;
    modal.querySelector('#gf-vence').hidden = !pendiente;
    modal.querySelector('#gf-lbl-fecha').textContent = pendiente ? 'Fecha del pedido' : 'Fecha';
  };
  form.querySelectorAll('input[name="estado"]').forEach((r) => r.addEventListener('change', alCambiarEstado));

  let archivo = null;          // { blob, nombre, tipo }
  form.archivo.addEventListener('change', async () => {
    const file = form.archivo.files[0];
    const lbl = modal.querySelector('#gf-archivo');
    archivo = null;
    if (!file) { lbl.textContent = 'Sin comprobante'; return; }
    try {
      if (file.type === 'application/pdf') {
        if (file.size > 10 * 1024 * 1024) throw new Error('El PDF pesa más de 10 MB');
        archivo = { blob: file, nombre: file.name, tipo: 'application/pdf', ext: 'pdf' };
      } else {
        lbl.textContent = 'Procesando foto…';
        archivo = { blob: await comprimirImagen(file), nombre: file.name, tipo: 'image/jpeg', ext: 'jpg' };
      }
      lbl.textContent = '✓ ' + file.name;
    } catch (e) { lbl.textContent = 'Sin comprobante'; toast(e.message, true); }
  });

  modal.querySelector('#gf-guardar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const v = Object.fromEntries(new FormData(form));
    const monto = Number(v.monto);
    if (!v.centro_id) return toast('Elige el centro', true);
    if (!v.fecha) return toast('Pon la fecha', true);
    if (!(monto > 0)) return toast('El monto debe ser mayor a cero', true);
    if (!v.concepto.trim()) return toast('Escribe el concepto', true);

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const c = centro(v.centro_id);
      const comprobante_path = archivo ? await subirComprobante(archivo, v.fecha) : null;
      const { error } = await db().from('gastos').insert({
        org_id: estado.miembro.org_id, empresa_id: c.empresa_id, centro_id: c.id,
        fecha: v.fecha, monto: Math.round(monto * 100) / 100, concepto: v.concepto.trim(),
        proveedor: v.proveedor.trim() || null, categoria: v.categoria,
        estado: v.estado === 'por_pagar' ? 'por_pagar' : 'pagado',
        forma_pago: v.estado === 'por_pagar' ? null : v.forma_pago,
        fecha_vencimiento: v.estado === 'por_pagar' ? (v.fecha_vencimiento || null) : null,
        notas: v.notas.trim() || null, comprobante_path, capturado_por: estado.miembro.nombre,
      });
      if (error) throw error;
      cerrarModal();
      toast(v.estado === 'por_pagar' ? 'Pedido registrado como por pagar ✓' : 'Gasto registrado ✓');
      const fd = new Date(v.fecha + 'T12:00:00');
      if (fd.getMonth() !== f.mes || fd.getFullYear() !== f.anio) { f.mes = fd.getMonth(); f.anio = fd.getFullYear(); render(raiz); }
      else cargar();
    } catch (e) {
      toast('No se pudo guardar: ' + (e.message || e), true);
      btn.disabled = false; btn.textContent = 'Guardar gasto';
    }
  });
}

async function subirComprobante({ blob, tipo, ext }, fecha) {
  const ruta = `app/${estado.miembro.org_id}/${fecha.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET_COMPROBANTES).upload(ruta, blob, { contentType: tipo, upsert: false });
  if (!error) return sb.storage.from(BUCKET_COMPROBANTES).getPublicUrl(ruta).data.publicUrl;
  // Si el almacenamiento rechaza la subida, se guarda dentro del registro (como hacía el Centro de Control)
  console.warn('Subida a almacenamiento falló, se guarda en la base:', error.message);
  return blobADataURL(blob);
}
