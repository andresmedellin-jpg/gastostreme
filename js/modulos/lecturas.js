// Lecturas de luz, gas y agua por unidad. El edificio paga un solo recibo a cada compañía y le cobra a cada
// departamento lo que marcó su medidor.
//  · Toma de lecturas (el que hace el recorrido, desde el celular): escanea la placa QR del medidor, escribe la
//    lectura y toma la foto. La app la compara con la anterior y con su consumo normal antes de dejarlo seguir.
//  · Luz, gas y agua (el encargado): avance del recorrido, revisión, cuadre contra los recibos de las compañías,
//    aviso de cobro por unidad (PDF) y catálogo de medidores con sus placas QR.
// Tablas: medidores, lecturas, recibos_servicio, tarifas_servicio (supabase/plantilla/lecturas_servicios.sql).
import { MESES } from '../config.js';
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar,
         comprimirImagen, subirArchivo, verFoto } from '../lib.js';
import { pintarRecibo, abrirVentanaRecibo } from '../recibo.js';

const SERV = {
  luz:  { nombre: 'Luz',  unidad: 'kWh', compania: 'CFE', zona: 'Cuarto de medidores' },
  gas:  { nombre: 'Gas',  unidad: 'm³',  compania: 'Gas natural', zona: 'Fila de gas' },
  agua: { nombre: 'Agua', unidad: 'm³',  compania: 'Agua y Drenaje', zona: 'Cuarto de bombas' },
};
const RARO = 2.2;                       // más de 2.2 veces su consumo normal = revisar
const TABS_ENC = [['avance', 'Avance'], ['revision', 'Revisión'], ['cuadre', 'Cuadre con recibos'], ['cobro', 'Cobro por unidad'], ['medidores', 'Medidores y placas']];

const per = (ym) => ym + '-01';
const ymDe = (d) => d.slice(0, 7);
const mesTxt = (ym) => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const mesAnterior = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const n0 = (x) => Number(x || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

const st = { tab: null, centro: null, ym: hoyISO().slice(0, 7), q: '', fSrv: '', fEst: '' };
let raiz, campo = false;
let medidores = [], lecturas = [], recibos = [], tarifas = [], unidades = [], contratos = [];

export async function render(view, mod) {
  raiz = view;
  campo = mod?.tab === 'recorrido';
  if (campo) st.tab = 'recorrido';
  else if (!st.tab || st.tab === 'recorrido') st.tab = 'avance';
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  const { data, error } = await db().from('medidores').select('centro_id').eq('activo', true);
  if (error) { view.innerHTML = `<div class="vacio">No se pudieron cargar los medidores: ${esc(error.message)}</div>`; return; }
  const ids = [...new Set(data.map((m) => m.centro_id))];
  const centros = estado.centros.filter((c) => ids.includes(c.id));
  if (!centros.length) { view.innerHTML = '<div class="vacio">Todavía no hay medidores dados de alta.</div>'; return; }
  if (!centros.some((c) => c.id === st.centro)) st.centro = centros[0].id;
  view.innerHTML = `
    <div class="sub-head lec-head">
      ${campo ? '' : `<div class="tabs" role="tablist">${TABS_ENC.map(([id, t]) => `<button role="tab" data-tab="${id}" aria-selected="${st.tab === id}">${t}</button>`).join('')}</div>`}
      <div class="filtros">
        ${centros.length > 1 ? `<select id="lec-centro" aria-label="Edificio">${centros.map((c) => `<option value="${c.id}" ${c.id === st.centro ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>` : `<span class="sub-meta">${esc(centros[0].nombre)}</span>`}
        <select id="lec-mes" aria-label="Mes">${Array.from({ length: 6 }, (_, i) => { let ym = hoyISO().slice(0, 7); for (let k = 0; k < i; k++) ym = mesAnterior(ym); return ym; })
          .map((ym) => `<option value="${ym}" ${ym === st.ym ? 'selected' : ''}>${mesTxt(ym)}</option>`).join('')}</select>
      </div>
    </div>
    <div id="lec-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelector('#lec-centro')?.addEventListener('change', (e) => { st.centro = e.target.value; cargar(); });
  view.querySelector('#lec-mes').addEventListener('change', (e) => { st.ym = e.target.value; cargar(); });
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    st.tab = b.dataset.tab;
    view.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
    pintar();
  }));
  await cargar();
}

async function cargar() {
  const desde = (() => { let ym = st.ym; for (let k = 0; k < 4; k++) ym = mesAnterior(ym); return per(ym); })();
  const [m, l, r, t, u, c] = await Promise.all([
    db().from('medidores').select('*').eq('centro_id', st.centro).eq('activo', true),
    todo(() => db().from('lecturas').select('*').eq('centro_id', st.centro).gte('periodo', desde).lte('periodo', per(st.ym))),
    db().from('recibos_servicio').select('*').eq('centro_id', st.centro),
    db().from('tarifas_servicio').select('*').eq('centro_id', st.centro),
    db().from('unidades').select('id, identificador, tipo').eq('centro_id', st.centro),
    db().from('contratos').select('id, unidad_id, arrendatario, activo').eq('centro_id', st.centro).eq('activo', true),
  ]);
  const err = m.error || l.error || u.error;
  if (err) { toast('No se pudo cargar: ' + err.message, true); return; }
  unidades = u.data; contratos = c.data || []; recibos = r.data || []; tarifas = t.data || []; lecturas = l.data;
  const ord = (x) => unidades.find((y) => y.id === x.unidad_id)?.identificador || '';
  const OS = { luz: 0, gas: 1, agua: 2 };
  medidores = m.data.sort((a, b) => OS[a.servicio] - OS[b.servicio] || (a.zona || '').localeCompare(b.zona || '') || a.orden - b.orden || ord(a).localeCompare(ord(b), 'es', { numeric: true }));
  pintar();
}

