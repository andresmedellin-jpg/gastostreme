// Pedidos de limpieza (Barby): por cada centro se escoge de un menú con lo que siempre se pide, con botones − / +.
// Se arma un solo mensaje con todos los centros ("Pedido 1 · Torre Elysium …") para copiar al correo o WhatsApp del
// proveedor, o un PDF. Al marcarlo como enviado queda un pedido por centro (historial: enviado → recibido).
// El pago lo captura Victoria en Gastos (categoría Limpieza). Tablas: insumos, insumo_centro, pedidos_insumos (0038).
import { db, estado, tieneRol, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';
import { MARCA } from '../config.js';

const ORDEN = ['Torre Elysium', 'Plaza GM 202', 'Plaza Hudson', 'Oficina'];      // como Barby los numera hoy
const NOTA_BASE = 'Favor de enviar las bolsas como se solicita, me han mandado grandes por medianas.';
const st = { vista: 'armar', centroId: null };
let raiz, centros = [], menu = [], catalogo = [], pedidos = [];

// Borrador del pedido y datos del mensaje: se guardan en este navegador para no perderlos al salir
const LS = 'pedidos-limpieza';
const leer = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const guardarLS = (d) => { try { localStorage.setItem(LS, JSON.stringify({ ...leer(), ...d })); } catch { /* sin almacenamiento */ } };
let carrito = leer().carrito || {};                       // { centroId: { insumoId: cantidad } }
const datosMsg = () => ({ saludo: 'Buenos días Vero', nota: NOTA_BASE, firma: estado.miembro?.nombre || '', proveedor: '', ...(leer().msg || {}) });

const PLURAL = { caja: 'cajas', rollo: 'rollos', bulto: 'bultos', cubeta: 'cubetas' };
const unidadTxt = (u, n) => (n > 1 && PLURAL[u]) || u;
const linea = (it, n) => `-${n} ${it.unidad === 'pza' ? '' : unidadTxt(it.unidad, n) + ' de '}${it.nombre}${it.medida ? ` (${it.medida})` : ''}`;
const insumo = (id) => catalogo.find((x) => x.id === id);
const nombreCentro = (id) => centros.find((c) => c.id === id)?.nombre || '';
const lineasDe = (cid) => Object.entries(carrito[cid] || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ it: insumo(id), n })).filter((x) => x.it);
const centrosConPedido = () => centros.filter((c) => lineasDe(c.id).length);

export async function render(view) {
  raiz = view;
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  const [c, m, k, p] = await Promise.all([
    db().rpc('pedidos_centros'),
    db().from('insumo_centro').select('centro_id, insumo_id, cantidad, orden').eq('activo', true),
    db().from('insumos').select('id, nombre, unidad, medida').eq('activo', true).order('nombre'),
    db().from('pedidos_insumos').select('id, centro_id, empresa_id, fecha, proveedor, estado, lineas, notas, recibido_en, capturado_por').order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(200),
  ]);
  const err = c.error || m.error || k.error || p.error;
  if (err) { view.innerHTML = `<div class="vacio">No se pudieron cargar los pedidos: ${esc(err.message)}</div>`; return; }
  centros = (c.data || []).sort((a, b) => (ORDEN.indexOf(a.nombre) + 1 || 99) - (ORDEN.indexOf(b.nombre) + 1 || 99) || a.nombre.localeCompare(b.nombre, 'es'));
  menu = m.data; catalogo = k.data; pedidos = p.data;
  if (!centros.some((x) => x.id === st.centroId)) st.centroId = centros[0]?.id || null;
  document.getElementById('page-actions').innerHTML = '';
  pintar();
}

