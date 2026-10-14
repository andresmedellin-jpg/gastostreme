// Personal: el día a día del encargado (asistencia, tareas, rondín, incidencias) y,
// para dueño y administración, nómina semanal, empleados, vacaciones y préstamos.
// Reemplaza "Elysium · Mi día" y la Nómina del Centro de Control.
import { MESES } from '../config.js';
import { db, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal,
         comprimirImagen, subirArchivo, verFoto, normalizar } from '../lib.js';

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CATS_TAREA = ['Limpieza', 'Mantenimiento', 'Seguridad', 'Jardinería', 'Administrativo', 'Otro'];
const CATS_INC = ['Falla de mantenimiento', 'Uso indebido de horario', 'Trabajo particular en el edificio', 'Ausencia / impuntualidad', 'Mal servicio', 'Otro'];
const METODOS = ['Efectivo', 'Transferencia SPEI', 'Depósito', 'Cheque'];

const admin = () => tieneRol(['administracion']);
const st = { tab: null, centro: null, fecha: hoyISO(), semana: lunesDe(hoyISO()), filtroInc: 'abiertas' };
let raiz, equipo = [];

// ---------- fechas ----------
function lunesDe(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const codigoDia = (iso) => DIAS[(new Date(iso + 'T12:00:00').getDay() + 6) % 7];
const hora = (ts) => ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
const etiquetaSemana = (lunes) => {
  const a = new Date(lunes + 'T12:00:00'), b = new Date(sumarDias(lunes, 6) + 'T12:00:00');
  return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3).toLowerCase()} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3).toLowerCase()} ${b.getFullYear()}`;
};
const iniciales = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

// ---------- entrada ----------
export async function render(view) {
  raiz = view;
  const tabsDia = [['asistencia', 'Asistencia'], ['tareas', 'Tareas'], ['rondin', 'Rondín'], ['incidencias', 'Incidencias']];
  const tabsAdmin = [['nomina', 'Nómina'], ['empleados', 'Empleados'], ['vacaciones', 'Vacaciones'], ['prestamos', 'Préstamos']];
  const tabs = admin() ? [...tabsAdmin, ...tabsDia] : tabsDia;
  st.tab ||= tabs[0][0];

  // centros con personal (para el encargado: los de su empresa)
  const visibles = estado.centros.filter((c) => !['socio', 'personal'].includes(c.tipo) || admin());
  st.centro ||= (visibles.find((c) => c.nombre === 'Torre Elysium') || visibles[0])?.id;

  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">${tabs.map(([id, t]) => `<button role="tab" data-tab="${id}">${t}</button>`).join('')}</div>
      <select id="p-centro" aria-label="Centro" class="${admin() ? '' : 'solo-dia'}">
        ${visibles.map((c) => `<option value="${c.id}" ${c.id === st.centro ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
    </div>
    <div id="p-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; pintar(); }));
  view.querySelector('#p-centro').addEventListener('change', (e) => { st.centro = e.target.value; pintar(); });
  await pintar();
}

