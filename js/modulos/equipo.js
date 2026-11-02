// Equipo de la torre · lo que ve el administrador: quién está ahorita, "Hoy en la torre" (se llena solo con lo que el
// personal hace desde su celular), pendientes del día, reportes de residentes, paquetes, turnos de la semana y nómina.
// También las pestañas de Turnos, Rondines (puntos con QR), Reportes y Paquetes. Lo usa personal.js.
// Tablas: turnos, puntos_rondin, rondin_marcas, solicitudes, paquetes, bitacora_turno (+ asistencia, tareas, empleados).
import { MESES, MARCA, CLIENTE } from '../config.js';
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar,
         comprimirImagen, subirArchivo, verFoto, sb } from '../lib.js';

export const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const COLORES = ['#2F6B4F', '#4a6fa5', '#9a6b2f', '#7a4f8f', '#2b6f7a', '#a24b3b', '#5c6b2f', '#2b3a33'];
export const CATS_REPORTE = ['Plomería / fuga', 'Electricidad', 'Elevador', 'Limpieza', 'Ruido / convivencia', 'Seguridad', 'Áreas comunes', 'Otro'];

// ---------- fechas y horarios ----------
export const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const lunesDe = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
export const codigoDia = (iso) => DIAS[(new Date(iso + 'T12:00:00').getDay() + 6) % 7];
export const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const corto = (t) => hhmm(t).replace(/:00$/, '');   // 7:00 → 7 en la cuadrícula de turnos
export const hhmm = (t) => (t ? String(t).slice(0, 5).replace(/^0/, '') : '');
const aMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const iniciales = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
export const colorDe = (n) => COLORES[[...String(n || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length];
export const avatar = (n, cls = '') => `<span class="eq-av ${cls}" style="background:${colorDe(n)}">${esc(iniciales(n))}</span>`;
const esVigilancia = (e) => /vigil|seguridad|guardia|caseta/.test(normalizar(e?.puesto));
const primerNombre = (n) => String(n || '').split(' ')[0];
// Fecha local (no la de Greenwich) de una marca de tiempo
export const fl = (ts) => { if (!ts) return ''; const d = new Date(ts); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ahoraMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// Horario de una persona en un día: el turno asignado o, si no hay, su horario normal (días laborales)
export function horarioDe(e, fecha, turnos) {
  // un turno sin horas ni descanso es "su horario normal" (así se regresa, sin borrar)
  const t = turnos.find((x) => x.empleado_id === e.id && x.fecha === fecha && (x.descanso || x.hora_inicio));
  if (t) return t.descanso ? { descanso: true, turno: t } : { ini: t.hora_inicio || e.hora_entrada, fin: t.hora_fin || e.hora_salida, lugar: t.lugar, turno: t };
  if (!String(e.dias_laborales || '').split(',').includes(codigoDia(fecha))) return { descanso: true, auto: true };
  return { ini: e.hora_entrada, fin: e.hora_salida };
}
const cruzaNoche = (h) => h && !h.descanso && aMin(h.fin) <= aMin(h.ini);

// ---------- pendientes del día (plantillas + tareas extra) ----------
const coincidePuesto = (emp, puesto) => { const a = normalizar(emp.puesto), b = normalizar(puesto); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
export function pendientesDe(equipo, plantillas, tareas, fecha) {
  const dia = codigoDia(fecha);
  const plan = plantillas.filter((p) => p.activo !== false && p.categoria !== 'Rondín' && (p.frecuencia === 'diaria' || (p.frecuencia === 'semanal' && p.dia_semana === dia)));
  const filas = [];
  equipo.forEach((e) => {
    const suyas = plan.filter((p) => (p.empleado_id ? p.empleado_id === e.id : coincidePuesto(e, p.puesto)));
    const regs = tareas.filter((r) => r.tipo === 'tarea' && r.empleado_id === e.id && r.fecha === fecha);
    suyas.forEach((p) => filas.push({ e, tarea: p.tarea, categoria: p.categoria, plantilla: p.id, reg: regs.find((r) => r.tarea === p.tarea) }));
    regs.filter((r) => !suyas.some((p) => p.tarea === r.tarea)).forEach((r) => filas.push({ e, tarea: r.tarea, categoria: r.categoria, reg: r }));
  });
  return filas;
}

// Marca una tarea (crea el registro del día si no existe)
export async function marcarTarea(f, centro, fecha, cambios) {
  const datos = { ...cambios, hora_registro: new Date().toISOString() };
  const { data, error } = f.reg
    ? await db().from('tareas').update(datos).eq('id', f.reg.id).select().single()
    : await db().from('tareas').insert({ org_id: estado.miembro.org_id, centro_id: centro, empleado_id: f.e.id, plantilla_id: f.plantilla || null,
        fecha, tipo: 'tarea', tarea: f.tarea, categoria: f.categoria, registrado_por: estado.miembro.nombre, ...datos }).select().single();
  if (error) throw error;
  return data;
}

// ---------- carga de todo lo del día ----------
async function cargarDia(centro, fecha, equipo) {
  const ayer = sumarDias(fecha, -1), lun = lunesDe(fecha);
  const ids = equipo.map((e) => e.id);
  const q = (t) => db().from(t);
  const [tu, asi, pr, rm, ta, pl, so, pa, bi, inc] = await Promise.all([
    q('turnos').select('*').eq('centro_id', centro).gte('fecha', sumarDias(lun, -1)).lte('fecha', sumarDias(lun, 13)),
    ids.length ? q('asistencia').select('*').in('empleado_id', ids).gte('fecha', lun < ayer ? lun : ayer).lte('fecha', fecha) : { data: [] },
    q('puntos_rondin').select('*').eq('centro_id', centro).eq('activo', true).order('orden'),
    q('rondin_marcas').select('*').eq('centro_id', centro).eq('fecha', fecha).order('hora'),
    q('tareas').select('*').eq('centro_id', centro).eq('fecha', fecha).in('tipo', ['tarea', 'incidencia']),
    q('tareas_plantilla').select('*').eq('centro_id', centro).eq('activo', true),
    q('solicitudes').select('*').eq('centro_id', centro).or(`estado.neq.resuelta,resuelto_en.gte.${sumarDias(fecha, -7)}`).order('creado_en', { ascending: false }),
    q('paquetes').select('*').eq('centro_id', centro).or(`entregado_en.is.null,recibido_en.gte.${fecha}`).order('recibido_en', { ascending: false }),
    q('bitacora_turno').select('*').eq('centro_id', centro).gte('creado_en', new Date(fecha + 'T00:00:00').toISOString()).lt('creado_en', new Date(sumarDias(fecha, 1) + 'T00:00:00').toISOString()).order('creado_en', { ascending: false }),
    q('tareas').select('*').eq('centro_id', centro).eq('tipo', 'incidencia').eq('fecha', fecha),
  ]);
  const err = [tu, asi, pr, rm, ta, pl, so, pa, bi].find((x) => x.error)?.error;
  if (err) throw err;
  return { turnos: tu.data, asistencia: asi.data, puntos: pr.data, marcas: rm.data, tareas: ta.data, plantillas: pl.data,
    solicitudes: so.data, paquetes: pa.data, bitacora: bi.data, incidencias: inc.data || [] };
}

// Estado de cada persona ahorita
function estadoAhora(e, D, fecha) {
  const h = horarioDe(e, fecha, D.turnos), a = D.asistencia.find((x) => x.empleado_id === e.id && x.fecha === fecha);
  // turno de noche que empezó ayer y sigue
  const hAyer = horarioDe(e, sumarDias(fecha, -1), D.turnos), aAyer = D.asistencia.find((x) => x.empleado_id === e.id && x.fecha === sumarDias(fecha, -1));
  if (fecha === hoyISO() && cruzaNoche(hAyer) && aAyer?.hora_entrada && !aAyer.hora_salida && ahoraMin() < aMin(hAyer.fin) + 120)
    return { k: 'turno', t: 'En turno', cls: 'ok', linea: `Entró ayer ${hora(aAyer.hora_entrada)} · sale ${hhmm(hAyer.fin)}`, a: aAyer, h: hAyer };
  if (a?.estado === 'falta') return { k: 'falta', t: 'Faltó', cls: 'no', linea: 'Falta registrada', a, h };
  if (a?.estado === 'permiso') return { k: 'permiso', t: 'Permiso', cls: 'gr', linea: 'Con permiso', a, h };
  if (h.descanso) return { k: 'descanso', t: 'Descansa', cls: 'gr', linea: 'Día de descanso', a, h };
  if (a?.hora_entrada && !a.hora_salida) {
    const tarde = a.minutos_tarde > 0;
    return { k: 'turno', t: tarde ? 'Llegó tarde' : 'En turno', cls: tarde ? 'lat' : 'ok', linea: `Entró ${hora(a.hora_entrada)}${tarde ? ` · ${a.minutos_tarde} min tarde` : ''}`, a, h };
  }
  if (a?.hora_salida) return { k: 'salio', t: 'Salió', cls: 'gr', linea: `Salió ${hora(a.hora_salida)}`, a, h };
  if (fecha !== hoyISO()) return { k: 'sin', t: 'Sin registro', cls: 'gr', linea: `${hhmm(h.ini)}–${hhmm(h.fin)}`, a, h };
  const tol = e.tolerancia_min || 10, ini = aMin(h.ini);
  if (ahoraMin() > ini + tol) return { k: 'nollego', t: 'No ha llegado', cls: 'no', linea: `Debía entrar ${hhmm(h.ini)}`, a, h };
  return { k: 'proximo', t: hhmm(h.ini), cls: 'gr', linea: `Entra ${hhmm(h.ini)}${h.lugar ? ' · ' + h.lugar : ''}`, a, h };
}
const ORDEN_EST = { turno: 0, nollego: 1, falta: 2, proximo: 3, salio: 4, sin: 5, permiso: 6, descanso: 7 };

// Rondas de un día: por persona y número de ronda, cuántos puntos se escanearon
export function rondas(marcas, puntos) {
  const g = {};
  marcas.forEach((m) => { const k = `${m.empleado_id}|${m.ronda}`; (g[k] ||= { empleado_id: m.empleado_id, ronda: m.ronda, marcas: [] }).marcas.push(m); });
  return Object.values(g).map((r) => {
    const hechos = new Set(r.marcas.map((m) => m.punto_id));
    const horas = r.marcas.map((m) => m.hora).sort();
    return { ...r, hechos, faltan: puntos.filter((p) => !hechos.has(p.id)), ini: horas[0], fin: horas[horas.length - 1] };
  }).sort((a, b) => String(b.fin).localeCompare(String(a.fin)));
}

// ================= HOY =================
export async function hoy(el, ctx) {
  const { centro, equipo, fecha } = ctx;
  const D = await cargarDia(centro, fecha, equipo);
  const nombre = (id) => equipo.find((e) => e.id === id)?.nombre || '';
  const est = equipo.map((e) => ({ e, s: estadoAhora(e, D, fecha) })).sort((a, b) => ORDEN_EST[a.s.k] - ORDEN_EST[b.s.k]);
  const pend = pendientesDe(equipo, D.plantillas, D.tareas, fecha);
  const hechas = pend.filter((f) => f.reg?.estado === 'hecho').length;
  const abiertas = D.solicitudes.filter((s) => s.estado !== 'resuelta');
  const porEntregar = D.paquetes.filter((p) => !p.entregado_en);
  const tareasDe = (e) => { const l = pend.filter((f) => f.e.id === e.id); return l.length ? `${l.filter((f) => f.reg?.estado === 'hecho').length} de ${l.length} tareas` : ''; };

  // línea de tiempo
  const ev = [];
  D.asistencia.filter((a) => a.fecha === fecha).forEach((a) => {
    const n = nombre(a.empleado_id);
    if (a.hora_entrada) ev.push({ t: a.hora_entrada, ic: a.minutos_tarde ? 'lat' : 'ok', s: a.minutos_tarde ? '⏱' : '✓', txt: `<b>${esc(n)}</b> checó entrada${a.minutos_tarde ? ` ${a.minutos_tarde} min tarde` : ''}`,
      sub: a.minutos_tarde ? 'no se descuenta solo; tú decides en la nómina' : (a.foto_entrada ? 'con foto' : ''), foto: a.foto_entrada });
    if (a.hora_salida) ev.push({ t: a.hora_salida, ic: 'gr', s: '→', txt: `<b>${esc(n)}</b> checó salida`, foto: a.foto_salida });
    if (a.estado === 'falta') ev.push({ t: a.creado_en, ic: 'no', s: '✕', txt: `<b>${esc(n)}</b> no llegó`, sub: 'falta registrada' });
  });
  rondas(D.marcas, D.puntos).forEach((r) => {
    const completa = D.puntos.length && !r.faltan.length;
    ev.push({ t: r.fin, ic: completa ? 'ok' : 'lat', s: completa ? '✓' : '!', txt: completa ? `<b>Rondín ${r.ronda} completo</b> · ${r.hechos.size} de ${D.puntos.length} puntos`
      : `<b>Rondín ${r.ronda} de ${esc(primerNombre(nombre(r.empleado_id)))}:</b> ${r.faltan.length > 2 ? `faltan ${r.faltan.length} puntos` : `faltó ${r.faltan.map((p) => `<b>${esc(p.nombre)}</b>`).join(' y ')}`}`,
      sub: `${esc(nombre(r.empleado_id))} · ${hora(r.ini)}–${hora(r.fin)}` });
  });
  D.tareas.filter((t) => t.tipo === 'tarea' && t.estado === 'hecho' && t.hora_registro).forEach((t) =>
    ev.push({ t: t.hora_registro, ic: 'ok', s: '✓', txt: `<b>${esc(primerNombre(nombre(t.empleado_id)))} terminó:</b> ${esc(t.tarea)}`, sub: t.foto_path ? 'con foto' : '', foto: t.foto_path }));
  D.incidencias.forEach((t) => ev.push({ t: t.hora_registro || t.creado_en, ic: 'no', s: '!', txt: `<b>Incidencia:</b> ${esc(t.tarea)}`, sub: [nombre(t.empleado_id), t.categoria].filter(Boolean).map(esc).join(' · ') }));
  D.solicitudes.forEach((s) => {
    if (fl(s.creado_en) === fecha)
      ev.push({ t: s.creado_en, ic: 'az', s: 'R', txt: `<b>${esc(s.unidad_txt || 'Residente')} reportó:</b> ${esc(s.descripcion)}${s.asignado_a ? ` <span class="eq-tag lat">Asignado a ${esc(primerNombre(nombre(s.asignado_a)))}</span>` : ''}`,
        sub: [s.reporta, { qr: 'por el QR del elevador', whatsapp: 'por WhatsApp', caseta: 'en caseta', oficina: 'en oficina' }[s.origen]].filter(Boolean).map(esc).join(' · ') });
    if (fl(s.resuelto_en) === fecha) ev.push({ t: s.resuelto_en, ic: 'ok', s: '✓', txt: `<b>Resuelto ${esc(s.unidad_txt || '')}:</b> ${esc(s.descripcion)}`, sub: s.nota_cierre || '', foto: s.foto_cierre });
  });
  D.paquetes.forEach((p) => {
    if (fl(p.recibido_en) === fecha) ev.push({ t: p.recibido_en, ic: 'gr', s: '📦', txt: `<b>Paquete para ${esc(unidadTxt(p, ctx))}</b>${p.paqueteria ? ' · ' + esc(p.paqueteria) : ''}`, sub: `recibió ${esc(p.recibido_por || '')}`, foto: p.foto_path });
    if (fl(p.entregado_en) === fecha) ev.push({ t: p.entregado_en, ic: 'ok', s: '✓', txt: `<b>Paquete entregado a ${esc(p.entregado_a || unidadTxt(p, ctx))}</b>` });
  });
  D.bitacora.forEach((b) => ev.push({ t: b.creado_en, ic: 'ok', s: '⇄', txt: `<b>Cambio de turno</b> · ${esc(primerNombre(nombre(b.empleado_id)))} entregó a ${esc(primerNombre(nombre(b.recibe_id)) || '—')}`, sub: b.nota ? `“${b.nota}”` : '' }));
  ev.sort((a, b) => String(b.t).localeCompare(String(a.t)));

  // nómina estimada de la semana (solo administración: necesita los sueldos)
  let nomina = null;
  if (tieneRol(['administracion'])) {
    const { data: emps } = await db().from('empleados').select('id, salario_semanal').in('id', equipo.map((e) => e.id));
    const lun = lunesDe(fecha);
    const desc = D.asistencia.filter((a) => a.fecha >= lun).reduce((s, a) => s + Number(a.monto_descuento || 0), 0);
    const faltas = D.asistencia.filter((a) => a.fecha >= lun && a.estado === 'falta').length, retardos = D.asistencia.filter((a) => a.fecha >= lun && a.minutos_tarde > 0).length;
    nomina = { total: (emps || []).reduce((s, e) => s + Number(e.salario_semanal || 0), 0) - desc, faltas, retardos, n: (emps || []).length, desc };
  }

  const pct = pend.length ? Math.round(hechas / pend.length * 100) : 0;
  const acc = document.getElementById('page-actions');
  acc.innerHTML = `${nomina?.n ? `<button class="btn btn-primary" id="eq-nom">Nómina de la semana · ${fmt(nomina.total)}</button>` : ''}`;
  acc.querySelector('#eq-nom')?.addEventListener('click', () => ctx.irA('nomina'));

  el.innerHTML = `
    ${fecha !== hoyISO() ? `<div class="panel rs-aviso">Estás viendo el ${fmtFecha(fecha)}. <button class="btn btn-sm btn-ghost" id="eq-hoy">Volver a hoy</button></div>` : ''}
    ${equipo.length ? `<div class="eq-ahora">${est.map(({ e, s }) => `
      <div class="eq-pers ${s.k === 'descanso' ? 'apagada' : ''}">
        <span class="eq-dot ${s.cls}">${esc(s.t)}</span>
        ${avatar(e.nombre)}
        <div><div class="eq-nm">${esc(e.nombre)}</div><div class="eq-r">${esc([e.puesto, s.h?.lugar].filter(Boolean).join(' · ') || '—')}</div></div>
        <div class="eq-ln ${s.k === 'nollego' ? 'neg' : ''}">${s.a?.foto_entrada ? `<button class="eq-foto" data-foto="${esc(s.a.foto_entrada)}" title="Ver foto" style="background-image:url('${esc(s.a.foto_entrada)}')"></button>` : ''}
          <span>${esc(s.linea)}${s.k === 'turno' && tareasDe(e) ? ' · ' + tareasDe(e) : ''}</span></div>
        ${s.k === 'nollego' && e.telefono ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="https://wa.me/52${String(e.telefono).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hola ${primerNombre(e.nombre)}, ¿todo bien? Tu turno empezaba a las ${hhmm(s.h.ini)}.`)}">Escribirle</a>` : ''}
      </div>`).join('')}</div>` : `<div class="vacio">Todavía no hay personal en este edificio. Agrégalo en la pestaña Empleados.</div>`}
    <div class="eq-grid">
      <div>
        <section class="panel"><div class="panel-head"><h3>Hoy en ${esc(estado.centros.find((c) => c.id === centro)?.nombre || 'la torre')}</h3><span class="sub-meta">se llena solo con lo que hace el equipo desde su celular</span></div>
          ${ev.length ? `<ul class="eq-tl">${ev.slice(0, 40).map((x) => `<li><span class="h">${hora(x.t)}</span><span class="ic ${x.ic}">${x.s}</span>
            <span class="tx">${x.txt}${x.sub ? `<small>${x.sub}</small>` : ''}</span>${x.foto ? `<button class="eq-foto" data-foto="${esc(x.foto)}" style="background-image:url('${esc(x.foto)}')" title="Ver foto"></button>` : ''}</li>`).join('')}</ul>`
          : '<div class="vacio">Todavía no hay movimientos hoy. Aquí aparecen las entradas con foto, los rondines, las tareas terminadas, los reportes y los paquetes.</div>'}
        </section>
        <section class="panel" id="eq-turnos"></section>
      </div>
      <div>
        <section class="panel"><div class="panel-head"><h3>Pendientes de hoy</h3><span class="sub-meta">${hechas} de ${pend.length}</span></div>
          ${pend.length ? `<div class="eq-ring">${anillo(pct)}<div class="nota">Las tareas de cada día salen solas. Cada quien las marca desde su celular, con foto.</div></div>
            ${[...pend].sort((a, b) => (a.reg?.estado === 'hecho') - (b.reg?.estado === 'hecho')).slice(0, 8).map((f) => {
              const s = est.find((x) => x.e.id === f.e.id)?.s, ok = f.reg?.estado === 'hecho';
              return `<div class="eq-chk"><i class="${ok ? 'y' : ''}"></i><span>${esc(f.tarea)}</span><span class="who ${!ok && ['falta', 'nollego'].includes(s?.k) ? 'neg' : ''}">${esc(primerNombre(f.e.nombre))}${ok ? ' · ' + hora(f.reg.hora_registro) : !ok && s?.k === 'falta' ? ' · faltó' : ''}</span></div>`; }).join('')}
            ${pend.length > 8 ? `<button class="link-btn" data-ir="tareas">Ver las ${pend.length}</button>` : ''}`
          : `<p class="nota">No hay tareas fijas para hoy. <button class="link-btn" data-ir="tareas">Configúralas en Tareas</button>: limpieza de lobby, basura, revisar bombas…</p>`}
        </section>
        <section class="panel"><div class="panel-head"><h3>Reportes de residentes</h3><span class="sub-meta">${abiertas.length} abierto${abiertas.length === 1 ? '' : 's'}</span></div>
          ${abiertas.slice(0, 4).map((s) => tarjetaReporte(s, ctx)).join('') || '<p class="nota">Sin reportes abiertos.</p>'}
          <div class="eq-acc"><button class="btn btn-sm btn-ghost" id="eq-nuevo-rep">＋ Registrar reporte</button><button class="btn btn-sm btn-ghost" data-ir="reportes">Ver todos</button></div>
        </section>
        <section class="panel"><div class="panel-head"><h3>Paquetes en caseta</h3><span class="sub-meta">${porEntregar.length} por entregar</span></div>
          ${porEntregar.slice(0, 4).map((p) => `<div class="eq-rep"><b>${esc(unidadTxt(p, ctx))}</b>${p.paqueteria ? ' · ' + esc(p.paqueteria) : ''}<div class="m"><span>${esc(p.descripcion || 'Paquete')}</span><span>${haceCuanto(p.recibido_en)}</span></div></div>`).join('') || '<p class="nota">No hay paquetes esperando.</p>'}
        </section>
        ${nomina?.n ? `<section class="panel"><div class="panel-head"><h3>Nómina de la semana</h3><span class="sub-meta">se calcula sola</span></div>
          <div class="eq-nom"><div><strong>${fmt(nomina.total)}</strong><small>${nomina.n} personas · ${nomina.faltas} falta${nomina.faltas === 1 ? '' : 's'} · ${nomina.retardos} retardo${nomina.retardos === 1 ? '' : 's'}</small></div>
          <button class="btn btn-primary" data-ir="nomina">Revisar y pagar</button></div></section>` : ''}
      </div>
    </div>`;
  el.querySelector('#eq-hoy')?.addEventListener('click', () => ctx.cambiarFecha(hoyISO()));
  el.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => verFoto(b.dataset.foto)));
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ctx.irA(b.dataset.ir)));
  el.querySelector('#eq-nuevo-rep').addEventListener('click', () => nuevoReporte(ctx, () => ctx.repintar()));
  enlazarReportes(el, ctx, D.solicitudes);
  await pintarTurnos(el.querySelector('#eq-turnos'), { ...ctx, turnos: D.turnos }, lunesDe(fecha), true);
}

const anillo = (pct) => `<svg width="64" height="64" viewBox="0 0 36 36" aria-label="${pct}%"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#ececec" stroke-width="4"/>
  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary)" stroke-width="4" stroke-dasharray="${pct * 0.974} 97.4" stroke-linecap="round" transform="rotate(-90 18 18)"/>
  <text x="18" y="21.5" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor">${pct}%</text></svg>`;
export function haceCuanto(ts) {
  const m = Math.round((Date.now() - new Date(ts)) / 60000);
  return m < 60 ? `hace ${Math.max(1, m)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} día${Math.round(m / 1440) === 1 ? '' : 's'}`;
}
export const unidadTxt = (x, ctx) => ctx.unidades?.find((u) => u.id === x.unidad_id)?.identificador || x.unidad_txt || 'Sin depto';

// ================= REPORTES DE RESIDENTES =================
function tarjetaReporte(s, ctx) {
  const n = ctx.equipo.find((e) => e.id === s.asignado_a)?.nombre;
  const viejo = s.estado !== 'resuelta' && Date.now() - new Date(s.creado_en) > 864e5;
  return `<div class="eq-rep"><b>${esc(s.unidad_txt || 'Sin depto')} · ${esc(s.descripcion)}</b>
    <div class="m"><span>${s.estado === 'resuelta' ? '✓ Resuelto' : n ? `${esc(primerNombre(n))} lo atiende` : 'Sin asignar'}${s.reporta ? ' · ' + esc(s.reporta) : ''}</span>
      <span class="${viejo ? 'neg' : ''}">${haceCuanto(s.creado_en)}</span></div>
    ${s.estado !== 'resuelta' ? `<div class="eq-acc"><select data-asignar="${s.id}" aria-label="Asignar"><option value="">${n ? 'Reasignar…' : 'Asignar a…'}</option>
      ${ctx.equipo.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select>
      <button class="btn btn-sm btn-ghost" data-resolver="${s.id}">Resuelto</button>
      ${s.telefono ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="https://wa.me/52${String(s.telefono).replace(/\D/g, '').slice(-10)}">WhatsApp</a>` : ''}</div>` : ''}</div>`;
}
function enlazarReportes(el, ctx, lista) {
  el.querySelectorAll('[data-asignar]').forEach((sel) => sel.addEventListener('change', async () => {
    if (!sel.value) return;
    const { error } = await db().from('solicitudes').update({ asignado_a: sel.value, estado: 'asignada', asignado_en: new Date().toISOString() }).eq('id', sel.dataset.asignar);
    if (error) return toast(error.message, true);
    toast('Asignado ✓ · le aparece en su celular'); ctx.repintar();
  }));
  el.querySelectorAll('[data-resolver]').forEach((b) => b.addEventListener('click', () => resolverReporte(lista.find((s) => s.id === b.dataset.resolver), ctx.repintar)));
}
export function resolverReporte(s, despues) {
  const modal = abrirModal({
    titulo: `Resolver · ${s.unidad_txt || 'reporte'}`,
    cuerpo: `<form class="form" id="rr"><p class="nota">${esc(s.descripcion)}</p>
      <label>¿Qué se hizo?<input name="nota" maxlength="200" placeholder="Ej. se cambió el empaque"></label>
      <label class="archivo">Foto de cómo quedó <small>(opcional)</small><input type="file" name="foto" accept="image/*" capture="environment"></label></form>`,
    pie: `<button class="btn btn-ghost" id="rr-no">Cancelar</button><button class="btn btn-primary" id="rr-si">Marcar resuelto</button>`,
  });
  const f = modal.querySelector('#rr');
  modal.querySelector('#rr-no').addEventListener('click', cerrarModal);
  modal.querySelector('#rr-si').addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      const foto = f.foto.files[0] ? await subirArchivo(await comprimirImagen(f.foto.files[0], 1200, 0.7), 'reportes') : null;
      const { error } = await db().from('solicitudes').update({ estado: 'resuelta', resuelto_en: new Date().toISOString(), nota_cierre: f.nota.value.trim() || null, foto_cierre: foto }).eq('id', s.id);
      if (error) throw error;
      cerrarModal();
      if (s.telefono) {
        const txt = `Hola${s.reporta ? ' ' + primerNombre(s.reporta) : ''}, tu reporte "${s.descripcion}" quedó resuelto${f.nota.value.trim() ? ': ' + f.nota.value.trim() : ''}.${foto ? ' Foto: ' + foto : ''} Gracias.`;
        abrirModal({ titulo: 'Resuelto ✓', cuerpo: '<p class="nota">¿Le avisas al residente?</p>',
          pie: `<button class="btn btn-ghost" data-cerrar>Ahora no</button><a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/52${String(s.telefono).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(txt)}">Avisar por WhatsApp</a>` });
        document.querySelector('#modal-root .btn-wa')?.addEventListener('click', () => setTimeout(cerrarModal, 300));
      } else toast('Resuelto ✓');
      despues?.();
    } catch (e) { ev.currentTarget.disabled = false; toast(e.message, true); }
  });
}
export function nuevoReporte(ctx, despues, origenFijo = null) {
  const us = [...(ctx.unidades || [])].sort((a, b) => a.identificador.localeCompare(b.identificador, 'es', { numeric: true }));
  const modal = abrirModal({
    titulo: 'Registrar reporte',
    cuerpo: `<form class="form" id="nr">
      <div class="form-2"><label>Depto<select name="unidad"><option value="">— Áreas comunes —</option>${us.map((u) => `<option value="${u.id}">${esc(u.identificador)}</option>`).join('')}</select></label>
        <label>Tipo<select name="cat">${CATS_REPORTE.map((c) => `<option>${c}</option>`).join('')}</select></label></div>
      <label>¿Qué pasa?<input name="desc" maxlength="300" required placeholder="Ej. fuga en el baño"></label>
      <div class="form-2"><label>Quién reporta<input name="quien" maxlength="80"></label><label>Teléfono<input name="tel" maxlength="20" inputmode="tel"></label></div>
      ${origenFijo ? '' : `<label>¿Cómo llegó?<select name="origen"><option value="whatsapp">WhatsApp</option><option value="caseta">En caseta</option><option value="oficina">Llamada u oficina</option></select></label>`}
      <label>Asignar a<select name="asig"><option value="">— Después —</option>${ctx.equipo.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></label>
      <label class="archivo">Foto <small>(opcional)</small><input type="file" name="foto" accept="image/*" capture="environment"></label></form>`,
    pie: `<button class="btn btn-ghost" id="nr-no">Cancelar</button><button class="btn btn-primary" id="nr-si">Guardar</button>`,
  });
  const f = modal.querySelector('#nr');
  // al elegir depto, se llena quién vive ahí
  f.unidad.addEventListener('change', () => { const k = ctx.contratos?.find((c) => c.unidad_id === f.unidad.value); if (k && !f.quien.value) { f.quien.value = k.arrendatario || ''; f.tel.value = k.telefono || ''; } });
  modal.querySelector('#nr-no').addEventListener('click', cerrarModal);
  modal.querySelector('#nr-si').addEventListener('click', async (ev) => {
    if (!f.desc.value.trim()) return toast('Escribe qué pasa', true);
    ev.currentTarget.disabled = true;
    try {
      const foto = f.foto.files[0] ? await subirArchivo(await comprimirImagen(f.foto.files[0], 1200, 0.7), 'reportes') : null;
      const u = us.find((x) => x.id === f.unidad.value);
      const { error } = await db().from('solicitudes').insert({ org_id: estado.miembro.org_id, centro_id: ctx.centro, unidad_id: u?.id || null, unidad_txt: u?.identificador || 'Áreas comunes',
        reporta: f.quien.value.trim() || null, telefono: f.tel.value.trim() || null, descripcion: f.desc.value.trim(), categoria: f.cat.value,
        origen: origenFijo || f.origen.value, foto_path: foto, registrado_por: estado.miembro.nombre,
        ...(f.asig.value ? { asignado_a: f.asig.value, estado: 'asignada', asignado_en: new Date().toISOString() } : {}) });
      if (error) throw error;
      cerrarModal(); toast('Reporte guardado ✓'); despues?.();
    } catch (e) { ev.currentTarget.disabled = false; toast(e.message, true); }
  });
}