// ---------- cálculo ----------
const unidadDe = (m) => unidades.find((u) => u.id === m.unidad_id);
const nombreUnidad = (m) => unidadDe(m)?.identificador || '—';
const ocupante = (unidadId) => contratos.find((c) => c.unidad_id === unidadId)?.arrendatario || '';
const lecturaDe = (m, ym = st.ym) => lecturas.find((l) => l.medidor_id === m.id && l.periodo === per(ym));
function anterior(m, ym = st.ym) {
  const prev = lecturas.filter((l) => l.medidor_id === m.id && l.periodo < per(ym)).sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
  return prev ? Number(prev.lectura) : Number(m.lectura_inicial || 0);
}
const consumo = (m, ym = st.ym) => { const l = lecturaDe(m, ym); return l ? Number(l.lectura) - anterior(m, ym) : null; };
function normal(m) {                    // promedio de los meses anteriores con lectura
  const cs = []; let ym = st.ym;
  for (let k = 0; k < 3; k++) { ym = mesAnterior(ym); const c = consumo(m, ym); if (c != null && lecturaDe(m, mesAnterior(ym)) ) cs.push(c); }
  return cs.length ? Math.round(cs.reduce((a, b) => a + b, 0) / cs.length) : null;
}
const reciboDe = (s) => recibos.find((r) => r.servicio === s && r.periodo === per(st.ym));
const tarifaDe = (s) => tarifas.find((t) => t.servicio === s) || { modo: 'tarifa', precio: 0, cargo_fijo: 0 };
// Importe de un medidor en el mes: tarifa fija, o su parte del recibo real según lo que consumió
function importe(m) {
  const c = consumo(m); if (c == null) return null;
  const t = tarifaDe(m.servicio);
  if (t.modo === 'prorrateo') {
    const r = reciboDe(m.servicio);
    if (!r || !(Number(r.consumo) > 0)) return null;
    return Math.round(c * Number(r.monto) / Number(r.consumo) * 100) / 100 + Number(t.cargo_fijo || 0);
  }
  return Math.round((c * Number(t.precio || 0) + Number(t.cargo_fijo || 0)) * 100) / 100;
}
const precioTxt = (s) => {
  const t = tarifaDe(s), r = reciboDe(s);
  if (t.modo === 'prorrateo') return r && Number(r.consumo) > 0 ? `${fmt(Number(r.monto) / Number(r.consumo))}/${SERV[s].unidad}` : 'falta recibo';
  return `${fmt(t.precio)}/${SERV[s].unidad}`;
};

// ---------- pintar ----------
function pintar() {
  const el = raiz.querySelector('#lec-cuerpo');
  const acc = document.getElementById('page-actions');
  acc.innerHTML = '';
  if (st.tab === 'recorrido') return pintarRecorrido(el);
  if (st.tab === 'avance') return pintarAvance(el);
  if (st.tab === 'revision') return pintarRevision(el);
  if (st.tab === 'cuadre') return pintarCuadre(el);
  if (st.tab === 'cobro') return pintarCobro(el);
  if (st.tab === 'medidores') return pintarMedidores(el);
}

const chipEstado = (l) => !l ? '<span class="tag tag-suave">Falta</span>'
  : l.estado === 'revisar' ? '<span class="tag tag-aviso">Revisar</span>'
  : l.estado === 'aprobada' ? '<span class="tag tag-ok">Aprobada</span>' : '<span class="tag tag-ok">Bien</span>';
const drum = (v) => `<span class="lec-drum">${[...String(Math.round(v)).padStart(6, '0')].map((d) => `<i>${d}</i>`).join('')}</span>`;

function porServicio() {
  return Object.keys(SERV).map((s) => {
    const ms = medidores.filter((m) => m.servicio === s);
    const hechos = ms.filter((m) => lecturaDe(m));
    return { s, ms, hechos, revisar: hechos.filter((m) => lecturaDe(m).estado === 'revisar'), zona: ms[0]?.zona || SERV[s].zona };
  }).filter((x) => x.ms.length);
}

// ----- recorrido (celular) -----
function pintarRecorrido(el) {
  const grupos = porServicio();
  const total = medidores.length, hechos = medidores.filter((m) => lecturaDe(m)).length;
  const pend = medidores.filter((m) => !lecturaDe(m));
  const lista = st.q ? medidores.filter((m) => normalizar(`${nombreUnidad(m)} ${SERV[m.servicio].nombre} ${m.serie || ''}`).includes(normalizar(st.q))) : pend;
  el.innerHTML = `<div class="lec-campo">
    <section class="panel lec-avance">
      <div class="panel-head"><h3>Recorrido de ${mesTxt(st.ym).toLowerCase()}</h3><span class="sub-meta">${hechos} de ${total}</span></div>
      <div class="lec-barra"><i style="width:${total ? hechos / total * 100 : 0}%"></i></div>
      <div class="lec-zonas">${grupos.map((g) => `<div><span>${SERV[g.s].nombre} · <span class="mut">${esc(g.zona)}</span></span><b>${g.hechos.length}/${g.ms.length}</b></div>`).join('')}</div>
      <button class="btn btn-primary btn-block lec-scan" id="lec-scan" ${pend.length ? '' : 'disabled'}>${pend.length ? '▣ Escanear placa QR' : 'Recorrido completo ✓'}</button>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>${st.q ? 'Resultados' : `Faltan ${pend.length}`}</h3></div>
      <input type="search" id="lec-q" placeholder="Si no lee el QR: busca depa o serie" value="${esc(st.q)}" aria-label="Buscar medidor" class="lec-buscar">
      <div class="lec-lista">${lista.slice(0, 80).map((m) => `<button data-med="${m.id}"><span><b>${esc(nombreUnidad(m))}</b> · ${SERV[m.servicio].nombre}</span>
        <span>${lecturaDe(m) ? chipEstado(lecturaDe(m)) : `<small>${esc(m.zona || '')}</small>`}</span></button>`).join('') || '<div class="vacio">Nada que mostrar</div>'}</div>
    </section></div>`;
  el.querySelector('#lec-scan')?.addEventListener('click', escanear);
  const q = el.querySelector('#lec-q');
  q.addEventListener('input', () => { st.q = q.value; const pos = q.selectionStart; pintarRecorrido(el); const n = el.querySelector('#lec-q'); n.focus(); n.setSelectionRange(pos, pos); });
  el.querySelectorAll('[data-med]').forEach((b) => b.addEventListener('click', () => capturar(medidores.find((m) => m.id === b.dataset.med))));
}

