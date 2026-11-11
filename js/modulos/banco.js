// Banco (conciliación): cada mes se sube el estado de cuenta en PDF; se lee aquí mismo en el navegador, se guardan sus
// movimientos (sin duplicar al volver a subirlo) y se cruzan con lo capturado: pagos de mantenimiento/luz/rentas, ingresos y gastos.
// Nada se liga solo: Andrés confirma lo que cuadra, revisa lo posible y ve lo que falta capturar.
// Tablas: cuentas_banco, banco_movs, banco_ligas (0039). Solo dueño, socio y administración.
import { db, todo, estado, fmt, fmtFecha, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';
import { MESES } from '../config.js';
import { leerEstadoBBVA } from '../banco-bbva.js';
import { sugerir } from '../conciliar.js';

const PROPIOS = ['GRUPO INMOBILIARIO TREME', 'GRUPO INMOBILIARIO TRE', 'GPO INM TRAME', 'DESARROLLOS Y PROYECTOS MEDCO', 'MIGUEL MEDELLIN', 'ANDRES MEDELLIN'];
const CONCEPTO = { mantenimiento: 'Mantenimiento', luz: 'Luz', renta: 'Renta', venta: 'Venta', cartera: 'Abono de compra', otro: 'Otro' };
const hoy = new Date();
const st = { cuentaId: null, mes: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`, tipo: 'abono', vista: 'revisar', rechazados: new Set() };
let raiz, cuentas = [], movs = [], ligas = [], regs = [], sug = new Map();

const mesTxt = (ym) => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const sumaMes = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const finMes = (ym) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0); return `${ym}-${String(d.getDate()).padStart(2, '0')}`; };
const masDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const cuenta = () => cuentas.find((c) => c.id === st.cuentaId);
const nombreEmpresa = (id) => estado.todasEmpresas.find((e) => e.id === id)?.nombre_corto || estado.todasEmpresas.find((e) => e.id === id)?.nombre || '';
const ligasDe = (movId) => ligas.filter((l) => l.mov_id === movId);
const regDe = (l) => regs.find((r) => r.clase === (l.pago_id ? 'pago' : l.ingreso_id ? 'ingreso' : 'gasto') && r.id === (l.pago_id || l.ingreso_id || l.gasto_id));
const quien = (m) => m.quien || m.detalle || m.descripcion;

export async function render(view) {
  raiz = view;
  document.getElementById('page-actions').innerHTML = '<button class="btn btn-primary" id="bk-subir">Subir estado de cuenta</button><input type="file" id="bk-file" accept="application/pdf,.pdf" hidden>';
  const inp = document.getElementById('bk-file');
  document.getElementById('bk-subir').addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) subir(f); });
  await cargar();
}

async function cargar() {
  raiz.innerHTML = '<div class="cargando">Cargando…</div>';
  const c = await db().from('cuentas_banco').select('id, empresa_id, banco, nombre, terminacion').eq('activo', true).order('creado_en');
  if (c.error) { raiz.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(c.error.message)}</div>`; return; }
  cuentas = c.data || [];
  if (!cuentas.length) { pintarVacio(); return; }
  if (!cuenta()) st.cuentaId = cuentas[0].id;
  const cu = cuenta(), ini = `${st.mes}-01`, fin = finMes(st.mes);
  const desde = masDias(ini, -20), hasta = masDias(fin, 20);
  const [m, l, p, i, g, u, k] = await Promise.all([
    todo(() => db().from('banco_movs').select('id, fecha, codigo, descripcion, detalle, quien, tipo, monto, estado, motivo, revisado_por').eq('cuenta_id', cu.id).gte('fecha', ini).lte('fecha', fin)),
    todo(() => db().from('banco_ligas').select('id, mov_id, pago_id, ingreso_id, gasto_id').eq('activo', true)),
    todo(() => db().from('pagos').select('id, fecha, monto, concepto, periodo, forma_pago, centro_id, unidad_id, contrato_id, notas').eq('empresa_id', cu.empresa_id).gte('fecha', desde).lte('fecha', hasta)),
    todo(() => db().from('ingresos').select('id, fecha, monto, concepto, cliente, categoria, forma_pago, centro_id').eq('empresa_id', cu.empresa_id).gte('fecha', desde).lte('fecha', hasta)),
    todo(() => db().from('gastos').select('id, fecha, fecha_pago, monto, proveedor, concepto, categoria, forma_pago, centro_id, estado').eq('empresa_id', cu.empresa_id).gte('fecha', masDias(desde, -60)).lte('fecha', hasta)),
    todo(() => db().from('unidades').select('id, identificador, ocupante')),
    todo(() => db().from('contratos').select('id, arrendatario')),
  ]);
  const err = [m, l, p, i, g, u, k].find((x) => x.error);
  if (err) { raiz.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(err.error.message)}</div>`; return; }
  movs = m.data.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.monto - a.monto);
  ligas = l.data;
  const uni = new Map(u.data.map((x) => [x.id, x])), con = new Map(k.data.map((x) => [x.id, x]));
  const centro = (id) => estado.todosCentros.find((c) => c.id === id)?.nombre || '';
  regs = [
    ...p.data.map((x) => {
      const un = uni.get(x.unidad_id), ct = con.get(x.contrato_id);
      return { clase: 'pago', id: x.id, fecha: x.fecha, monto: Number(x.monto), forma: x.forma_pago,
        unidad: `${un?.identificador || ''} ${ct?.arrendatario || ''}`, nombres: `${un?.ocupante || ''} ${ct?.arrendatario || ''} ${x.notas || ''}`,
        titulo: `${CONCEPTO[x.concepto] || x.concepto} · ${centro(x.centro_id)}${un ? ` · ${un.identificador}` : ''}${ct ? ` · ${ct.arrendatario}` : ''}`,
        sub: [un?.ocupante, x.periodo && mesTxt(String(x.periodo).slice(0, 7)).toLowerCase()].filter(Boolean).join(' · ') };
    }),
    ...i.data.map((x) => ({ clase: 'ingreso', id: x.id, fecha: x.fecha, monto: Number(x.monto), forma: x.forma_pago, unidad: '',
      nombres: `${x.cliente || ''} ${x.concepto || ''}`, titulo: `${x.categoria || 'Ingreso'} · ${x.cliente || x.concepto || centro(x.centro_id)}`, sub: x.concepto || '' })),
    ...g.data.filter((x) => x.estado !== 'por_pagar').map((x) => ({ clase: 'gasto', id: x.id, fecha: x.fecha_pago || x.fecha, monto: Number(x.monto), forma: x.forma_pago,
      unidad: '', nombres: `${x.proveedor || ''} ${x.concepto || ''}`, titulo: `${x.categoria || 'Gasto'} · ${x.proveedor || x.concepto || ''}`, sub: centro(x.centro_id) })),
  ];
  const ligados = new Set(ligas.map((x) => (x.pago_id ? 'pago' : x.ingreso_id ? 'ingreso' : 'gasto') + (x.pago_id || x.ingreso_id || x.gasto_id)));
  const libres = regs.filter((r) => !ligados.has(r.clase + r.id));
  const pend = movs.filter((x) => x.estado === 'pendiente');
  sug = sugerir(pend, libres, PROPIOS);
  for (const id of st.rechazados) if (sug.has(id)) sug.set(id, { nivel: 'falta', regs: [] });
  pintar();
}

function pintarVacio() {
  raiz.innerHTML = `<section class="panel bk-vacio">
    <h3>Concilia tus cuentas de banco</h3>
    <p>Cada mes sube el estado de cuenta en PDF (BBVA). El sistema lo lee, revisa que cuadre con los totales del banco y lo cruza
    con lo que el equipo capturó: mantenimiento, luz, rentas, ingresos y gastos.</p>
    <p class="nota">Nada se registra solo: tú confirmas cada coincidencia.</p>
    <button class="btn btn-primary" id="bk-subir2">Subir estado de cuenta (PDF)</button></section>`;
  raiz.querySelector('#bk-subir2').addEventListener('click', () => document.getElementById('bk-file').click());
}

function grupos() {
  const delTipo = movs.filter((m) => m.tipo === st.tipo);
  const g = { cuadra: [], posible: [], traspaso: [], falta: [], conciliado: [], ignorado: [] };
  for (const m of delTipo) {
    if (m.estado !== 'pendiente') g[m.estado].push(m);
    else g[sug.get(m.id)?.nivel || 'falta'].push(m);
  }
  return g;
}

// Capturado como transferencia o depósito que no está ligado a ningún movimiento de banco (de este mes)
function sinBanco() {
  const ligados = new Set(ligas.map((x) => x.pago_id || x.ingreso_id || x.gasto_id));
  const clase = st.tipo === 'abono' ? ['pago', 'ingreso'] : ['gasto'];
  return regs.filter((r) => clase.includes(r.clase) && r.fecha.startsWith(st.mes) && !ligados.has(r.id) && !/efectivo|cheque/i.test(r.forma || '') && r.forma)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function pintar() {
  const cu = cuenta(), g = grupos();
  const delTipo = movs.filter((m) => m.tipo === st.tipo);
  const total = delTipo.reduce((s, m) => s + Number(m.monto), 0);
  const listos = g.conciliado.length + g.ignorado.length;
  const porRevisar = g.cuadra.length + g.posible.length + g.traspaso.length;
  const sb = sinBanco();
  const dep = st.tipo === 'abono';
  const vistas = [['revisar', `Por revisar · ${porRevisar}`], ['falta', `${dep ? 'Faltan capturar' : 'Sin gasto capturado'} · ${g.falta.length}`],
    ['listos', `Conciliados · ${listos}`], ['sinbanco', `Capturado sin banco · ${sb.length}`]];
  raiz.innerHTML = `
    <div class="bk-barra">
      <select id="bk-cuenta" class="bd-sel" aria-label="Cuenta">${cuentas.map((c) => `<option value="${c.id}" ${c.id === cu.id ? 'selected' : ''}>${esc(c.banco)} ${esc(c.nombre)} ····${esc(c.terminacion)} · ${esc(nombreEmpresa(c.empresa_id))}</option>`).join('')}</select>
      <div class="bk-mes"><button class="btn btn-ghost btn-sm" id="bk-ant" aria-label="Mes anterior">‹</button><strong>${mesTxt(st.mes)}</strong><button class="btn btn-ghost btn-sm" id="bk-sig" aria-label="Mes siguiente">›</button></div>
      <div class="segmento">${[['abono', 'Depósitos'], ['cargo', 'Retiros']].map(([k, t]) => `<button data-tipo="${k}" class="${st.tipo === k ? 'activo' : ''}">${t}</button>`).join('')}</div>
    </div>
    ${!movs.length ? `<section class="panel bk-vacio"><p>No hay movimientos de ${mesTxt(st.mes).toLowerCase()} en esta cuenta.</p><p class="nota">Sube el estado de cuenta de ese mes con el botón de arriba.</p></section>` : `
    <div class="kpis">
      <div class="kpi"><span>${dep ? 'Depósitos' : 'Retiros'} del mes</span><strong>${fmt(total)}</strong><small>${delTipo.length} movimientos</small></div>
      <div class="kpi"><span>Conciliados</span><strong class="pos">${listos}</strong><small>${delTipo.length ? Math.round(listos / delTipo.length * 100) : 0}% del mes</small></div>
      <div class="kpi"><span>Por revisar</span><strong>${porRevisar}</strong><small>sugerencias para confirmar</small></div>
      <div class="kpi"><span>${dep ? 'Faltan capturar' : 'Sin gasto capturado'}</span><strong class="${g.falta.length ? 'neg' : 'pos'}">${fmt(g.falta.reduce((s, m) => s + Number(m.monto), 0))}</strong><small>${g.falta.length} movimientos</small></div>
    </div>
    <div class="sub-head"><div class="tabs" role="tablist">${vistas.map(([id, t]) => `<button role="tab" data-v="${id}" aria-selected="${st.vista === id}">${t}</button>`).join('')}</div></div>
    <div id="bk-cuerpo"></div>`}`;
  raiz.querySelector('#bk-cuenta').addEventListener('change', (e) => { st.cuentaId = e.target.value; cargar(); });
  raiz.querySelector('#bk-ant').addEventListener('click', () => { st.mes = sumaMes(st.mes, -1); cargar(); });
  raiz.querySelector('#bk-sig').addEventListener('click', () => { st.mes = sumaMes(st.mes, 1); cargar(); });
  raiz.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { st.tipo = b.dataset.tipo; pintar(); }));
  raiz.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.v; pintar(); }));
  const el = raiz.querySelector('#bk-cuerpo');
  if (!el) return;
  if (st.vista === 'falta') return pintarFaltan(el, g.falta);
  if (st.vista === 'listos') return pintarListos(el, g);
  if (st.vista === 'sinbanco') return pintarSinBanco(el, sb);
  pintarRevisar(el, g);
}

const filaMov = (m, derecha, acciones) => `<tr>
  <td class="nowrap" data-l="Fecha">${fmtFecha(m.fecha)}</td>
  <td data-l="Movimiento"><strong>${esc(quien(m))}</strong><small class="sub">${esc(m.quien ? m.detalle : m.descripcion)}</small></td>
  <td class="num" data-l="Monto"><strong>${fmt(m.monto)}</strong></td>
  <td data-l="En el sistema">${derecha}</td>
  <td class="acciones nowrap">${acciones}</td></tr>`;
const listaRegs = (rs) => rs.map((r) => `<div class="bk-reg"><span>${esc(r.titulo)}</span><small class="mut">${fmt(r.monto)} · ${fmtFecha(r.fecha)}${r.sub ? ` · ${esc(r.sub)}` : ''}</small></div>`).join('')
;
const conIva = (m, rs) => Math.abs(rs.reduce((s, r) => s + r.monto, 0) - Number(m.monto)) > 0.6 ? '<span class="badge">con IVA</span>' : '';
const tabla = (filas, vacio) => `<div class="tabla-wrap"><table class="tabla bk-tabla"><thead><tr><th>Fecha</th><th>Movimiento</th><th class="num">Monto</th><th>En el sistema</th><th></th></tr></thead>
  <tbody>${filas || `<tr><td colspan="5" class="vacio">${vacio}</td></tr>`}</tbody></table></div>`;

function pintarRevisar(el, g) {
  const sec = (titulo, ayuda, lista, boton, filas) => lista.length ? `<section class="panel"><div class="panel-head"><div><h3>${titulo} · ${lista.length}</h3><small class="mut">${ayuda}</small></div>${boton}</div>${tabla(filas)}</section>` : '';
  el.innerHTML = (sec('Cuadran', 'El movimiento menciona la unidad o el nombre y el monto coincide.', g.cuadra,
    `<button class="btn btn-primary" id="bk-todos">Confirmar los ${g.cuadra.length}</button>`,
    g.cuadra.map((m) => { const s = sug.get(m.id); return filaMov(m, listaRegs(s.regs) + conIva(m, s.regs), `<button class="btn btn-sm btn-primary" data-ok="${m.id}">Confirmar</button><button class="btn btn-sm btn-ghost" data-no="${m.id}">No es</button>`); }).join(''))
  + sec('Posibles', 'Mismo monto y fecha cercana, pero el banco no dice de quién es (por ejemplo, depósitos en efectivo). Revísalos uno por uno.', g.posible, '',
    g.posible.map((m) => { const s = sug.get(m.id); return filaMov(m, listaRegs(s.regs) + conIva(m, s.regs), `<button class="btn btn-sm" data-ok="${m.id}">Sí es</button><button class="btn btn-sm btn-ghost" data-no="${m.id}">No es</button>`); }).join(''))
  + sec('Traspasos y comisiones', 'Entre tus cuentas, de los socios, devoluciones o comisiones: no son ingreso ni gasto de la operación.', g.traspaso,
    `<button class="btn btn-ghost" id="bk-trasp">Marcar todos como "no aplica"</button>`,
    g.traspaso.map((m) => filaMov(m, `<span class="badge">${esc(sug.get(m.id).motivo)}</span>`, `<button class="btn btn-sm btn-ghost" data-ign="${m.id}">No aplica</button><button class="btn btn-sm btn-ghost" data-no="${m.id}">Sí es de la operación</button>`)).join('')))
  || '<div class="vacio">No hay sugerencias pendientes. Revisa "Faltan capturar".</div>';
  el.querySelector('#bk-todos')?.addEventListener('click', (e) => confirmar(g.cuadra, e.currentTarget));
  el.querySelector('#bk-trasp')?.addEventListener('click', (e) => ignorar(g.traspaso, null, e.currentTarget));
  el.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => confirmar([movs.find((m) => m.id === b.dataset.ok)], b)));
  el.querySelectorAll('[data-ign]').forEach((b) => b.addEventListener('click', () => ignorar([movs.find((m) => m.id === b.dataset.ign)], null, b)));
  el.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => { st.rechazados.add(b.dataset.no); sug.set(b.dataset.no, { nivel: 'falta', regs: [] }); pintar(); }));
}

function pintarFaltan(el, lista) {
  const dep = st.tipo === 'abono';
  el.innerHTML = `<p class="nota">${dep ? 'Llegaron al banco y no se encontró su captura. Captúralo en su sección (Mantenimiento, Rentas o "＋ Ingreso") y vuelve aquí: se cruzará solo. Si ya está capturado con otro monto o fecha, usa "Ligar".'
    : 'Salieron del banco y no se encontró su gasto. Pídele a Victoria que lo capture, o lígalo si ya está con otro monto o fecha.'}</p>
    <section class="panel">${tabla(lista.map((m) => filaMov(m, '<span class="badge rojo">No encontrado</span>',
      `<button class="btn btn-sm" data-ligar="${m.id}">Ligar…</button><button class="btn btn-sm btn-ghost" data-ign="${m.id}">No aplica</button>`)).join(''), 'Todo lo de este mes está capturado.')}</section>`;
  el.querySelectorAll('[data-ligar]').forEach((b) => b.addEventListener('click', () => ligarManual(movs.find((m) => m.id === b.dataset.ligar))));
  el.querySelectorAll('[data-ign]').forEach((b) => b.addEventListener('click', () => {
    const motivo = prompt('¿Por qué no aplica? (por ejemplo: traspaso, préstamo, aportación de socio)', 'Traspaso');
    if (motivo !== null) ignorar([movs.find((m) => m.id === b.dataset.ign)], motivo || 'No aplica', b);
  }));
}

function pintarListos(el, g) {
  const filas = [...g.conciliado, ...g.ignorado].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => {
    const der = m.estado === 'ignorado' ? `<span class="badge">${esc(m.motivo || 'No aplica')}</span>`
      : listaRegs(ligasDe(m.id).map(regDe).filter(Boolean)) || '<small class="mut">Ligado a un registro de otro periodo o que ya se eliminó</small>';
    return filaMov(m, der + (m.revisado_por ? `<small class="mut">Revisó: ${esc(m.revisado_por)}</small>` : ''), `<button class="btn btn-sm btn-ghost" data-deshacer="${m.id}">Deshacer</button>`);
  }).join('');
  el.innerHTML = `<section class="panel">${tabla(filas, 'Todavía no confirmas nada de este mes.')}</section>`;
  el.querySelectorAll('[data-deshacer]').forEach((b) => b.addEventListener('click', () => deshacer(movs.find((m) => m.id === b.dataset.deshacer), b)));
}

function pintarSinBanco(el, lista) {
  el.innerHTML = `<p class="nota">Se capturaron como transferencia o depósito en ${mesTxt(st.mes).toLowerCase()} y no están ligados a ningún movimiento de banco.
    Puede ser que cayeran en otra cuenta que todavía no subes (por ejemplo, Banregio), o que el monto o la forma de pago se capturó mal.</p>
    <section class="panel"><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Registro</th><th>Forma</th><th class="num">Monto</th></tr></thead><tbody>
    ${lista.map((r) => `<tr><td class="nowrap" data-l="Fecha">${fmtFecha(r.fecha)}</td><td data-l="Registro"><strong>${esc(r.titulo)}</strong><small class="sub">${esc(r.sub || '')}</small></td>
      <td data-l="Forma">${esc(r.forma || '')}</td><td class="num" data-l="Monto">${fmt(r.monto)}</td></tr>`).join('') || '<tr><td colspan="4" class="vacio">Nada pendiente.</td></tr>'}
    </tbody></table></div></section>`;
}

// ---------- acciones ----------
async function confirmar(lista, btn) {
  const filas = [];
  for (const m of lista) for (const r of sug.get(m.id)?.regs || []) filas.push({ org_id: estado.miembro.org_id, mov_id: m.id, activo: true, [`${r.clase}_id`]: r.id });
  await guardarLigas(lista, filas, btn);
}

async function guardarLigas(lista, filas, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  if (filas.length) {
    const { error } = await db().from('banco_ligas').insert(filas);
    if (error) { if (btn) btn.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
  }
  const { error } = await db().from('banco_movs').update({ estado: 'conciliado', revisado_por: estado.miembro.nombre, revisado_en: new Date().toISOString() }).in('id', lista.map((m) => m.id));
  if (error) return toast('No se pudo guardar: ' + error.message, true);
  toast(lista.length > 1 ? `${lista.length} movimientos conciliados ✓` : 'Conciliado ✓');
  cargar();
}

async function ignorar(lista, motivo, btn) {
  if (btn) { btn.disabled = true; }
  for (const m of lista) {
    const { error } = await db().from('banco_movs').update({ estado: 'ignorado', motivo: motivo || sug.get(m.id)?.motivo || 'No aplica', revisado_por: estado.miembro.nombre, revisado_en: new Date().toISOString() }).eq('id', m.id);
    if (error) return toast('No se pudo guardar: ' + error.message, true);
  }
  toast('Listo ✓'); cargar();
}

async function deshacer(m, btn) {
  btn.disabled = true;
  const a = await db().from('banco_ligas').update({ activo: false }).eq('mov_id', m.id).eq('activo', true);
  const b = await db().from('banco_movs').update({ estado: 'pendiente', motivo: null, revisado_por: null, revisado_en: null }).eq('id', m.id);
  if (a.error || b.error) return toast('No se pudo deshacer: ' + (a.error || b.error).message, true);
  st.rechazados.delete(m.id); toast('Regresó a pendiente'); cargar();
}

function ligarManual(m) {
  const ligados = new Set(ligas.map((x) => x.pago_id || x.ingreso_id || x.gasto_id));
  const clase = m.tipo === 'abono' ? ['pago', 'ingreso'] : ['gasto'];
  const cand = regs.filter((r) => clase.includes(r.clase) && !ligados.has(r.id) && r.fecha >= masDias(m.fecha, -20) && r.fecha <= masDias(m.fecha, 20))
    .sort((a, b) => Math.abs(new Date(a.fecha) - new Date(m.fecha)) - Math.abs(new Date(b.fecha) - new Date(m.fecha)));
  const modal = abrirModal({
    titulo: `Ligar ${fmt(m.monto)} · ${fmtFecha(m.fecha)}`, ancho: true,
    cuerpo: `<p class="nota">${esc([...new Set([quien(m), m.detalle, m.descripcion].filter(Boolean))].join(' · '))}</p>
      <input type="search" id="lg-q" class="bk-buscar" placeholder="Buscar unidad, nombre o monto" aria-label="Buscar">
      <div class="bk-lista" id="lg-lista"></div>
      <p class="bk-suma" id="lg-suma"></p>`,
    pie: '<button class="btn btn-ghost" id="lg-no">Cancelar</button><button class="btn btn-primary" id="lg-si">Ligar</button>',
  });
  const marcados = new Set();
  const q = modal.querySelector('#lg-q'), lista = modal.querySelector('#lg-lista'), suma = modal.querySelector('#lg-suma');
  const total = () => cand.filter((r) => marcados.has(r.clase + r.id)).reduce((s, r) => s + r.monto, 0);
  const dibujar = () => {
    const t = normalizar(q.value);
    lista.innerHTML = cand.filter((r) => !t || normalizar(`${r.titulo} ${r.sub} ${r.monto}`).includes(t)).slice(0, 60).map((r) =>
      `<label class="bk-op"><input type="checkbox" value="${r.clase + r.id}" ${marcados.has(r.clase + r.id) ? 'checked' : ''}>
        <span><strong>${fmt(r.monto)}</strong> · ${esc(r.titulo)}<small class="mut">${fmtFecha(r.fecha)}${r.sub ? ` · ${esc(r.sub)}` : ''}</small></span></label>`).join('') || '<div class="vacio">Sin registros cercanos</div>';
    lista.querySelectorAll('input').forEach((c) => c.addEventListener('change', () => { c.checked ? marcados.add(c.value) : marcados.delete(c.value); resumen(); }));
  };
  const resumen = () => {
    const s = total(), d = Number(m.monto) - s;
    suma.innerHTML = marcados.size ? `Seleccionado: <strong>${fmt(s)}</strong>${Math.abs(d) < 0.6 ? ' · cuadra ✓' : Math.abs(s * 1.16 - m.monto) < 0.6 ? ' · cuadra con IVA ✓' : ` · diferencia ${fmt(d)}`}` : '';
  };
  q.addEventListener('input', dibujar); dibujar();
  modal.querySelector('#lg-no').addEventListener('click', cerrarModal);
  modal.querySelector('#lg-si').addEventListener('click', async (e) => {
    const sel = cand.filter((r) => marcados.has(r.clase + r.id));
    if (!sel.length) return toast('Marca al menos un registro', true);
    cerrarModal();
    await guardarLigas([m], sel.map((r) => ({ org_id: estado.miembro.org_id, mov_id: m.id, activo: true, [`${r.clase}_id`]: r.id })), e.currentTarget);
  });
}

// ---------- subir estado de cuenta ----------
let pdfjs = null;
async function cargarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

async function subir(archivo) {
  abrirModal({ titulo: 'Leyendo estado de cuenta…', cuerpo: '<div class="cargando">Leyendo el PDF…</div>', bloqueado: true });
  let r;
  try { r = await leerEstadoBBVA(await cargarPdfjs(), new Uint8Array(await archivo.arrayBuffer())); }
  catch (e) { cerrarModal(); return toast('No se pudo leer: ' + (e.message || e) + '. Por ahora solo se leen estados de cuenta de BBVA en PDF.', true); }
  cerrarModal();
  const tit = normalizar(r.titular);
  const sugerida = estado.todasEmpresas.find((e) => tit && (tit.includes(normalizar(e.nombre_corto || '---')) || normalizar(e.nombre).startsWith(tit.slice(0, 18))))
    || estado.todasEmpresas.find((e) => /treme/i.test(e.nombre) && /treme/i.test(r.titular)) || estado.todasEmpresas.find((e) => /medco/i.test(e.nombre) && /medco/i.test(r.titular));
  const existente = cuentas.find((c) => c.banco === r.banco && c.terminacion === r.terminacion);
  const ab = r.movs.filter((m) => m.tipo === 'abono'), ca = r.movs.filter((m) => m.tipo === 'cargo');
  const modal = abrirModal({
    titulo: 'Estado de cuenta',
    cuerpo: `<div class="bk-resumen">
        <p><strong>${esc(r.banco)} ${esc(r.producto.replace(/ BBVA$/, ''))} ····${esc(r.terminacion)}</strong><br><span class="mut">${esc(r.titular)}</span></p>
        <p>Del ${fmtFecha(r.desde)} al ${fmtFecha(r.hasta)}</p>
        <p>${ab.length} depósitos por <strong>${fmt(r.totales.leidosAbonos)}</strong><br>${ca.length} retiros por <strong>${fmt(r.totales.leidosCargos)}</strong></p>
        ${r.cuadra ? '<p class="pos"><strong>✓ Cuadra al centavo con los totales del banco.</strong></p>'
          : `<p class="neg"><strong>No cuadra con los totales del banco</strong> (banco: depósitos ${fmt(r.totales.abonos)}, retiros ${fmt(r.totales.cargos)}). Revisa el archivo antes de guardarlo.</p>`}
      </div>
      ${existente ? `<p class="nota">Cuenta ya registrada (${esc(nombreEmpresa(existente.empresa_id))}). Si ya subiste este mes, solo se agregan los movimientos nuevos.</p>`
        : `<label>¿De qué empresa es la cuenta?<select id="sb-emp">${estado.todasEmpresas.map((e) => `<option value="${e.id}" ${e.id === sugerida?.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></label>`}`,
    pie: '<button class="btn btn-ghost" id="sb-no">Cancelar</button><button class="btn btn-primary" id="sb-si">Guardar y conciliar</button>',
  });
  modal.querySelector('#sb-no').addEventListener('click', cerrarModal);
  modal.querySelector('#sb-si').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
    let cu = existente;
    if (!cu) {
      const { data, error } = await db().from('cuentas_banco').insert({ org_id: estado.miembro.org_id, empresa_id: modal.querySelector('#sb-emp').value,
        activo: true, banco: r.banco, nombre: r.producto.replace(/ BBVA$/, '').replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()).replace('Pyme', 'PyME'), terminacion: r.terminacion }).select('id, empresa_id, banco, nombre, terminacion').single();
      if (error) { btn.disabled = false; btn.textContent = 'Guardar y conciliar'; return toast('No se pudo guardar la cuenta: ' + error.message, true); }
      cu = data;
    }
    const prev = await todo(() => db().from('banco_movs').select('id, huella').eq('cuenta_id', cu.id).gte('fecha', r.desde).lte('fecha', r.hasta));
    if (prev.error) { btn.disabled = false; return toast('No se pudo revisar: ' + prev.error.message, true); }
    const ya = new Set(prev.data.map((x) => x.huella));
    const nuevos = r.movs.filter((m) => !ya.has(m.huella)).map((m) => ({ org_id: estado.miembro.org_id, cuenta_id: cu.id, empresa_id: cu.empresa_id,
      fecha: m.fecha, fecha_liq: m.fecha_liq, codigo: m.codigo, descripcion: m.descripcion, detalle: m.detalle || null, quien: m.quien || null,
      tipo: m.tipo, monto: m.monto, huella: m.huella, estado: 'pendiente' }));
    for (let i = 0; i < nuevos.length; i += 300) {
      const { error } = await db().from('banco_movs').insert(nuevos.slice(i, i + 300));
      if (error) { btn.disabled = false; btn.textContent = 'Guardar y conciliar'; return toast('No se pudieron guardar los movimientos: ' + error.message, true); }
    }
    cerrarModal();
    toast(nuevos.length ? `${nuevos.length} movimientos guardados ✓` : 'Ese mes ya estaba completo; no se duplicó nada');
    st.cuentaId = cu.id; st.mes = r.hasta.slice(0, 7); st.vista = 'revisar'; st.tipo = 'abono';
    cargar();
  });
}
