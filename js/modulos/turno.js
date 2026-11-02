// Mi turno · la pantalla del personal en su celular (vigilancia, limpieza, mantenimiento):
// checar entrada y salida con selfie, su rondín escaneando los QR de cada punto, sus pendientes del día (con foto),
// los reportes que le asignaron, paquetes, buscar una placa, reportar algo y entregar el turno con una nota.
// Si el usuario no está ligado a una persona (p. ej. el celular de la caseta), primero pregunta "¿Quién eres?".
import { MARCA } from '../config.js';
import { db, estado, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar, comprimirImagen, subirArchivo, verFoto } from '../lib.js';
import { horarioDe, pendientesDe, marcarTarea, rondas, sumarDias, hora, hhmm, avatar, nuevoReporte, recibirPaquete, entregarPaquete,
         avisoPaquete, resolverReporte, unidadTxt, haceCuanto, fl } from './equipo.js';

const CLAVE_YO = 'unaria-turno-yo';
let raiz, yo = null, C = {};
const esVig = (e) => /vigil|seguridad|guardia|caseta/.test(normalizar(e?.puesto));
const primer = (n) => String(n || '').split(' ')[0];
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export async function render(view) {
  raiz = view;
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  document.getElementById('page-actions').innerHTML = '';
  // ¿quién soy? (usuario ligado a su ficha, o el celular compartido de la caseta)
  const { data: mio } = await db().rpc('mi_empleado');
  yo = mio?.[0] || null;
  if (!yo) {
    const todos = (await Promise.all(estado.centros.map((c) => db().rpc('equipo_de', { p_centro: c.id }).then((r) => (r.data || []).map((e) => ({ ...e, centro_id: c.id })))))).flat();
    yo = todos.find((e) => e.id === leer(CLAVE_YO)) || null;
    if (!yo) return quienEres(todos);
  }
  await cargar();
}

function quienEres(todos) {
  raiz.innerHTML = `<div class="tu"><div class="tu-hd"><small>${esc(MARCA.nombre || '')}</small><h2>¿Quién eres?</h2><small>Este celular lo usan varias personas. Toca tu nombre.</small></div>
    <div class="tu-sec">${todos.map((e) => `<button class="tu-quien" data-yo="${e.id}">${avatar(e.nombre)}<span><b>${esc(e.nombre)}</b><small>${esc(e.puesto || '')}</small></span></button>`).join('') || '<p class="nota">No hay personal dado de alta.</p>'}</div></div>`;
  raiz.querySelectorAll('[data-yo]').forEach((b) => b.addEventListener('click', () => { guardar(CLAVE_YO, b.dataset.yo); render(raiz); }));
}

async function cargar() {
  const hoy = hoyISO(), ayer = sumarDias(hoy, -1), centro = yo.centro_id;
  const [tu, as, pu, ma, pl, ta, so, pa, bi, eq, un, ko] = await Promise.all([
    db().from('turnos').select('*').eq('empleado_id', yo.id).gte('fecha', ayer).lte('fecha', hoy),
    db().from('asistencia').select('*').eq('empleado_id', yo.id).gte('fecha', ayer).lte('fecha', hoy),
    db().from('puntos_rondin').select('*').eq('centro_id', centro).eq('activo', true).order('orden'),
    db().from('rondin_marcas').select('*').eq('centro_id', centro).eq('fecha', hoy).eq('empleado_id', yo.id).order('hora'),
    db().from('tareas_plantilla').select('*').eq('centro_id', centro).eq('activo', true),
    db().from('tareas').select('*').eq('centro_id', centro).eq('fecha', hoy).eq('empleado_id', yo.id).eq('tipo', 'tarea'),
    db().from('solicitudes').select('*').eq('centro_id', centro).eq('asignado_a', yo.id).neq('estado', 'resuelta').order('creado_en'),
    db().from('paquetes').select('*').eq('centro_id', centro).is('entregado_en', null).order('recibido_en', { ascending: false }),
    db().from('bitacora_turno').select('*').eq('centro_id', centro).order('creado_en', { ascending: false }).limit(1),
    db().rpc('equipo_de', { p_centro: centro }),
    db().from('unidades').select('id, identificador').eq('centro_id', centro).eq('activo', true),
    db().from('contratos').select('unidad_id, arrendatario, telefono').eq('centro_id', centro).eq('activo', true),
  ]);
  C = { hoy, ayer, centro, turnos: tu.data || [], asistencia: as.data || [], puntos: pu.data || [], marcas: ma.data || [], plantillas: pl.data || [],
    tareas: ta.data || [], reportes: so.data || [], paquetes: pa.data || [], bitacora: bi.data?.[0] || null, equipo: eq.data || [],
    unidades: un.data || [], contratos: ko.data || [] };
  pintar();
}