// Cámara: BarcodeDetector del navegador si existe; si no, jsQR
let jsQRCarga;
const cargarJsQR = () => jsQRCarga ||= new Promise((ok, mal) => {
  if (window.jsQR) return ok(window.jsQR);
  const s = document.createElement('script');
  s.src = new URL('js/vendor/jsQR.js', location.href).href;
  s.onload = () => ok(window.jsQR); s.onerror = () => { jsQRCarga = null; mal(new Error('No se pudo cargar el lector de QR')); };
  document.head.appendChild(s);
});
async function escanear() {
  const modal = abrirModal({
    titulo: 'Apunta a la placa del medidor',
    cuerpo: `<div class="lec-camara"><video id="lec-video" playsinline muted></video><div class="lec-mira"></div></div>
      <p class="nota" id="lec-cam-msg">Abriendo la cámara…</p>`,
    pie: `<button class="btn btn-ghost" id="lec-cam-no">Cancelar</button>`,
  });
  let stream, vivo = true;
  const parar = () => { vivo = false; stream?.getTracks().forEach((t) => t.stop()); };
  modal.querySelector('#lec-cam-no').addEventListener('click', () => { parar(); cerrarModal(); });
  const obs = new MutationObserver(() => { if (!document.body.contains(modal)) { parar(); obs.disconnect(); } });
  obs.observe(document.getElementById('modal-root'), { childList: true });
  const msg = modal.querySelector('#lec-cam-msg'), video = modal.querySelector('#lec-video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream; await video.play();
    msg.textContent = 'Centra el código en el recuadro. Si está oscuro, prende la lámpara del celular.';
  } catch {
    msg.innerHTML = 'No se pudo abrir la cámara. Da permiso de cámara a la página, o cierra y busca el medidor en la lista.';
    return;
  }
  let detectar;
  if ('BarcodeDetector' in window) {
    const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
    detectar = async () => (await bd.detect(video))[0]?.rawValue;
  } else {
    const jsQR = await cargarJsQR().catch(() => null);
    if (!jsQR) { msg.textContent = 'No se pudo cargar el lector. Busca el medidor en la lista.'; return; }
    const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    detectar = async () => {
      c.width = video.videoWidth; c.height = video.videoHeight; if (!c.width) return null;
      ctx.drawImage(video, 0, 0); return jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data;
    };
  }
  const ciclo = async () => {
    if (!vivo) return;
    const txt = await detectar().catch(() => null);
    if (txt) {
      const id = String(txt).replace(/^MED:/, '');
      const m = medidores.find((x) => x.id === id);
      if (m) { parar(); cerrarModal(); navigator.vibrate?.(80); return capturar(m); }
      msg.textContent = 'Ese código no es de un medidor de este edificio.';
    }
    setTimeout(ciclo, 250);
  };
  ciclo();
}