async function pintar() {
  raiz.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === st.tab));
  const diario = ['asistencia', 'tareas', 'rondin', 'incidencias'].includes(st.tab);
  raiz.querySelector('#p-centro').style.display = diario ? '' : 'none';
  document.getElementById('page-actions').innerHTML = '';
  const el = raiz.querySelector('#p-cuerpo');
  el.innerHTML = '<div class="cargando">Cargando…</div>';
  if (diario) {
    const { data, error } = await db().rpc('equipo_de', { p_centro: st.centro });
    if (error) { el.innerHTML = `<div class="vacio">No se pudo cargar el personal: ${esc(error.message)}</div>`; return; }
    equipo = data || [];
  }
  try {
    await ({ asistencia, tareas, rondin, incidencias, nomina, empleados, vacaciones, prestamos })[st.tab](el);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(e.message)}</div>`;
  }
}

function barraFecha(el) {
  return `<div class="periodo">
    <button class="icon-btn" data-dia="-1" aria-label="Día anterior">‹</button>
    <input type="date" id="p-fecha" value="${st.fecha}" aria-label="Fecha">
    <button class="icon-btn" data-dia="1" aria-label="Día siguiente">›</button>
    ${st.fecha !== hoyISO() ? '<button class="btn btn-sm btn-ghost" data-dia="0">Hoy</button>' : ''}
  </div>`;
}
function enlazarFecha(el) {
  el.querySelector('#p-fecha')?.addEventListener('change', (e) => { st.fecha = e.target.value || hoyISO(); pintar(); });
  el.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => {
    st.fecha = +b.dataset.dia === 0 ? hoyISO() : sumarDias(st.fecha, +b.dataset.dia); pintar();
  }));
}
const sinEquipo = '<div class="vacio">No hay personal activo en este centro. Se da de alta en Personal → Empleados.</div>';

// ================= ASISTENCIA =================
async function asistencia(el) {
  if (!equipo.length) { el.innerHTML = barraFecha() + sinEquipo; enlazarFecha(el); return; }
  const { data: filas, error } = await db().from('asistencia').select('*').eq('fecha', st.fecha).in('empleado_id', equipo.map((e) => e.id));
  if (error) throw error;
  const porEmp = Object.fromEntries((filas || []).map((a) => [a.empleado_id, a]));
  const resumen = { presente: 0, retardo: 0, falta: 0, permiso: 0, sin: 0 };
  equipo.forEach((e) => { const a = porEmp[e.id]; resumen[a ? a.estado : 'sin'] = (resumen[a ? a.estado : 'sin'] || 0) + 1; });
  el.innerHTML = `${barraFecha()}
    <p class="nota">Toca <strong>Entrada</strong> o <strong>Salida</strong> en el momento en que cada quien llegue o se vaya. El retardo y su descuento se calculan solos con su horario.</p>
    <div class="chips resumen-dia">
      <span class="badge verde">${resumen.presente} a tiempo</span><span class="badge ambar">${resumen.retardo} con retardo</span>
      <span class="badge rojo">${resumen.falta} faltas</span><span class="badge gris">${resumen.permiso} permisos</span>
      <span class="badge gris">${resumen.sin} sin registrar</span></div>
    <div class="tarjetas">${equipo.map((e) => {
      const a = porEmp[e.id];
      const badge = !a ? '<span class="badge gris">Sin registrar</span>'
        : a.estado === 'falta' ? '<span class="badge rojo">Falta</span>'
        : a.estado === 'permiso' ? '<span class="badge gris">Permiso</span>'
        : a.estado === 'retardo' ? `<span class="badge ambar">${a.minutos_tarde ? a.minutos_tarde + ' min tarde' : 'Salió antes'}</span>`
        : '<span class="badge verde">A tiempo</span>';
      const sinEntrada = !a || (!a.hora_entrada && !['falta', 'permiso'].includes(a.estado));
      return `<div class="tarjeta">
        <div class="tarjeta-top"><span class="avatar">${iniciales(e.nombre)}</span>
          <div><strong>${esc(e.nombre)}</strong><small class="mut">${esc(e.puesto || '—')} · ${String(e.hora_entrada || '').slice(0, 5)}–${String(e.hora_salida || '').slice(0, 5)}</small></div>${badge}</div>
        <div class="mut tarjeta-linea">${a?.hora_entrada ? 'Entrada ' + hora(a.hora_entrada) : 'Sin entrada'}${a?.hora_salida ? ' · Salida ' + hora(a.hora_salida) : ''}
          ${Number(a?.monto_descuento) ? ` · <span class="neg">descuento ${fmt(a.monto_descuento)}</span>` : ''}</div>
        <div class="botones">
          ${sinEntrada ? `<button class="btn btn-sm btn-primary" data-marcar="entrada" data-emp="${e.id}">Entrada</button>` : ''}
          ${a?.hora_entrada && !a.hora_salida ? `<button class="btn btn-sm btn-ghost" data-marcar="salida" data-emp="${e.id}">Salida</button>` : ''}
          ${sinEntrada ? `<button class="btn btn-sm btn-ghost peligro" data-marcar="falta" data-emp="${e.id}">Falta</button>
            <button class="btn btn-sm btn-ghost" data-marcar="permiso" data-emp="${e.id}">Permiso</button>` : ''}
          ${a ? `<button class="btn btn-sm btn-ghost" data-corregir="${a.id}">Corregir</button>` : ''}
        </div></div>`;
    }).join('')}</div>`;
  enlazarFecha(el);
  el.querySelectorAll('[data-marcar]').forEach((b) => b.addEventListener('click', async () => {
    const e = equipo.find((x) => x.id === b.dataset.emp), accion = b.dataset.marcar;
    if (accion === 'falta' && !confirm(`¿Marcar falta a ${e.nombre} el ${fmtFecha(st.fecha)}? Se descuenta el día completo.`)) return;
    b.disabled = true;
    const { data, error } = await db().rpc('asistencia_marcar', { p_empleado: e.id, p_fecha: st.fecha, p_accion: accion });
    if (error) { b.disabled = false; return toast(error.message, true); }
    toast(accion === 'entrada' ? (data.minutos_tarde ? `Entrada · ${data.minutos_tarde} min tarde` : 'Entrada registrada ✓')
      : accion === 'salida' ? (data.minutos_salida_temprano ? `Salida · ${data.minutos_salida_temprano} min antes` : 'Salida registrada ✓')
      : accion === 'falta' ? 'Falta registrada' : 'Permiso registrado (sin descuento)');
    pintar();
  }));
  el.querySelectorAll('[data-corregir]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar este registro de asistencia para volver a marcarlo?')) return;
    const { error } = await db().from('asistencia').delete().eq('id', b.dataset.corregir);
    if (error) return toast(error.message, true);
    toast('Registro borrado'); pintar();
  }));
}

// ================= TAREAS =================
const coincidePuesto = (emp, puesto) => {
  const a = normalizar(emp.puesto), b = normalizar(puesto);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};

async function tareas(el) {
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-primary" id="t-nueva">＋ Agregar tarea</button>`;
  document.getElementById('t-nueva').addEventListener('click', () => tareaExtra());
  if (!equipo.length) { el.innerHTML = barraFecha() + sinEquipo; enlazarFecha(el); return; }
  const dia = codigoDia(st.fecha);
  const [pl, rg] = await Promise.all([
    db().from('tareas_plantilla').select('*').eq('centro_id', st.centro).eq('activo', true),
    db().from('tareas').select('*').eq('centro_id', st.centro).eq('fecha', st.fecha).eq('tipo', 'tarea'),
  ]);
  if (pl.error || rg.error) throw pl.error || rg.error;
  const plan = pl.data.filter((p) => p.categoria !== 'Rondín' && (p.frecuencia === 'diaria' || (p.frecuencia === 'semanal' && p.dia_semana === dia)));
  let total = 0, hechas = 0;
  const bloques = equipo.map((e) => {
    const suyas = plan.filter((p) => (p.empleado_id ? p.empleado_id === e.id : coincidePuesto(e, p.puesto)));
    const regs = rg.data.filter((r) => r.empleado_id === e.id);
    const filas = suyas.map((p) => ({ tarea: p.tarea, categoria: p.categoria, plantilla: p.id, reg: regs.find((r) => r.tarea === p.tarea) }));
    regs.filter((r) => !suyas.some((p) => p.tarea === r.tarea)).forEach((r) => filas.push({ tarea: r.tarea, categoria: r.categoria, reg: r }));
    if (!filas.length) return '';
    const h = filas.filter((f) => f.reg?.estado === 'hecho').length;
    total += filas.length; hechas += h;
    const pct = Math.round(h / filas.length * 100);
    return `<section class="panel">
      <div class="panel-head"><div class="tarjeta-top"><span class="avatar">${iniciales(e.nombre)}</span>
        <div><strong>${esc(e.nombre)}</strong><small class="mut">${esc(e.puesto || '')}</small></div></div>
        <span class="badge ${pct >= 80 ? 'verde' : pct >= 40 ? 'ambar' : 'rojo'}">${h}/${filas.length} · ${pct}%</span></div>
      <ul class="checklist">${filas.map((f, i) => {
        const est = f.reg?.estado || 'pendiente';
        const key = `${e.id}|${i}`;
        TAREA_CTX[key] = { e, f };
        return `<li class="est-${est}">
          <div class="check-txt"><span class="${est === 'hecho' ? 'tachada' : ''}">${esc(f.tarea)}</span>
            <small class="mut">${esc(f.categoria || '')}${f.reg?.hora_registro ? ' · ' + hora(f.reg.hora_registro) : ''}</small>
            ${f.reg?.foto_path ? `<img class="mini-foto" src="${esc(f.reg.foto_path)}" alt="Foto" data-foto="${esc(f.reg.foto_path)}">` : ''}</div>
          <label class="icon-btn foto ${f.reg?.foto_path ? 'tiene' : ''}" title="Agregar foto">📷<input type="file" accept="image/*" capture="environment" hidden data-fototarea="${key}"></label>
          <button class="btn btn-sm ${est === 'hecho' ? 'btn-primary' : 'btn-ghost'}" data-tarea="${key}" data-estado="hecho">✓ Hecho</button>
          <button class="btn btn-sm btn-ghost ${est === 'no_hecho' ? 'peligro activo' : ''}" data-tarea="${key}" data-estado="no_hecho" aria-label="No se hizo">✕</button>
        </li>`;
      }).join('')}</ul></section>`;
  }).join('');
  el.innerHTML = `${barraFecha()}
    <div class="kpis kpis-3">
      <div class="kpi"><span>Tareas del día</span><strong>${total}</strong><small>${DIAS_CORTO[DIAS.indexOf(dia)]} ${fmtFecha(st.fecha)}</small></div>
      <div class="kpi"><span>Hechas</span><strong class="pos">${hechas}</strong><small>${total ? Math.round(hechas / total * 100) : 0}% del día</small></div>
      <div class="kpi"><span>Pendientes</span><strong class="${total - hechas ? 'neg' : 'pos'}">${total - hechas}</strong><small>&nbsp;</small></div>
    </div>
    ${bloques || '<div class="vacio">No hay tareas programadas para este día. Puedes agregar una con “＋ Agregar tarea”.</div>'}`;
  enlazarFecha(el);
  el.querySelectorAll('[data-foto]').forEach((i) => i.addEventListener('click', () => verFoto(i.dataset.foto)));
  el.querySelectorAll('[data-tarea]').forEach((b) => b.addEventListener('click', () => guardarTarea(TAREA_CTX[b.dataset.tarea], { estado: b.dataset.estado })));
  el.querySelectorAll('[data-fototarea]').forEach((inp) => inp.addEventListener('change', async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      toast('Subiendo foto…');
      const url = await subirArchivo(await comprimirImagen(file, 1200, 0.7), 'tareas');
      await guardarTarea(TAREA_CTX[inp.dataset.fototarea], { foto_path: url, estado: TAREA_CTX[inp.dataset.fototarea].f.reg?.estado || 'hecho' });
    } catch (e) { toast('No se pudo guardar la foto: ' + e.message, true); }
  }));
}
const TAREA_CTX = {};

