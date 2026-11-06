// Personal / Equipo: "Hoy" (quién está, lo que pasó en el día, pendientes, reportes, paquetes, turnos y nómina; ver equipo.js),
// el día a día del encargado (turnos, rondines, reportes, paquetes, asistencia, tareas, incidencias) y,
// para dueño y administración, nómina semanal, empleados, vacaciones y préstamos.
// Reemplaza "Elysium · Mi día" y la Nómina del Centro de Control.
import { MESES, MARCA } from '../config.js';
import { db, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal,
         comprimirImagen, subirArchivo, verFoto, normalizar } from '../lib.js';

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CATS_TAREA = ['Limpieza', 'Mantenimiento', 'Seguridad', 'Jardinería', 'Administrativo', 'Otro'];
const CATS_INC = ['Falla de mantenimiento', 'Uso indebido de horario', 'Trabajo particular en el edificio', 'Ausencia / impuntualidad', 'Mal servicio', 'Otro'];
const METODOS = ['Efectivo', 'Transferencia SPEI', 'Depósito', 'Cheque'];

const admin = () => tieneRol(['administracion']);
const st = { tab: null, centro: null, fecha: hoyISO(), semana: lunesDe(hoyISO()), filtroInc: 'abiertas' };
let raiz, equipo = [], unidadesC = [], contratosC = [];
const EQUIPO = ['hoy', 'turnos', 'rondines', 'reportes', 'paquetes', 'plantillas'];   // vistas que viven en equipo.js

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
// Tres pestañas, por momento: Hoy (lo que pasa y lo que hay que hacer), Semana (turnos y nómina) y Personas
// (empleados, vacaciones, préstamos). Lo demás son vistas de detalle a las que se llega desde ahí, con "← Volver".
// El encargado ve solo Hoy y Semana. Con la marca "personalEnMenu", cada vista es su propia opción del menú (mod.tab).
// Seis pestañas: Hoy y Turnos (día a día, también para el encargado); Raya, Plantilla, Vacaciones y Préstamos (dueño y administración).
const PRINCIPALES = [['hoy', 'Hoy'], ['turnos', 'Turnos'], ['nomina', 'Raya semanal'], ['empleados', 'Plantilla'], ['vacaciones', 'Vacaciones'], ['prestamos', 'Préstamos']];
const PADRE = { asistencia: 'hoy', tareas: 'hoy', rondin: 'hoy', incidencias: 'hoy', rondines: 'hoy', reportes: 'hoy', paquetes: 'hoy', plantillas: 'hoy',
  semana: 'turnos', personas: 'empleados' };
const TITULO = { semana: 'Turnos', personas: 'Plantilla', asistencia: 'Asistencia por día', tareas: 'Tareas por día', rondin: 'Supervisión', incidencias: 'Incidencias', rondines: 'Rondines',
  reportes: 'Reportes de residentes', paquetes: 'Paquetes', plantillas: 'Tareas de cada día', turnos: 'Turnos', nomina: 'Nómina',
  empleados: 'Empleados', vacaciones: 'Vacaciones', prestamos: 'Préstamos' };