function pintar() {
  raiz.innerHTML = `
    <div class="sub-head"><div class="tabs" role="tablist">
      ${[['armar', 'Armar pedido'], ['enviados', `Enviados${pedidos.filter((x) => x.estado === 'enviado').length ? ' · ' + pedidos.filter((x) => x.estado === 'enviado').length : ''}`]]
        .map(([id, t]) => `<button role="tab" data-v="${id}" aria-selected="${st.vista === id}">${t}</button>`).join('')}
    </div></div>
    <div id="pd-cuerpo"></div>`;
  raiz.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.v; pintar(); }));
  const el = raiz.querySelector('#pd-cuerpo');
  if (!centros.length) { el.innerHTML = '<div class="vacio">Todavía no hay centros con productos de limpieza.</div>'; return; }
  if (st.vista === 'enviados') return pintarEnviados(el);
  pintarArmar(el);
}

// ---------- armar pedido ----------
function pintarArmar(el) {
  const cid = st.centroId;
  const propios = menu.filter((x) => x.centro_id === cid).sort((a, b) => a.orden - b.orden).map((x) => ({ ...x, it: insumo(x.insumo_id) })).filter((x) => x.it);
  const sel = carrito[cid] || {};
  const n = (id) => sel[id] || 0;
  const conPedido = centrosConPedido();
  el.innerHTML = `
    <div class="pd-grid">
      <section class="panel pd-menu">
        <div class="segmento pd-centros" role="tablist" aria-label="Centro">${centros.map((c) => { const k = lineasDe(c.id).length;
          return `<button class="${c.id === cid ? 'activo' : ''}" data-c="${c.id}">${esc(c.nombre)}${k ? ` <span class="pd-badge">${k}</span>` : ''}</button>`; }).join('')}</div>
        <div class="pd-acciones">
          <button class="btn btn-sm btn-ghost" id="pd-siempre">Lo de siempre</button>
          ${ultimoDe(cid) ? '<button class="btn btn-sm btn-ghost" id="pd-ultimo">Repetir el último</button>' : ''}
          ${lineasDe(cid).length ? '<button class="btn btn-sm btn-ghost" id="pd-limpiar">Vaciar</button>' : ''}
          <button class="btn btn-sm btn-ghost" id="pd-otro">＋ Otro producto</button>
        </div>
        <ul class="pd-lista">${propios.map(({ it, cantidad }) => `
          <li class="${n(it.id) ? 'con' : ''}">
            <div><strong>${esc(it.nombre)}</strong><small>${esc([it.unidad, it.medida].filter(Boolean).join(' · '))} · de siempre ${cantidad}</small></div>
            <div class="pd-paso" role="group" aria-label="Cantidad de ${esc(it.nombre)}">
              <button type="button" data-menos="${it.id}" aria-label="Menos" ${n(it.id) ? '' : 'disabled'}>−</button>
              <output>${n(it.id)}</output>
              <button type="button" data-mas="${it.id}" aria-label="Más">＋</button>
            </div></li>`).join('') || '<li class="vacio">Este centro no tiene productos. Agrégalos con ＋ Otro producto.</li>'}</ul>
      </section>
      <aside class="panel pd-resumen">
        <h3>Tu pedido</h3>
        ${conPedido.length ? conPedido.map((c, i) => `<div class="pd-bloque"><strong>Pedido ${i + 1} · ${esc(c.nombre)}</strong>
          <ul>${lineasDe(c.id).map(({ it, n: q }) => `<li>${esc(linea(it, q).slice(1))}</li>`).join('')}</ul></div>`).join('')
          : '<p class="mut">Escoge productos con ＋ en cada centro.</p>'}
        <details class="pd-datos"><summary>Datos del mensaje</summary>
          <label>Saludo<input id="pd-saludo" maxlength="80" value="${esc(datosMsg().saludo)}"></label>
          <label>Nota para el proveedor<textarea id="pd-nota" rows="2" maxlength="300">${esc(datosMsg().nota)}</textarea></label>
          <label>Firma<textarea id="pd-firma" rows="2" maxlength="200">${esc(datosMsg().firma)}</textarea></label>
          <label>Proveedor <small>(para el historial)</small><input id="pd-prov" maxlength="80" value="${esc(datosMsg().proveedor)}" placeholder="Ej. Limpieza Vero"></label>
        </details>
        <div class="pd-botones">
          <button class="btn btn-primary" id="pd-copiar" ${conPedido.length ? '' : 'disabled'}>Copiar mensaje</button>
          <button class="btn btn-ghost" id="pd-pdf" ${conPedido.length ? '' : 'disabled'}>PDF</button>
        </div>
        <button class="btn btn-ghost btn-block" id="pd-enviado" ${conPedido.length ? '' : 'disabled'}>Ya lo envié: guardar pedido</button>
      </aside>
    </div>`;
  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { st.centroId = b.dataset.c; pintar(); }));
  const poner = (id, q) => { carrito[cid] = { ...(carrito[cid] || {}), [id]: Math.max(0, q) }; guardarLS({ carrito }); pintar(); };
  el.querySelectorAll('[data-mas]').forEach((b) => b.addEventListener('click', () => poner(b.dataset.mas, n(b.dataset.mas) + 1)));
  el.querySelectorAll('[data-menos]').forEach((b) => b.addEventListener('click', () => poner(b.dataset.menos, n(b.dataset.menos) - 1)));
  el.querySelector('#pd-siempre').addEventListener('click', () => {
    carrito[cid] = Object.fromEntries(propios.map((x) => [x.it.id, Number(x.cantidad)])); guardarLS({ carrito }); pintar();
  });
  el.querySelector('#pd-ultimo')?.addEventListener('click', () => {
    carrito[cid] = Object.fromEntries(ultimoDe(cid).lineas.map((l) => [l.insumo_id, Number(l.cantidad)])); guardarLS({ carrito }); pintar();
  });
  el.querySelector('#pd-limpiar')?.addEventListener('click', () => { delete carrito[cid]; guardarLS({ carrito }); pintar(); });
  el.querySelector('#pd-otro').addEventListener('click', () => otroProducto(cid));
  // Datos del mensaje: se recuerdan al escribir
  const datos = () => ({ saludo: el.querySelector('#pd-saludo').value.trim(), nota: el.querySelector('#pd-nota').value.trim(),
    firma: el.querySelector('#pd-firma').value.trim(), proveedor: el.querySelector('#pd-prov').value.trim() });
  el.querySelectorAll('.pd-datos input, .pd-datos textarea').forEach((x) => x.addEventListener('input', () => guardarLS({ msg: datos() })));
  el.querySelector('#pd-copiar').addEventListener('click', async () => {
    const texto = mensaje(datos());
    try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado: pégalo en el correo o WhatsApp'); }
    catch { verTexto(texto); }
  });
  el.querySelector('#pd-pdf').addEventListener('click', () => pdf(datos()));
  el.querySelector('#pd-enviado').addEventListener('click', (ev) => marcarEnviado(ev.currentTarget, datos()));
}

