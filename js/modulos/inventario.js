// Inventario: catálogo de productos (válvulas, refacciones) y sus movimientos.
// La existencia de cada producto = entradas − salidas (+/− ajustes). Nada se "edita" a mano: todo es un movimiento,
// así queda la historia de quién metió o sacó qué, cuándo y para qué proyecto.
// Tablas: productos, inventario_movs.
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';

export const CATEGORIAS_PRODUCTO = ['Válvula de bola', 'Válvula de compuerta', 'Válvula de mariposa', 'Válvula check',
  'Válvula de globo', 'Válvula de alivio', 'Regulador', 'Actuador', 'Refacción / kit', 'Otro'];
const TIPOS = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' };

const st = { q: '', cat: '', bajos: false };
let raiz, productos = [], movs = [];

export async function render(view) {
  raiz = view;
  const puede = tieneRol(['administracion', 'operacion']);
  document.getElementById('page-actions').innerHTML = puede
    ? `<button class="btn btn-ghost" id="inv-mov">Movimiento</button><button class="btn btn-primary" id="inv-nuevo">＋ Producto</button>` : '';
  document.getElementById('inv-nuevo')?.addEventListener('click', () => editarProducto(null));
  document.getElementById('inv-mov')?.addEventListener('click', () => movimiento(null, 'entrada'));
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  await cargar();
}

// Existencias y costo promedio de cada producto a partir de sus movimientos
export function existencias(prods, lista) {
  const m = new Map(prods.map((p) => [p.id, 0]));
  lista.forEach((x) => {
    const q = Number(x.cantidad || 0);
    m.set(x.producto_id, (m.get(x.producto_id) || 0) + (x.tipo === 'salida' ? -q : q));
  });
  return m;
}

async function cargar() {
  const [p, m] = await Promise.all([
    db().from('productos').select('*').eq('activo', true).order('clave'),
    todo(() => db().from('inventario_movs').select('*')),
  ]);
  if (p.error || m.error) { raiz.innerHTML = `<div class="vacio">No se pudo cargar el inventario: ${esc((p.error || m.error).message)}</div>`; return; }
  movs = m.data;
  const ex = existencias(p.data, movs);
  productos = p.data.map((x) => ({ ...x, existencia: ex.get(x.id) || 0 }));
  pintar();
}

const bajo = (p) => Number(p.minimo || 0) > 0 && p.existencia <= Number(p.minimo);
const nombreCentro = (id) => estado.centros.find((c) => c.id === id)?.nombre || '';