let fijo = null;
export async function render(view, mod) {
  raiz = view;
  fijo = mod?.tab || null;
  if (fijo) st.tab = fijo;
  const tabs = admin() ? PRINCIPALES : PRINCIPALES.slice(0, 2);
  if (st.tab === 'semana') st.tab = 'turnos';
  if (st.tab === 'personas') st.tab = 'empleados';
  if (!st.tab || (!PADRE[st.tab] && !tabs.some(([id]) => id === st.tab)) || (PADRE[st.tab] && !tabs.some(([id]) => id === PADRE[st.tab]))) st.tab = tabs[0][0];

  // centros con personal (para el encargado: los de su empresa); con la marca, solo los centros que tienen personal
  const visibles = estado.centros.filter((c) => (!['socio', 'personal'].includes(c.tipo) || admin()) && (!MARCA.centrosPersonal || MARCA.centrosPersonal.includes(c.nombre)));
  if (st.centro && !visibles.some((c) => c.id === st.centro)) st.centro = null;   // se cambió de empresa arriba
  st.centro ||= (visibles.find((c) => c.nombre === (MARCA.centroPersonal || 'Torre Elysium')) || visibles[0])?.id;

  view.innerHTML = `
    <div class="sub-head">
      ${fijo ? '<span></span>' : `<div class="tabs" role="tablist">${tabs.map(([id, t]) => `<button role="tab" data-tab="${id}">${t}</button>`).join('')}</div>`}
      <div class="p-der">
        <select id="p-centro" aria-label="Edificio" class="${admin() ? '' : 'solo-dia'}" ${visibles.length < 2 ? 'hidden' : ''}>
          ${visibles.map((c) => `<option value="${c.id}" ${c.id === st.centro ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
        ${tieneRol(['administracion', 'encargado']) && !fijo ? '<button class="btn btn-ghost" id="p-conf" title="Rondín, tareas de cada día, QR del elevador">Configurar</button>' : ''}
      </div>
    </div>
    <div id="p-volver"></div>
    <div id="p-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; pintar(); }));
  view.querySelector('#p-centro').addEventListener('change', (e) => { st.centro = e.target.value; pintar(); });
  view.querySelector('#p-conf')?.addEventListener('click', async () => (await import('./equipo.js')).configurar(contexto()));
  await pintar();
}

const irA = (t) => { st.tab = t; pintar(); window.scrollTo({ top: 0 }); };
const contexto = () => ({ centro: st.centro, equipo, fecha: st.fecha, st, unidades: unidadesC, contratos: contratosC, irA, repintar: pintar,
  cambiarFecha: (f) => { st.fecha = f; pintar(); }, barraFecha, enlazarFecha });

async function pintar() {
  const padre = PADRE[st.tab] || st.tab;
  raiz.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === padre));
  const conEquipo = padre === 'hoy' || padre === 'turnos';
  raiz.querySelector('#p-centro').style.display = conEquipo ? '' : 'none';
  const conf = raiz.querySelector('#p-conf'); if (conf) conf.style.display = conEquipo ? '' : 'none';
  // vista de detalle: "← Volver" a su pestaña
  const vol = raiz.querySelector('#p-volver');
  vol.innerHTML = PADRE[st.tab] && !fijo ? `<div class="p-volver"><button class="link-btn" id="p-atras">← ${PRINCIPALES.find(([id]) => id === padre)[1]}</button><strong>${TITULO[st.tab]}</strong></div>` : '';
  vol.querySelector('#p-atras')?.addEventListener('click', () => irA(padre));
  document.getElementById('page-actions').innerHTML = '';
  const el = raiz.querySelector('#p-cuerpo');
  el.innerHTML = '<div class="cargando">Cargando…</div>';
  if (conEquipo) {
    const { data, error } = await db().rpc('equipo_de', { p_centro: st.centro });
    if (error) { el.innerHTML = `<div class="vacio">No se pudo cargar el personal: ${esc(error.message)}</div>`; return; }
    equipo = data || [];
  }
  try {
    if (['hoy', 'reportes', 'paquetes'].includes(st.tab)) {
      const [u, k] = await Promise.all([
        db().from('unidades').select('id, identificador').eq('centro_id', st.centro).eq('activo', true),
        db().from('contratos').select('unidad_id, arrendatario, telefono').eq('centro_id', st.centro).eq('activo', true)]);
      unidadesC = u.data || []; contratosC = k.data || [];
    }
    if (EQUIPO.includes(st.tab)) {
      const m = await import('./equipo.js');
      if (st.tab === 'turnos') { el.innerHTML = '<section class="panel" id="s-turnos"></section>'; await m.turnos(el.querySelector('#s-turnos'), contexto()); return; }
      await m[st.tab](el, contexto());
      return;
    }
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
const sinEquipo = '<div class="vacio">No hay personal activo en este centro. Se da de alta en Nómina y equipo → Plantilla.</div>';

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
  const sem = st.semana, fin = sumarDias(sem, 6), hoy = hoyISO();
  const [emp, per, asis, pre, abo] = await Promise.all([
    db().from('empleados').select('*').eq('activo', true).order('nombre'),
    db().from('nomina_periodos').select('id, empresa_id, fecha_inicio, nomina_lineas(*)').eq('fecha_inicio', sem),
    db().from('asistencia').select('empleado_id, fecha, estado, monto_descuento').gte('fecha', sem).lte('fecha', fin),
    db().from('prestamos').select('*'),
    db().from('prestamo_abonos').select('*'),
  ]);
  if (emp.error || per.error || asis.error) throw emp.error || per.error || asis.error;
  const lineas = per.data.flatMap((p) => p.nomina_lineas);
  const pagoDe = (id) => lineas.find((l) => l.empleado_id === id);
  const faltasDe = (id) => asis.data.filter((a) => a.empleado_id === id && a.estado === 'falta').map((a) => a.fecha);
  const retardosDe = (id) => asis.data.filter((a) => a.empleado_id === id && a.estado !== 'falta').reduce((s, a) => s + Number(a.monto_descuento || 0), 0);
  const diario = (e) => Number(e.salario_semanal) / (e.dias_semana || 6);
  const sueldoDe = (e) => Math.max(0, Number(e.salario_semanal) - faltasDe(e.id).length * diario(e));
  // Préstamo vigente de cada persona: se le descuenta su abono semanal (se puede cambiar o quitar antes de pagar)
  const abonos = abo.data || [];
  const saldoP = (p) => Number(p.monto) - abonos.filter((a) => a.prestamo_id === p.id).reduce((s, a) => s + Number(a.monto), 0);
  const prestamoDe = (id) => (pre.data || []).filter((p) => p.empleado_id === id && saldoP(p) > 0.009).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const descuento = {};                                 // empleado → abono a descontar esta semana
  emp.data.forEach((e) => { const p = prestamoDe(e.id); if (p) descuento[e.id] = Math.min(saldoP(p), Number(p.abono_semanal) || 0); });
  const netoDe = (e) => Math.max(0, sueldoDe(e) - (descuento[e.id] || 0));
  const pagadoDe = (l) => Number(l.sueldo) - Number(l.abono_prestamo || 0);

  // Centros con gente, para filtrar la hoja
  const centrosConGente = [...new Set(emp.data.map((e) => e.centro_id || ''))].sort((a, b) => nombreCentro(a).localeCompare(nombreCentro(b), 'es'));
  if (st.rayaCentro && !centrosConGente.includes(st.rayaCentro)) st.rayaCentro = null;
  const visibles = () => emp.data.filter((e) => !st.rayaCentro || (e.centro_id || '') === st.rayaCentro);
  const pendientesDe = () => visibles().filter((e) => !pagoDe(e.id));
  const actual = lunesDe(hoy);

  el.innerHTML = `<div class="ry">
    <div class="ry-barra">
      <div class="ry-semana">
        <button class="icon-btn" data-sem="-7" aria-label="Semana anterior">‹</button>
        <div><span class="ry-eti">${sem === actual ? 'Esta semana' : sem < actual ? `Hace ${Math.round((new Date(actual) - new Date(sem)) / 6048e5)} sem.` : 'Próxima semana'}</span>
          <strong>${etiquetaSemana(sem)}</strong></div>
        <button class="icon-btn" data-sem="7" aria-label="Semana siguiente" ${sem >= actual ? 'disabled' : ''}>›</button>
        ${sem !== actual ? '<button class="btn btn-sm btn-ghost" data-sem="0">Ir a esta semana</button>' : ''}
      </div>
      ${centrosConGente.length > 1 ? `<div class="ry-centros" role="tablist">
        <button class="pill ${!st.rayaCentro ? 'activa' : ''}" data-rc="">Todos <span>${emp.data.length}</span></button>
        ${centrosConGente.map((c) => `<button class="pill ${st.rayaCentro === c ? 'activa' : ''}" data-rc="${c}">${esc(nombreCentro(c))} <span>${emp.data.filter((e) => (e.centro_id || '') === c).length}</span></button>`).join('')}
      </div>` : ''}
    </div>
    <section class="ry-resumen" id="ry-resumen"></section>
    <section class="panel ry-hoja"><div class="tabla-wrap"><table class="tabla ry-tabla">
      <thead><tr><th>Colaborador</th><th class="ry-dias-h">Asistencia <small>(toca un día para marcar falta)</small></th><th class="num">Sueldo</th>
        <th class="num">Faltas</th><th class="num">Préstamo</th><th class="num">A pagar</th><th class="ry-acc"></th></tr></thead>
      <tbody id="ry-filas"></tbody></table></div></section>
    <p class="nota">Cada pago se registra como gasto de Nómina en el centro de la persona (por el sueldo de la semana). El abono a préstamo se descuenta de lo que se le entrega y se anota en su préstamo. Los retardos se muestran como referencia; no se descuentan solos.</p>
  </div>`;
  el = el.querySelector('.ry');

  const fila = (e) => {
    const p = pagoDe(e.id), faltas = faltasDe(e.id), ret = retardosDe(e.id), pr = prestamoDe(e.id);
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias(sem, i));
    const trabaja = (e.dias_laborales || 'LUN,MAR,MIE,JUE,VIE,SAB').split(',');
    const fDesc = faltas.length * diario(e);
    return `<tr class="${p ? 'ry-pagado' : ''}" data-emp="${e.id}">
      <td data-l="Colaborador"><div class="ry-quien"><span class="avatar">${iniciales(e.nombre)}</span><div><strong>${esc(e.nombre)}</strong>
        <small>${esc(e.puesto || '—')}${st.rayaCentro ? '' : ` · ${esc(nombreCentro(e.centro_id))}`}</small></div></div></td>
      <td data-l="Asistencia"><div class="ry-dias">${dias.map((d) => {
        const lab = trabaja.includes(codigoDia(d)), f = faltas.includes(d), fut = d > hoy;
        return `<button class="ry-dia ${f ? 'falta' : !lab ? 'libre' : fut ? 'fut' : 'ok'}" ${p || (!lab && !f) ? 'disabled' : ''} data-falta="${e.id}|${d}"
          title="${f ? 'Faltó — tocar para quitar' : lab ? (fut ? 'Programado' : 'Asistió — tocar para marcar falta') : 'Descanso'}">${DIAS_CORTO[(new Date(d + 'T12:00:00').getDay() + 6) % 7].charAt(0)}</button>`;
      }).join('')}</div>${ret ? `<small class="ry-ret">Retardos: ${fmt(ret)}</small>` : ''}</td>
      <td class="num" data-l="Sueldo">${fmt(e.salario_semanal)}</td>
      <td class="num ${faltas.length ? 'neg' : 'mut'}" data-l="Faltas">${faltas.length ? `−${fmt(fDesc)}<small>${faltas.length} día${faltas.length === 1 ? '' : 's'}</small>` : '—'}</td>
      <td class="num" data-l="Préstamo">${p ? (Number(p.abono_prestamo) ? `<span class="neg">−${fmt(p.abono_prestamo)}</span>` : '<span class="mut">—</span>')
        : pr ? `<label class="ry-abono" title="Saldo del préstamo: ${fmt(saldoP(pr))}"><span>−</span><input type="number" min="0" step="50" max="${saldoP(pr).toFixed(2)}" data-abono="${e.id}" value="${descuento[e.id] || 0}"></label><small>debe ${fmt(saldoP(pr))}</small>`
        : '<span class="mut">—</span>'}</td>
      <td class="num ry-neto" data-l="A pagar">${p ? fmt(pagadoDe(p)) : fmt(netoDe(e))}</td>
      <td class="ry-acc">${p
        ? `<div class="ry-ok"><span class="ry-check">Pagado</span><small>${esc(p.forma_pago || '')} · ${fmtFecha(p.fecha)}</small>
            <button class="icon-btn peligro" data-borrarpago="${p.id}" aria-label="Deshacer pago" title="Deshacer pago">✕</button></div>`
        : `<button class="btn btn-sm btn-primary" data-pagar="${e.id}">Pagar</button>`}</td></tr>`;
  };
  const pintarResumen = () => {
    const lista = visibles();
    const total = lista.reduce((s, e) => { const p = pagoDe(e.id); return s + (p ? pagadoDe(p) : netoDe(e)); }, 0);
    const pagado = lista.reduce((s, e) => s + (pagoDe(e.id) ? pagadoDe(pagoDe(e.id)) : 0), 0);
    const pend = pendientesDe(), hechos = lista.length - pend.length;
    const pct = lista.length ? Math.round((hechos / lista.length) * 100) : 0;
    el.querySelector('#ry-resumen').innerHTML = `
      <div class="ry-cifra"><span>Raya de la semana</span><strong>${fmt(total)}</strong><small>${lista.length} persona${lista.length === 1 ? '' : 's'}</small></div>
      <div class="ry-cifra"><span>Entregado</span><strong class="pos">${fmt(pagado)}</strong><small>${hechos} de ${lista.length}</small></div>
      <div class="ry-cifra"><span>Falta entregar</span><strong>${fmt(Math.max(0, total - pagado))}</strong><small>${pend.length} pendiente${pend.length === 1 ? '' : 's'}</small></div>
      <div class="ry-avance"><div class="ry-pista"><span style="width:${pct}%"></span></div><small>${pct} % pagado</small></div>
      <div class="ry-todos">${pend.length ? `<select id="ry-forma" aria-label="Forma de pago">${METODOS.map((m) => `<option>${m}</option>`).join('')}</select>
        <button class="btn btn-primary" id="ry-todos">Pagar a ${pend.length} pendiente${pend.length === 1 ? '' : 's'}</button>` : lista.length ? '<span class="ry-listo">Semana pagada completa</span>' : ''}</div>`;
    el.querySelector('#ry-todos')?.addEventListener('click', pagarTodos);
  };
  const pintarFilas = () => {
    const lista = visibles();
    // orden: pendientes primero, por centro y nombre; los pagados al final
    lista.sort((a, b) => (!!pagoDe(a.id) - !!pagoDe(b.id)) || nombreCentro(a.centro_id).localeCompare(nombreCentro(b.centro_id), 'es') || a.nombre.localeCompare(b.nombre, 'es'));
    el.querySelector('#ry-filas').innerHTML = lista.map(fila).join('') || '<tr><td colspan="7" class="vacio">Sin colaboradores activos.</td></tr>';
    pintarResumen();
  };
  const repintarFila = (e) => {
    const tr = el.querySelector(`tr[data-emp="${e.id}"]`);
    if (tr) tr.outerHTML = fila(e);
    pintarResumen();
  };
  pintarFilas();
  document.getElementById('page-actions').innerHTML = '';

  el.querySelectorAll('[data-sem]').forEach((b) => b.addEventListener('click', () => {
    st.semana = +b.dataset.sem === 0 ? actual : sumarDias(sem, +b.dataset.sem); pintar();
  }));
  el.querySelectorAll('[data-rc]').forEach((b) => b.addEventListener('click', () => { st.rayaCentro = b.dataset.rc || null; nomina(el.parentElement); }));
  const porId = (id) => emp.data.find((x) => x.id === id);
  el.addEventListener('input', (ev) => {
    const i = ev.target.closest('[data-abono]'); if (!i) return;
    const e = porId(i.dataset.abono), pr = prestamoDe(e.id);
    descuento[e.id] = Math.min(Math.max(0, Number(i.value) || 0), pr ? saldoP(pr) : 0, sueldoDe(e));
    el.querySelector(`tr[data-emp="${e.id}"] .ry-neto`).textContent = fmt(netoDe(e));
    pintarResumen();
  });

  // Registrar el pago: gasto de Nómina por el sueldo; si hay abono, se descuenta en la línea y se anota en el préstamo
  async function registrar(e, forma, fecha, nota) {
    const ab = descuento[e.id] || 0, pr = prestamoDe(e.id);
    const notas = [nota, ab ? `Descuento préstamo ${fmt(ab)} · entregado ${fmt(netoDe(e))}` : ''].filter(Boolean).join(' · ');
    const { data, error } = await db().rpc('nomina_pagar', { p_empleado: e.id, p_semana: sem, p_monto: Math.round(sueldoDe(e) * 100) / 100,
      p_fecha: fecha, p_forma: forma, p_notas: notas });
    if (error) throw error;
    if (ab && pr) {
      await db().from('nomina_lineas').update({ abono_prestamo: ab }).eq('id', data);
      const r = await db().from('prestamo_abonos').insert({ org_id: estado.miembro.org_id, prestamo_id: pr.id, monto: ab, fecha });
      if (!r.error) { abonos.push({ prestamo_id: pr.id, monto: ab, fecha }); if (saldoP(pr) <= 0.009) await db().from('prestamos').update({ liquidado: true }).eq('id', pr.id); }
    }
    const { data: l } = await db().from('nomina_lineas').select('*').eq('id', data).maybeSingle();
    lineas.push(l || { id: data, empleado_id: e.id, sueldo: sueldoDe(e), abono_prestamo: ab, forma_pago: forma, fecha });
  }
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pagar]');
    if (!b) return;
    const e = porId(b.dataset.pagar), ab = descuento[e.id] || 0;
    const modal = abrirModal({
      titulo: `Pagar raya · ${e.nombre}`,
      cuerpo: `<form class="form" id="np"><div class="ry-recibo">
          <div><span>Sueldo de la semana</span><strong>${fmt(e.salario_semanal)}</strong></div>
          ${faltasDe(e.id).length ? `<div><span>Faltas (${faltasDe(e.id).length})</span><strong class="neg">−${fmt(Number(e.salario_semanal) - sueldoDe(e))}</strong></div>` : ''}
          ${ab ? `<div><span>Abono a préstamo</span><strong class="neg">−${fmt(ab)}</strong></div>` : ''}
          <div class="ry-recibo-tot"><span>Se entrega</span><strong>${fmt(netoDe(e))}</strong></div></div>
        <p class="nota">Semana ${etiquetaSemana(sem)}</p>
        <div class="form-2"><label>Forma de pago<select name="forma">${METODOS.map((m) => `<option>${m}</option>`).join('')}</select></label>
          <label>Fecha<input type="date" name="fecha" value="${hoy}"></label></div>
        <label>Nota <small>(opcional)</small><input name="nota" maxlength="200" placeholder="Horas extra, bono…"></label></form>`,
      pie: `<button class="btn btn-ghost" id="np-no">Cancelar</button><button class="btn btn-primary" id="np-si">Confirmar pago</button>`,
    });
    const f = modal.querySelector('#np');
    modal.querySelector('#np-no').addEventListener('click', cerrarModal);
    modal.querySelector('#np-si').addEventListener('click', async (x) => {
      x.currentTarget.disabled = true;
      try { await registrar(e, f.forma.value, f.fecha.value || hoy, f.nota.value.trim()); }
      catch (err) { x.currentTarget.disabled = false; return toast(err.message, true); }
      cerrarModal(); toast(`Pago a ${e.nombre} registrado`); pintarFilas();
    });
  });
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-falta]');
    if (!b || b.disabled || b.dataset.ocupado) return;
    const [id, fecha] = b.dataset.falta.split('|');
    const e = porId(id);
    const ya = asis.data.find((a) => a.empleado_id === id && a.fecha === fecha && a.estado === 'falta');
    if (ya) asis.data.splice(asis.data.indexOf(ya), 1);
    else asis.data.push({ empleado_id: id, fecha, estado: 'falta', monto_descuento: 0 });
    repintarFila(e);
    const nuevo = el.querySelector(`[data-falta="${id}|${fecha}"]`);
    if (nuevo) nuevo.dataset.ocupado = '1';
    const { error } = ya ? await db().from('asistencia').delete().eq('empleado_id', id).eq('fecha', fecha).eq('estado', 'falta')
      : await db().rpc('asistencia_marcar', { p_empleado: id, p_fecha: fecha, p_accion: 'falta' });
    if (error) {
      if (ya) asis.data.push(ya); else asis.data.splice(asis.data.findIndex((a) => a.empleado_id === id && a.fecha === fecha && a.estado === 'falta'), 1);
      toast('No se pudo guardar la falta: ' + error.message, true);
    }
    repintarFila(e);
  });
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-borrarpago]');
    if (!b) return;
    const l = lineas.find((x) => x.id === b.dataset.borrarpago);
    if (!confirm(`¿Deshacer el pago de ${fmt(pagadoDe(l))} a ${porId(l.empleado_id)?.nombre}?${l.gasto_id ? '\nTambién se borra su gasto de Nómina.' : '\nSu gasto de Nómina se capturó en el sistema anterior; si hace falta, bórralo en Gastos.'}${Number(l.abono_prestamo) ? '\nEl abono al préstamo se quita en Préstamos.' : ''}`)) return;
    const { error } = await db().from('nomina_lineas').delete().eq('id', l.id);
    if (error) return toast(error.message, true);
    if (l.gasto_id) await db().from('gastos').delete().eq('id', l.gasto_id);
    lineas.splice(lineas.indexOf(l), 1);
    toast('Pago deshecho'); pintarFilas();
  });
  async function pagarTodos(ev) {
    const pendientes = pendientesDe(), forma = el.querySelector('#ry-forma').value;
    const suma = pendientes.reduce((s, e) => s + netoDe(e), 0);
    if (!confirm(`¿Registrar el pago de ${pendientes.length} persona${pendientes.length === 1 ? '' : 's'} por ${fmt(suma)}, en ${forma.toLowerCase()} y con fecha de hoy?`)) return;
    ev.currentTarget.disabled = true;
    let ok = 0;
    for (const e of pendientes) {
      try { await registrar(e, forma, hoy, ''); ok++; } catch (err) { toast(`${e.nombre}: ${err.message}`, true); }
    }
    toast(`${ok} pago${ok === 1 ? '' : 's'} registrado${ok === 1 ? '' : 's'}`); pintarFilas();
  }
}
const nombreCentro = (id) => estado.centros.find((c) => c.id === id)?.nombre || 'Sin centro asignado';