async function guardarTarea({ e, f }, cambios) {
  const datos = { ...cambios, hora_registro: new Date().toISOString() };
  const { error } = f.reg
    ? await db().from('tareas').update(datos).eq('id', f.reg.id)
    : await db().from('tareas').insert({ org_id: estado.miembro.org_id, centro_id: st.centro, empleado_id: e.id, plantilla_id: f.plantilla || null,
        fecha: st.fecha, tipo: 'tarea', tarea: f.tarea, categoria: f.categoria, registrado_por: estado.miembro.nombre, ...datos });
  if (error) return toast(error.message, true);
  pintar();
}

function tareaExtra() {
  const modal = abrirModal({
    titulo: 'Agregar tarea',
    cuerpo: `<form class="form" id="tx">
      <label>Empleado<select name="emp">${equipo.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></label>
      <label>Tarea<input name="tarea" maxlength="200" required></label>
      <label>Categoría<select name="cat">${CATS_TAREA.map((c) => `<option>${c}</option>`).join('')}</select></label>
      <p class="nota">Se agrega solo para el ${fmtFecha(st.fecha)}. Las tareas fijas de cada día se cambian en la plantilla.</p></form>`,
    pie: `<button class="btn btn-ghost" id="tx-no">Cancelar</button><button class="btn btn-primary" id="tx-si">Agregar</button>`,
  });
  const f = modal.querySelector('#tx');
  modal.querySelector('#tx-no').addEventListener('click', cerrarModal);
  modal.querySelector('#tx-si').addEventListener('click', async () => {
    if (!f.tarea.value.trim()) return toast('Escribe la tarea', true);
    const { error } = await db().from('tareas').insert({ org_id: estado.miembro.org_id, centro_id: st.centro, empleado_id: f.emp.value,
      fecha: st.fecha, tipo: 'tarea', tarea: f.tarea.value.trim(), categoria: f.cat.value, estado: 'pendiente', registrado_por: estado.miembro.nombre });
    if (error) return toast(error.message, true);
    cerrarModal(); toast('Tarea agregada ✓'); pintar();
  });
}

// ================= RONDÍN =================
async function rondin(el) {
  const yo = normalizar(estado.miembro.nombre).split(' ')[0];
  const revisados = equipo.filter((e) => !normalizar(e.puesto).includes('encargado') && !(yo && normalizar(e.nombre).startsWith(yo)));
  if (!revisados.length) { el.innerHTML = barraFecha() + sinEquipo; enlazarFecha(el); return; }
  const { data, error } = await db().from('tareas').select('*').eq('centro_id', st.centro).eq('fecha', st.fecha).eq('tipo', 'rondin')
    .order('hora_registro');
  if (error) throw error;
  el.innerHTML = `${barraFecha()}
    <p class="nota">Recorre el edificio y marca a cada persona: ¿está trabajando en lo suyo? Se puede marcar varias veces al día.</p>
    <section class="panel"><ul class="checklist">${revisados.map((e) => {
      const checks = data.filter((r) => r.empleado_id === e.id);
      const ult = checks[checks.length - 1];
      return `<li>
        <div class="check-txt"><strong>${esc(e.nombre)}</strong><small class="mut">${esc(e.puesto || '')}</small>
          <small>${checks.length ? checks.map((c) => `<span class="${c.estado === 'hecho' ? 'pos' : 'neg'}">${c.estado === 'hecho' ? '✓' : '✕'} ${hora(c.hora_registro)}</span>`).join(' · ') : '<span class="mut">Sin verificar</span>'}</small>
          ${ult?.foto_path ? `<img class="mini-foto" src="${esc(ult.foto_path)}" alt="Foto" data-foto="${esc(ult.foto_path)}">` : ''}</div>
        <label class="icon-btn foto" title="Verificar con foto">📷<input type="file" accept="image/*" capture="environment" hidden data-fotoronda="${e.id}"></label>
        <button class="btn btn-sm btn-primary" data-ronda="${e.id}" data-estado="hecho">✓ Trabajando</button>
        <button class="btn btn-sm btn-ghost peligro" data-ronda="${e.id}" data-estado="no_hecho">✕ No la encontré</button>
        ${ult ? `<button class="link-btn" data-deshacer="${ult.id}">deshacer</button>` : ''}
      </li>`;
    }).join('')}</ul></section>`;
  enlazarFecha(el);
  const marcar = async (empId, estadoR, foto_path = null) => {
    const { error: e2 } = await db().from('tareas').insert({ org_id: estado.miembro.org_id, centro_id: st.centro, empleado_id: empId,
      fecha: st.fecha, tipo: 'rondin', tarea: 'Verificación de rondín', categoria: 'Rondín', estado: estadoR, foto_path,
      hora_registro: new Date().toISOString(), registrado_por: estado.miembro.nombre });
    if (e2) return toast(e2.message, true);
    toast(estadoR === 'hecho' ? 'Trabajando ✓' : 'Marcado: no la encontré'); pintar();
  };
  el.querySelectorAll('[data-foto]').forEach((i) => i.addEventListener('click', () => verFoto(i.dataset.foto)));
  el.querySelectorAll('[data-ronda]').forEach((b) => b.addEventListener('click', () => marcar(b.dataset.ronda, b.dataset.estado)));
  el.querySelectorAll('[data-fotoronda]').forEach((inp) => inp.addEventListener('change', async () => {
    const file = inp.files[0]; if (!file) return;
    try { toast('Subiendo foto…'); marcar(inp.dataset.fotoronda, 'hecho', await subirArchivo(await comprimirImagen(file, 1200, 0.7), 'rondin')); }
    catch (e) { toast('No se pudo guardar la foto: ' + e.message, true); }
  }));
  el.querySelectorAll('[data-deshacer]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar la última verificación?')) return;
    const { error: e3 } = await db().from('tareas').delete().eq('id', b.dataset.deshacer);
    if (e3) return toast(e3.message, true);
    pintar();
  }));
}