export async function reportes(el, ctx) {
  const { data, error } = await db().from('solicitudes').select('*').eq('centro_id', ctx.centro).order('creado_en', { ascending: false }).limit(300);
  if (error) throw error;
  const f = ctx.st.filtroRep || 'abiertos';
  const lista = data.filter((s) => f === 'todos' || (f === 'abiertos' ? s.estado !== 'resuelta' : s.estado === 'resuelta'));
  const acc = document.getElementById('page-actions');
  acc.innerHTML = `<button class="btn btn-ghost" id="rp-qr">QR para el elevador</button><button class="btn btn-primary" id="rp-nuevo">＋ Registrar reporte</button>`;
  acc.querySelector('#rp-nuevo').addEventListener('click', () => nuevoReporte(ctx, ctx.repintar));
  acc.querySelector('#rp-qr').addEventListener('click', () => qrReportes(ctx));
  const resueltos = data.filter((s) => s.resuelto_en);
  const prom = resueltos.length ? resueltos.reduce((a, s) => a + (new Date(s.resuelto_en) - new Date(s.creado_en)), 0) / resueltos.length / 36e5 : null;
  el.innerHTML = `<div class="kpis kpis-3">
      <div class="kpi"><span>Abiertos</span><strong class="${data.some((s) => s.estado !== 'resuelta') ? 'neg' : ''}">${data.filter((s) => s.estado !== 'resuelta').length}</strong><small>${data.filter((s) => s.estado === 'abierta').length} sin asignar</small></div>
      <div class="kpi"><span>Resueltos</span><strong class="pos">${resueltos.length}</strong><small>de ${data.length} recibidos</small></div>
      <div class="kpi"><span>Tiempo para resolver</span><strong>${prom == null ? '—' : prom < 24 ? Math.round(prom) + ' h' : (prom / 24).toFixed(1) + ' días'}</strong><small>en promedio</small></div></div>
    <section class="panel"><div class="panel-head"><div class="segmento">${[['abiertos', 'Abiertos'], ['resueltos', 'Resueltos'], ['todos', 'Todos']].map(([id, t]) => `<button data-f="${id}" class="${f === id ? 'activo' : ''}">${t}</button>`).join('')}</div>
      <span class="sub-meta">Los residentes reportan con el QR del elevador; lo que llega por WhatsApp o en caseta se registra aquí.</span></div>
      ${lista.map((s) => tarjetaReporte(s, ctx)).join('') || '<div class="vacio">Nada por aquí.</div>'}</section>`;
  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { ctx.st.filtroRep = b.dataset.f; ctx.repintar(); }));
  enlazarReportes(el, ctx, data);
}
// Hoja con el QR para pegar en el elevador: abre la página pública para reportar (sin cuenta)
function qrReportes(ctx) {
  const w = window.open('', '_blank'); if (!w) return toast('Permite ventanas emergentes', true);
  const centro = estado.centros.find((c) => c.id === ctx.centro)?.nombre || '';
  const url = new URL(`reportar.html?cliente=${encodeURIComponent(CLIENTE?.id || '')}&c=${ctx.centro}`, document.baseURI).href;
  const qrLib = new URL('js/vendor/qrcode.min.js', document.baseURI).href;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR reportes · ${esc(centro)}</title><script src="${qrLib}"><\/script>
<style>body{font-family:Arial,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}.c{border:3px solid ${MARCA.color || '#141414'};border-radius:16px;padding:28px 32px;text-align:center;max-width:420px}
h1{margin:0 0 6px;font-size:28px}p{color:#444;font-size:16px;margin:6px 0}#q{display:inline-block;margin:16px 0}.u{font-size:11px;color:#888;word-break:break-all}@media print{button{display:none}}</style></head>
<body><div class="c"><h1>¿Algo no funciona?</h1><p>Escanea con tu celular y repórtalo a la administración de <b>${esc(centro)}</b>.</p><div id="q"></div><p><b>Fugas · luz · elevador · limpieza · ruido</b></p><p class="u">${esc(url)}</p>
<button onclick="print()">Imprimir</button></div><script>window.onload=function(){new QRCode(document.getElementById('q'),{text:${JSON.stringify(url)},width:220,height:220})}<\/script></body></html>`);
  w.document.close();
}

// ================= PAQUETES =================
export async function paquetes(el, ctx) {
  const { data, error } = await db().from('paquetes').select('*').eq('centro_id', ctx.centro).order('recibido_en', { ascending: false }).limit(200);
  if (error) throw error;
  const pend = data.filter((p) => !p.entregado_en), entregados = data.filter((p) => p.entregado_en);
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-primary" id="pq-nuevo">＋ Recibir paquete</button>`;
  document.getElementById('pq-nuevo').addEventListener('click', () => recibirPaquete(ctx, ctx.repintar));
  const fila = (p) => `<tr><td data-l="Depto"><b>${esc(unidadTxt(p, ctx))}</b></td><td data-l="Qué">${esc([p.paqueteria, p.descripcion].filter(Boolean).join(' · ') || 'Paquete')}</td>
    <td data-l="Recibió">${fmtFecha(p.recibido_en)} ${hora(p.recibido_en)} · ${esc(p.recibido_por || '')}</td>
    <td data-l="Entrega">${p.entregado_en ? `${fmtFecha(p.entregado_en)} ${hora(p.entregado_en)} · ${esc(p.entregado_a || '')}` : `<button class="btn btn-sm btn-ghost" data-entregar="${p.id}">Entregado</button> ${avisoPaquete(p, ctx)}`}</td>
    <td>${p.foto_path ? `<button class="eq-foto" data-foto="${esc(p.foto_path)}" style="background-image:url('${esc(p.foto_path)}')"></button>` : ''}</td></tr>`;
  el.innerHTML = `<section class="panel"><div class="panel-head"><h3>Por entregar · ${pend.length}</h3></div>
      ${pend.length ? `<div class="tabla-wrap"><table class="tabla rs-tabla"><thead><tr><th>Depto</th><th>Qué</th><th>Recibió</th><th>Entrega</th><th></th></tr></thead><tbody>${pend.map(fila).join('')}</tbody></table></div>` : '<p class="nota">No hay paquetes esperando.</p>'}</section>
    <section class="panel"><div class="panel-head"><h3>Entregados</h3></div>
      ${entregados.length ? `<div class="tabla-wrap"><table class="tabla rs-tabla"><thead><tr><th>Depto</th><th>Qué</th><th>Recibió</th><th>Entrega</th><th></th></tr></thead><tbody>${entregados.slice(0, 50).map(fila).join('')}</tbody></table></div>` : '<p class="nota">Todavía no hay.</p>'}</section>`;
  el.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => verFoto(b.dataset.foto)));
  el.querySelectorAll('[data-entregar]').forEach((b) => b.addEventListener('click', () => entregarPaquete(data.find((p) => p.id === b.dataset.entregar), ctx.repintar)));
}
export function avisoPaquete(p, ctx) {
  const k = ctx.contratos?.find((c) => c.unidad_id === p.unidad_id);
  const t = String(k?.telefono || '').replace(/\D/g, '');
  if (t.length < 10) return '';
  const txt = `Hola${k.arrendatario ? ' ' + primerNombre(k.arrendatario) : ''}, te llegó un paquete${p.paqueteria ? ' de ' + p.paqueteria : ''} a ${estado.centros.find((c) => c.id === p.centro_id)?.nombre || 'la torre'}. Puedes recogerlo en caseta.`;
  return `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="https://wa.me/52${t.slice(-10)}?text=${encodeURIComponent(txt)}">Avisar</a>`;
}
export function recibirPaquete(ctx, despues) {
  const us = [...(ctx.unidades || [])].sort((a, b) => a.identificador.localeCompare(b.identificador, 'es', { numeric: true }));
  const modal = abrirModal({
    titulo: 'Recibir paquete',
    cuerpo: `<form class="form" id="pq">
      <label>¿Para qué depto?<select name="unidad" required><option value="">Elige…</option>${us.map((u) => `<option value="${u.id}">${esc(u.identificador)}${ctx.contratos?.find((c) => c.unidad_id === u.id) ? ' · ' + esc(ctx.contratos.find((c) => c.unidad_id === u.id).arrendatario) : ''}</option>`).join('')}</select></label>
      <div class="form-2"><label>Paquetería<select name="paq">${['Amazon', 'Mercado Libre', 'DHL', 'FedEx', 'Estafeta', 'Comida', 'Otra'].map((x) => `<option>${x}</option>`).join('')}</select></label>
        <label>Qué es <small>(opcional)</small><input name="desc" maxlength="80" placeholder="Caja mediana"></label></div>
      <label class="archivo">Foto del paquete<input type="file" name="foto" accept="image/*" capture="environment"></label></form>`,
    pie: `<button class="btn btn-ghost" id="pq-no">Cancelar</button><button class="btn btn-primary" id="pq-si">Guardar</button>`,
  });
  const f = modal.querySelector('#pq');
  modal.querySelector('#pq-no').addEventListener('click', cerrarModal);
  modal.querySelector('#pq-si').addEventListener('click', async (ev) => {
    if (!f.unidad.value) return toast('Elige el depto', true);
    ev.currentTarget.disabled = true;
    try {
      const foto = f.foto.files[0] ? await subirArchivo(await comprimirImagen(f.foto.files[0], 1200, 0.7), 'paquetes') : null;
      const { data, error } = await db().from('paquetes').insert({ org_id: estado.miembro.org_id, centro_id: ctx.centro, unidad_id: f.unidad.value,
        paqueteria: f.paq.value, descripcion: f.desc.value.trim() || null, foto_path: foto, recibido_por: ctx.quien || estado.miembro.nombre }).select().single();
      if (error) throw error;
      const aviso = avisoPaquete(data, ctx);
      if (aviso) abrirModal({ titulo: 'Paquete guardado ✓', cuerpo: '<p class="nota">¿Le avisas al residente que ya llegó?</p>', pie: `<button class="btn btn-ghost" data-cerrar>Ahora no</button>${aviso.replace('btn-sm ', '')}` });
      else { cerrarModal(); toast('Paquete guardado ✓'); }
      document.querySelector('#modal-root .btn-wa')?.addEventListener('click', () => setTimeout(cerrarModal, 300));
      despues?.();
    } catch (e) { ev.currentTarget.disabled = false; toast(e.message, true); }
  });
}
export function entregarPaquete(p, despues) {
  const modal = abrirModal({ titulo: 'Entregar paquete', cuerpo: `<form class="form" id="ep"><label>¿A quién se le entregó?<input name="a" maxlength="80" required></label></form>`,
    pie: `<button class="btn btn-ghost" id="ep-no">Cancelar</button><button class="btn btn-primary" id="ep-si">Entregado</button>` });
  const f = modal.querySelector('#ep');
  modal.querySelector('#ep-no').addEventListener('click', cerrarModal);
  modal.querySelector('#ep-si').addEventListener('click', async () => {
    if (!f.a.value.trim()) return toast('Escribe quién lo recibió', true);
    const { error } = await db().from('paquetes').update({ entregado_en: new Date().toISOString(), entregado_a: f.a.value.trim(), entregado_por: estado.miembro.nombre }).eq('id', p.id);
    if (error) return toast(error.message, true);
    cerrarModal(); toast('Entregado ✓'); despues?.();
  });
}