// Captura de una lectura (también sirve para corregir desde la oficina)
function capturar(m, desdeOficina = false) {
  const S = SERV[m.servicio], ya = lecturaDe(m), ant = anterior(m), nor = normal(m);
  let foto = null, avisado = false;
  const modal = abrirModal({
    titulo: `${S.nombre} · ${nombreUnidad(m)}`,
    cuerpo: `<form class="form" id="lf" novalidate>
      <div class="lec-ficha">
        <div><span class="lec-tag lec-${m.servicio}">${S.nombre.toUpperCase()}</span> <b>${esc(nombreUnidad(m))}</b></div>
        <small>${esc(ocupante(m.unidad_id) || 'Sin inquilino')} · Serie ${esc(m.serie || '—')} · ${esc(m.zona || '')}</small>
        <div><small>Lectura anterior</small><br>${drum(ant)}</div>
        <small>${nor != null ? `Consumo normal: unos ${n0(nor)} ${S.unidad} al mes` : 'Sin historial todavía'}</small>
      </div>
      <label>Lectura de hoy (${S.unidad})<input name="lectura" class="lec-input" inputmode="decimal" autocomplete="off" value="${ya ? Number(ya.lectura) : ''}" placeholder="${nor != null ? Math.round(ant + nor) : ''}"></label>
      <label class="lec-foto" id="lf-foto-lbl">${ya?.foto_path ? 'Ya tiene foto; si tomas otra, la reemplaza' : '📷 Tomar foto de los números'}
        <input type="file" name="foto" accept="image/*" capture="environment" hidden></label>
      <label>Nota <small>(opcional)</small><input name="nota" maxlength="200" value="${esc(ya?.nota || '')}" placeholder="Ej. vidrio empañado, medidor dañado"></label>
      <div id="lf-aviso"></div>
    </form>`,
    pie: `<button class="btn btn-ghost" id="lf-no">Cancelar</button><button class="btn btn-primary" id="lf-si">${ya ? 'Guardar corrección' : 'Guardar'}</button>`,
  });
  const f = modal.querySelector('#lf'), aviso = modal.querySelector('#lf-aviso'), btn = modal.querySelector('#lf-si');
  const decir = (t, cls) => { aviso.innerHTML = `<div class="lec-aviso ${cls}">${t}</div>`; };
  f.lectura.addEventListener('input', () => { avisado = false; aviso.innerHTML = ''; btn.textContent = ya ? 'Guardar corrección' : 'Guardar'; });
  f.foto.addEventListener('change', async () => {
    const file = f.foto.files?.[0]; if (!file) return;
    const lbl = modal.querySelector('#lf-foto-lbl');
    lbl.firstChild.textContent = 'Preparando foto…';
    try {
      foto = await comprimirImagen(file, 1400, 0.7);
      lbl.classList.add('lista'); lbl.firstChild.textContent = '';
      lbl.insertAdjacentHTML('afterbegin', `<img src="${URL.createObjectURL(foto)}" alt="Foto del medidor"><span>Foto lista ✓ (toca para repetir)</span>`);
    } catch (e) { lbl.firstChild.textContent = '📷 ' + e.message; }
  });
  modal.querySelector('#lf-no').addEventListener('click', cerrarModal);
  btn.addEventListener('click', async () => {
    const v = Number(String(f.lectura.value).replace(/[^\d.]/g, ''));
    if (!f.lectura.value.trim() || !(v >= 0)) return decir('Escribe la lectura.', 'mal');
    if (!foto && !ya?.foto_path && !desdeOficina) return decir('Falta la foto del medidor.', 'mal');
    if (v < ant) return decir(`La lectura (${n0(v)}) es menor que la anterior (${n0(ant)}). Revisa el número o que sea el medidor correcto.`, 'mal');
    const c = v - ant, raro = nor != null && nor > 0 && c > nor * RARO;
    if (raro && !avisado) {
      avisado = true; btn.textContent = 'Guardar de todos modos';
      return decir(`Consumo de ${n0(c)} ${S.unidad}: más del doble de lo normal (${n0(nor)}). Revisa el número; si está bien, guarda y el encargado lo verá marcado.`, 'ojo');
    }
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const foto_path = foto ? await subirArchivo(foto, 'lecturas') : (ya?.foto_path || null);
      const fila = { lectura: v, fecha: hoyISO(), foto_path, nota: f.nota.value.trim() || null, capturado_por: estado.miembro.nombre,
        estado: raro ? 'revisar' : (desdeOficina && tieneRol(['administracion']) ? 'aprobada' : 'ok') };
      const { data, error } = ya
        ? await db().from('lecturas').update(fila).eq('id', ya.id).select('*').single()
        : await db().from('lecturas').insert({ ...fila, org_id: estado.miembro.org_id, centro_id: m.centro_id, medidor_id: m.id, periodo: per(st.ym) }).select('*').single();
      if (error) throw error;
      lecturas = lecturas.filter((l) => l.id !== data.id).concat(data);
      cerrarModal();
      toast(raro ? `Guardada · ${nombreUnidad(m)} queda para revisar` : `Guardada · ${nombreUnidad(m)} ${S.nombre.toLowerCase()} ✓`);
      pintar();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Guardar';
      decir('No se pudo guardar: ' + esc(e.message || e), 'mal');
    }
  });
}