// ================= INCIDENCIAS =================
async function incidencias(el) {
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-primary" id="i-nueva">＋ Reportar algo</button>`;
  document.getElementById('i-nueva').addEventListener('click', reportar);
  const { data, error } = await db().from('tareas').select('*').eq('centro_id', st.centro).eq('tipo', 'incidencia')
    .order('creado_en', { ascending: false }).limit(500);
  if (error) throw error;
  const resuelta = (i) => !!i.resuelto_en || i.estado === 'hecho';
  const lista = data.filter((i) => st.filtroInc === 'todas' || (st.filtroInc === 'abiertas' ? !resuelta(i) : resuelta(i)));
  const nombre = (id) => equipo.find((e) => e.id === id)?.nombre || '';
  el.innerHTML = `
    <div class="segmento">${[['abiertas', 'Abiertas'], ['resueltas', 'Resueltas'], ['todas', 'Todas']]
      .map(([id, t]) => `<button data-filtro="${id}" class="${st.filtroInc === id ? 'activo' : ''}">${t}</button>`).join('')}</div>
    ${lista.length ? `<div class="tarjetas">${lista.map((i) => `
      <div class="tarjeta incidencia ${i.severidad === 'grave' ? 'grave' : ''}">
        <div class="tarjeta-top"><div><strong>${esc(i.tarea)}</strong>
          <small class="mut">${[nombre(i.empleado_id), i.categoria, fmtFecha(i.fecha), i.severidad === 'grave' ? 'Grave' : 'Leve'].filter(Boolean).map(esc).join(' · ')}</small></div>
          <span class="badge ${resuelta(i) ? 'verde' : 'rojo'}">${resuelta(i) ? 'Resuelta' : 'Abierta'}</span></div>
        ${i.notas ? `<p class="nota">${esc(i.notas)}</p>` : ''}
        ${i.foto_path ? `<img class="mini-foto" src="${esc(i.foto_path)}" alt="Foto" data-foto="${esc(i.foto_path)}">` : ''}
        ${!resuelta(i) ? `<div class="botones"><button class="btn btn-sm btn-ghost" data-resolver="${i.id}">Marcar resuelta</button></div>` : ''}
      </div>`).join('')}</div>` : '<div class="vacio">Sin incidencias.</div>'}`;
  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { st.filtroInc = b.dataset.filtro; pintar(); }));
  el.querySelectorAll('[data-foto]').forEach((i) => i.addEventListener('click', () => verFoto(i.dataset.foto)));
  el.querySelectorAll('[data-resolver]').forEach((b) => b.addEventListener('click', async () => {
    const { error: e2 } = await db().from('tareas').update({ estado: 'hecho', resuelto_en: new Date().toISOString() }).eq('id', b.dataset.resolver);
    if (e2) return toast(e2.message, true);
    toast('Marcada como resuelta ✓'); pintar();
  }));
}