function pagarModal(e, monto, alPagar) {
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
    const { data, error } = await db().rpc('nomina_pagar', { p_empleado: e.id, p_semana: st.semana, p_monto: Number(f.monto.value) || 0,
      p_fecha: f.fecha.value || hoyISO(), p_forma: f.forma.value, p_notas: f.nota.value.trim() });
    if (error) { btn.disabled = false; return toast(error.message, true); }
    cerrarModal(); toast('Pago registrado ✓');
    if (alPagar) alPagar(data); else pintar();
  });
}

// ================= EMPLEADOS =================
async function empleados(el) {
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-primary" id="e-nuevo">＋ Empleado</button>`;
  document.getElementById('e-nuevo').addEventListener('click', () => editarEmpleado(null));
  const [{ data: todos, error }, { data: mbs }] = await Promise.all([
    db().from('empleados').select('*').order('activo', { ascending: false }).order('nombre'),
    db().from('miembros').select('empleado_id, usuario, activo')]);
  if (error) throw error;
  const acceso = (e) => (mbs || []).find((m) => m.empleado_id === e.id && m.activo);
  const esDueno = estado.miembro.rol === 'dueno';
  // Los dados de baja se guardan por su historial de nómina, pero no se muestran salvo que se pidan
  const bajas = todos.filter((e) => !e.activo).length;
  const data = verBajas ? todos : todos.filter((e) => e.activo);
  const asegurados = todos.filter((e) => e.activo && e.imss).length;
  el.innerHTML = `<section class="panel">
    <div class="panel-head"><h3>${todos.length - bajas} empleado${todos.length - bajas === 1 ? '' : 's'} activo${todos.length - bajas === 1 ? '' : 's'}
      <small class="sub-meta">· ${asegurados} en el IMSS · raya semanal ${fmt(todos.filter((e) => e.activo).reduce((s, e) => s + Number(e.salario_semanal || 0), 0))}</small></h3>
      ${bajas ? `<button class="btn btn-sm btn-ghost" id="e-bajas">${verBajas ? 'Ocultar dados de baja' : `Ver dados de baja (${bajas})`}</button>` : ''}</div>
    <div class="tabla-wrap"><table class="tabla">
    <thead><tr><th>Nombre</th><th>Puesto</th><th class="num">Sueldo semanal</th><th>Horario</th><th></th></tr></thead>
    <tbody>${porCentro(data).map(([cid, gente]) => `<tr class="pl-grupo"><td colspan="5"><strong>${esc(nombreCentro(cid))}</strong>
      <span>${gente.length} · ${fmt(gente.filter((e) => e.activo).reduce((s, e) => s + Number(e.salario_semanal || 0), 0))} por semana</span></td></tr>
      ${gente.map((e) => `<tr class="${e.activo ? '' : 'inactivo'}">
      <td data-l="Nombre"><strong>${esc(e.nombre)}</strong>${e.activo ? '' : ' <span class="tag tag-suave">baja</span>'}${e.imss ? ' <span class="tag" title="Asegurado en el IMSS (registro patronal)">IMSS</span>' : ''}</td>
      <td class="mut" data-l="Puesto">${esc(e.puesto || '—')}</td>
            <td class="num fuerte" data-l="Sueldo">${fmt(e.salario_semanal)}</td>
      <td class="mut nowrap" data-l="Horario">${String(e.hora_entrada || '').slice(0, 5)}–${String(e.hora_salida || '').slice(0, 5)} · ${e.dias_semana} días</td>
      <td class="acciones nowrap">${!e.activo ? '' : acceso(e) ? `<span class="tag tag-ok" title="Entra desde su celular">Acceso: ${esc(acceso(e).usuario || '')}</span>`
        : esDueno ? `<button class="btn btn-sm btn-ghost" data-acceso="${e.id}" title="Crearle usuario para su celular">Dar acceso</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-editar="${e.id}">Editar</button></td></tr>`).join('')}`).join('')}</tbody>
  </table></div></section>`;
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarEmpleado(data.find((x) => x.id === b.dataset.editar))));
  el.querySelector('#e-bajas')?.addEventListener('click', () => { verBajas = !verBajas; empleados(el); });
  el.querySelectorAll('[data-acceso]').forEach((b) => b.addEventListener('click', async () =>
    (await import('./equipo.js')).darAcceso(data.find((x) => x.id === b.dataset.acceso), () => empleados(el))));
}
let verBajas = false;
const porCentro = (lista) => {
  const g = new Map();
  lista.forEach((e) => { const k = e.centro_id || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(e); });
  return [...g.entries()].sort((a, b) => nombreCentro(a[0]).localeCompare(nombreCentro(b[0]), 'es'));
};

function editarEmpleado(e) {
  const dl = (e?.dias_laborales || 'LUN,MAR,MIE,JUE,VIE,SAB').split(',');
  const modal = abrirModal({
    titulo: e ? `Editar · ${e.nombre}` : 'Nuevo empleado',
    cuerpo: `<form class="form" id="ef">
      <label>Nombre<input name="nombre" maxlength="100" value="${esc(e?.nombre || '')}" required></label>
      <label>Celular <small>(para escribirle por WhatsApp)</small><input name="tel" maxlength="20" inputmode="tel" value="${esc(e?.telefono || '')}"></label>
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
        <label class="opcion opcion-linea"><input type="checkbox" name="imss" ${e?.imss ? 'checked' : ''}> Dado de alta en el IMSS (registro patronal)</label>
        <div class="form-2"><label>NSS<input name="nss" maxlength="11" inputmode="numeric" value="${esc(e?.nss || '')}"></label>
          <label>Fecha de alta<input type="date" name="alta" value="${e?.alta_imss || ''}"></label></div>
        <label>Nombre como está en el IMSS<input name="nimss" maxlength="120" value="${esc(e?.nombre_imss || '')}"></label>
      </fieldset>
      <label class="opcion opcion-linea"><input type="checkbox" name="prima" ${e?.prima_vacacional ? 'checked' : ''}> Se le paga prima vacacional (25 %)</label>
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
    const datos = { nombre: f.nombre.value.trim(), telefono: f.tel.value.trim() || null, puesto: f.puesto.value.trim() || null, centro_id: centro.id, empresa_id: centro.empresa_id,
      salario_semanal: Number(f.sueldo.value) || 0, dias_semana: +f.dias.value, hora_entrada: f.entrada.value || '08:00',
      hora_salida: f.salida.value || '17:00', tolerancia_min: +f.tol.value || 0, fecha_ingreso: f.ingreso.value || null,
      dias_laborales: [...f.querySelectorAll('[name=dl]:checked')].map((c) => c.value).join(',') || 'LUN,MAR,MIE,JUE,VIE,SAB',
      activo: f.activo.checked, prima_vacacional: f.prima.checked, imss: f.imss.checked, nss: f.nss.value.trim() || null,
      alta_imss: f.alta.value || null, nombre_imss: f.nimss.value.trim() || null };
    const { error } = e ? await db().from('empleados').update(datos).eq('id', e.id)
      : await db().from('empleados').insert({ ...datos, org_id: estado.miembro.org_id });
    if (error) { btn.disabled = false; return toast(error.message, true); }
    cerrarModal(); toast('Empleado guardado ✓'); pintar();
  });
}