function pintar() {
  const mes = hoyISO().slice(0, 7);
  const valor = productos.reduce((s, p) => s + Math.max(0, p.existencia) * Number(p.costo || 0), 0);
  const valorVenta = productos.reduce((s, p) => s + Math.max(0, p.existencia) * Number(p.precio || 0), 0);
  const bajos = productos.filter(bajo);
  const movMes = movs.filter((x) => (x.fecha || '').startsWith(mes));
  const salidasMes = movMes.filter((x) => x.tipo === 'salida').reduce((s, x) => s + Number(x.cantidad) * Number(productos.find((p) => p.id === x.producto_id)?.costo || 0), 0);

  let lista = productos;
  if (st.cat) lista = lista.filter((p) => p.categoria === st.cat);
  if (st.bajos) lista = lista.filter(bajo);
  if (st.q) lista = lista.filter((p) => normalizar(`${p.clave} ${p.descripcion} ${p.marca || ''} ${p.medida || ''}`).includes(normalizar(st.q)));
  const puede = tieneRol(['administracion', 'operacion']);

  raiz.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Valor del almacén</span><strong>${fmt(valor)}</strong><small>a costo · ${fmt(valorVenta)} a precio de venta</small></div>
      <div class="kpi"><span>Productos</span><strong>${productos.length}</strong><small>${productos.reduce((s, p) => s + Math.max(0, p.existencia), 0).toLocaleString('es-MX')} piezas en existencia</small></div>
      <div class="kpi"><span>Bajo el mínimo</span><strong class="${bajos.length ? 'neg' : 'pos'}">${bajos.length}</strong><small>${bajos.length ? 'hay que resurtir' : 'todo surtido'}</small></div>
      <div class="kpi"><span>Salidas del mes</span><strong>${fmt(salidasMes)}</strong><small>${movMes.length} movimientos este mes</small></div>
    </div>
    ${bajos.length ? `<section class="panel aviso-panel"><div class="panel-head"><h3>Por resurtir · ${bajos.length}</h3>
      <button class="btn btn-sm btn-ghost" id="inv-verbajos">${st.bajos ? 'Ver todos' : 'Ver solo estos'}</button></div>
      <p class="sub-meta" style="margin:0">${bajos.slice(0, 6).map((p) => `<b>${esc(p.clave)}</b> ${esc(p.descripcion)} (${p.existencia} de mín. ${p.minimo})`).join(' · ')}${bajos.length > 6 ? ' …' : ''}</p></section>` : ''}
    <section class="panel">
      <div class="panel-head">
        <h3>${lista.length} producto${lista.length === 1 ? '' : 's'}</h3>
        <div class="filtros filtros-sm">
          <input type="search" id="inv-q" placeholder="Buscar clave, medida, marca…" value="${esc(st.q)}" aria-label="Buscar producto">
          <select id="inv-cat" aria-label="Categoría"><option value="">Todas las categorías</option>
            ${CATEGORIAS_PRODUCTO.map((c) => `<option ${st.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Clave</th><th>Producto</th><th>Categoría</th><th class="num">Existencia</th><th class="num">Costo</th><th class="num">Precio</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${lista.map((p) => `<tr>
          <td class="mut nowrap" data-l="Fecha">${esc(p.clave)}</td>
          <td class="concepto" data-l="Concepto">${esc(p.descripcion)}<small class="sub">${esc([p.marca, p.medida, p.clase, p.ubicacion && 'Ubic. ' + p.ubicacion].filter(Boolean).join(' · '))}</small></td>
          <td data-l="Categoría"><span class="tag tag-suave">${esc(p.categoria || '—')}</span></td>
          <td class="num fuerte ${bajo(p) ? 'neg' : ''}" data-l="Monto">${p.existencia.toLocaleString('es-MX')} ${esc(p.unidad || 'pza')}${p.minimo ? `<small class="sub">mín. ${p.minimo}</small>` : ''}</td>
          <td class="num mut" data-l="Costo">${fmt(p.costo)}</td>
          <td class="num" data-l="Precio">${fmt(p.precio)}</td>
          <td class="num" data-l="Valor">${fmt(Math.max(0, p.existencia) * Number(p.costo || 0))}</td>
          <td class="acciones">${puede ? `<button class="icon-btn" data-entrada="${p.id}" title="Entrada (compra)" aria-label="Entrada">＋</button>
            <button class="icon-btn" data-salida="${p.id}" title="Salida (venta o servicio)" aria-label="Salida">−</button>` : ''}
            <button class="icon-btn" data-hist="${p.id}" title="Movimientos" aria-label="Movimientos">☰</button>
            ${puede ? `<button class="icon-btn" data-editar="${p.id}" title="Editar producto" aria-label="Editar producto">✎</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="vacio">Sin productos para este filtro</td></tr>'}</tbody>
      </table></div>
    </section>
    <p class="nota">La existencia se calcula con las entradas y salidas; para corregir un conteo físico usa "Movimiento → Ajuste".</p>`;

  const q = raiz.querySelector('#inv-q');
  q.addEventListener('input', () => { st.q = q.value; const pos = q.selectionStart; pintar(); const n = raiz.querySelector('#inv-q'); n.focus(); n.setSelectionRange(pos, pos); });
  raiz.querySelector('#inv-cat').addEventListener('change', (e) => { st.cat = e.target.value; pintar(); });
  raiz.querySelector('#inv-verbajos')?.addEventListener('click', () => { st.bajos = !st.bajos; pintar(); });
  const por = (id) => productos.find((p) => p.id === id);
  raiz.querySelectorAll('[data-entrada]').forEach((b) => b.addEventListener('click', () => movimiento(por(b.dataset.entrada), 'entrada')));
  raiz.querySelectorAll('[data-salida]').forEach((b) => b.addEventListener('click', () => movimiento(por(b.dataset.salida), 'salida')));
  raiz.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => historial(por(b.dataset.hist))));
  raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarProducto(por(b.dataset.editar))));
}