function reportar() {
  const modal = abrirModal({
    titulo: 'Reportar algo',
    cuerpo: `<form class="form" id="rf">
      <label>¿Qué pasó?<input name="titulo" maxlength="200" required></label>
      <label>Empleado relacionado <small>(si aplica)</small><select name="emp"><option value="">— Ninguno —</option>
        ${equipo.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></label>
      <div class="form-2">
        <label>Categoría<select name="cat">${CATS_INC.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <label>Gravedad<select name="sev"><option value="leve">Leve</option><option value="grave">Grave</option></select></label>
      </div>
      <label>Notas<textarea name="notas" rows="2"></textarea></label>
      <label class="archivo">Foto <small>(opcional)</small><input type="file" name="foto" accept="image/*" capture="environment"></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="rf-no">Cancelar</button><button class="btn btn-primary" id="rf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#rf');
  modal.querySelector('#rf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#rf-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!f.titulo.value.trim()) return toast('Escribe qué pasó', true);
    btn.disabled = true;
    try {
      const foto = f.foto.files[0] ? await subirArchivo(await comprimirImagen(f.foto.files[0], 1200, 0.7), 'incidencias') : null;
      const { error } = await db().from('tareas').insert({ org_id: estado.miembro.org_id, centro_id: st.centro, empleado_id: f.emp.value || null,
        fecha: hoyISO(), tipo: 'incidencia', tarea: f.titulo.value.trim(), categoria: f.cat.value, severidad: f.sev.value,
        notas: f.notas.value.trim() || null, foto_path: foto, estado: 'pendiente', registrado_por: estado.miembro.nombre });
      if (error) throw error;
      cerrarModal(); toast('Guardado ✓'); pintar();
    } catch (e) { btn.disabled = false; toast(e.message, true); }
  });
}

// ================= NÓMINA (dueño y administración) =================
async function nomina(el) {
  const sem = st.semana, fin = sumarDias(sem, 6);
  const [emp, per, asis] = await Promise.all([
    db().from('empleados').select('*').eq('activo', true).order('nombre'),
    db().from('nomina_periodos').select('id, empresa_id, fecha_inicio, nomina_lineas(*)').eq('fecha_inicio', sem),
    db().from('asistencia').select('empleado_id, fecha, estado, monto_descuento').gte('fecha', sem).lte('fecha', fin),
  ]);
  if (emp.error || per.error || asis.error) throw emp.error || per.error || asis.error;
  const lineas = per.data.flatMap((p) => p.nomina_lineas);
  const pagoDe = (id) => lineas.find((l) => l.empleado_id === id);
  const faltasDe = (id) => asis.data.filter((a) => a.empleado_id === id && a.estado === 'falta').map((a) => a.fecha);
  const retardosDe = (id) => asis.data.filter((a) => a.empleado_id === id && a.estado !== 'falta').reduce((s, a) => s + Number(a.monto_descuento || 0), 0);
  const montoDe = (e) => Math.max(0, Number(e.salario_semanal) - faltasDe(e.id).length * Number(e.salario_semanal) / (e.dias_semana || 6));

  const grupos = {};
  emp.data.forEach((e) => (grupos[e.centro_id || ''] ||= []).push(e));
  const total = emp.data.reduce((s, e) => s + montoDe(e), 0);
  const pagado = lineas.reduce((s, l) => s + Number(l.sueldo), 0);
  const pendientes = emp.data.filter((e) => !pagoDe(e.id));
  const semanas = Array.from({ length: 16 }, (_, i) => sumarDias(lunesDe(hoyISO()), -7 * i));
  if (!semanas.includes(sem)) semanas.push(sem);

  document.getElementById('page-actions').innerHTML = pendientes.length
    ? `<button class="btn btn-primary" id="n-todos">Pagar a ${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}</button>` : '';
  el.innerHTML = `
    <div class="periodo"><select id="n-semana" aria-label="Semana">${semanas.map((s) =>
      `<option value="${s}" ${s === sem ? 'selected' : ''}>${etiquetaSemana(s)}${s === lunesDe(hoyISO()) ? ' · esta semana' : ''}</option>`).join('')}</select></div>
    <div class="kpis kpis-3">
      <div class="kpi"><span>Total a pagar</span><strong>${fmt(total)}</strong><small>${emp.data.length} personas</small></div>
      <div class="kpi"><span>Ya pagado</span><strong class="pos">${fmt(pagado)}</strong><small>${lineas.length} personas</small></div>
      <div class="kpi"><span>Por pagar</span><strong class="${pendientes.length ? 'neg' : 'pos'}">${pendientes.length ? fmt(Math.max(0, total - pagado)) : '✓ Listo'}</strong><small>${pendientes.length} pendientes</small></div>
    </div>
    ${Object.entries(grupos).sort((a, b) => nombreCentro(a[0]).localeCompare(nombreCentro(b[0]))).map(([cid, lista]) => {
      const sub = lista.reduce((s, e) => s + montoDe(e), 0), pagadoC = lista.reduce((s, e) => s + Number(pagoDe(e.id)?.sueldo || 0), 0);
      return `<section class="panel"><div class="panel-head"><h3>${esc(nombreCentro(cid))}</h3>
        <span class="mut">${lista.length} · <strong class="${pagadoC >= sub ? 'pos' : ''}">${fmt(pagadoC)} / ${fmt(sub)}</strong></span></div>
        <ul class="nomina">${lista.map((e) => {
          const p = pagoDe(e.id), faltas = faltasDe(e.id), monto = montoDe(e), ret = retardosDe(e.id);
          const dias = Array.from({ length: e.dias_semana || 6 }, (_, i) => sumarDias(sem, i));
          return `<li class="${p ? 'pagado' : ''}">
            <div class="tarjeta-top"><span class="avatar">${iniciales(e.nombre)}</span>
              <div><strong>${esc(e.nombre)}</strong><small class="mut">${esc(e.puesto || '—')} · ${fmt(e.salario_semanal)}/sem${faltas.length ? ` · <span class="neg">${faltas.length} falta${faltas.length === 1 ? '' : 's'}</span>` : ''}${ret ? ` · retardos ${fmt(ret)}` : ''}</small></div>
              <div class="nomina-der">${p
                ? `<span class="pos fuerte">✓ ${fmt(p.sueldo)}</span><small class="mut">${esc(p.forma_pago || '')} · ${fmtFecha(p.fecha)}</small>
                   <button class="icon-btn peligro" data-borrarpago="${p.id}" aria-label="Eliminar pago">✕</button>`
                : `<strong>${fmt(monto)}</strong><button class="btn btn-sm btn-primary" data-pagar="${e.id}">Pagar</button>`}</div></div>
            ${p ? '' : `<div class="dias-falta">${dias.map((d) => {
              const f = faltas.includes(d);
              return `<button class="dia-falta ${f ? 'falta' : ''}" data-falta="${e.id}|${d}" title="${f ? 'Quitar falta' : 'Marcar falta'}">${DIAS_CORTO[(new Date(d + 'T12:00:00').getDay() + 6) % 7]}<br>${f ? '✗' : '✓'}</button>`;
            }).join('')}</div>`}
          </li>`;
        }).join('')}</ul></section>`;
    }).join('') || '<div class="vacio">Sin empleados activos.</div>'}
    <p class="nota">Cada pago se registra también como gasto de "Nómina" en el centro de la persona. Los retardos se muestran como referencia y no se descuentan solos (igual que antes).</p>`;

  el.querySelector('#n-semana').addEventListener('change', (e) => { st.semana = e.target.value; pintar(); });
  const porId = (id) => emp.data.find((x) => x.id === id);
  el.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => pagarModal(porId(b.dataset.pagar), montoDe(porId(b.dataset.pagar)))));
  el.querySelectorAll('[data-falta]').forEach((b) => b.addEventListener('click', async () => {
    const [id, fecha] = b.dataset.falta.split('|');
    b.disabled = true;
    const ya = asis.data.find((a) => a.empleado_id === id && a.fecha === fecha && a.estado === 'falta');
    const { error } = ya ? await db().from('asistencia').delete().eq('empleado_id', id).eq('fecha', fecha).eq('estado', 'falta')
      : await db().rpc('asistencia_marcar', { p_empleado: id, p_fecha: fecha, p_accion: 'falta' });
    if (error) { b.disabled = false; return toast(error.message, true); }
    pintar();
  }));
  el.querySelectorAll('[data-borrarpago]').forEach((b) => b.addEventListener('click', async () => {
    const l = lineas.find((x) => x.id === b.dataset.borrarpago);
    if (!confirm(`¿Eliminar el pago de ${fmt(l.sueldo)} a ${porId(l.empleado_id)?.nombre}?${l.gasto_id ? '\nTambién se borra su gasto de Nómina.' : '\nOjo: su gasto de Nómina se capturó en el sistema anterior; si hace falta, bórralo en Gastos.'}`)) return;
    const { error } = await db().from('nomina_lineas').delete().eq('id', l.id);
    if (error) return toast(error.message, true);
    if (l.gasto_id) await db().from('gastos').delete().eq('id', l.gasto_id);
    toast('Pago eliminado'); pintar();
  }));
  document.getElementById('n-todos')?.addEventListener('click', async (ev) => {
    const suma = pendientes.reduce((s, e) => s + montoDe(e), 0);
    if (!confirm(`¿Registrar el pago de ${pendientes.length} personas por ${fmt(suma)}, en efectivo y con fecha de hoy?`)) return;
    ev.currentTarget.disabled = true;
    let ok = 0;
    for (const e of pendientes) {
      const { error } = await db().rpc('nomina_pagar', { p_empleado: e.id, p_semana: sem, p_monto: montoDe(e), p_fecha: hoyISO(), p_forma: 'Efectivo', p_notas: '' });
      if (error) toast(`${e.nombre}: ${error.message}`, true); else ok++;
    }
    toast(`${ok} pagos registrados ✓`); pintar();
  });
}
const nombreCentro = (id) => estado.centros.find((c) => c.id === id)?.nombre || 'Sin centro asignado';

function pagarModal(e, monto) {
  const modal = abrirModal({
    titulo: `Pagar a ${e.nombre}`,
    cuerpo: `<form class="form" id="np"><p class="nota">Semana ${etiquetaSemana(st.semana)}</p>
      <div class="form-2"><label>Monto<input type="number" name="monto" step="0.01" min="0" value="${Math.round(monto * 100) / 100}"></label>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}"></label></div>
      <label>Método<select name="forma">${METODOS.map((m) => `<option>${m}</option>`).join('')}</select></label>
      <label>Nota<input name="nota" maxlength="200" placeholder="Horas extra, bono…"></label></form>`,
    pie: `<button class="btn btn-ghost" id="np-no">Cancelar</button><button class="btn btn-primary" id="np-si">Confirmar pago</button>`,
  });
  const f = modal.querySelector('#np');
  modal.querySelector('#np-no').addEventListener('click', cerrarModal);
  modal.querySelector('#np-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const { error } = await db().rpc('nomina_pagar', { p_empleado: e.id, p_semana: st.semana, p_monto: Number(f.monto.value) || 0,
      p_fecha: f.fecha.value || hoyISO(), p_forma: f.forma.value, p_notas: f.nota.value.trim() });
    if (error) { btn.disabled = false; return toast(error.message, true); }
    cerrarModal(); toast('Pago registrado ✓'); pintar();
  });
}

// ================= EMPLEADOS =================
async function empleados(el) {
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-primary" id="e-nuevo">＋ Empleado</button>`;
  document.getElementById('e-nuevo').addEventListener('click', () => editarEmpleado(null));
  const { data: todos, error } = await db().from('empleados').select('*').order('activo', { ascending: false }).order('nombre');
  if (error) throw error;
  // Los dados de baja se guardan por su historial de nómina, pero no se muestran salvo que se pidan
  const bajas = todos.filter((e) => !e.activo).length;
  const data = verBajas ? todos : todos.filter((e) => e.activo);
  const asegurados = todos.filter((e) => e.activo && e.imss).length;
  el.innerHTML = `<section class="panel">
    <div class="panel-head"><h3>${todos.length - bajas} empleado${todos.length - bajas === 1 ? '' : 's'} activo${todos.length - bajas === 1 ? '' : 's'}
      <small class="sub-meta">· ${asegurados} en el IMSS</small></h3>
      ${bajas ? `<button class="btn btn-sm btn-ghost" id="e-bajas">${verBajas ? 'Ocultar dados de baja' : `Ver dados de baja (${bajas})`}</button>` : ''}</div>
    <div class="tabla-wrap"><table class="tabla">
    <thead><tr><th>Nombre</th><th>Puesto</th><th>Centro</th><th class="num">Sueldo semanal</th><th>Horario</th><th></th></tr></thead>
    <tbody>${data.map((e) => `<tr class="${e.activo ? '' : 'inactivo'}">
      <td data-l="Nombre"><strong>${esc(e.nombre)}</strong>${e.activo ? '' : ' <span class="tag tag-suave">baja</span>'}${e.imss ? ' <span class="tag" title="Asegurado en el IMSS (registro patronal de MEDCO)">IMSS</span>' : ''}</td>
      <td class="mut" data-l="Puesto">${esc(e.puesto || '—')}</td>
      <td class="mut" data-l="Centro">${esc(nombreCentro(e.centro_id))}</td>
      <td class="num fuerte" data-l="Sueldo">${fmt(e.salario_semanal)}</td>
      <td class="mut nowrap" data-l="Horario">${String(e.hora_entrada || '').slice(0, 5)}–${String(e.hora_salida || '').slice(0, 5)} · ${e.dias_semana} días</td>
      <td class="acciones"><button class="btn btn-sm btn-ghost" data-editar="${e.id}">Editar</button></td></tr>`).join('')}</tbody>
  </table></div></section>`;
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarEmpleado(data.find((x) => x.id === b.dataset.editar))));
  el.querySelector('#e-bajas')?.addEventListener('click', () => { verBajas = !verBajas; empleados(el); });
}
let verBajas = false;

