// Cotizaciones: partidas de productos del inventario y de mano de obra / servicio, con IVA.
// Estados: borrador → enviada → aceptada / rechazada. Una cotización aceptada se puede convertir en proyecto
// (centro tipo "obra" + cuenta por cobrar al cliente, igual que las obras) y descontar del inventario lo que lleva.
// Tabla: cotizaciones (las partidas viven dentro, en "partidas").
import { MARCA } from '../config.js';
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';
import { existencias } from './inventario.js';
import { pdfCotizacion } from '../cotizacion-pdf.js';

const IVA = 0.16;
const ESTADOS = {
  borrador: { t: 'Borrador', c: 'tag-suave' },
  enviada: { t: 'Enviada', c: 'tag-aviso' },
  aceptada: { t: 'Aceptada', c: 'tag-ok' },
  rechazada: { t: 'Rechazada', c: '' },
};
const st = { estado: '', q: '' };
let raiz, cots = [], productos = [];

export async function render(view) {
  raiz = view;
  document.getElementById('page-actions').innerHTML = puede() ? '<button class="btn btn-primary" id="c-nueva">＋ Cotización</button>' : '';
  document.getElementById('c-nueva')?.addEventListener('click', () => editar(null));
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  await cargar();
}
const puede = () => tieneRol(['administracion', 'cobranza']);

async function cargar() {
  const [c, p, m] = await Promise.all([
    todo(() => db().from('cotizaciones').select('*')),
    db().from('productos').select('*').eq('activo', true).order('clave'),
    todo(() => db().from('inventario_movs').select('producto_id, tipo, cantidad')),
  ]);
  if (c.error) { raiz.innerHTML = `<div class="vacio">No se pudieron cargar las cotizaciones: ${esc(c.error.message)}</div>`; return; }
  const ex = existencias(p.data || [], m.data || []);
  productos = (p.data || []).map((x) => ({ ...x, existencia: ex.get(x.id) || 0 }));
  cots = c.data.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.folio || '').localeCompare(a.folio || ''));
  pintar();
}

export const totales = (partidas = []) => {
  const subtotal = partidas.reduce((s, x) => s + Number(x.cantidad || 0) * Number(x.precio || 0), 0);
  const r2 = (n) => Math.round(n * 100) / 100;
  return { subtotal: r2(subtotal), iva: r2(subtotal * IVA), total: r2(subtotal * (1 + IVA)) };
};
const vence = (c) => { const d = new Date(c.fecha + 'T12:00:00'); d.setDate(d.getDate() + Number(c.vigencia_dias || 15)); return d.toISOString().slice(0, 10); };