const ctxEquipo = () => ({ centro: C.centro, equipo: C.equipo, unidades: C.unidades, contratos: C.contratos, quien: yo.nombre, repintar: cargar });

function pintar() {
  const h = horarioDe(yo, C.hoy, C.turnos), hAyer = horarioDe(yo, C.ayer, C.turnos);
  const aHoy = C.asistencia.find((a) => a.fecha === C.hoy), aAyer = C.asistencia.find((a) => a.fecha === C.ayer);
  // turno de noche de ayer que sigue abierto: se cierra hoy
  const nocheAbierta = aAyer?.hora_entrada && !aAyer.hora_salida && !hAyer.descanso && String(hAyer.fin) <= String(hAyer.ini);
  const a = nocheAbierta && !aHoy ? aAyer : aHoy, fechaA = a === aAyer ? C.ayer : C.hoy;
  const turnoTxt = h.descanso ? 'Hoy descansas' : `Tu turno: hoy ${hhmm(h.ini)} a ${hhmm(h.fin)}${h.lugar ? ' · ' + h.lugar : ''}`;
  const rs = rondas(C.marcas, C.puntos);
  const actual = rs.sort((x, y) => y.ronda - x.ronda)[0];
  const completa = actual && !actual.faltan.length;
  const ronda = !actual ? 1 : completa ? actual.ronda + 1 : actual.ronda;
  const hechosRonda = completa || !actual ? new Set() : actual.hechos;
  const pend = pendientesDe([yo], C.plantillas, C.tareas, C.hoy);
  const nPend = pend.filter((f) => f.reg?.estado !== 'hecho').length + C.reportes.length;
  const notaPrev = C.bitacora && C.bitacora.empleado_id !== yo.id && fl(C.bitacora.creado_en) >= C.ayer ? C.bitacora : null;

  raiz.innerHTML = `<div class="tu">
    <div class="tu-hd"><small>${esc(MARCA.nombre || '')} · ${esc(yo.puesto || 'Equipo')}</small><h2>Hola, ${esc(primer(yo.nombre))}</h2><small>${esc(turnoTxt)}</small>
      ${leer(CLAVE_YO) ? '<button class="tu-cambiar" id="tu-otro">No soy yo</button>' : ''}</div>
    <div class="tu-ent">${!a?.hora_entrada || a?.estado === 'falta'
      ? `<label class="tu-big">📷 Checar entrada<input type="file" accept="image/*" capture="user" hidden id="tu-ent"></label><div class="tu-sub">Tómate una selfie en tu lugar de trabajo. Queda la hora.</div>`
      : !a.hora_salida
        ? `<div class="tu-ok">✓ Entraste a las ${hora(a.hora_entrada)}${a.minutos_tarde ? ` · ${a.minutos_tarde} min tarde` : ''}</div>
           <div class="tu-dos"><button class="btn btn-ghost" id="tu-entregar">⇄ Entregar turno</button><label class="btn btn-primary">📷 Checar salida<input type="file" accept="image/*" capture="user" hidden id="tu-sal"></label></div>`
        : `<div class="tu-ok">✓ Saliste a las ${hora(a.hora_salida)}. ¡Buen descanso!</div>`}</div>
    ${notaPrev ? `<div class="tu-sec tu-nota"><b>Nota del turno anterior</b><p>“${esc(notaPrev.nota || 'Sin novedades')}”</p><small>${esc(C.equipo.find((e) => e.id === notaPrev.empleado_id)?.nombre || '')} · ${hora(notaPrev.creado_en)}</small></div>` : ''}
    ${C.puntos.length && (esVig(yo) || C.marcas.length) ? `<div class="tu-sec"><h4>Rondín ${ronda} <span>${hechosRonda.size} de ${C.puntos.length}</span></h4>
      <div class="eq-pts">${C.puntos.map((p) => `<button class="${hechosRonda.has(p.id) ? 'y' : ''}" data-punto="${p.id}">${esc(p.nombre)}</button>`).join('')}</div>
      <button class="tu-big tu-big-sm" id="tu-scan">▣ Escanear ${hechosRonda.size ? 'siguiente ' : ''}punto</button>
      ${rs.length && completa ? `<small class="mut">Rondín ${actual.ronda} completo a las ${hora(actual.fin)} ✓</small>` : ''}</div>` : ''}
    <div class="tu-sec"><h4>Mis pendientes <span>${nPend ? `${nPend} por hacer` : 'todo listo ✓'}</span></h4>
      ${C.reportes.map((s) => `<div class="tu-chk rep"><i></i><span><b>${esc(s.unidad_txt || 'Reporte')}:</b> ${esc(s.descripcion)}<small>${haceCuanto(s.creado_en)}${s.reporta ? ' · ' + esc(s.reporta) : ''}</small></span>
        <button class="btn btn-sm btn-primary" data-rep="${s.id}">Resuelto</button></div>`).join('')}
      ${pend.map((f, i) => { const ok = f.reg?.estado === 'hecho'; return `<div class="tu-chk ${ok ? 'hecho' : ''}"><button class="tu-box ${ok ? 'y' : ''}" data-t="${i}" aria-label="Hecho"></button>
        <span>${esc(f.tarea)}${ok ? `<small>${hora(f.reg.hora_registro)}${f.reg.foto_path ? ' · con foto' : ''}</small>` : ''}</span>
        <label class="tu-cam" title="Foto">📷<input type="file" accept="image/*" capture="environment" hidden data-ft="${i}"></label></div>`; }).join('')}
      ${!pend.length && !C.reportes.length ? '<p class="nota">No tienes tareas asignadas hoy.</p>' : ''}</div>
    ${esVig(yo) && C.paquetes.length ? `<div class="tu-sec"><h4>Paquetes en caseta <span>${C.paquetes.length}</span></h4>
      ${C.paquetes.map((p) => `<div class="tu-chk"><span><b>${esc(unidadTxt(p, ctxEquipo()))}</b> · ${esc(p.paqueteria || 'Paquete')}<small>${haceCuanto(p.recibido_en)}</small></span>
        ${avisoPaquete(p, ctxEquipo())}<button class="btn btn-sm btn-ghost" data-entregar="${p.id}">Entregado</button></div>`).join('')}</div>` : ''}
    <div class="tu-rb"><button id="tu-placa">🚗<span>Buscar placa</span></button><button id="tu-reportar">⚠️<span>Reportar algo</span></button>
      ${esVig(yo) ? '<button id="tu-paquete">📦<span>Paquete</span></button>' : ''}</div>
  </div>`;

  const $ = (s) => raiz.querySelector(s);
  $('#tu-otro')?.addEventListener('click', () => { guardar(CLAVE_YO, null); render(raiz); });
  $('#tu-ent')?.addEventListener('change', (e) => checar('entrada', e.target.files[0], C.hoy));
  $('#tu-sal')?.addEventListener('change', (e) => checar('salida', e.target.files[0], fechaA));
  $('#tu-entregar')?.addEventListener('click', entregarTurno);
  $('#tu-scan')?.addEventListener('click', () => escanear(ronda, hechosRonda));
  raiz.querySelectorAll('[data-punto]').forEach((b) => b.addEventListener('click', () => {
    if (hechosRonda.has(b.dataset.punto)) return toast('Ese punto ya está en esta ronda');
    puntoSinQR(C.puntos.find((p) => p.id === b.dataset.punto), ronda);
  }));
  raiz.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', async () => {
    const f = pend[+b.dataset.t]; b.disabled = true;
    try { await marcarTarea(f, C.centro, C.hoy, { estado: f.reg?.estado === 'hecho' ? 'pendiente' : 'hecho' }); navigator.vibrate?.(40); await cargar(); }
    catch (e) { b.disabled = false; toast(e.message, true); }
  }));
  raiz.querySelectorAll('[data-ft]').forEach((inp) => inp.addEventListener('change', async () => {
    const file = inp.files[0]; if (!file) return;
    try { toast('Subiendo foto…'); const url = await subirArchivo(await comprimirImagen(file, 1200, 0.7), 'tareas');
      await marcarTarea(pend[+inp.dataset.ft], C.centro, C.hoy, { estado: 'hecho', foto_path: url }); toast('Hecho con foto ✓'); await cargar(); }
    catch (e) { toast('No se pudo: ' + e.message, true); }
  }));
  raiz.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => resolverReporte(C.reportes.find((s) => s.id === b.dataset.rep), cargar)));
  raiz.querySelectorAll('[data-entregar]').forEach((b) => b.addEventListener('click', () => entregarPaquete(C.paquetes.find((p) => p.id === b.dataset.entregar), cargar)));
  $('#tu-placa').addEventListener('click', buscarPlaca);
  $('#tu-reportar').addEventListener('click', () => nuevoReporte(ctxEquipo(), cargar, 'caseta'));
  $('#tu-paquete')?.addEventListener('click', () => recibirPaquete(ctxEquipo(), cargar));
}