function editarEmpleado(e) {
  const dl = (e?.dias_laborales || 'LUN,MAR,MIE,JUE,VIE,SAB').split(',');
  const modal = abrirModal({
    titulo: e ? `Editar · ${e.nombre}` : 'Nuevo empleado',
    cuerpo: `<form class="form" id="ef">
      <label>Nombre<input name="nombre" maxlength="100" value="${esc(e?.nombre || '')}" required></label>
      <div class="form-2"><label>Puesto<input name="puesto" maxlength="60" value="${esc(e?.puesto || '')}"></label>
        <label>Centro<select name="centro">${estado.centros.map((c) => `<option value="${c.id}" ${e?.centro_id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label></div>
      <div class="form-2"><label>Sueldo semanal<input type="number" name="sueldo" min="0" step="0.01" value="${e ? Number(e.salario_semanal) : ''}"></label>
        <label>Días por semana<select name="dias">${[3, 4, 5, 6, 7].map((n) => `<option ${(e?.dias_semana || 6) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="form-2"><label>Entrada<input type="time" name="entrada" value="${String(e?.hora_entrada || '08:00').slice(0, 5)}"></label>
        <label>Salida<input type="time" name="salida" value="${String(e?.hora_salida || '17:00').slice(0, 5)}"></label></div>
      <div class="form-2"><label>Tolerancia (min)<input type="number" name="tol" min="0" max="120" value="${e?.tolerancia_min ?? 10}"></label>
        <label>Fecha de ingreso<input type="date" name="ingreso" value="${e?.fecha_ingreso || ''}"></label></div>
      <fieldset class="opciones"><legend>Días que trabaja</legend><div class="dias-sel">${DIAS.map((d, i) =>
        `<label class="opcion opcion-linea"><input type="checkbox" name="dl" value="${d}" ${dl.includes(d) ? 'checked' : ''}> ${DIAS_CORTO[i]}</label>`).join('')}</div></fieldset>
      <fieldset class="opciones"><legend>Seguro social</legend>
        <label class="opcion opcion-linea"><input type="checkbox" name="imss" ${e?.imss ? 'checked' : ''}> Dado de alta en el IMSS (registro patronal de MEDCO)</label>
        <div class="form-2"><label>NSS<input name="nss" maxlength="11" inputmode="numeric" value="${esc(e?.nss || '')}"></label>
          <label>Fecha de alta<input type="date" name="alta" value="${e?.alta_imss || ''}"></label></div>
        <label>Nombre como está en el IMSS<input name="nimss" maxlength="120" value="${esc(e?.nombre_imss || '')}"></label>
      </fieldset>
      <label class="opcion opcion-linea"><input type="checkbox" name="activo" ${!e || e.activo ? 'checked' : ''}> Activo (sale en nómina y asistencia)</label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="ef-no">Cancelar</button><button class="btn btn-primary" id="ef-si">Guardar</button>`,
  });
  const f = modal.querySelector('#ef');
  modal.querySelector('#ef-no').addEventListener('click', cerrarModal);
  modal.querySelector('#ef-si').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!f.nombre.value.trim()) return toast('Escribe el nombre', true);
    const centro = estado.centros.find((c) => c.id === f.centro.value);
    btn.disabled = true;
    const datos = { nombre: f.nombre.value.trim(), puesto: f.puesto.value.trim() || null, centro_id: centro.id, empresa_id: centro.empresa_id,
      salario_semanal: Number(f.sueldo.value) || 0, dias_semana: +f.dias.value, hora_entrada: f.entrada.value || '08:00',
      hora_salida: f.salida.value || '17:00', tolerancia_min: +f.tol.value || 0, fecha_ingreso: f.ingreso.value || null,
      dias_laborales: [...f.querySelectorAll('[name=dl]:checked')].map((c) => c.value).join(',') || 'LUN,MAR,MIE,JUE,VIE,SAB',
      activo: f.activo.checked, imss: f.imss.checked, nss: f.nss.value.trim() || null,
      alta_imss: f.alta.value || null, nombre_imss: f.nimss.value.trim() || null };
    const { error } = e ? await db().from('empleados').update(datos).eq('id', e.id)
      : await db().from('empleados').insert({ ...datos, org_id: estado.miembro.org_id });
    if (error) { btn.disabled = false; return toast(error.message, true); }
    cerrarModal(); toast('Empleado guardado ✓'); pintar();
  });
}