// ----- avance -----
function pintarAvance(el) {
  const g = porServicio();
  const pend = medidores.filter((m) => !lecturaDe(m));
  const rev = medidores.filter((m) => lecturaDe(m)?.estado === 'revisar');
  el.innerHTML = `
    <div class="kpis kpis-3">${g.map((x) => `<div class="kpi"><span>${SERV[x.s].nombre} · ${esc(x.zona)}</span>
      <strong>${x.hechos.length} / ${x.ms.length}</strong><div class="lec-barra"><i style="width:${x.hechos.length / x.ms.length * 100}%"></i></div>
      <small>${x.revisar.length ? `<b style="color:var(--warn)">${x.revisar.length} para revisar</b>` : 'sin lecturas raras'}</small></div>`).join('')}</div>
    ${rev.length ? `<section class="panel"><div class="panel-head"><h3>Para revisar · ${rev.length}</h3><button class="btn btn-sm btn-ghost" id="lec-ir-rev">Ir a revisión</button></div>
      <p class="nota">${rev.map((m) => `<b>${esc(nombreUnidad(m))}</b> ${SERV[m.servicio].nombre.toLowerCase()} (${n0(consumo(m))} ${SERV[m.servicio].unidad})`).join(' · ')}</p></section>` : ''}
    <section class="panel"><div class="panel-head"><h3>${pend.length ? `Faltan por leer · ${pend.length}` : 'Recorrido completo ✓'}</h3></div>
      ${pend.length ? `<div class="tabla-wrap"><table class="tabla lec-t"><thead><tr><th>Unidad</th><th>Servicio</th><th>Dónde</th><th>Inquilino</th></tr></thead>
      <tbody>${pend.map((m) => `<tr><td data-l="Unidad"><b>${esc(nombreUnidad(m))}</b></td><td data-l="Servicio">${SERV[m.servicio].nombre}</td><td data-l="Dónde">${esc(m.zona || '')}</td><td data-l="Inquilino">${esc(ocupante(m.unidad_id))}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </section>`;
  el.querySelector('#lec-ir-rev')?.addEventListener('click', () => raiz.querySelector('[data-tab="revision"]').click());
}

// ----- revisión -----
function pintarRevision(el) {
  const puede = tieneRol(['administracion']);
  let filas = medidores;
  if (st.fSrv) filas = filas.filter((m) => m.servicio === st.fSrv);
  if (st.fEst === 'revisar') filas = filas.filter((m) => lecturaDe(m)?.estado === 'revisar');
  if (st.fEst === 'falta') filas = filas.filter((m) => !lecturaDe(m));
  if (st.q) filas = filas.filter((m) => normalizar(`${nombreUnidad(m)} ${ocupante(m.unidad_id)}`).includes(normalizar(st.q)));
  const porAprobar = medidores.filter((m) => lecturaDe(m)?.estado === 'ok');
  el.innerHTML = `<section class="panel">
    <div class="panel-head"><h3>${filas.length} medidores</h3>
      <div class="filtros filtros-sm">
        <input type="search" id="rv-q" placeholder="Buscar unidad o inquilino" value="${esc(st.q)}" aria-label="Buscar">
        <select id="rv-srv" aria-label="Servicio"><option value="">Todos los servicios</option>${Object.entries(SERV).map(([k, v]) => `<option value="${k}" ${st.fSrv === k ? 'selected' : ''}>${v.nombre}</option>`).join('')}</select>
        <select id="rv-est" aria-label="Estado"><option value="">Todas</option><option value="revisar" ${st.fEst === 'revisar' ? 'selected' : ''}>Para revisar</option><option value="falta" ${st.fEst === 'falta' ? 'selected' : ''}>Faltan</option></select>
        ${puede && porAprobar.length ? `<button class="btn btn-sm btn-primary" id="rv-aprobar">Aprobar las ${porAprobar.length} normales</button>` : ''}
      </div></div>
    <div class="tabla-wrap"><table class="tabla lec-t"><thead><tr><th>Unidad</th><th>Servicio</th><th class="num">Anterior</th><th class="num">Actual</th><th class="num">Consumo</th><th class="num">Normal</th><th>Foto</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas.map((m) => { const l = lecturaDe(m), c = consumo(m), nor = normal(m), S = SERV[m.servicio];
        return `<tr><td data-l="Unidad"><b>${esc(nombreUnidad(m))}</b><br><small>${esc(ocupante(m.unidad_id))}</small></td><td data-l="Servicio">${S.nombre}</td>
          <td data-l="Anterior" class="num">${n0(anterior(m))}</td><td data-l="Actual" class="num">${l ? n0(l.lectura) : '—'}</td>
          <td data-l="Consumo" class="num">${c != null ? `<b>${n0(c)}</b> ${S.unidad}` : '—'}</td><td data-l="Normal" class="num">${nor != null ? n0(nor) : '—'}</td>
          <td data-l="Foto">${l?.foto_path ? `<button class="icon-btn" data-foto="${l.id}" title="Ver foto" aria-label="Ver foto">📷</button>` : '—'}</td>
          <td data-l="Estado">${chipEstado(l)}${l?.nota ? `<br><small>${esc(l.nota)}</small>` : ''}</td>
          <td data-l="" class="nowrap">${l && l.estado !== 'aprobada' && puede ? `<button class="btn btn-sm btn-ghost" data-ok="${l.id}">Aprobar</button>` : ''}
            <button class="icon-btn" data-corr="${m.id}" title="${l ? 'Corregir lectura' : 'Capturar'}" aria-label="Corregir">✎</button></td></tr>`; }).join('')}</tbody></table></div>
  </section>`;
  const re = () => pintarRevision(el);
  el.querySelector('#rv-q').addEventListener('change', (e) => { st.q = e.target.value; re(); });
  el.querySelector('#rv-srv').addEventListener('change', (e) => { st.fSrv = e.target.value; re(); });
  el.querySelector('#rv-est').addEventListener('change', (e) => { st.fEst = e.target.value; re(); });
  el.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => verFoto(lecturas.find((l) => l.id === b.dataset.foto)?.foto_path)));
  el.querySelectorAll('[data-corr]').forEach((b) => b.addEventListener('click', () => capturar(medidores.find((m) => m.id === b.dataset.corr), true)));
  const aprobar = async (ids) => {
    const { error } = await db().from('lecturas').update({ estado: 'aprobada' }).in('id', ids);
    if (error) return toast('No se pudo aprobar: ' + error.message, true);
    lecturas.forEach((l) => { if (ids.includes(l.id)) l.estado = 'aprobada'; });
    toast(ids.length > 1 ? `${ids.length} lecturas aprobadas ✓` : 'Lectura aprobada ✓'); re();
  };
  el.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => aprobar([b.dataset.ok])));
  el.querySelector('#rv-aprobar')?.addEventListener('click', () => aprobar(porAprobar.map((m) => lecturaDe(m).id)));
}

// ----- cuadre contra los recibos de las compañías -----
function pintarCuadre(el) {
  const puede = tieneRol(['administracion']);
  const g = porServicio();
  el.innerHTML = `<p class="nota" style="margin-bottom:12px">Lo que suman todos los medidores contra lo que cobró cada compañía al edificio en ${mesTxt(st.ym).toLowerCase()}.
      La diferencia es consumo que nadie está pagando: áreas comunes, una lectura mal tomada, un medidor dañado o alguien colgado.</p>
    <div class="lec-cuadre">${g.map((x) => {
      const S = SERV[x.s], r = reciboDe(x.s), suma = x.hechos.reduce((a, m) => a + consumo(m), 0), falta = x.ms.length - x.hechos.length;
      const cobrado = x.hechos.reduce((a, m) => a + (importe(m) || 0), 0);
      const dif = r ? Number(r.consumo) - suma : null, pct = r && Number(r.consumo) ? dif / Number(r.consumo) * 100 : null;
      const estadoTxt = !r ? '<span class="tag tag-suave">Falta capturar el recibo</span>' : falta ? `<span class="tag tag-suave">Faltan ${falta} lecturas</span>`
        : Math.abs(pct) <= 8 ? '<span class="tag tag-ok">Cuadra</span>' : `<span class="tag tag-aviso">No cuadra: ${Math.round(pct)} %</span>`;
      return `<section class="panel"><div class="panel-head"><h3>${S.nombre}</h3>${estadoTxt}</div>
        <dl class="lec-dl">
          <dt>Recibo ${esc(r?.compania || S.compania)}</dt><dd>${r ? `${n0(r.consumo)} ${S.unidad} · ${fmt(r.monto)}` : '—'}</dd>
          <dt>Suma de los medidores</dt><dd>${n0(suma)} ${S.unidad}</dd>
          <dt>Diferencia</dt><dd>${dif != null ? `<b>${n0(dif)} ${S.unidad}</b>${pct != null ? ` (${Math.round(pct)} %)` : ''}` : '—'}</dd>
          <dt>Se le cobra a las unidades</dt><dd>${fmt(cobrado)}</dd>
          <dt>Lo absorbe el edificio</dt><dd>${r ? fmt(Number(r.monto) - cobrado) : '—'}</dd>
          <dt>Cómo se cobra</dt><dd>${tarifaDe(x.s).modo === 'prorrateo' ? 'Reparto del recibo' : 'Tarifa'} · ${precioTxt(x.s)}${Number(tarifaDe(x.s).cargo_fijo) ? ` + ${fmt(tarifaDe(x.s).cargo_fijo)} fijo` : ''}</dd>
        </dl>
        ${puede ? `<div class="botones"><button class="btn btn-sm btn-ghost" data-recibo="${x.s}">${r ? 'Corregir recibo' : 'Capturar recibo'}</button>
          <button class="btn btn-sm btn-ghost" data-tarifa="${x.s}">Tarifa</button></div>` : ''}
      </section>`; }).join('')}</div>`;
  el.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => editarRecibo(b.dataset.recibo)));
  el.querySelectorAll('[data-tarifa]').forEach((b) => b.addEventListener('click', () => editarTarifa(b.dataset.tarifa)));
}