// ---------- checar con selfie ----------
async function checar(accion, file, fecha) {
  if (!file) return;
  raiz.querySelector('.tu-ent').innerHTML = '<div class="tu-ok">Guardando…</div>';
  try {
    const foto = await subirArchivo(await comprimirImagen(file, 900, 0.7), 'asistencia');
    const { data, error } = await db().rpc('asistencia_marcar', { p_empleado: yo.id, p_fecha: fecha, p_accion: accion });
    if (error) throw error;
    await db().rpc('asistencia_foto', { p_asistencia: data.id, p_tipo: accion, p_url: foto });
    navigator.vibrate?.(80);
    toast(accion === 'entrada' ? (data.minutos_tarde ? `Entrada · ${data.minutos_tarde} min tarde` : 'Entrada registrada ✓') : 'Salida registrada ✓');
  } catch (e) { toast('No se pudo: ' + (e.message || e), true); }
  cargar();
}

// ---------- entregar el turno ----------
function entregarTurno() {
  const otros = C.equipo.filter((e) => e.id !== yo.id);
  const modal = abrirModal({ titulo: 'Entregar turno',
    cuerpo: `<form class="form" id="et"><label>¿A quién se lo entregas?<select name="a"><option value="">— Nadie en este momento —</option>
      ${otros.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></label>
      <label>Novedades del turno<textarea name="nota" rows="4" placeholder="Paquete para D402 en caseta. Portón eléctrico lento."></textarea></label></form>`,
    pie: `<button class="btn btn-ghost" id="et-no">Cancelar</button><button class="btn btn-primary" id="et-si">Entregar</button>` });
  const f = modal.querySelector('#et');
  modal.querySelector('#et-no').addEventListener('click', cerrarModal);
  modal.querySelector('#et-si').addEventListener('click', async () => {
    const { error } = await db().from('bitacora_turno').insert({ org_id: estado.miembro.org_id, centro_id: C.centro, empleado_id: yo.id, recibe_id: f.a.value || null, nota: f.nota.value.trim() || null });
    if (error) return toast(error.message, true);
    cerrarModal(); toast('Turno entregado ✓ · ahora checa tu salida'); cargar();
  });
}