// ================= VACACIONES =================
async function vacaciones(el) {
  const anio = new Date().getFullYear();
  const [emp, vac] = await Promise.all([
    db().from('empleados').select('id, nombre, puesto, centro_id, fecha_ingreso').eq('activo', true).order('nombre'),
    db().from('vacaciones').select('*').order('fecha_inicio', { ascending: false }),
  ]);
  if (emp.error || vac.error) throw emp.error || vac.error;
  el.innerHTML = `<section class="panel"><div class="panel-head"><h3>Vacaciones ${anio}</h3></div>
    <ul class="checklist">${emp.data.map((e) => {
      const suyas = vac.data.filter((v) => v.empleado_id === e.id);
      const tomados = suyas.filter((v) => v.fecha_inicio.startsWith(String(anio))).reduce((s, v) => s + v.dias, 0);
      return `<li><div class="check-txt"><strong>${esc(e.nombre)}</strong>
          <small class="mut">${tomados} día${tomados === 1 ? '' : 's'} tomados este año${e.fecha_ingreso ? ' · ingresó ' + fmtFecha(e.fecha_ingreso) : ''}</small>
          ${suyas.length ? `<small>${suyas.slice(0, 4).map((v) => `${fmtFecha(v.fecha_inicio)} → ${fmtFecha(v.fecha_fin)} (${v.dias}) <button class="link-btn" data-borrarvac="${v.id}">quitar</button>`).join(' · ')}</small>` : ''}</div>
        <button class="btn btn-sm btn-ghost" data-vac="${e.id}">＋ Vacaciones</button></li>`;
    }).join('')}</ul></section>`;
  el.querySelectorAll('[data-vac]').forEach((b) => b.addEventListener('click', () => {
    const e = emp.data.find((x) => x.id === b.dataset.vac);
    const modal = abrirModal({ titulo: `Vacaciones · ${e.nombre}`,
      cuerpo: `<form class="form" id="vf"><div class="form-2"><label>Desde<input type="date" name="ini" value="${hoyISO()}"></label>
        <label>Hasta<input type="date" name="fin" value="${hoyISO()}"></label></div>
        <label>Días hábiles<input type="number" name="dias" min="1" value="1"></label><label>Notas<input name="notas"></label></form>`,
      pie: `<button class="btn btn-ghost" id="vf-no">Cancelar</button><button class="btn btn-primary" id="vf-si">Guardar</button>` });
    const f = modal.querySelector('#vf');
    const calc = () => { const d = Math.round((new Date(f.fin.value) - new Date(f.ini.value)) / 864e5) + 1; if (d > 0) f.dias.value = d; };
    f.ini.addEventListener('change', calc); f.fin.addEventListener('change', calc);
    modal.querySelector('#vf-no').addEventListener('click', cerrarModal);
    modal.querySelector('#vf-si').addEventListener('click', async () => {
      if (f.fin.value < f.ini.value) return toast('La fecha final es antes de la inicial', true);
      const { error } = await db().from('vacaciones').insert({ org_id: estado.miembro.org_id, empleado_id: e.id, fecha_inicio: f.ini.value,
        fecha_fin: f.fin.value, dias: +f.dias.value || 1, notas: f.notas.value.trim() || null });
      if (error) return toast(error.message, true);
      cerrarModal(); toast('Vacaciones registradas ✓'); pintar();
    });
  }));
  el.querySelectorAll('[data-borrarvac]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Quitar este periodo de vacaciones?')) return;
    const { error } = await db().from('vacaciones').delete().eq('id', b.dataset.borrarvac);
    if (error) return toast(error.message, true);
    pintar();
  }));
}