function editarProducto(p) {
  const emps = estado.empresas;
  const modal = abrirModal({
    titulo: p ? 'Editar producto' : 'Nuevo producto',
    cuerpo: `<form class="form" id="fp">
      <div class="form-2"><label>Clave<input name="clave" required maxlength="40" value="${esc(p?.clave || '')}" placeholder="VB-200-150"></label>
        <label>Categoría<select name="categoria">${CATEGORIAS_PRODUCTO.map((c) => `<option ${p?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
      <label>Descripción<input name="descripcion" required maxlength="200" value="${esc(p?.descripcion || '')}" placeholder="Válvula de bola bridada 2&quot; acero al carbón"></label>
      <div class="form-2"><label>Marca<input name="marca" maxlength="60" value="${esc(p?.marca || '')}"></label>
        <label>Medida<input name="medida" maxlength="30" value="${esc(p?.medida || '')}" placeholder='2"'></label></div>
      <div class="form-2"><label>Clase / presión<input name="clase" maxlength="40" value="${esc(p?.clase || '')}" placeholder="Clase 150"></label>
        <label>Ubicación en almacén<input name="ubicacion" maxlength="40" value="${esc(p?.ubicacion || '')}" placeholder="Rack A-3"></label></div>
      <div class="form-2"><label>Costo (compra)<input type="number" name="costo" min="0" step="0.01" value="${p?.costo ?? ''}" required></label>
        <label>Precio de venta<input type="number" name="precio" min="0" step="0.01" value="${p?.precio ?? ''}" required></label></div>
      <div class="form-2"><label>Mínimo en almacén<input type="number" name="minimo" min="0" step="1" value="${p?.minimo ?? 0}"></label>
        <label>Unidad<input name="unidad" maxlength="10" value="${esc(p?.unidad || 'pza')}"></label></div>
      ${emps.length > 1 ? `<label>Empresa<select name="empresa">${emps.map((e) => `<option value="${e.id}" ${p?.empresa_id === e.id ? 'selected' : ''}>${esc(e.nombre_corto)}</option>`).join('')}</select></label>` : ''}
      ${p ? '' : '<label>Existencia inicial<input type="number" name="inicial" min="0" step="1" value="0"><small>Se registra como una entrada de hoy.</small></label>'}
    </form>`,
    pie: `${p ? '<button class="btn btn-ghost btn-peligro" id="fp-baja" style="margin-right:auto">Dar de baja</button>' : ''}<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="fp-ok">Guardar</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#fp');
  modal.querySelector('#fp-baja')?.addEventListener('click', async () => {
    if (!confirm(`¿Dar de baja ${p.clave}? Deja de aparecer en el inventario, pero su historia se conserva.`)) return;
    const { error } = await db().from('productos').update({ activo: false }).eq('id', p.id);
    if (error) return toast(error.message, true);
    cerrarModal(); toast('Producto dado de baja'); cargar();
  });
  modal.querySelector('#fp-ok').addEventListener('click', async (ev) => {
    if (!f.reportValidity()) return;
    const datos = { clave: f.clave.value.trim(), categoria: f.categoria.value, descripcion: f.descripcion.value.trim(),
      marca: f.marca.value.trim() || null, medida: f.medida.value.trim() || null, clase: f.clase.value.trim() || null,
      ubicacion: f.ubicacion.value.trim() || null, costo: Number(f.costo.value), precio: Number(f.precio.value),
      minimo: Number(f.minimo.value) || 0, unidad: f.unidad.value.trim() || 'pza',
      empresa_id: f.empresa?.value || p?.empresa_id || estado.empresas[0]?.id };
    if (productos.some((x) => x.clave.toLowerCase() === datos.clave.toLowerCase() && x.id !== p?.id)) return toast('Ya existe un producto con esa clave', true);
    ev.currentTarget.disabled = true;
    const r = p ? await db().from('productos').update(datos).eq('id', p.id)
      : await db().from('productos').insert({ ...datos, org_id: estado.miembro.org_id, activo: true }).select().single();
    if (r.error) { ev.currentTarget.disabled = false; return toast('No se pudo guardar: ' + r.error.message, true); }
    const ini = Number(f.inicial?.value || 0);
    if (!p && ini > 0) await db().from('inventario_movs').insert({ org_id: estado.miembro.org_id, producto_id: r.data.id, fecha: hoyISO(),
      tipo: 'entrada', cantidad: ini, costo_unitario: datos.costo, referencia: 'Existencia inicial', capturado_por: estado.miembro.nombre });
    cerrarModal(); toast(p ? 'Producto actualizado ✓' : 'Producto agregado ✓'); cargar();
  });
}

export function movimiento(p, tipo, { alGuardar } = {}) {
  const obras = estado.centros.filter((c) => c.tipo === 'obra');
  const modal = abrirModal({
    titulo: 'Movimiento de inventario',
    cuerpo: `<form class="form" id="fm">
      <label>Producto<select name="producto" required>${productos.map((x) => `<option value="${x.id}" ${p?.id === x.id ? 'selected' : ''}>${esc(x.clave)} · ${esc(x.descripcion)} (hay ${x.existencia})</option>`).join('')}</select></label>
      <div class="form-2">
        <label>Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label>
      </div>
      <div class="form-2">
        <label><span id="fm-lcant">Cantidad</span><input type="number" name="cantidad" step="1" required></label>
        <label id="fm-costo">Costo unitario<input type="number" name="costo" min="0" step="0.01"></label>
      </div>
      <label id="fm-obra">Proyecto / servicio <small>(opcional)</small><select name="centro"><option value="">— Venta de mostrador / ninguno —</option>
        ${obras.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></label>
      <label>Referencia <small>(factura, remisión, cotización)</small><input name="referencia" maxlength="120"></label>
      <label>Notas<input name="notas" maxlength="200"></label>
    </form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="fm-ok">Guardar movimiento</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#fm');
  const prod = () => productos.find((x) => x.id === f.producto.value);
  const ajustar = () => {
    const t = f.tipo.value;
    modal.querySelector('#fm-costo').hidden = t !== 'entrada';
    modal.querySelector('#fm-obra').hidden = t !== 'salida';
    modal.querySelector('#fm-lcant').textContent = t === 'ajuste' ? 'Cantidad (+ suma, − resta)' : 'Cantidad';
    f.cantidad.min = t === 'ajuste' ? '' : '1';
    if (t === 'entrada' && !f.costo.value) f.costo.value = prod()?.costo ?? '';
  };
  f.tipo.addEventListener('change', ajustar);
  f.producto.addEventListener('change', () => { f.costo.value = prod()?.costo ?? ''; });
  ajustar();
  modal.querySelector('#fm-ok').addEventListener('click', async (ev) => {
    if (!f.reportValidity()) return;
    const t = f.tipo.value, q = Number(f.cantidad.value), x = prod();
    if (!q || (t !== 'ajuste' && q < 0)) return toast('Pon una cantidad válida', true);
    if (t === 'salida' && q > x.existencia) return toast(`Solo hay ${x.existencia} ${x.unidad || 'pza'} de ${x.clave}`, true);
    ev.currentTarget.disabled = true;
    const { error } = await db().from('inventario_movs').insert({ org_id: estado.miembro.org_id, producto_id: x.id, fecha: f.fecha.value,
      tipo: t, cantidad: q, costo_unitario: t === 'entrada' ? Number(f.costo.value || x.costo) : Number(x.costo),
      centro_id: t === 'salida' ? (f.centro.value || null) : null, referencia: f.referencia.value.trim() || null,
      notas: f.notas.value.trim() || null, capturado_por: estado.miembro.nombre });
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
    cerrarModal(); toast(`${TIPOS[t]} registrada ✓`);
    alGuardar ? alGuardar() : cargar();
  });
}

function historial(p) {
  const lista = movs.filter((x) => x.producto_id === p.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado_en || '').localeCompare(a.creado_en || ''));
  abrirModal({
    titulo: `${p.clave} · movimientos`, ancho: true,
    cuerpo: `<p class="sub-meta">${esc(p.descripcion)} · existencia actual <b>${p.existencia} ${esc(p.unidad || 'pza')}</b></p>
      <div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Referencia</th><th>Proyecto</th><th class="num">Cantidad</th></tr></thead>
      <tbody>${lista.map((x) => `<tr><td class="mut nowrap" data-l="Fecha">${fmtFecha(x.fecha)}</td>
        <td data-l="Tipo"><span class="tag ${x.tipo === 'entrada' ? 'tag-ok' : x.tipo === 'salida' ? 'tag-suave' : 'tag-aviso'}">${TIPOS[x.tipo]}</span></td>
        <td class="concepto" data-l="Concepto">${esc(x.referencia || '—')}${x.notas ? `<small class="sub">${esc(x.notas)}</small>` : ''}</td>
        <td class="mut" data-l="Proyecto">${esc(nombreCentro(x.centro_id) || '—')}</td>
        <td class="num fuerte ${x.tipo === 'salida' ? 'neg' : 'pos'}" data-l="Monto">${x.tipo === 'salida' ? '−' : x.cantidad > 0 ? '+' : ''}${Math.abs(x.cantidad)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="vacio">Sin movimientos</td></tr>'}</tbody></table></div>`,
  });
}