function editarRecibo(s) {
  const S = SERV[s], r = reciboDe(s);
  const modal = abrirModal({
    titulo: `Recibo de ${S.nombre.toLowerCase()} · ${mesTxt(st.ym)}`,
    cuerpo: `<form class="form" id="rf" novalidate>
      <label>Compañía<input name="compania" value="${esc(r?.compania || S.compania)}" maxlength="60"></label>
      <div class="form-2"><label>Consumo del recibo (${S.unidad})<input type="number" name="consumo" min="0" step="0.01" value="${r ? Number(r.consumo) : ''}"></label>
        <label>Total a pagar<input type="number" name="monto" min="0" step="0.01" value="${r ? Number(r.monto) : ''}"></label></div>
      <p class="nota">Lo que viene en el recibo que le llega al edificio. El pago del recibo se registra en Gastos como siempre.</p></form>`,
    pie: `<button class="btn btn-ghost" id="rf-no">Cancelar</button><button class="btn btn-primary" id="rf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#rf');
  modal.querySelector('#rf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#rf-si').addEventListener('click', async () => {
    const fila = { org_id: estado.miembro.org_id, centro_id: st.centro, servicio: s, periodo: per(st.ym),
      compania: f.compania.value.trim() || S.compania, consumo: Number(f.consumo.value) || 0, monto: Number(f.monto.value) || 0 };
    const { error } = await db().from('recibos_servicio').upsert(fila, { onConflict: 'centro_id,servicio,periodo' });
    if (error) return toast('No se pudo guardar: ' + error.message, true);
    cerrarModal(); toast('Recibo guardado ✓'); cargar();
  });
}

function editarTarifa(s) {
  const S = SERV[s], t = tarifaDe(s);
  const modal = abrirModal({
    titulo: `Cómo se cobra la ${S.nombre.toLowerCase()}`,
    cuerpo: `<form class="form" id="tf" novalidate>
      <label class="opcion"><input type="radio" name="modo" value="tarifa" ${t.modo !== 'prorrateo' ? 'checked' : ''}><span><b>Tarifa fija</b><small>Un precio por ${S.unidad}, el mismo para todos.</small></span></label>
      <label class="opcion"><input type="radio" name="modo" value="prorrateo" ${t.modo === 'prorrateo' ? 'checked' : ''}><span><b>Repartir el recibo real</b><small>Cada unidad paga su parte del recibo de la compañía según lo que consumió.</small></span></label>
      <div class="form-2"><label>Precio por ${S.unidad} <small>(tarifa fija)</small><input type="number" name="precio" min="0" step="0.0001" value="${Number(t.precio || 0)}"></label>
        <label>Cargo fijo al mes <small>(opcional)</small><input type="number" name="cargo" min="0" step="0.01" value="${Number(t.cargo_fijo || 0)}"></label></div></form>`,
    pie: `<button class="btn btn-ghost" id="tf-no">Cancelar</button><button class="btn btn-primary" id="tf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#tf');
  modal.querySelector('#tf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#tf-si').addEventListener('click', async () => {
    const { error } = await db().from('tarifas_servicio').upsert({ org_id: estado.miembro.org_id, centro_id: st.centro, servicio: s,
      modo: f.modo.value, precio: Number(f.precio.value) || 0, cargo_fijo: Number(f.cargo.value) || 0 }, { onConflict: 'centro_id,servicio' });
    if (error) return toast('No se pudo guardar: ' + error.message, true);
    cerrarModal(); toast('Tarifa guardada ✓'); cargar();
  });
}

// ----- cobro por unidad -----
function pintarCobro(el) {
  const filas = unidades.map((u) => {
    const ms = medidores.filter((m) => m.unidad_id === u.id);
    if (!ms.length) return null;
    const imp = Object.fromEntries(Object.keys(SERV).map((s) => { const m = ms.find((x) => x.servicio === s); return [s, m ? importe(m) : undefined]; }));
    const falta = ms.some((m) => !lecturaDe(m) || importe(m) == null), revisar = ms.some((m) => lecturaDe(m)?.estado === 'revisar');
    return { u, ms, imp, total: Object.values(imp).reduce((a, b) => a + (b || 0), 0), falta, revisar };
  }).filter(Boolean).filter((r) => !st.q || normalizar(`${r.u.identificador} ${ocupante(r.u.id)}`).includes(normalizar(st.q)))
    .sort((a, b) => a.u.identificador.localeCompare(b.u.identificador, 'es', { numeric: true }));
  const listos = filas.filter((r) => !r.falta && !r.revisar);
  el.innerHTML = `<div class="kpis kpis-3">
      <div class="kpi"><span>A cobrar a las unidades</span><strong>${fmt(filas.reduce((a, r) => a + r.total, 0))}</strong><small>${mesTxt(st.ym)}</small></div>
      <div class="kpi"><span>Listas para cobrar</span><strong>${listos.length} / ${filas.length}</strong><small>con sus lecturas completas y revisadas</small></div>
      <div class="kpi"><span>Recibos de las compañías</span><strong>${fmt(Object.keys(SERV).reduce((a, s) => a + Number(reciboDe(s)?.monto || 0), 0))}</strong><small>lo que paga el edificio</small></div>
    </div>
    <section class="panel"><div class="panel-head"><h3>Aviso de cobro por unidad</h3>
      <input type="search" id="cb-q" placeholder="Buscar unidad o inquilino" value="${esc(st.q)}" aria-label="Buscar"></div>
      <div class="tabla-wrap"><table class="tabla lec-t"><thead><tr><th>Unidad</th><th class="num">Luz</th><th class="num">Gas</th><th class="num">Agua</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>${filas.map((r) => `<tr><td data-l="Unidad"><b>${esc(r.u.identificador)}</b><br><small>${esc(ocupante(r.u.id) || 'Sin inquilino')}</small></td>
        ${Object.keys(SERV).map((s) => `<td data-l="${SERV[s].nombre}" class="num">${r.imp[s] === undefined ? '<small>—</small>' : r.imp[s] == null ? '<small>falta</small>' : fmt(r.imp[s])}</td>`).join('')}
        <td data-l="Total" class="num"><b>${fmt(r.total)}</b></td>
        <td data-l="" class="nowrap">${r.revisar ? '<span class="tag tag-aviso">Revisar</span> ' : r.falta ? '<span class="tag tag-suave">Incompleto</span> ' : ''}<button class="btn btn-sm btn-ghost" data-aviso="${r.u.id}">PDF</button></td></tr>`).join('')}</tbody></table></div>
    </section>`;
  el.querySelector('#cb-q').addEventListener('change', (e) => { st.q = e.target.value; pintarCobro(el); });
  el.querySelectorAll('[data-aviso]').forEach((b) => b.addEventListener('click', () => avisoCobro(unidades.find((u) => u.id === b.dataset.aviso))));
}

async function avisoCobro(u) {
  const w = abrirVentanaRecibo();
  if (!w) return toast('Permite ventanas emergentes para ver el aviso', true);
  const ms = medidores.filter((m) => m.unidad_id === u.id);
  const centro = estado.centros.find((c) => c.id === st.centro)?.nombre || '';
  const lineas = ms.filter((m) => importe(m) != null).map((m) => {
    const S = SERV[m.servicio], c = consumo(m), l = lecturaDe(m);
    return { concepto: S.nombre, detalle: `Lectura ${n0(anterior(m))} → ${n0(l.lectura)} · ${n0(c)} ${S.unidad}`,
      cantidad: `${n0(c)} ${S.unidad}`, precioTexto: precioTxt(m.servicio), precio: 0, subtotal: importe(m) };
  });
  const quien = ocupante(u.id) || u.identificador;
  await pintarRecibo(w, {
    titulo: `Aviso de cobro ${u.identificador} ${mesTxt(st.ym)}`, encabezado: 'AVISO DE COBRO', folio: `SRV-${st.ym.replace('-', '')}-${u.identificador.replace(/\D/g, '')}`,
    fecha: hoyISO(), sinIva: true, totalTexto: 'TOTAL A PAGAR:', estadoTexto: 'SERVICIOS DE ' + mesTxt(st.ym).toUpperCase(),
    colCantidad: 'Consumo', colPrecio: 'Precio',
    info: [['A nombre de', quien], ['Unidad', `${u.identificador} · ${centro}`], ['Periodo', mesTxt(st.ym)], ['Concepto', 'Luz, gas y agua según medidor']],
    lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), moneda: 'MXN',
    aviso: 'Las lecturas se tomaron con foto del medidor; si tiene dudas sobre su consumo, pida la foto de su lectura.',
    pie: 'Aviso de cobro de servicios • Consérvelo para sus registros',
  });
}

// ----- medidores y placas -----
function pintarMedidores(el) {
  const puede = tieneRol(['administracion']);
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-ghost" id="md-placas">Imprimir placas QR</button>${puede ? '<button class="btn btn-primary" id="md-nuevo">＋ Medidor</button>' : ''}`;
  document.getElementById('md-placas').addEventListener('click', imprimirPlacas);
  document.getElementById('md-nuevo')?.addEventListener('click', () => editarMedidor(null));
  const filas = medidores.filter((m) => !st.q || normalizar(`${nombreUnidad(m)} ${m.serie || ''}`).includes(normalizar(st.q)));
  el.innerHTML = `<section class="panel"><div class="panel-head"><h3>${medidores.length} medidores</h3>
      <input type="search" id="md-q" placeholder="Buscar unidad o serie" value="${esc(st.q)}" aria-label="Buscar"></div>
    <p class="nota" style="margin-bottom:10px">Cada medidor lleva una placa con su código QR, el servicio y la unidad en grande, y el número de serie. Al escanearla se abre la captura de ese medidor.</p>
    <div class="tabla-wrap"><table class="tabla lec-t"><thead><tr><th>Unidad</th><th>Servicio</th><th>Serie</th><th>Dónde está</th><th class="num">Orden</th><th></th></tr></thead>
    <tbody>${filas.map((m) => `<tr><td data-l="Unidad"><b>${esc(nombreUnidad(m))}</b></td><td data-l="Servicio">${SERV[m.servicio].nombre}</td><td data-l="Serie" class="mono">${esc(m.serie || '—')}</td>
      <td data-l="Dónde">${esc(m.zona || '')}</td><td data-l="Orden" class="num">${m.orden}</td>
      <td data-l="">${puede ? `<button class="icon-btn" data-ed="${m.id}" aria-label="Editar">✎</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  el.querySelector('#md-q').addEventListener('change', (e) => { st.q = e.target.value; pintarMedidores(el); });
  el.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => editarMedidor(medidores.find((m) => m.id === b.dataset.ed))));
}

function editarMedidor(m) {
  const modal = abrirModal({
    titulo: m ? `Medidor de ${SERV[m.servicio].nombre.toLowerCase()} · ${nombreUnidad(m)}` : 'Nuevo medidor',
    cuerpo: `<form class="form" id="mf" novalidate>
      <div class="form-2"><label>Unidad<select name="unidad">${[...unidades].sort((a, b) => a.identificador.localeCompare(b.identificador, 'es', { numeric: true }))
        .map((u) => `<option value="${u.id}" ${m?.unidad_id === u.id ? 'selected' : ''}>${esc(u.identificador)}</option>`).join('')}</select></label>
      <label>Servicio<select name="servicio">${Object.entries(SERV).map(([k, v]) => `<option value="${k}" ${m?.servicio === k ? 'selected' : ''}>${v.nombre}</option>`).join('')}</select></label></div>
      <div class="form-2"><label>Número de serie<input name="serie" value="${esc(m?.serie || '')}" maxlength="40"></label>
      <label>Lectura inicial<input type="number" name="inicial" min="0" step="0.01" value="${m ? Number(m.lectura_inicial) : ''}"></label></div>
      <div class="form-2"><label>Dónde está<input name="zona" value="${esc(m?.zona || '')}" maxlength="60" placeholder="Cuarto de medidores (sótano)"></label>
      <label>Orden en la zona<input type="number" name="orden" min="0" step="1" value="${m?.orden ?? medidores.length + 1}"></label></div></form>`,
    pie: `${m ? '<button class="btn btn-ghost peligro" id="mf-baja">Dar de baja</button>' : ''}<button class="btn btn-ghost" id="mf-no">Cancelar</button><button class="btn btn-primary" id="mf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#mf');
  modal.querySelector('#mf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#mf-baja')?.addEventListener('click', async () => {
    const { error } = await db().from('medidores').update({ activo: false }).eq('id', m.id);
    if (error) return toast('No se pudo: ' + error.message, true);
    cerrarModal(); toast('Medidor dado de baja'); cargar();
  });
  modal.querySelector('#mf-si').addEventListener('click', async () => {
    const fila = { unidad_id: f.unidad.value, servicio: f.servicio.value, serie: f.serie.value.trim() || null, lectura_inicial: Number(f.inicial.value) || 0,
      zona: f.zona.value.trim() || SERV[f.servicio.value].zona, orden: Number(f.orden.value) || 0 };
    const { error } = m ? await db().from('medidores').update(fila).eq('id', m.id)
      : await db().from('medidores').insert({ ...fila, org_id: estado.miembro.org_id, centro_id: st.centro, activo: true });
    if (error) return toast(error.code === '23505' ? 'Esa unidad ya tiene medidor de ese servicio' : 'No se pudo guardar: ' + error.message, true);
    cerrarModal(); toast('Medidor guardado ✓'); cargar();
  });
}

// Hoja de placas lista para imprimir o mandar al grabador (QR = "MED:<id>")
function imprimirPlacas() {
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para ver las placas', true);
  const centro = estado.centros.find((c) => c.id === st.centro)?.nombre || '';
  const qrLib = new URL('js/vendor/qrcode.min.js', location.href).href;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Placas QR · ${esc(centro)}</title>
<style>@page{size:letter;margin:10mm} body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#fff}
.barra{position:sticky;top:0;background:#141414;color:#fff;padding:10px;display:flex;gap:10px;align-items:center;justify-content:center;font-size:14px}
.barra button{font:700 14px Arial;padding:8px 14px;border:0;border-radius:4px;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(3,62mm);gap:6mm;justify-content:center;padding:8mm}
.p{border:2px solid #141414;border-radius:3mm;padding:3mm;display:grid;justify-items:center;gap:1.5mm;break-inside:avoid;background:#f5c518}
.p.luz{background:#f5c518}.p.gas{background:#f2a54a}.p.agua{background:#7cc4f0}
.s{font-weight:800;font-size:13pt;letter-spacing:.15em}.q{background:#fff;padding:2mm;line-height:0}.u{font-weight:800;font-size:15pt;text-align:center}
.n{font:600 7.5pt monospace}.z{font-size:7pt}
@media print{.barra{display:none}}</style><script src="${qrLib}"><\/script></head><body>
<div class="barra">${medidores.length} placas · ${esc(centro)} <button onclick="print()">Imprimir</button></div>
<div class="grid">${medidores.map((m) => `<div class="p ${m.servicio}"><div class="s">${SERV[m.servicio].nombre.toUpperCase()}</div><div class="q" data-qr="MED:${m.id}"></div>
  <div class="u">${esc(nombreUnidad(m))}</div><div class="n">SERIE ${esc(m.serie || '—')}</div><div class="z">${esc(centro)} · ${esc(m.zona || '')}</div></div>`).join('')}</div>
<script>window.addEventListener('load',function(){document.querySelectorAll('[data-qr]').forEach(function(e){new QRCode(e,{text:e.dataset.qr,width:110,height:110,correctLevel:QRCode.CorrectLevel.M})})})<\/script>
</body></html>`);
  w.document.close();
}