// ================= VACACIONES =================
// Ley Federal del Trabajo (reforma "vacaciones dignas", vigente desde 2023):
// al cumplir cada año de servicio le tocan días (Art. 76), debe disfrutarlos dentro de los 6 meses siguientes (Art. 81)
// y se paga prima vacacional de al menos 25 % sobre el salario de esos días (Art. 80).
const diasLey = (anios) => anios < 1 ? 0 : anios <= 5 ? 10 + 2 * anios : 22 + 2 * Math.floor((anios - 6) / 5);
const sumarAnios = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const f = new Date(Date.UTC(y + n, m - 1, d)); return f.toISOString().slice(0, 10); };
const sumarMeses = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const f = new Date(Date.UTC(y, m - 1 + n, d)); return f.toISOString().slice(0, 10); };
const aniosCumplidos = (ingreso, hoy) => { let n = 0; while (sumarAnios(ingreso, n + 1) <= hoy) n++; return n; };
const antiguedadTxt = (ingreso, hoy) => {
  const n = aniosCumplidos(ingreso, hoy);
  let m = 0; while (sumarMeses(sumarAnios(ingreso, n), m + 1) <= hoy) m++;
  return [n ? `${n} año${n === 1 ? '' : 's'}` : '', m ? `${m} mes${m === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' ') || 'menos de 1 mes';
};
const salarioDiario = (e) => Number(e.salario_semanal || 0) / 7;
// En la empresa las vacaciones se pagan por semanas: cada semana de vacaciones = los días que trabaja a la semana (normalmente 6)
const semanasDe = (e, dias) => dias / (e.dias_semana || 6);
const semanasTxt = (e, dias) => { const w = Math.round(semanasDe(e, dias) * 10) / 10; return `${w} semana${w === 1 ? '' : 's'}`; };
// Lo que se le paga por esos días: semanas × sueldo semanal, + 25 % de prima solo a quien la recibe
const pagoDe = (e, dias) => semanasDe(e, dias) * Number(e.salario_semanal || 0) * (e.prima_vacacional ? 1.25 : 1);

async function vacaciones(el) {
  const hoy = hoyISO();
  const [emp, vac] = await Promise.all([
    db().from('empleados').select('id, nombre, puesto, centro_id, fecha_ingreso, salario_semanal, dias_semana, prima_vacacional').eq('activo', true).order('nombre'),
    db().from('vacaciones').select('*').order('fecha_inicio', { ascending: false }),
  ]);
  if (emp.error || vac.error) throw emp.error || vac.error;

  // Situación de cada empleado: periodo vigente (último aniversario cumplido) y el anterior si quedó algo pendiente
  const filas = emp.data.map((e) => {
    const suyas = vac.data.filter((v) => v.empleado_id === e.id);
    if (!e.fecha_ingreso) return { e, suyas, sinFecha: true };
    const n = aniosCumplidos(e.fecha_ingreso, hoy);
    const periodos = [];
    for (const p of [n - 1, n]) {
      if (p < 1) continue;
      const dias = diasLey(p), usados = suyas.filter((v) => v.periodo === p).reduce((s, v) => s + Number(v.dias || 0), 0);
      const desde = sumarAnios(e.fecha_ingreso, p);
      periodos.push({ p, dias, usados, pendientes: Math.max(0, dias - usados), desde, vence: sumarMeses(desde, 6) });
    }
    // El periodo anterior solo cuenta si quedó algo sin dar (después de un año ya no se puede reclamar, Art. 516)
    const vivos = periodos.filter((x) => x.p === n || (x.pendientes > 0 && sumarAnios(x.desde, 1) > hoy && suyas.some((v) => v.periodo != null)));
    const proximo = sumarAnios(e.fecha_ingreso, n + 1);
    return { e, suyas, n, vivos, actual: periodos.find((x) => x.p === n), proximo, diasProx: diasLey(n + 1) };
  });
  const pendientesTot = filas.reduce((s, f) => s + pagoDe(f.e, (f.vivos || []).reduce((a, x) => a + x.pendientes, 0)), 0);
  const vencidos = filas.filter((f) => (f.vivos || []).some((x) => x.pendientes > 0 && x.vence < hoy));
  const sinFecha = filas.filter((f) => f.sinFecha);
  const enMes = filas.filter((f) => f.proximo && f.proximo <= sumarMeses(hoy, 1));

  // Cada persona con su situación, ordenada por lo urgente: fuera de plazo → por vencer → pendientes → al corriente
  const pendDe = (f) => (f.vivos || []).reduce((a, x) => a + x.pendientes, 0);
  const nivel = (f) => {
    if (f.sinFecha) return { k: 4, t: 'Sin fecha de ingreso', c: 'gris' };
    if (!f.n) return { k: 6, t: 'Aún no cumple 1 año', c: 'gris' };
    const pend = pendDe(f);
    if (!pend) return { k: 5, t: 'Al corriente', c: 'ok' };
    if (f.vivos.some((x) => x.pendientes > 0 && x.vence < hoy)) return { k: 0, t: 'Fuera de plazo', c: 'mal' };
    if (f.vivos.some((x) => x.pendientes > 0 && x.vence <= sumarMeses(hoy, 1))) return { k: 1, t: 'Vence este mes', c: 'aviso' };
    return { k: 2, t: 'Pendientes', c: 'aviso' };
  };
  filas.forEach((f) => { f.niv = nivel(f); });
  filas.sort((a, b) => a.niv.k - b.niv.k || (a.actual?.vence || '9').localeCompare(b.actual?.vence || '9') || a.e.nombre.localeCompare(b.e.nombre, 'es'));
  const atencion = filas.filter((f) => f.niv.k <= 2 || f.niv.k === 4);
  st.vacFiltro ||= atencion.length ? 'atencion' : 'todas';
  const lista = st.vacFiltro === 'atencion' ? atencion : filas;
  // Ventana de 6 meses para darlas: dónde va hoy
  const ventana = (x) => {
    const t0 = new Date(x.desde).getTime(), t1 = new Date(x.vence).getTime(), th = new Date(hoy).getTime();
    return Math.max(0, Math.min(100, ((th - t0) / (t1 - t0)) * 100));
  };
  el.innerHTML = `
    <div class="vc-cifras">
      <div class="vc-cifra"><span>Por pagar o dar</span><strong>${fmt(pendientesTot)}</strong><small>${filas.filter((f) => pendDe(f)).length} personas con días pendientes</small></div>
      <div class="vc-cifra ${vencidos.length ? 'mal' : ''}"><span>Fuera de plazo</span><strong>${vencidos.length}</strong><small>pasaron 6 meses del aniversario</small></div>
      <div class="vc-cifra"><span>Aniversario en 30 días</span><strong>${enMes.length}</strong><small>${enMes.map((f) => esc(f.e.nombre.split(' ')[0])).slice(0, 4).join(', ') || 'Nadie'}</small></div>
      <div class="vc-cifra"><span>Sin fecha de ingreso</span><strong>${sinFecha.length}</strong><small>${sinFecha.length ? 'no se pueden calcular' : 'todos completos'}</small></div>
    </div>
    <div class="vc-barra"><div class="segmento">
      <button class="${st.vacFiltro === 'atencion' ? 'activo' : ''}" data-vf="atencion">Requieren atención · ${atencion.length}</button>
      <button class="${st.vacFiltro === 'todas' ? 'activo' : ''}" data-vf="todas">Todos · ${filas.length}</button></div>
      <button class="link-btn" id="vc-ley">Cómo se calculan</button></div>
    <section class="panel vc-lista">${lista.map((f) => {
      const pend = pendDe(f), x = f.actual;
      return `<article class="vc-fila">
        <div class="ry-quien"><span class="avatar">${iniciales(f.e.nombre)}</span><div><strong>${esc(f.e.nombre)}</strong>
          <small>${esc(nombreCentro(f.e.centro_id))}${f.sinFecha ? '' : ` · ${antiguedadTxt(f.e.fecha_ingreso, hoy)}`}</small></div></div>
        <div class="vc-toca">${x ? `<strong>${fmt(pagoDe(f.e, x.dias))}</strong><small>${semanasTxt(f.e, x.dias)}${f.e.prima_vacacional ? ' + prima 25 %' : ''} · ${f.n}º año</small>`
          : f.sinFecha ? '<small class="mut">Falta la fecha de ingreso</small>' : `<small class="mut">Primer año el ${fmtFecha(f.proximo)}</small>`}</div>
        <div class="vc-plazo">${x ? `<div class="vc-pista ${f.niv.c}"><span style="width:${ventana(x)}%"></span></div>
          <small>${fmtFecha(x.desde)} → <b>${fmtFecha(x.vence)}</b>${pend ? ` · faltan ${fmt(pagoDe(f.e, pend))}` : ''}</small>` : f.proximo ? `<small class="mut">Próximo aniversario ${fmtFecha(f.proximo)}</small>` : ''}</div>
        <span class="vc-chip ${f.niv.c}">${f.niv.t}</span>
        <div class="vc-acc">${f.sinFecha ? `<button class="btn btn-sm btn-ghost" data-fecha="${f.e.id}">Poner fecha</button>`
          : `${f.suyas.length ? `<button class="btn btn-sm btn-ghost" data-hist="${f.e.id}">Historial (${f.suyas.length})</button>` : ''}
             ${f.n ? `<button class="btn btn-sm ${pend ? 'btn-primary' : 'btn-ghost'}" data-vac="${f.e.id}">Registrar</button>` : ''}`}</div>
      </article>`; }).join('') || '<div class="vacio">Nadie requiere atención: todos al corriente.</div>'}</section>`;
  el.querySelectorAll('[data-vf]').forEach((b) => b.addEventListener('click', () => { st.vacFiltro = b.dataset.vf; vacaciones(el); }));
  el.querySelector('#vc-ley').addEventListener('click', () => {
    abrirModal({ titulo: 'Cómo se calculan las vacaciones', cuerpo: `<p class="nota">Ley Federal del Trabajo (desde 2023): 12 días al cumplir 1 año, +2 por año hasta 20 días al 5º, y +2 cada 5 años después.
      Se dan dentro de los 6 meses siguientes al aniversario, con prima vacacional de al menos 25 %.</p>
      <p class="nota">En la empresa se pagan en <strong>semanas de sueldo</strong> (12 días = 2 semanas si trabaja 6 días). La prima del 25 % solo a quien la tiene marcada en su ficha. La antigüedad cuenta desde la fecha de ingreso que se le reconoce.</p>`,
      pie: '<button class="btn btn-primary" id="vl-ok">Entendido</button>' }).querySelector('#vl-ok').addEventListener('click', cerrarModal);
  });
  const fila = (id) => filas.find((f) => f.e.id === id);
  el.querySelectorAll('[data-vac]').forEach((b) => b.addEventListener('click', () => registrarVacaciones(fila(b.dataset.vac))));
  el.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => historialVacaciones(fila(b.dataset.hist))));
  el.querySelectorAll('[data-fecha]').forEach((b) => b.addEventListener('click', async () => {
    const { data, error } = await db().from('empleados').select('*').eq('id', b.dataset.fecha).single();
    if (error) return toast(error.message, true);
    editarEmpleado(data);
  }));
}

function registrarVacaciones(f) {
  const e = f.e, hoy = hoyISO();
  const opciones = [];
  for (let p = f.n; p >= Math.max(1, f.n - 1); p--) {
    const usados = f.suyas.filter((v) => v.periodo === p).reduce((s, v) => s + Number(v.dias || 0), 0);
    opciones.push({ p, dias: diasLey(p), pend: Math.max(0, diasLey(p) - usados), desde: sumarAnios(e.fecha_ingreso, p) });
  }
  const sd = salarioDiario(e);
  const modal = abrirModal({ titulo: `Vacaciones · ${e.nombre}`,
    cuerpo: `<form class="form" id="vf">
      <label>¿De qué año de servicio?<select name="periodo">${opciones.map((o) =>
        `<option value="${o.p}">${o.p}º año (desde ${fmtFecha(o.desde)}) · le tocan ${fmt(pagoDe(e, o.dias))}, faltan ${fmt(pagoDe(e, o.pend))}</option>`).join('')}</select></label>
      <fieldset class="opciones"><legend>¿Qué pasó?</legend>
        <label class="opcion opcion-linea"><input type="radio" name="tipo" value="disfrutadas" checked> Las tomó (descansó esos días)</label>
        <label class="opcion opcion-linea"><input type="radio" name="tipo" value="pagadas"> Se le pagaron sin descansar</label></fieldset>
      <div class="form-2" id="vf-fechas"><label>Desde<input type="date" name="ini" value="${hoy}"></label><label>Hasta<input type="date" name="fin" value="${hoy}"></label></div>
      <div class="form-2"><label>Semanas<input type="number" name="semanas" min="0.5" max="10" step="0.5" value="${Math.round(semanasDe(e, opciones[0]?.pend || 0) * 10) / 10 || 1}"></label>
        <label>Equivale a días<input type="number" name="dias" min="1" max="60" value="${opciones[0]?.pend || (e.dias_semana || 6)}"></label></div>
      <label id="vf-lfecha" style="display:none">Fecha de pago<input type="date" name="fpago" value="${hoy}"></label>
      <div class="form-2"><label>Monto pagado<input type="number" name="monto" min="0" step="0.01"></label>
        <label${e.prima_vacacional ? '' : ' style="display:none"'}>Prima vacacional (25 %)<input type="number" name="prima" min="0" step="0.01"></label></div>
      <p class="nota" id="vf-nota"></p>
      <label>Notas<input name="notas" maxlength="200"></label></form>`,
    pie: `<button class="btn btn-ghost" id="vf-no">Cancelar</button><button class="btn btn-primary" id="vf-si">Guardar</button>` });
  const fm = modal.querySelector('#vf');
  const tipo = () => fm.querySelector('[name=tipo]:checked').value;
  const sugerir = () => {
    const w = Math.round(((Number(fm.dias.value) || 0) / (e.dias_semana || 6)) * 100) / 100, sem = Number(e.salario_semanal || 0);
    const pag = tipo() === 'pagadas';
    const prima = e.prima_vacacional ? w * sem * 0.25 : 0;
    fm.monto.value = pag ? (w * sem).toFixed(2) : '0.00'; fm.prima.value = prima.toFixed(2);
    if (document.activeElement !== fm.semanas) fm.semanas.value = Math.round(w * 10) / 10;
    modal.querySelector('#vf-nota').textContent = !sem ? 'Sin sueldo registrado: escribe el monto.'
      : `${w} semana${w === 1 ? '' : 's'} × ${fmt(sem)} = ${fmt(w * sem)}` + (e.prima_vacacional ? ` + prima ${fmt(prima)}` : '')
        + (pag ? '.' : '. Su sueldo de esas semanas va en la nómina normal.') + ' Puedes cambiar el monto.';
  };
  const ajustar = () => {
    const pag = tipo() === 'pagadas';
    modal.querySelector('#vf-fechas').style.display = pag ? 'none' : '';
    modal.querySelector('#vf-lfecha').style.display = pag ? '' : 'none';
  };
  const ds = e.dias_semana || 6;
  // Del calendario sale cuántas semanas descansó (7 días naturales = 1 semana)
  const calc = () => { const d = Math.round((new Date(fm.fin.value) - new Date(fm.ini.value)) / 864e5) + 1;
    if (d > 0) { fm.semanas.value = Math.round(d / 7 * 2) / 2 || 0.5; fm.dias.value = Math.round(fm.semanas.value * ds); sugerir(); } };
  fm.ini.addEventListener('change', calc); fm.fin.addEventListener('change', calc);
  fm.semanas.addEventListener('input', () => { fm.dias.value = Math.round((Number(fm.semanas.value) || 0) * ds); sugerir(); });
  fm.dias.addEventListener('input', () => { fm.semanas.value = Math.round((Number(fm.dias.value) || 0) / ds * 10) / 10; sugerir(); });
  fm.periodo.addEventListener('change', () => { const o = opciones.find((x) => x.p === +fm.periodo.value);
    if (o) { fm.dias.value = o.pend || ds; fm.semanas.value = Math.round(fm.dias.value / ds * 10) / 10; sugerir(); } });
  fm.querySelectorAll('[name=tipo]').forEach((r) => r.addEventListener('change', () => { ajustar(); sugerir(); }));
  sugerir(); ajustar();
  modal.querySelector('#vf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#vf-si').addEventListener('click', async (ev) => {
    const pag = tipo() === 'pagadas';
    const dias = Number(fm.dias.value);
    if (!(dias > 0)) return toast('Escribe los días', true);
    if (!pag && fm.fin.value < fm.ini.value) return toast('La fecha final es antes de la inicial', true);
    ev.currentTarget.disabled = true;
    const { error } = await db().from('vacaciones').insert({ org_id: estado.miembro.org_id, empleado_id: e.id, periodo: +fm.periodo.value,
      tipo: tipo(), dias, fecha_inicio: pag ? fm.fpago.value : fm.ini.value, fecha_fin: pag ? fm.fpago.value : fm.fin.value,
      monto: fm.monto.value === '' ? null : Number(fm.monto.value), prima: fm.prima.value === '' ? null : Number(fm.prima.value),
      notas: fm.notas.value.trim() || null });
    if (error) { ev.currentTarget.disabled = false; return toast(error.message, true); }
    cerrarModal(); toast('Vacaciones registradas ✓'); pintar();
  });
}

function historialVacaciones(f) {
  const modal = abrirModal({ titulo: `Historial de vacaciones · ${f.e.nombre}`,
    cuerpo: f.suyas.length ? `<ul class="lista-pagos">${f.suyas.map((v) => `<li><div>
        <strong>${semanasTxt(f.e, v.dias)} ${v.tipo === 'pagadas' ? 'pagadas' : 'tomadas'}</strong> <span class="mut">(${v.dias} días)</span>
        <span class="mut">${v.periodo ? `· ${v.periodo}º año` : ''} · ${v.tipo === 'pagadas' ? 'pagado el ' + fmtFecha(v.fecha_inicio) : fmtFecha(v.fecha_inicio) + ' → ' + fmtFecha(v.fecha_fin)}</span>
        ${v.monto != null || v.prima != null ? `<small>Pago ${fmt(v.monto || 0)} + prima ${fmt(v.prima || 0)} = <strong>${fmt(Number(v.monto || 0) + Number(v.prima || 0))}</strong></small>` : ''}
        ${v.notas ? `<small>${esc(v.notas)}</small>` : ''}</div>
        <button class="btn btn-sm btn-ghost peligro" data-borrarvac="${v.id}">Quitar</button></li>`).join('')}</ul>`
      : '<div class="vacio">Sin vacaciones registradas.</div>',
    pie: `<button class="btn btn-primary" id="hv-ok">Listo</button>` });
  modal.querySelector('#hv-ok').addEventListener('click', cerrarModal);
  modal.querySelectorAll('[data-borrarvac]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Quitar este registro de vacaciones?')) return;
    const { error } = await db().from('vacaciones').delete().eq('id', b.dataset.borrarvac);
    if (error) return toast(error.message, true);
    cerrarModal(); pintar();
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
  // Solo préstamos de la gente de esta empresa (en Grupo, de todos)
  const suyos = pre.data.filter((p) => emp.data.some((e) => e.id === p.empleado_id));
  const abonosDe = (p) => abo.data.filter((a) => a.prestamo_id === p.id);
  const vivosS = suyos.filter((p) => saldo(p) > 0.009), liquidados = suyos.filter((p) => saldo(p) <= 0.009);
  st.preFiltro ||= 'vigentes';
  const lista = st.preFiltro === 'vigentes' ? vivosS : liquidados;
  const semanal = vivosS.reduce((s, p) => s + Math.min(saldo(p), Number(p.abono_semanal) || 0), 0);
  const centroDe = (id) => nombreCentro(emp.data.find((e) => e.id === id)?.centro_id);
  el.innerHTML = `<div class="vc-cifras">
      <div class="vc-cifra"><span>Saldo por recuperar</span><strong>${fmt(vivosS.reduce((s, p) => s + saldo(p), 0))}</strong><small>${vivosS.length} préstamo${vivosS.length === 1 ? '' : 's'} vigente${vivosS.length === 1 ? '' : 's'}</small></div>
      <div class="vc-cifra"><span>Se descuenta por semana</span><strong>${fmt(semanal)}</strong><small>en la raya semanal</small></div>
      <div class="vc-cifra"><span>Recuperado</span><strong>${fmt(suyos.reduce((s, p) => s + Number(p.monto) - saldo(p), 0))}</strong><small>de ${fmt(suyos.reduce((s, p) => s + Number(p.monto), 0))} prestados</small></div>
      <div class="vc-cifra"><span>Liquidados</span><strong>${liquidados.length}</strong><small>préstamos terminados</small></div></div>
    <div class="vc-barra"><div class="segmento">
      <button class="${st.preFiltro === 'vigentes' ? 'activo' : ''}" data-pf="vigentes">Vigentes · ${vivosS.length}</button>
      <button class="${st.preFiltro === 'liquidados' ? 'activo' : ''}" data-pf="liquidados">Liquidados · ${liquidados.length}</button></div></div>
    ${lista.length ? `<section class="panel"><div class="tabla-wrap"><table class="tabla pr-tabla">
      <thead><tr><th>Colaborador</th><th class="num">Prestado</th><th>Avance</th><th class="num">Saldo</th><th class="num">Abono semanal</th><th>Termina</th><th></th></tr></thead>
      <tbody>${lista.map((p) => {
        const sal = saldo(p), pct = Math.round(((Number(p.monto) - sal) / Number(p.monto)) * 100), ab = Number(p.abono_semanal) || 0;
        const sems = sal > 0.009 && ab ? Math.ceil(sal / ab) : 0, ult = abonosDe(p).slice(-1)[0];
        return `<tr>
          <td data-l="Colaborador"><div class="ry-quien"><span class="avatar">${iniciales(nom(p.empleado_id))}</span><div><strong>${esc(nom(p.empleado_id))}</strong>
            <small>${esc(centroDe(p.empleado_id))} · ${fmtFecha(p.fecha)}${p.notas ? ' · ' + esc(p.notas) : ''}</small></div></div></td>
          <td class="num" data-l="Prestado">${fmt(p.monto)}</td>
          <td data-l="Avance"><div class="pr-avance"><div class="ry-pista"><span style="width:${pct}%"></span></div><small>${pct} % · ${abonosDe(p).length} abono${abonosDe(p).length === 1 ? '' : 's'}${ult ? `, último ${fmtFecha(ult.fecha)}` : ''}</small></div></td>
          <td class="num fuerte" data-l="Saldo">${sal > 0.009 ? fmt(sal) : '<span class="pos">Liquidado</span>'}</td>
          <td class="num" data-l="Abono">${ab ? fmt(ab) : '<span class="mut">Sin abono fijo</span>'}</td>
          <td class="mut nowrap" data-l="Termina">${sal <= 0.009 ? '—' : sems ? `${sems} semana${sems === 1 ? '' : 's'} · ${fmtFecha(sumarDias(lunesDe(hoyISO()), sems * 7))}` : '—'}</td>
          <td class="acciones nowrap"><button class="btn btn-sm btn-ghost" data-histp="${p.id}">Abonos</button>
            ${sal > 0.009 ? `<button class="btn btn-sm btn-ghost" data-abono="${p.id}">＋ Abono</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></section>`
      : `<div class="vacio">${st.preFiltro === 'vigentes' ? 'Nadie tiene préstamos vigentes.' : 'Todavía no hay préstamos liquidados.'}</div>`}
    <p class="nota">El abono semanal se descuenta solo en la Raya semanal al pagar (se puede cambiar ahí antes de pagar).</p>`;
  el.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => { st.preFiltro = b.dataset.pf; prestamos(el); }));
  el.querySelectorAll('[data-histp]').forEach((b) => b.addEventListener('click', () => {
    const p = pre.data.find((x) => x.id === b.dataset.histp), ab = abonosDe(p);
    abrirModal({ titulo: `Abonos · ${nom(p.empleado_id)}`, cuerpo: ab.length ? `<ul class="lista-pagos">${ab.map((a) => `<li><div><strong>${fmt(a.monto)}</strong><small>${fmtFecha(a.fecha)}</small></div></li>`).join('')}</ul>
      <p class="nota">Prestado ${fmt(p.monto)} el ${fmtFecha(p.fecha)} · saldo ${fmt(saldo(p))}</p>` : '<div class="vacio">Sin abonos todavía.</div>',
      pie: '<button class="btn btn-primary" id="ha-ok">Listo</button>' }).querySelector('#ha-ok').addEventListener('click', cerrarModal);
  }));
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
