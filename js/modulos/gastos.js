import { CATEGORIAS, FORMAS_PAGO, MESES, BUCKET_COMPROBANTES } from '../config.js';
import { sb, db, estado, esAdmin, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal,
         comprimirImagen, blobADataURL, abrirComprobante } from '../lib.js';

const PRIVADOS = ['socio', 'personal'];   // Casa y Socios: fuera de "Todos" (como en el Centro de Control)

const f = {                                // filtros vigentes
  mes: new Date().getMonth(),
  anio: new Date().getFullYear(),
  centro: 'todos',                         // 'todos' | 'emp:<id>' | <centro_id>
  categoria: '', forma: '', q: '',
};
let datos = [];                            // gastos del mes (todos los centros visibles)
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
  const { data, error } = await db().from('gastos')
    .select('id, fecha, monto, concepto, proveedor, categoria, forma_pago, comprobante_path, notas, centro_id, empresa_id, capturado_por')
    .gte('fecha', iso(desde)).lt('fecha', iso(hasta))
    .order('fecha', { ascending: false }).limit(5000);
  if (error) { toast('No se pudieron cargar los gastos: ' + error.message, true); datos = []; }
  else datos = data;
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

function pintar() { pintarKPIs(); pintarCategorias(); pintarCentros(); pintarTabla(); }

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
    <div class="kpi"><span>Total del mes</span><strong class="neg">${fmt(total)}</strong><small>${d.length} gasto${d.length === 1 ? '' : 's'}</small></div>
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
      <td class="mut" data-l="Forma">${esc(g.forma_pago || '—')}</td>
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

async function borrar(id) {
  const g = datos.find((x) => x.id === id);
  if (!confirm(`¿Eliminar "${g?.concepto}" por ${fmt(g?.monto)}?\nQueda registrado en la bitácora.`)) return;
  const { error } = await db().from('gastos').delete().eq('id', id);
  if (error) return toast('No se pudo eliminar: ' + error.message, true);
  datos = datos.filter((x) => x.id !== id);
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
        <label>Centro<select name="centro_id" required>${opcionesCentro(false)}</select></label>
        <div class="form-2">
          <label>Fecha<input type="date" name="fecha" required value="${hoyISO()}"></label>
          <label>Monto<input type="number" name="monto" required min="0.01" step="0.01" inputmode="decimal" placeholder="0.00"></label>
        </div>
        <label>Concepto<input name="concepto" required maxlength="200" placeholder="¿En qué se gastó?"></label>
        <label>Proveedor <small>(opcional)</small><input name="proveedor" maxlength="120"></label>
        <div class="form-2">
          <label>Categoría<select name="categoria">${Object.keys(CATEGORIAS).map((c) => `<option>${c}</option>`).join('')}</select></label>
          <label>Forma de pago<select name="forma_pago">${FORMAS_PAGO.map((x) => `<option>${x}</option>`).join('')}</select></label>
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
        proveedor: v.proveedor.trim() || null, categoria: v.categoria, forma_pago: v.forma_pago,
        notas: v.notas.trim() || null, comprobante_path, capturado_por: estado.miembro.nombre,
      });
      if (error) throw error;
      cerrarModal();
      toast('Gasto registrado ✓');
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