// ---------- rondín ----------
async function guardarMarca(punto, ronda, foto = null, nota = null) {
  const { error } = await db().from('rondin_marcas').insert({ org_id: estado.miembro.org_id, centro_id: C.centro, empleado_id: yo.id, punto_id: punto.id,
    fecha: C.hoy, ronda, foto_path: foto, nota });
  if (error) return toast(error.message, true);
  navigator.vibrate?.(60); toast(`${punto.nombre} ✓`); cargar();
}
function puntoSinQR(p, ronda) {
  const modal = abrirModal({ titulo: `${p.nombre} sin QR`,
    cuerpo: `<form class="form" id="sq"><p class="nota">Si la placa no se lee o no está, toma una foto del lugar para que cuente.</p>
      <label class="archivo">Foto del lugar<input type="file" name="foto" accept="image/*" capture="environment"></label>
      <label>Nota<input name="nota" maxlength="120" placeholder="La placa está despegada"></label></form>`,
    pie: `<button class="btn btn-ghost" id="sq-no">Cancelar</button><button class="btn btn-primary" id="sq-si">Guardar</button>` });
  const f = modal.querySelector('#sq');
  modal.querySelector('#sq-no').addEventListener('click', cerrarModal);
  modal.querySelector('#sq-si').addEventListener('click', async (ev) => {
    if (!f.foto.files[0]) return toast('Toma la foto del lugar', true);
    ev.currentTarget.disabled = true;
    try { const url = await subirArchivo(await comprimirImagen(f.foto.files[0], 1200, 0.7), 'rondin'); cerrarModal(); guardarMarca(p, ronda, url, f.nota.value.trim() || 'Sin QR'); }
    catch (e) { ev.currentTarget.disabled = false; toast(e.message, true); }
  });
}
let jsQRCarga;
const cargarJsQR = () => jsQRCarga ||= new Promise((ok, mal) => {
  if (window.jsQR) return ok(window.jsQR);
  const s = document.createElement('script'); s.src = new URL('js/vendor/jsQR.js', document.baseURI).href;
  s.onload = () => ok(window.jsQR); s.onerror = () => { jsQRCarga = null; mal(new Error('No se pudo cargar el lector de QR')); };
  document.head.appendChild(s);
});
async function escanear(ronda, hechos) {
  const modal = abrirModal({ titulo: 'Apunta a la placa del punto', cuerpo: `<div class="lec-camara"><video id="tu-video" playsinline muted></video><div class="lec-mira"></div></div><p class="nota" id="tu-cam-msg">Abriendo la cámara…</p>`,
    pie: `<button class="btn btn-ghost" id="tu-cam-no">Cancelar</button>` });
  let stream, vivo = true;
  const parar = () => { vivo = false; stream?.getTracks().forEach((t) => t.stop()); };
  modal.querySelector('#tu-cam-no').addEventListener('click', () => { parar(); cerrarModal(); });
  const obs = new MutationObserver(() => { if (!document.body.contains(modal)) { parar(); obs.disconnect(); } });
  obs.observe(document.getElementById('modal-root'), { childList: true });
  const msg = modal.querySelector('#tu-cam-msg'), video = modal.querySelector('#tu-video');
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); video.srcObject = stream; await video.play();
    msg.textContent = 'Centra el código en el recuadro.'; }
  catch { msg.textContent = 'No se pudo abrir la cámara. Da permiso de cámara o toca el punto en la lista para marcarlo con foto.'; return; }
  let detectar;
  if ('BarcodeDetector' in window) { const bd = new window.BarcodeDetector({ formats: ['qr_code'] }); detectar = async () => (await bd.detect(video))[0]?.rawValue; }
  else {
    const jsQR = await cargarJsQR().catch(() => null); if (!jsQR) { msg.textContent = 'No se pudo cargar el lector.'; return; }
    const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
    detectar = async () => { c.width = video.videoWidth; c.height = video.videoHeight; if (!c.width) return null; x.drawImage(video, 0, 0); return jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data; };
  }
  const ciclo = async () => {
    if (!vivo) return;
    const txt = await detectar().catch(() => null);
    if (txt) {
      const p = C.puntos.find((y) => y.id === String(txt).replace(/^PTO:/, ''));
      if (p && hechos.has(p.id)) msg.textContent = `${p.nombre} ya está en esta ronda. Sigue con el siguiente.`;
      else if (p) { parar(); cerrarModal(); return guardarMarca(p, ronda); }
      else msg.textContent = 'Ese código no es de un punto del rondín.';
    }
    setTimeout(ciclo, 250);
  };
  ciclo();
}