function pintar() {
  const mes = hoyISO().slice(0, 7);
  const delMes = cots.filter((c) => (c.fecha || '').startsWith(mes));
  const abiertas = cots.filter((c) => c.estado === 'enviada');
  const cerradas = cots.filter((c) => ['aceptada', 'rechazada'].includes(c.estado));
  const ganadas = cots.filter((c) => c.estado === 'aceptada');
  const tasa = cerradas.length ? Math.round(ganadas.length / cerradas.length * 100) : 0;
  const T = (l) => l.reduce((s, c) => s + totales(c.partidas).total, 0);

  let lista = cots;
  if (st.estado) lista = lista.filter((c) => c.estado === st.estado);
  if (st.q) lista = lista.filter((c) => normalizar(`${c.folio} ${c.cliente} ${c.titulo || ''}`).includes(normalizar(st.q)));
  const hoy = hoyISO();

  raiz.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Cotizado este mes</span><strong>${fmt(T(delMes))}</strong><small>${delMes.length} cotizaciones</small></div>
      <div class="kpi"><span>Esperando respuesta</span><strong class="${abiertas.length ? 'neg' : ''}">${fmt(T(abiertas))}</strong><small>${abiertas.length} enviadas</small></div>
      <div class="kpi"><span>Ganadas</span><strong class="pos">${fmt(T(ganadas))}</strong><small>${ganadas.length} aceptadas</small></div>
      <div class="kpi"><span>Tasa de cierre</span><strong>${tasa}%</strong><small>de las que ya tienen respuesta</small></div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <div class="tabs" role="tablist">
          <button role="tab" data-est="" aria-selected="${!st.estado}">Todas</button>
          ${Object.entries(ESTADOS).map(([k, e]) => `<button role="tab" data-est="${k}" aria-selected="${st.estado === k}">${e.t} <small>${cots.filter((c) => c.estado === k).length}</small></button>`).join('')}
        </div>
        <div class="filtros filtros-sm"><input type="search" id="c-q" placeholder="Buscar folio o cliente" value="${esc(st.q)}" aria-label="Buscar cotización"></div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Asunto</th><th>Estado</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${lista.map((c) => {
          const vencida = c.estado === 'enviada' && vence(c) < hoy;
          return `<tr class="clic" data-abrir="${c.id}">
          <td class="nowrap fuerte" data-l="Folio">${esc(c.folio)}</td>
          <td class="mut nowrap" data-l="Fecha">${fmtFecha(c.fecha)}</td>
          <td data-l="Concepto"><b>${esc(c.cliente)}</b><small class="sub">${esc(c.titulo || '')}</small></td>
          <td class="mut corto" data-l="Asunto">${esc(c.titulo || '—')}</td>
          <td data-l="Estado"><span class="tag ${ESTADOS[c.estado]?.c || ''}">${ESTADOS[c.estado]?.t || c.estado}</span>${vencida ? ' <span class="tag tag-aviso">vencida</span>' : ''}${c.centro_id ? ' <span class="tag">proyecto</span>' : ''}</td>
          <td class="num fuerte" data-l="Monto">${fmt(totales(c.partidas).total)}</td>
          <td class="acciones"><button class="btn btn-sm btn-ghost" data-pdf="${c.id}">PDF</button></td></tr>`;
        }).join('') || '<tr><td colspan="7" class="vacio">Sin cotizaciones</td></tr>'}</tbody>
      </table></div>
    </section>`;

  raiz.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', () => { st.estado = b.dataset.est; pintar(); }));
  const q = raiz.querySelector('#c-q');
  q.addEventListener('input', () => { st.q = q.value; const pos = q.selectionStart; pintar(); const n = raiz.querySelector('#c-q'); n.focus(); n.setSelectionRange(pos, pos); });
  raiz.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pdfCotizacion(cots.find((c) => c.id === b.dataset.pdf), empresaDe); }));
  raiz.querySelectorAll('[data-abrir]').forEach((tr) => tr.addEventListener('click', () => editar(cots.find((c) => c.id === tr.dataset.abrir))));
}
const empresaDe = (id) => estado.empresas.find((e) => e.id === id) || estado.empresas[0];

function siguienteFolio() {
  const n = Math.max(0, ...cots.map((c) => Number(String(c.folio || '').replace(/\D/g, '')) || 0)) + 1;
  return 'COT-' + String(n).padStart(4, '0');
}

// ---------- editor ----------
function editar(c) {
  const nueva = !c;
  const doc = c ? JSON.parse(JSON.stringify(c)) : {
    folio: siguienteFolio(), fecha: hoyISO(), vigencia_dias: 15, estado: 'borrador', cliente: '', contacto: '', correo: '',
    titulo: '', empresa_id: estado.empresas[0]?.id, partidas: [],
    condiciones: 'Precios en pesos mexicanos más IVA. Tiempo de entrega sujeto a existencias. Anticipo del 50 % para iniciar.',
  };
  const bloqueada = ['aceptada', 'rechazada'].includes(doc.estado) || !puede();
  const modal = abrirModal({
    titulo: nueva ? 'Nueva cotización' : `Cotización ${doc.folio}`, ancho: true,
    cuerpo: `<form class="form" id="fc">
      <div class="form-3">
        <label>Cliente<input name="cliente" required maxlength="120" value="${esc(doc.cliente)}" ${bloqueada ? 'disabled' : ''}></label>
        <label>Atención a<input name="contacto" maxlength="120" value="${esc(doc.contacto || '')}" ${bloqueada ? 'disabled' : ''}></label>
        <label>Correo<input type="email" name="correo" maxlength="120" value="${esc(doc.correo || '')}" ${bloqueada ? 'disabled' : ''}></label>
      </div>
      <label>Asunto<input name="titulo" maxlength="160" value="${esc(doc.titulo || '')}" placeholder="Ej. Mantenimiento preventivo a válvulas de la línea 3" ${bloqueada ? 'disabled' : ''}></label>
      <div class="form-3">
        <label>Fecha<input type="date" name="fecha" value="${doc.fecha}" ${bloqueada ? 'disabled' : ''}></label>
        <label>Vigencia (días)<input type="number" name="vigencia" min="1" value="${doc.vigencia_dias || 15}" ${bloqueada ? 'disabled' : ''}></label>
        ${estado.empresas.length > 1 ? `<label>Cotiza<select name="empresa" ${bloqueada ? 'disabled' : ''}>${estado.empresas.map((e) => `<option value="${e.id}" ${doc.empresa_id === e.id ? 'selected' : ''}>${esc(e.nombre_corto)}</option>`).join('')}</select></label>` : '<span></span>'}
      </div>
      <div class="partidas-head"><b>Partidas</b>${bloqueada ? '' : `
        <div class="filtros filtros-sm"><select id="fc-prod" aria-label="Agregar producto"><option value="">＋ Agregar producto del inventario…</option>
          ${productos.map((p) => `<option value="${p.id}">${esc(p.clave)} · ${esc(p.descripcion)} — ${fmt(p.precio)} (hay ${p.existencia})</option>`).join('')}</select>
          <button type="button" class="btn btn-sm btn-ghost" id="fc-mo">＋ Mano de obra / servicio</button></div>`}</div>
      <div class="tabla-wrap"><table class="tabla partidas"><thead><tr><th style="width:52%">Descripción</th><th class="num">Cant.</th><th class="num">Precio unit.</th><th class="num">Importe</th><th></th></tr></thead>
        <tbody id="fc-partidas"></tbody></table></div>
      <div class="totales" id="fc-tot"></div>
      <label>Condiciones y notas<textarea name="condiciones" rows="2" ${bloqueada ? 'disabled' : ''}>${esc(doc.condiciones || '')}</textarea></label>
      ${c?.centro_id ? `<p class="nota">Se convirtió en el proyecto <b>${esc(estado.centros.find((x) => x.id === c.centro_id)?.nombre || '')}</b> (ver en ${esc(MARCA.titulos.obras || 'Obras')}).</p>` : ''}
    </form>`,
    pie: `${!nueva && puede() ? botonesEstado(doc) : ''}<span style="flex:1"></span>
      ${nueva ? '' : '<button class="btn btn-ghost" id="fc-pdf">PDF</button>'}
      ${bloqueada ? '<button class="btn btn-ghost" data-cerrar>Cerrar</button>' : '<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="fc-ok">Guardar</button>'}`,
  });
  modal.querySelector('.modal-foot').style.flexWrap = 'wrap';
  modal.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarModal));
  const f = modal.querySelector('#fc');

  const pintarPartidas = () => {
    modal.querySelector('#fc-partidas').innerHTML = doc.partidas.map((x, i) => {
      const p = x.producto_id && productos.find((y) => y.id === x.producto_id);
      const falta = p && Number(x.cantidad) > p.existencia;
      return `<tr>
        <td data-l="Concepto">${bloqueada ? esc(x.descripcion) : `<input data-i="${i}" data-k="descripcion" value="${esc(x.descripcion)}" aria-label="Descripción">`}
          <small class="sub">${x.producto_id ? esc(x.clave || '') + (p ? ` · hay ${p.existencia}` : '') : 'Mano de obra / servicio'}${falta ? ' · <b class="neg">no alcanza el inventario</b>' : ''}</small></td>
        <td class="num" data-l="Cant.">${bloqueada ? x.cantidad : `<input type="number" min="0" step="any" data-i="${i}" data-k="cantidad" value="${x.cantidad}" class="num-in" aria-label="Cantidad">`}</td>
        <td class="num" data-l="Precio">${bloqueada ? fmt(x.precio) : `<input type="number" min="0" step="0.01" data-i="${i}" data-k="precio" value="${x.precio}" class="num-in" aria-label="Precio">`}</td>
        <td class="num fuerte" data-l="Monto">${fmt(Number(x.cantidad) * Number(x.precio))}</td>
        <td class="acciones">${bloqueada ? '' : `<button type="button" class="icon-btn" data-quitar="${i}" aria-label="Quitar">✕</button>`}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="vacio">Agrega productos o mano de obra</td></tr>';
    const t = totales(doc.partidas);
    modal.querySelector('#fc-tot').innerHTML = `<div><span>Subtotal</span><b>${fmt(t.subtotal)}</b></div><div><span>IVA 16 %</span><b>${fmt(t.iva)}</b></div><div class="g"><span>Total</span><b>${fmt(t.total)}</b></div>`;
    modal.querySelectorAll('#fc-partidas input').forEach((inp) => inp.addEventListener('change', () => {
      const x = doc.partidas[+inp.dataset.i];
      x[inp.dataset.k] = inp.dataset.k === 'descripcion' ? inp.value : Number(inp.value) || 0;
      pintarPartidas();
    }));
    modal.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => { doc.partidas.splice(+b.dataset.quitar, 1); pintarPartidas(); }));
  };
  pintarPartidas();
  modal.querySelector('#fc-prod')?.addEventListener('change', (e) => {
    const p = productos.find((x) => x.id === e.target.value);
    if (!p) return;
    const ya = doc.partidas.find((x) => x.producto_id === p.id);
    if (ya) ya.cantidad = Number(ya.cantidad) + 1;
    else doc.partidas.push({ producto_id: p.id, clave: p.clave, descripcion: [p.descripcion, p.marca].filter(Boolean).join(' · '), unidad: p.unidad || 'pza', cantidad: 1, precio: Number(p.precio) });
    e.target.value = ''; pintarPartidas();
  });
  modal.querySelector('#fc-mo')?.addEventListener('click', () => {
    doc.partidas.push({ producto_id: null, descripcion: 'Mano de obra: ', unidad: 'servicio', cantidad: 1, precio: 0 });
    pintarPartidas();
    const ins = modal.querySelectorAll('#fc-partidas input[data-k="descripcion"]'); const u = ins[ins.length - 1]; u.focus(); u.setSelectionRange(u.value.length, u.value.length);
  });

  const leer = () => Object.assign(doc, { cliente: f.cliente.value.trim(), contacto: f.contacto.value.trim() || null, correo: f.correo.value.trim() || null,
    titulo: f.titulo.value.trim() || null, fecha: f.fecha.value || hoyISO(), vigencia_dias: Number(f.vigencia.value) || 15,
    empresa_id: f.empresa?.value || doc.empresa_id, condiciones: f.condiciones.value.trim() || null });
  const guardar = async (cambios = {}) => {
    if (!bloqueada) leer();
    Object.assign(doc, cambios);
    if (!doc.cliente) { toast('Escribe el cliente', true); return false; }
    if (!doc.partidas.length) { toast('Agrega al menos una partida', true); return false; }
    const datos = { folio: doc.folio, fecha: doc.fecha, vigencia_dias: doc.vigencia_dias, estado: doc.estado, cliente: doc.cliente,
      contacto: doc.contacto, correo: doc.correo, titulo: doc.titulo, empresa_id: doc.empresa_id, partidas: doc.partidas,
      condiciones: doc.condiciones, centro_id: doc.centro_id || null, total: totales(doc.partidas).total };
    const r = nueva && !doc.id ? await db().from('cotizaciones').insert({ ...datos, org_id: estado.miembro.org_id, capturado_por: estado.miembro.nombre }).select().single()
      : await db().from('cotizaciones').update(datos).eq('id', doc.id).select().single();
    if (r.error) { toast('No se pudo guardar: ' + r.error.message, true); return false; }
    doc.id = r.data.id;
    return true;
  };
  modal.querySelector('#fc-ok')?.addEventListener('click', async (ev) => {
    if (!f.reportValidity()) return;
    ev.currentTarget.disabled = true;
    if (await guardar()) { cerrarModal(); toast(`Cotización ${doc.folio} guardada ✓`); cargar(); }
    else ev.currentTarget.disabled = false;
  });
  modal.querySelector('#fc-pdf')?.addEventListener('click', async () => {
    if (!bloqueada) { if (!(await guardar())) return; cargar(); }
    pdfCotizacion(doc, empresaDe);
  });
  modal.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
    const nuevoEstado = b.dataset.estado;
    if (nuevoEstado === 'aceptada') return aceptar(doc, guardar);
    if (await guardar({ estado: nuevoEstado })) { cerrarModal(); toast(`Marcada como ${ESTADOS[nuevoEstado].t.toLowerCase()}`); cargar(); }
  }));
}