// ================= TURNOS =================
// Semana por persona: cada celda es su horario de ese día (el normal, o el que se le asignó). Toca una celda para cambiarla.
export async function turnos(el, ctx) {
  const lun = ctx.st.semanaTurnos || lunesDe(ctx.fecha);
  const { data, error } = await db().from('turnos').select('*').eq('centro_id', ctx.centro).gte('fecha', sumarDias(lun, -1)).lte('fecha', sumarDias(lun, 6));
  if (error) throw error;
  await pintarTurnos(el, { ...ctx, turnos: data }, lun, false);
}
async function pintarTurnos(el, ctx, lun, compacto) {
  if (!el) return;
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lun, i));
  const puede = tieneRol(['administracion', 'encargado']);
  const clase = (h) => { if (h.descanso) return 'de'; const i = aMin(h.ini); return cruzaNoche(h) || i >= 18 * 60 ? 'm3' : i >= 12 * 60 ? 'm2' : 'm1'; };
  const cobertura = coberturaCaseta(ctx.equipo, ctx.turnos, dias);
  el.innerHTML = `<div class="panel-head"><h3>Turnos de la semana</h3>
      <div class="eq-acc">${compacto ? '' : `<button class="icon-btn" data-sem="-7" aria-label="Semana anterior">‹</button><strong class="sub-meta">${fmtFecha(lun)} – ${fmtFecha(dias[6])}</strong><button class="icon-btn" data-sem="7" aria-label="Semana siguiente">›</button>`}
        <span class="sub-meta">${puede ? 'toca un día para cambiarlo' : ''}</span></div></div>
    ${ctx.equipo.length ? `<div class="tabla-wrap"><table class="eq-turnos"><tr><th></th>${dias.map((d, i) => `<th class="${d === hoyISO() ? 'hoy-th' : ''}">${DIAS_CORTO[i]} ${+d.slice(8)}</th>`).join('')}</tr>
      ${ctx.equipo.map((e) => `<tr><td class="n">${avatar(e.nombre, 'sm')}<span>${esc(e.nombre)}</span></td>${dias.map((d) => { const h = horarioDe(e, d, ctx.turnos);
        return `<td><button class="eq-celda ${clase(h)} ${d === hoyISO() ? 'hoy' : ''} ${h.turno ? 'asignado' : ''}" data-e="${e.id}" data-d="${d}" ${puede ? '' : 'disabled'}
          title="${h.descanso ? 'Descanso' : `${hhmm(h.ini)} a ${hhmm(h.fin)}${h.lugar ? ' · ' + h.lugar : ''}`}">${h.descanso ? 'Descanso' : `${corto(h.ini)}–${corto(h.fin)}`}</button></td>`; }).join('')}</tr>`).join('')}</table></div>
      <div class="eq-ley"><span><i class="m1"></i>Mañana</span><span><i class="m2"></i>Tarde</span><span><i class="m3"></i>Noche</span><span><i class="de"></i>Descanso</span>
        ${cobertura == null ? '' : cobertura.length ? `<span class="neg">Caseta sin vigilante: ${cobertura.slice(0, 3).map(esc).join(' · ')}${cobertura.length > 3 ? '…' : ''}</span>` : '<span class="pos">Caseta cubierta las 24 h ✓</span>'}</div>`
      : '<p class="nota">Sin personal.</p>'}`;
  el.querySelectorAll('[data-sem]').forEach((b) => b.addEventListener('click', () => { ctx.st.semanaTurnos = sumarDias(lun, +b.dataset.sem); ctx.repintar(); }));
  if (puede) el.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => editarTurno(ctx.equipo.find((e) => e.id === b.dataset.e), b.dataset.d, ctx)));
}
// Huecos de vigilancia: horas del día sin ningún vigilante en turno (contando el turno de noche del día anterior)
function coberturaCaseta(equipo, turnos, dias) {
  const vig = equipo.filter(esVigilancia);
  if (!vig.length) return null;
  const huecos = [];
  dias.forEach((d, i) => {
    const cub = new Array(24).fill(false);
    vig.forEach((e) => {
      const h = horarioDe(e, d, turnos);
      if (!h.descanso) { const a = Math.floor(aMin(h.ini) / 60), b = Math.ceil(aMin(h.fin) / 60); for (let x = a; x < (cruzaNoche(h) ? 24 : b); x++) cub[x] = true; }
      const hp = horarioDe(e, sumarDias(d, -1), turnos);
      if (cruzaNoche(hp)) for (let x = 0; x < Math.ceil(aMin(hp.fin) / 60); x++) cub[x] = true;
    });
    const libres = cub.map((c, x) => (c ? null : x)).filter((x) => x != null);
    if (libres.length) huecos.push(`${DIAS_CORTO[i]} ${libres[0]}–${libres[libres.length - 1] + 1} h`);
  });
  return huecos;
}
function editarTurno(e, fecha, ctx) {
  const h = horarioDe(e, fecha, ctx.turnos);
  const modal = abrirModal({
    titulo: `${e.nombre} · ${DIAS_CORTO[DIAS.indexOf(codigoDia(fecha))]} ${fmtFecha(fecha)}`,
    cuerpo: `<form class="form" id="tf">
      <label class="opcion opcion-linea"><input type="checkbox" name="descanso" ${h.descanso ? 'checked' : ''}> Descansa este día</label>
      <div class="form-2"><label>Entra<input type="time" name="ini" value="${String(h.ini || e.hora_entrada || '07:00').slice(0, 5)}"></label>
        <label>Sale<input type="time" name="fin" value="${String(h.fin || e.hora_salida || '15:00').slice(0, 5)}"></label></div>
      <label>Dónde <small>(opcional)</small><input name="lugar" maxlength="40" value="${esc(h.lugar || '')}" placeholder="Caseta, pisos 1–3…"></label>
      <label class="opcion opcion-linea"><input type="checkbox" name="semana"> Aplicar igual el resto de la semana</label>
      <p class="nota">Si sale antes de la hora en que entra, es turno de noche (termina al día siguiente). ${h.turno ? '' : 'Hoy tiene su horario normal.'}</p></form>`,
    pie: `${h.turno ? '<button class="btn btn-ghost" id="tf-normal">Volver a su horario normal</button>' : ''}<button class="btn btn-ghost" id="tf-no">Cancelar</button><button class="btn btn-primary" id="tf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#tf');
  modal.querySelector('#tf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#tf-normal')?.addEventListener('click', async () => {
    const { error } = await db().from('turnos').update({ descanso: false, hora_inicio: null, hora_fin: null, lugar: null }).eq('id', h.turno.id);
    if (error) return toast(error.message, true);
    cerrarModal(); ctx.repintar();
  });
  modal.querySelector('#tf-si').addEventListener('click', async () => {
    const fechas = f.semana.checked ? Array.from({ length: 7 - DIAS.indexOf(codigoDia(fecha)) }, (_, i) => sumarDias(fecha, i)) : [fecha];
    const filas = fechas.map((d) => ({ org_id: estado.miembro.org_id, centro_id: ctx.centro, empleado_id: e.id, fecha: d, descanso: f.descanso.checked,
      hora_inicio: f.descanso.checked ? null : f.ini.value, hora_fin: f.descanso.checked ? null : f.fin.value, lugar: f.lugar.value.trim() || null }));
    const { error } = await db().from('turnos').upsert(filas, { onConflict: 'empleado_id,fecha' });
    if (error) return toast(error.message, true);
    cerrarModal(); toast('Turno guardado ✓'); ctx.repintar();
  });
}

// ================= RONDINES (puntos con QR) =================
export async function rondines(el, ctx) {
  const [p, m] = await Promise.all([
    db().from('puntos_rondin').select('*').eq('centro_id', ctx.centro).eq('activo', true).order('orden'),
    db().from('rondin_marcas').select('*').eq('centro_id', ctx.centro).eq('fecha', ctx.fecha).order('hora'),
  ]);
  if (p.error || m.error) throw p.error || m.error;
  const puntos = p.data, rs = rondas(m.data, puntos);
  const puede = tieneRol(['administracion', 'encargado']);
  const nombre = (id) => ctx.equipo.find((e) => e.id === id)?.nombre || '—';
  document.getElementById('page-actions').innerHTML = puntos.length ? `<button class="btn btn-ghost" id="rd-qr">Imprimir placas QR</button>` : '';
  document.getElementById('rd-qr')?.addEventListener('click', () => placasPuntos(puntos));
  el.innerHTML = `${ctx.barraFecha()}
    <div class="eq-grid">
      <section class="panel"><div class="panel-head"><h3>Rondines del ${fmtFecha(ctx.fecha)}</h3><span class="sub-meta">${rs.length} ronda${rs.length === 1 ? '' : 's'}</span></div>
        ${rs.length ? rs.map((r) => `<div class="eq-rep"><b>Ronda ${r.ronda} · ${esc(nombre(r.empleado_id))}</b>
          <div class="m"><span>${hora(r.ini)}–${hora(r.fin)} · ${r.hechos.size} de ${puntos.length} puntos</span>${r.faltan.length ? `<span class="neg">Faltó: ${r.faltan.map((x) => esc(x.nombre)).join(', ')}</span>` : '<span class="pos">Completa ✓</span>'}</div>
          <div class="eq-pts">${puntos.map((x) => { const mk = r.marcas.find((y) => y.punto_id === x.id); return `<span class="${mk ? 'y' : ''}" title="${mk ? hora(mk.hora) : 'sin escanear'}">${esc(x.nombre)}${mk ? ' ' + hora(mk.hora) : ''}</span>`; }).join('')}</div></div>`).join('')
          : `<p class="nota">${puntos.length ? 'Nadie ha hecho rondín este día.' : 'Primero da de alta los puntos del recorrido.'}</p>`}
      </section>
      <section class="panel"><div class="panel-head"><h3>Puntos del recorrido</h3>${puede ? '<button class="btn btn-sm btn-ghost" id="rd-nuevo">＋ Punto</button>' : ''}</div>
        <p class="nota" style="margin-bottom:8px">Cada punto lleva una placa con QR. El vigilante la escanea con su celular al pasar; si se salta uno, aquí se ve.</p>
        ${puntos.map((x) => `<div class="eq-chk"><span class="mono" style="font-size:12px">${x.orden}</span><span>${esc(x.nombre)}</span>${puede ? `<button class="link-btn who" data-ed="${x.id}">Editar</button>` : ''}</div>`).join('') || '<p class="nota">Sin puntos todavía. Ejemplo: Lobby, Estacionamiento, Cuarto de bombas, Gas, Azotea.</p>'}
      </section></div>`;
  ctx.enlazarFecha(el);
  el.querySelector('#rd-nuevo')?.addEventListener('click', () => editarPunto(null, puntos, ctx));
  el.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => editarPunto(puntos.find((x) => x.id === b.dataset.ed), puntos, ctx)));
}
function editarPunto(p, puntos, ctx) {
  const modal = abrirModal({ titulo: p ? 'Editar punto' : 'Nuevo punto del rondín',
    cuerpo: `<form class="form" id="pf"><label>Nombre<input name="n" maxlength="40" value="${esc(p?.nombre || '')}" placeholder="Cuarto de bombas" required></label>
      <label>Orden en el recorrido<input type="number" name="o" min="1" value="${p?.orden ?? puntos.length + 1}"></label></form>`,
    pie: `${p ? '<button class="btn btn-ghost" id="pf-baja">Quitar</button>' : ''}<button class="btn btn-ghost" id="pf-no">Cancelar</button><button class="btn btn-primary" id="pf-si">Guardar</button>` });
  const f = modal.querySelector('#pf');
  modal.querySelector('#pf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#pf-baja')?.addEventListener('click', async () => { await db().from('puntos_rondin').update({ activo: false }).eq('id', p.id); cerrarModal(); ctx.repintar(); });
  modal.querySelector('#pf-si').addEventListener('click', async () => {
    if (!f.n.value.trim()) return toast('Escribe el nombre', true);
    const datos = { nombre: f.n.value.trim(), orden: Number(f.o.value) || 1 };
    const { error } = p ? await db().from('puntos_rondin').update(datos).eq('id', p.id)
      : await db().from('puntos_rondin').insert({ ...datos, org_id: estado.miembro.org_id, centro_id: ctx.centro, activo: true });
    if (error) return toast(error.message, true);
    cerrarModal(); toast('Guardado ✓'); ctx.repintar();
  });
}
function placasPuntos(puntos) {
  const w = window.open('', '_blank'); if (!w) return toast('Permite ventanas emergentes', true);
  const qrLib = new URL('js/vendor/qrcode.min.js', document.baseURI).href;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Placas del rondín</title><script src="${qrLib}"><\/script>
<style>@page{size:letter;margin:10mm}body{font-family:Arial,sans-serif;margin:0}.g{display:grid;grid-template-columns:repeat(3,62mm);gap:6mm;justify-content:center;padding:8mm}
.p{border:2px solid #141414;border-radius:3mm;padding:4mm;display:grid;justify-items:center;gap:2mm;break-inside:avoid}.s{font-weight:800;letter-spacing:.15em;font-size:11pt}.n{font-weight:800;font-size:14pt;text-align:center}
.barra{background:#141414;color:#fff;text-align:center;padding:10px}@media print{.barra{display:none}}</style></head><body><div class="barra"><button onclick="print()">Imprimir</button></div>
<div class="g">${puntos.map((x) => `<div class="p"><div class="s">RONDÍN · ${x.orden}</div><div class="q" data-qr="PTO:${x.id}"></div><div class="n">${esc(x.nombre)}</div></div>`).join('')}</div>
<script>window.onload=function(){document.querySelectorAll('[data-qr]').forEach(function(e){new QRCode(e,{text:e.dataset.qr,width:120,height:120})})}<\/script></body></html>`);
  w.document.close();
}

// ================= DAR ACCESO AL CELULAR =================
// El dueño le crea a cada persona su usuario para entrar desde su celular (rol "equipo", ligado a su ficha)
export function darAcceso(e, despues) {
  const sugerido = normalizar(e.nombre).split(' ').slice(0, 2).join('.').replace(/[^a-z0-9.]/g, '');
  const pass = normalizar(primerNombre(e.nombre)).replace(/[^a-z]/g, '').slice(0, 8) + (1000 + Math.floor(Math.random() * 9000));
  const modal = abrirModal({ titulo: `Acceso al celular · ${e.nombre}`,
    cuerpo: `<form class="form" id="da"><p class="nota">Con este usuario entra desde su celular a checar con foto, hacer su rondín y marcar sus pendientes. No ve dinero.</p>
      <div class="form-2"><label>Usuario<input name="u" value="${esc(sugerido)}" autocapitalize="none" maxlength="30"></label><label>Contraseña<input name="p" value="${esc(pass)}" maxlength="40"></label></div></form>`,
    pie: `<button class="btn btn-ghost" id="da-no">Cancelar</button><button class="btn btn-primary" id="da-si">Crear acceso</button>` });
  const f = modal.querySelector('#da');
  modal.querySelector('#da-no').addEventListener('click', cerrarModal);
  modal.querySelector('#da-si').addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const { data, error } = await sb.functions.invoke('usuarios', { body: { accion: 'crear', nombre: e.nombre, usuario: f.u.value.trim().toLowerCase(), password: f.p.value, rol: 'equipo', roles: [], empresas: null, empleado_id: e.id } });
    const msg = error ? (await error.context?.json?.().catch(() => null))?.error || error.message : data?.error;
    if (msg) { ev.currentTarget.disabled = false; return toast(msg, true); }
    const link = location.origin + location.pathname;
    const txt = `Hola ${primerNombre(e.nombre)}, ya tienes acceso a la app de ${MARCA.nombre || 'la torre'}:\n${link}\nUsuario: ${f.u.value.trim().toLowerCase()}\nContraseña: ${f.p.value}\nÁbrela en tu celular y guárdala en tu pantalla de inicio.`;
    abrirModal({ titulo: 'Acceso creado ✓', cuerpo: `<p class="nota">Mándale sus datos:</p><textarea rows="6" style="width:100%">${esc(txt)}</textarea>`,
      pie: `${e.telefono ? `<a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/52${String(e.telefono).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(txt)}">Mandar por WhatsApp</a>` : ''}<button class="btn btn-primary" data-cerrar>Listo</button>` });
    despues?.();
  });
}