// ---------- buscar placa ----------
function buscarPlaca() {
  const modal = abrirModal({ titulo: 'Buscar placa o residente', cuerpo: `<input type="search" id="bp-q" class="lec-buscar" placeholder="Placa, depto o nombre" autocomplete="off" autocapitalize="characters"><div id="bp-r" style="margin-top:10px"></div>` });
  const q = modal.querySelector('#bp-q'), out = modal.querySelector('#bp-r');
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => {
    const v = q.value.trim(); if (v.length < 2) { out.innerHTML = ''; return; }
    const placa = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const [ve, re] = await Promise.all([
      placa.length >= 2 ? db().from('vehiculos').select('unidad_id, placas, modelo, color').eq('activo', true).ilike('placas', `%${placa}%`).limit(10) : { data: [] },
      db().from('residentes').select('unidad_id, nombre, telefono').eq('activo', true).ilike('nombre', `%${v}%`).limit(10)]);
    const un = (id) => C.unidades.find((u) => u.id === id);
    const porDepto = C.unidades.filter((u) => normalizar(u.identificador).includes(normalizar(v))).slice(0, 5);
    const k = (id) => C.contratos.find((c) => c.unidad_id === id);
    out.innerHTML = [...(ve.data || []).filter((x) => un(x.unidad_id)).map((x) => `<div class="tu-res"><b class="mono">${esc(x.placas)}</b> → <b>${esc(un(x.unidad_id).identificador)}</b><small>${esc([x.modelo, x.color].filter(Boolean).join(' · '))} · ${esc(k(x.unidad_id)?.arrendatario || '')}</small></div>`),
      ...(re.data || []).filter((x) => un(x.unidad_id)).map((x) => `<div class="tu-res"><b>${esc(x.nombre)}</b> → <b>${esc(un(x.unidad_id).identificador)}</b>${x.telefono ? `<small>${esc(x.telefono)}</small>` : ''}</div>`),
      ...porDepto.map((u) => `<div class="tu-res"><b>${esc(u.identificador)}</b><small>${esc(k(u.id)?.arrendatario || 'Disponible')}</small></div>`)].join('')
      || '<p class="nota">No está registrado. Pide identificación y avisa a administración.</p>';
  }, 250); });
}