// Menú de empleados: solo activos, agrupados por centro (los dados de baja se conservan por su historial, pero no se eligen)
function opcionesEmpleados(lista) {
  const activos = lista.filter((e) => e.activo !== false);
  const grupos = new Map();
  activos.forEach((e) => { const c = nombreCentro(e.centro_id) || 'Sin centro'; if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(e); });
  return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([c, es]) => `<optgroup label="${esc(c)}">${es.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</optgroup>`).join('');
}

// ================= PRÉSTAMOS =================
async function prestamos(el) {
  const [emp, pre, abo] = await Promise.all([
    db().from('empleados').select('id, nombre, activo, centro_id').order('nombre'),
    db().from('prestamos').select('*').order('fecha', { ascending: false }),
    db().from('prestamo_abonos').select('*').order('fecha'),
  ]);
  if (emp.error || pre.error || abo.error) throw emp.error || pre.error || abo.error;
  const saldo = (p) => Number(p.monto) - abo.data.filter((a) => a.prestamo_id === p.id).reduce((s, a) => s + Number(a.monto), 0);
  const vivos = pre.data.filter((p) => saldo(p) > 0.009);
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-primary" id="pr-nuevo">＋ Préstamo</button>`;
  document.getElementById('pr-nuevo').addEventListener('click', () => {
    const modal = abrirModal({ titulo: 'Nuevo préstamo',
      cuerpo: `<form class="form" id="pf"><label>Empleado<select name="emp">${opcionesEmpleados(emp.data)}</select></label>
        <div class="form-2"><label>Monto<input type="number" name="monto" min="1" step="0.01"></label><label>Abono semanal<input type="number" name="abono" min="0" step="0.01"></label></div>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}"></label><label>Notas<input name="notas"></label></form>`,
      pie: `<button class="btn btn-ghost" id="pf-no">Cancelar</button><button class="btn btn-primary" id="pf-si">Guardar</button>` });
    const f = modal.querySelector('#pf');
    modal.querySelector('#pf-no').addEventListener('click', cerrarModal);
    modal.querySelector('#pf-si').addEventListener('click', async () => {
      if (!(Number(f.monto.value) > 0)) return toast('Escribe el monto', true);
      const { error } = await db().from('prestamos').insert({ org_id: estado.miembro.org_id, empleado_id: f.emp.value, monto: Number(f.monto.value),
        abono_semanal: Number(f.abono.value) || 0, fecha: f.fecha.value, notas: f.notas.value.trim() || null });
      if (error) return toast(error.message, true);
      cerrarModal(); toast('Préstamo registrado ✓'); pintar();
    });
  });
  const nom = (id) => emp.data.find((e) => e.id === id)?.nombre || '—';
  el.innerHTML = `<div class="kpis kpis-3">
      <div class="kpi"><span>Préstamos vivos</span><strong>${vivos.length}</strong><small>&nbsp;</small></div>
      <div class="kpi"><span>Saldo por cobrar</span><strong class="neg">${fmt(vivos.reduce((s, p) => s + saldo(p), 0))}</strong><small>&nbsp;</small></div>
      <div class="kpi"><span>Prestado en total</span><strong>${fmt(pre.data.reduce((s, p) => s + Number(p.monto), 0))}</strong><small>&nbsp;</small></div></div>
    ${pre.data.length ? `<section class="panel"><ul class="lista-pagos">${pre.data.map((p) => `<li>
      <div><strong>${esc(nom(p.empleado_id))}</strong> <span class="mut">· ${fmt(p.monto)} el ${fmtFecha(p.fecha)}${Number(p.abono_semanal) ? ` · abona ${fmt(p.abono_semanal)}/sem` : ''}</span>
        <small>${saldo(p) > 0.009 ? `Debe <strong class="neg">${fmt(saldo(p))}</strong>` : '<span class="pos">Liquidado ✓</span>'}${p.notas ? ' · ' + esc(p.notas) : ''}</small>
        ${abo.data.filter((a) => a.prestamo_id === p.id).map((a) => `<small class="mut">Abono ${fmt(a.monto)} · ${fmtFecha(a.fecha)}</small>`).join('')}</div>
      ${saldo(p) > 0.009 ? `<button class="btn btn-sm btn-ghost" data-abono="${p.id}">＋ Abono</button>` : ''}</li>`).join('')}</ul></section>`
      : '<div class="vacio">Sin préstamos registrados.</div>'}`;
  el.querySelectorAll('[data-abono]').forEach((b) => b.addEventListener('click', () => {
    const p = pre.data.find((x) => x.id === b.dataset.abono);
    const modal = abrirModal({ titulo: `Abono · ${nom(p.empleado_id)}`,
      cuerpo: `<form class="form" id="af"><p class="nota">Saldo: ${fmt(saldo(p))}</p><div class="form-2">
        <label>Monto<input type="number" name="monto" min="1" step="0.01" value="${Math.min(saldo(p), Number(p.abono_semanal) || saldo(p))}"></label>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}"></label></div></form>`,
      pie: `<button class="btn btn-ghost" id="af-no">Cancelar</button><button class="btn btn-primary" id="af-si">Guardar</button>` });
    const f = modal.querySelector('#af');
    modal.querySelector('#af-no').addEventListener('click', cerrarModal);
    modal.querySelector('#af-si').addEventListener('click', async () => {
      const m = Number(f.monto.value);
      if (!(m > 0)) return toast('Escribe el abono', true);
      const { error } = await db().from('prestamo_abonos').insert({ org_id: estado.miembro.org_id, prestamo_id: p.id, monto: m, fecha: f.fecha.value });
      if (error) return toast(error.message, true);
      if (saldo(p) - m <= 0.009) await db().from('prestamos').update({ liquidado: true }).eq('id', p.id);
      cerrarModal(); toast('Abono registrado ✓'); pintar();
    });
  }));
}