const ultimoDe = (cid) => pedidos.find((p) => p.centro_id === cid && p.estado !== 'cancelado' && (p.lineas || []).length);

function mensaje(d, lista = centrosConPedido().map((c) => ({ nombre: c.nombre, lineas: lineasDe(c.id).map(({ it, n }) => linea(it, n)) }))) {
  return [`${d.saludo}`, '', `Me puedes cotizar lo siguiente por favor.${d.nota ? ' ' + d.nota : ''}`, '',
    ...lista.flatMap((c, i) => [`Pedido ${i + 1} · ${c.nombre}`, ...c.lineas, '']),
    'Saludos', '', d.firma].join('\n').trim();
}

function verTexto(texto) {
  const modal = abrirModal({ titulo: 'Mensaje para el proveedor',
    cuerpo: `<p class="nota">No se pudo copiar solo. Selecciónalo y cópialo.</p><textarea class="pd-texto" rows="16" readonly>${esc(texto)}</textarea>`,
    pie: '<button class="btn btn-primary" id="vt-ok">Listo</button>' });
  modal.querySelector('#vt-ok').addEventListener('click', cerrarModal);
  modal.querySelector('textarea').select();
}

// PDF: hoja carta con el logo, la fecha y una tabla por centro; se guarda con "Imprimir → Guardar como PDF"
function pdf(d, lista = centrosConPedido().map((c) => ({ nombre: c.nombre, lineas: lineasDe(c.id) }))) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para ver el PDF', true);
  const logo = new URL(MARCA.reciboLogo || 'img/logo-treme.png', location.href).href;
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Solicitud de cotización ${hoyISO()}</title>
  <style>@page{size:letter;margin:16mm}body{font-family:Inter,Arial,sans-serif;color:#1a1a1a;margin:0;font-size:12px}
  .barra{position:sticky;top:0;background:#1a1a1a;padding:10px;text-align:center}.barra button{font:600 13px Arial;padding:8px 14px;border:0;border-radius:4px;cursor:pointer}
  .hoja{max-width:7.5in;margin:20px auto}.cab{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1a1a1a;padding-bottom:12px;margin-bottom:16px}
  .cab img{height:42px}.cab h1{font-size:17px;margin:0;text-align:right}.cab div{text-align:right;color:#555}
  h2{font-size:12px;color:#8B1A1A;letter-spacing:.4px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}
  th{background:#1a1a1a;color:#fff;text-align:left;padding:6px 8px;font-size:11px}td{border:1px solid #ddd;padding:6px 8px}
  td.c{text-align:center;width:70px}.nota{margin-top:16px;color:#333}@media print{.barra{display:none}.hoja{margin:0}}</style></head><body>
  <div class="barra"><button onclick="print()">Imprimir / Guardar PDF</button> <button onclick="close()">Cerrar</button></div>
  <div class="hoja"><div class="cab"><img src="${logo}" alt=""><div><h1>SOLICITUD DE COTIZACIÓN</h1><div>${esc(fecha)}</div></div></div>
  <p>${esc(d.saludo)}:<br>Me puedes cotizar lo siguiente por favor.</p>
  ${lista.map((c, i) => `<h2>PEDIDO ${i + 1} · ${esc(c.nombre.toUpperCase())}</h2><table><tr><th>Producto</th><th>Medida</th><th class="c">Cantidad</th><th class="c">Unidad</th></tr>
    ${c.lineas.map(({ it, n }) => `<tr><td>${esc(it.nombre)}</td><td>${esc(it.medida || '')}</td><td class="c">${n}</td><td class="c">${esc(unidadTxt(it.unidad, n))}</td></tr>`).join('')}</table>`).join('')}
  ${d.nota ? `<p class="nota"><b>Nota:</b> ${esc(d.nota)}</p>` : ''}
  <p class="nota">Saludos<br><br>${esc(d.firma).replace(/\n/g, '<br>')}</p></div></body></html>`);
  w.document.close();
}

async function marcarEnviado(btn, d) {
  const conPedido = centrosConPedido();
  if (!confirm(`¿Guardar ${conPedido.length === 1 ? 'el pedido' : `los ${conPedido.length} pedidos`} como enviado${conPedido.length === 1 ? '' : 's'}? El borrador se vacía.`)) return;
  btn.disabled = true;
  const filas = conPedido.map((c) => ({
    org_id: estado.miembro.org_id, empresa_id: c.empresa_id, centro_id: c.id, fecha: hoyISO(), proveedor: d.proveedor || null, estado: 'enviado',
    lineas: lineasDe(c.id).map(({ it, n }) => ({ insumo_id: it.id, nombre: it.nombre, unidad: it.unidad, medida: it.medida, cantidad: n })),
    notas: d.nota || null, capturado_por: estado.miembro.nombre,
  }));
  const { error } = await db().from('pedidos_insumos').insert(filas);
  if (error) { btn.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
  carrito = {}; guardarLS({ carrito });
  toast('Pedido guardado ✓'); st.vista = 'enviados'; render(raiz);
}

function otroProducto(cid) {
  const yaEn = new Set(menu.filter((x) => x.centro_id === cid).map((x) => x.insumo_id));
  const otros = catalogo.filter((x) => !yaEn.has(x.id));
  const modal = abrirModal({
    titulo: `Agregar producto · ${nombreCentro(cid)}`,
    cuerpo: `<form class="form" id="of" novalidate>
      ${otros.length ? `<label>De la lista<select name="cat"><option value="">— Producto nuevo —</option>${otros.map((x) =>
        `<option value="${x.id}">${esc(x.nombre)}${x.medida ? ` (${esc(x.medida)})` : ''}</option>`).join('')}</select></label>` : ''}
      <div id="of-nuevo"><label>Producto nuevo<input name="nombre" maxlength="100" placeholder="Ej. Pinol de 1 L"></label>
      <div class="form-2"><label>Se pide por<select name="unidad">${['pza', 'paq', 'gal', 'kg', 'rollo', 'caja', 'L', 'bulto', 'cubeta'].map((u) => `<option>${u}</option>`).join('')}</select></label>
        <label>Medida <small>(opcional)</small><input name="medida" maxlength="40" placeholder="Ej. .70 x .90 cm"></label></div></div>
      <label>¿Cuántos se piden normalmente?<input type="number" name="cant" min="1" step="1" value="1" inputmode="numeric"></label>
      <p class="nota">Queda en el menú de ${esc(nombreCentro(cid))} para las siguientes veces.</p>
    </form>`,
    pie: '<button class="btn btn-ghost" id="of-no">Cancelar</button><button class="btn btn-primary" id="of-si">Agregar</button>',
  });
  const f = modal.querySelector('#of');
  const verNuevo = () => { const n = modal.querySelector('#of-nuevo'); n.hidden = !!f.cat?.value; };
  f.cat?.addEventListener('change', verNuevo); verNuevo();
  modal.querySelector('#of-no').addEventListener('click', cerrarModal);
  modal.querySelector('#of-si').addEventListener('click', async (ev) => {
    const cant = Math.max(1, Number(f.cant.value) || 1);
    let id = f.cat?.value || null;
    ev.currentTarget.disabled = true;
    if (!id) {
      const nombre = f.nombre.value.trim();
      if (!nombre) { ev.currentTarget.disabled = false; return toast('Escribe el producto', true); }
      const ya = catalogo.find((x) => normalizar(x.nombre) === normalizar(nombre) && (x.medida || '') === f.medida.value.trim());
      if (ya) id = ya.id;
      else {
        const { data, error } = await db().from('insumos').insert({ org_id: estado.miembro.org_id, nombre, unidad: f.unidad.value, medida: f.medida.value.trim() || null, activo: true }).select('id').single();
        if (error) { ev.currentTarget.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
        id = data.id;
      }
    }
    const orden = Math.max(0, ...menu.filter((x) => x.centro_id === cid).map((x) => x.orden)) + 1;
    const { error } = await db().from('insumo_centro').upsert({ org_id: estado.miembro.org_id, insumo_id: id, centro_id: cid, cantidad: cant, orden, activo: true }, { onConflict: 'insumo_id,centro_id' });
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
    carrito[cid] = { ...(carrito[cid] || {}), [id]: cant }; guardarLS({ carrito });
    cerrarModal(); toast('Producto agregado ✓'); render(raiz);
  });
}

// ---------- enviados ----------
function pintarEnviados(el) {
  const puedeVerTodo = tieneRol(['administracion']);
  el.innerHTML = `<section class="panel">
      <div class="panel-head"><h3>Pedidos enviados</h3>${puedeVerTodo ? '<span class="mut">El pago lo registra Victoria en Gastos (Limpieza).</span>' : ''}</div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Centro</th><th>Productos</th><th>Estado</th><th></th></tr></thead>
        <tbody>${pedidos.map((p) => `<tr class="${p.estado === 'cancelado' ? 'inactivo' : ''}">
          <td class="nowrap mut" data-l="Fecha">${fmtFecha(p.fecha)}</td>
          <td data-l="Centro"><strong>${esc(nombreCentro(p.centro_id) || '—')}</strong>${p.proveedor ? `<small class="sub">${esc(p.proveedor)}</small>` : ''}</td>
          <td class="mut" data-l="Productos">${(p.lineas || []).length} producto${(p.lineas || []).length === 1 ? '' : 's'}</td>
          <td data-l="Estado">${p.estado === 'recibido' ? `<span class="badge verde">Recibido</span>${p.recibido_en ? ` <small class="mut">${fmtFecha(p.recibido_en)}</small>` : ''}`
            : p.estado === 'cancelado' ? '<span class="badge gris">Cancelado</span>' : '<span class="badge ambar">Enviado</span>'}</td>
          <td class="acciones nowrap"><button class="btn btn-sm btn-ghost" data-ver="${p.id}">Ver</button>
            ${p.estado === 'enviado' ? `<button class="btn btn-sm btn-primary" data-rec="${p.id}">Llegó</button>` : ''}
            <button class="btn btn-sm btn-ghost" data-rep="${p.id}">Repetir</button></td></tr>`).join('')
          || '<tr><td colspan="5" class="vacio">Todavía no hay pedidos enviados</td></tr>'}</tbody>
      </table></div></section>`;
  const ped = (id) => pedidos.find((x) => x.id === id);
  el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verPedido(ped(b.dataset.ver))));
  el.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', async () => {
    const { error } = await db().from('pedidos_insumos').update({ estado: 'recibido', recibido_en: hoyISO() }).eq('id', b.dataset.rec);
    if (error) return toast('No se pudo guardar: ' + error.message, true);
    toast('Marcado como recibido ✓'); render(raiz);
  }));
  el.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => {
    const p = ped(b.dataset.rep);
    carrito[p.centro_id] = Object.fromEntries((p.lineas || []).filter((l) => insumo(l.insumo_id)).map((l) => [l.insumo_id, Number(l.cantidad)]));
    guardarLS({ carrito }); st.centroId = p.centro_id; st.vista = 'armar'; pintar();
    toast('Pedido cargado: ajusta cantidades y envíalo');
  }));
}

function verPedido(p) {
  const texto = mensaje(datosMsg(), [{ nombre: nombreCentro(p.centro_id), lineas: (p.lineas || []).map((l) => linea(l, l.cantidad)) }]);
  const modal = abrirModal({
    titulo: `${nombreCentro(p.centro_id)} · ${fmtFecha(p.fecha)}`,
    cuerpo: `<ul class="pd-ver">${(p.lineas || []).map((l) => `<li>${esc(linea(l, l.cantidad).slice(1))}</li>`).join('')}</ul>
      <p class="nota">Lo pidió ${esc(p.capturado_por || '—')}${p.proveedor ? ` a ${esc(p.proveedor)}` : ''}.</p>`,
    pie: `${p.estado === 'enviado' ? '<button class="btn btn-ghost peligro" id="vp-cancel">Cancelar pedido</button>' : ''}<button class="btn btn-ghost" id="vp-copiar">Copiar mensaje</button><button class="btn btn-primary" id="vp-ok">Listo</button>`,
  });
  modal.querySelector('#vp-ok').addEventListener('click', cerrarModal);
  modal.querySelector('#vp-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado'); } catch { verTexto(texto); }
  });
  modal.querySelector('#vp-cancel')?.addEventListener('click', async () => {
    if (!confirm('¿Cancelar este pedido?')) return;
    const { error } = await db().from('pedidos_insumos').update({ estado: 'cancelado' }).eq('id', p.id);
    if (error) return toast('No se pudo: ' + error.message, true);
    cerrarModal(); toast('Pedido cancelado'); render(raiz);
  });
}