function botonesEstado(c) {
  const b = (e, t, cls = 'btn-ghost') => `<button class="btn ${cls}" data-estado="${e}">${t}</button>`;
  if (c.estado === 'borrador') return b('enviada', 'Marcar enviada');
  if (c.estado === 'enviada') return b('aceptada', '✓ Aceptada', 'btn-primary') + b('rechazada', 'Rechazada') + b('borrador', 'Regresar a borrador');
  if (c.estado === 'rechazada') return b('enviada', 'Reabrir');
  return '';
}

// Aceptada: se puede volver proyecto (centro tipo obra + cuenta por cobrar) y descontar del inventario
function aceptar(doc, guardar) {
  const conProductos = doc.partidas.filter((x) => x.producto_id);
  const modal = abrirModal({
    titulo: `${doc.folio} aceptada`,
    cuerpo: `<form class="form" id="fa">
      <p>¡Bien! ${esc(doc.cliente)} aceptó por <b>${fmt(totales(doc.partidas).total)}</b>.</p>
      <label class="opcion opcion-linea"><input type="checkbox" name="proyecto" checked> Crear el proyecto en ${esc(MARCA.titulos.obras || 'Obras')} (valor, cobros y costos)</label>
      <label>Nombre del proyecto<input name="nombre" maxlength="80" value="${esc((doc.titulo || doc.cliente).slice(0, 80))}"></label>
      ${conProductos.length ? `<label class="opcion opcion-linea"><input type="checkbox" name="surtir" checked> Descontar del inventario las ${conProductos.reduce((s, x) => s + Number(x.cantidad), 0)} piezas de la cotización</label>` : ''}
    </form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="fa-ok">Confirmar</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#fa');
  modal.querySelector('#fa-ok').addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const org = estado.miembro.org_id, emp = doc.empresa_id || estado.empresas[0]?.id;
    if (f.proyecto.checked && !doc.centro_id) {
      const c = await db().from('centros').insert({ org_id: org, empresa_id: emp, nombre: f.nombre.value.trim() || doc.cliente, tipo: 'obra', activo: true, en_gastos: true }).select().single();
      if (c.error) { ev.currentTarget.disabled = false; return toast('No se pudo crear el proyecto: ' + c.error.message, true); }
      estado.centros.push(c.data);
      doc.centro_id = c.data.id;
      await db().from('cuentas_por_cobrar').insert({ org_id: org, empresa_id: emp, centro_id: c.data.id, tipo: 'venta', cliente: doc.cliente,
        referencia: doc.folio, monto_original: totales(doc.partidas).total, fecha_origen: hoyISO(), notas: doc.titulo || null });
    }
    if (f.surtir?.checked) {
      const movs = conProductos.map((x) => ({ org_id: org, producto_id: x.producto_id, fecha: hoyISO(), tipo: 'salida', cantidad: Number(x.cantidad),
        costo_unitario: Number(productos.find((p) => p.id === x.producto_id)?.costo || 0), centro_id: doc.centro_id || null,
        referencia: doc.folio + ' · ' + doc.cliente, capturado_por: estado.miembro.nombre }));
      if (movs.length) await db().from('inventario_movs').insert(movs);
    }
    if (await guardar({ estado: 'aceptada' })) {
      cerrarModal();
      toast(doc.centro_id ? `Proyecto creado ✓ — ya aparece en ${MARCA.titulos.obras || 'Obras'}` : 'Cotización aceptada ✓');
      cargar();
    } else ev.currentTarget.disabled = false;
  });
}
