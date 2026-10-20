// Prospectos de MEDCO: quién pidió cotización, de dónde vino (Google, Instagram, Facebook, la página…) y en qué va.
// Estados de un toque: nuevo → calificado / no calificado → cotizado → ganado / perdido.
// Pestaña Publicidad: lo invertido por semana en Google y Meta contra los contactos que trajo cada uno.
// Tablas: prospectos, inversion_publicidad. Los tiempos (primera respuesta, calificado) los anota la base (0024).
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';
import { MESES } from '../config.js';

export const ESTADOS = {
  nuevo:         { t: 'Nuevo',          c: 'tag-aviso' },
  calificado:    { t: 'Calificado',     c: 'tag-ok' },
  no_calificado: { t: 'No calificado',  c: 'tag-suave' },
  cotizado:      { t: 'Cotizado',       c: 'tag-azul' },
  ganado:        { t: 'Ganado',         c: 'tag-ok' },
  perdido:       { t: 'Perdido',        c: 'tag-suave' },
};
// Siguiente paso posible desde cada estado (los botones de un toque)
const SIGUE = {
  nuevo: ['calificado', 'no_calificado'],
  calificado: ['cotizado', 'perdido'],
  no_calificado: ['calificado'],
  cotizado: ['ganado', 'perdido'],
  ganado: [],
  perdido: ['calificado'],
};
export const ORIGENES = {
  google: 'Google', instagram: 'Instagram', facebook: 'Facebook', web: 'Página web',
  whatsapp: 'WhatsApp directo', recomendacion: 'Recomendación', otro: 'Otro',
};
const PLATAFORMA_DE = (o) => (o === 'google' ? 'google' : ['instagram', 'facebook'].includes(o) ? 'meta' : 'organico');
const PLATAFORMAS = { google: 'Google Ads', meta: 'Meta (Instagram y Facebook)', organico: 'Sin anuncio' };
const TIPOS = ['Nave o bodega', 'Plaza o locales', 'Estructura metálica', 'Edificio u oficinas', 'Otro'];
const TERRENO = { si: 'Tiene terreno', buscando: 'Buscando terreno', no: 'Sin terreno' };
const CUANDO = { ya: 'Este trimestre', '3_meses': 'En 3 meses', '6_meses': 'En 6 meses', explorando: 'Solo cotizando' };
const MOTIVOS = ['Precio', 'Eligió a otro', 'No contestó', 'Lo pospuso', 'Fuera de zona', 'No es lo que hacemos'];
const UNA_HORA = 3600e3;
const YA_CONTESTADO = ['whatsapp', 'recomendacion', 'otro'];

const FILTROS = {
  atender:   { t: 'Por atender', f: (p) => p.estado === 'nuevo' },
  activos:   { t: 'En proceso',  f: (p) => ['calificado', 'cotizado'].includes(p.estado) },
  ganado:    { t: 'Ganados',     f: (p) => p.estado === 'ganado' },
  cerrados:  { t: 'Descartados', f: (p) => ['no_calificado', 'perdido'].includes(p.estado) },
  todos:     { t: 'Todos',       f: () => true },
};

const st = { vista: 'lista', filtro: 'atender', origen: '', q: '', mes: hoyISO().slice(0, 7) };
let raiz, pros = [], inversion = [];

export async function render(view) {
  raiz = view;
  document.getElementById('page-actions').innerHTML = puede() ? '<button class="btn btn-primary" id="p-nuevo">＋ Prospecto</button>' : '';
  document.getElementById('p-nuevo')?.addEventListener('click', () => editar(null));
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  await cargar();
}
const puede = () => tieneRol(['administracion']);

async function cargar() {
  const [p, i] = await Promise.all([
    todo(() => db().from('prospectos').select('*')),
    todo(() => db().from('inversion_publicidad').select('*')),
  ]);
  if (p.error || i.error) {
    raiz.innerHTML = `<div class="vacio">No se pudieron cargar los prospectos: ${esc((p.error || i.error).message)}</div>`;
    return;
  }
  pros = p.data.sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  inversion = i.data.sort((a, b) => b.semana.localeCompare(a.semana));
  // Si no hay nada por atender, abrir directo en "En proceso" (o "Todos")
  if (st.filtro === 'atender' && !pros.some(FILTROS.atender.f)) st.filtro = pros.some(FILTROS.activos.f) ? 'activos' : 'todos';
  pintar();
  avisoMenu();
}

// ---------- utilidades ----------
const sinContestar = (p) => p.estado === 'nuevo' && !p.primera_respuesta;
const tarde = (p) => sinContestar(p) && Date.now() - new Date(p.creado_en).getTime() > UNA_HORA;
export const esCalificado = (p) => !!p.calificado_en || ['calificado', 'cotizado', 'ganado'].includes(p.estado);

function hace(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d < 8 ? `hace ${d} día${d === 1 ? '' : 's'}` : fmtFecha(iso.slice(0, 10));
}
function duracion(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return h < 24 ? `${h.toFixed(h < 10 ? 1 : 0)} h` : `${Math.round(h / 24)} días`;
}
// Número para wa.me: solo dígitos; los de 10 dígitos son de México (52)
export function waNumero(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return '52' + d;
  if (d.length === 12 && d.startsWith('52')) return d;
  if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
  return d;
}
const lunesDe = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const etiquetaMes = (ym) => `${MESES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;

// Contador en el menú: cuántos llevan más de una hora sin respuesta
function avisoMenu() {
  const a = document.querySelector('#nav a[data-mod="prospectos"]');
  if (!a) return;
  a.querySelector('.nav-badge')?.remove();
  const n = pros.filter(tarde).length;
  if (n) a.insertAdjacentHTML('beforeend', `<span class="nav-badge" title="Sin contestar hace más de 1 hora">${n}</span>`);
}

// ---------- pantalla ----------
function pintar() {
  raiz.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        <button role="tab" data-vista="lista" aria-selected="${st.vista === 'lista'}">Prospectos</button>
        <button role="tab" data-vista="publicidad" aria-selected="${st.vista === 'publicidad'}">Publicidad</button>
      </div>
      <div class="sub-meta">${st.vista === 'lista' ? 'Lo que entra por la página y los anuncios llega aquí solo' : 'Cuánto cuesta cada contacto serio, por plataforma'}</div>
    </div>
    <div id="p-cuerpo"></div>`;
  raiz.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.vista; pintar(); }));
  const el = raiz.querySelector('#p-cuerpo');
  st.vista === 'lista' ? lista(el) : publicidad(el);
}

function lista(el) {
  const mes = hoyISO().slice(0, 7);
  const delMes = pros.filter((p) => p.creado_en.slice(0, 7) === mes);
  const atrasados = pros.filter(tarde);
  const ganadosMes = delMes.filter((p) => p.estado === 'ganado');

  let l = pros.filter(FILTROS[st.filtro].f);
  if (st.origen) l = l.filter((p) => p.origen === st.origen);
  if (st.q) l = l.filter((p) => normalizar(`${p.nombre} ${p.empresa || ''} ${p.whatsapp || ''} ${p.ubicacion || ''} ${p.tipo_obra || ''}`).includes(normalizar(st.q)));

  el.innerHTML = `
    ${atrasados.length ? `<div class="alerta-roja" role="alert"><b>${atrasados.length} ${atrasados.length === 1 ? 'prospecto lleva' : 'prospectos llevan'} más de una hora sin respuesta.</b>
      Contestar rápido es lo que más pesa en que un contacto se vuelva obra.
      <button class="btn btn-sm btn-primary" id="p-ver-atender">Ver</button></div>` : ''}
    <div class="kpis">
      <div class="kpi"><span>Contactos en ${MESES[Number(mes.slice(5)) - 1].toLowerCase()}</span><strong>${delMes.length}</strong><small>${delMes.filter((p) => PLATAFORMA_DE(p.origen) !== 'organico').length} de anuncios</small></div>
      <div class="kpi"><span>Calificados</span><strong class="pos">${delMes.filter(esCalificado).length}</strong><small>tienen terreno o fecha para empezar</small></div>
      <div class="kpi"><span>Por atender</span><strong class="${pros.filter(FILTROS.atender.f).length ? 'neg' : ''}">${pros.filter(FILTROS.atender.f).length}</strong><small>${atrasados.length ? `${atrasados.length} con más de 1 hora` : 'al día'}</small></div>
      <div class="kpi"><span>Ganados en el mes</span><strong class="pos">${ganadosMes.length}</strong><small>${fmt(ganadosMes.reduce((s, p) => s + Number(p.monto || 0), 0))}</small></div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <div class="tabs" role="tablist" aria-label="Filtro de prospectos">
          ${Object.entries(FILTROS).map(([k, f]) => `<button role="tab" data-filtro="${k}" aria-selected="${st.filtro === k}">${f.t} <small>${pros.filter(f.f).length}</small></button>`).join('')}
        </div>
        <div class="filtros filtros-sm">
          <select id="p-origen" aria-label="Origen"><option value="">Todos los orígenes</option>
            ${Object.entries(ORIGENES).map(([k, t]) => `<option value="${k}" ${st.origen === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <input type="search" id="p-q" placeholder="Buscar nombre, empresa o teléfono" value="${esc(st.q)}" aria-label="Buscar prospecto">
        </div>
      </div>
      <div class="pros-lista">${l.map(tarjeta).join('') || `<div class="vacio">${pros.length ? 'Nada en este filtro.' : 'Todavía no hay prospectos. Los que lleguen por construcciones.medco.mx aparecerán aquí solos; también puedes agregarlos con ＋ Prospecto.'}</div>`}</div>
    </section>`;

  el.querySelector('#p-ver-atender')?.addEventListener('click', () => { st.filtro = 'atender'; st.origen = ''; st.q = ''; pintar(); });
  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { st.filtro = b.dataset.filtro; pintar(); }));
  el.querySelector('#p-origen').addEventListener('change', (e) => { st.origen = e.target.value; pintar(); });
  const q = el.querySelector('#p-q');
  q.addEventListener('input', () => { st.q = q.value; const pos = q.selectionStart; pintar(); const n = raiz.querySelector('#p-q'); n.focus(); n.setSelectionRange(pos, pos); });
  el.querySelectorAll('[data-abrir]').forEach((c) => c.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    editar(pros.find((p) => p.id === c.dataset.abrir));
  }));
  el.querySelectorAll('[data-wa]').forEach((a) => a.addEventListener('click', () => marcarContactado(pros.find((p) => p.id === a.dataset.wa))));
  el.querySelectorAll('[data-paso]').forEach((b) => b.addEventListener('click', () => {
    const [id, nuevo] = b.dataset.paso.split(':');
    cambiarEstado(pros.find((p) => p.id === id), nuevo);
  }));
}

function tarjeta(p) {
  const datos = [p.tipo_obra, p.m2 ? `${Number(p.m2).toLocaleString('es-MX')} m²` : '', TERRENO[p.tiene_terreno], CUANDO[p.cuando], p.ubicacion].filter(Boolean);
  const wa = waNumero(p.whatsapp);
  const msg = `Hola ${p.nombre.split(' ')[0]}, te escribe MEDCO Construcciones. Recibimos tu solicitud${p.tipo_obra ? ` de ${p.tipo_obra.toLowerCase()}` : ''}. ¿Tienes unos minutos para platicar sobre tu proyecto?`;
  const respuesta = p.primera_respuesta ? duracion(new Date(p.primera_respuesta) - new Date(p.creado_en)) : '';
  return `<article class="pros-card${tarde(p) ? ' tarde' : ''}" data-abrir="${p.id}" tabindex="0">
    <div class="pros-top">
      <div class="pros-quien"><b>${esc(p.nombre)}</b>${p.empresa ? `<small>${esc(p.empresa)}</small>` : ''}</div>
      <div class="pros-tags"><span class="tag ${ESTADOS[p.estado].c}">${ESTADOS[p.estado].t}</span><span class="tag tag-origen o-${p.origen}">${ORIGENES[p.origen] || p.origen}</span></div>
    </div>
    ${datos.length ? `<div class="pros-datos">${datos.map((d) => `<span>${esc(d)}</span>`).join('')}</div>` : ''}
    ${p.mensaje ? `<p class="pros-msg">${esc(p.mensaje.length > 160 ? p.mensaje.slice(0, 160) + '…' : p.mensaje)}</p>` : ''}
    <div class="pros-pie">
      <span class="pros-cuando ${tarde(p) ? 'neg fuerte' : ''}">${hace(p.creado_en)}${respuesta ? ` · contestado en ${respuesta}` : sinContestar(p) ? ' · sin contestar' : ''}${p.estado === 'ganado' && p.monto ? ` · ${fmt(p.monto)}` : ''}</span>
      <span class="pros-acc">
        ${wa ? `<a class="btn btn-sm btn-wa" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" data-wa="${p.id}">WhatsApp</a>` : ''}
        ${p.correo && !wa ? `<a class="btn btn-sm btn-ghost" href="mailto:${esc(p.correo)}" data-wa="${p.id}">Correo</a>` : ''}
        ${puede() ? SIGUE[p.estado].map((e) => `<button class="btn btn-sm ${e === 'perdido' || e === 'no_calificado' ? 'btn-ghost' : 'btn-paso'}" data-paso="${p.id}:${e}">${ESTADOS[e].t}</button>`).join('') : ''}
      </span>
    </div>
  </article>`;
}

// ---------- cambios ----------
async function guardar(p, cambios) {
  const { data, error } = await db().from('prospectos').update(cambios).eq('id', p.id).select().single();
  if (error) { toast('No se pudo guardar: ' + error.message, true); return null; }
  Object.assign(p, data);
  return p;
}

async function marcarContactado(p) {
  if (!p || p.primera_respuesta || !puede()) return;
  // Se abre WhatsApp en otra pestaña; aquí solo se anota la hora de la primera respuesta
  await guardar(p, { primera_respuesta: new Date().toISOString() });
  pintar(); avisoMenu();
}

async function cambiarEstado(p, nuevo) {
  if (!p) return;
  if (nuevo === 'ganado') return pedirMonto(p);
  if (nuevo === 'perdido' || nuevo === 'no_calificado') return pedirMotivo(p, nuevo);
  if (await guardar(p, { estado: nuevo })) { toast(`${p.nombre}: ${ESTADOS[nuevo].t.toLowerCase()} ✓`); pintar(); avisoMenu(); }
}

function pedirMonto(p) {
  const modal = abrirModal({
    titulo: `Ganado: ${p.nombre}`,
    cuerpo: `<form class="form" id="pm"><label>Monto del contrato (sin IVA)
        <input type="number" id="pm-monto" min="0" step="1000" value="${p.monto || ''}" placeholder="Ej. 4500000" inputmode="decimal"></label>
      <p class="nota">Sirve para saber cuánto vendieron los anuncios. Cuando arranque la obra, regístrala en Obras como siempre.</p></form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="pm-ok">Marcar ganado</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  modal.querySelector('#pm-ok').addEventListener('click', async () => {
    const m = modal.querySelector('#pm-monto').value;
    if (await guardar(p, { estado: 'ganado', monto: m ? Number(m) : p.monto })) { cerrarModal(); toast('¡Ganado! ✓'); pintar(); avisoMenu(); }
  });
}

function pedirMotivo(p, nuevo) {
  const modal = abrirModal({
    titulo: `${ESTADOS[nuevo].t}: ${p.nombre}`,
    cuerpo: `<form class="form" id="pmo"><span class="nota">¿Por qué? (opcional, ayuda a ajustar los anuncios)</span>
      <div class="chips-elegir">${(nuevo === 'no_calificado' ? ['Solo cotizando', 'Sin terreno ni fecha', 'Obra muy chica', 'Fuera de zona', 'No es lo que hacemos', 'Número equivocado'] : MOTIVOS)
        .map((m) => `<button type="button" class="btn btn-sm btn-ghost" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <label>Otro motivo<input id="pmo-txt" maxlength="300" value="${esc(p.motivo || '')}"></label></form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="pmo-ok">Guardar</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  modal.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { modal.querySelector('#pmo-txt').value = b.dataset.m; }));
  modal.querySelector('#pmo-ok').addEventListener('click', async () => {
    const motivo = modal.querySelector('#pmo-txt').value.trim() || null;
    if (await guardar(p, { estado: nuevo, motivo })) { cerrarModal(); toast(`${p.nombre}: ${ESTADOS[nuevo].t.toLowerCase()}`); pintar(); avisoMenu(); }
  });
}

// ---------- alta y edición ----------
function editar(p) {
  const nuevo = !p;
  const d = p || { nombre: '', empresa: '', whatsapp: '', correo: '', tipo_obra: '', m2: '', tiene_terreno: '', cuando: '', ubicacion: '', origen: 'whatsapp', estado: 'nuevo', notas: '', mensaje: '' };
  const ro = !puede() ? 'disabled' : '';
  const opt = (obj, val, vacio) => `<option value="">${vacio}</option>` + Object.entries(obj).map(([k, t]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${t}</option>`).join('');
  const respuesta = p?.primera_respuesta ? duracion(new Date(p.primera_respuesta) - new Date(p.creado_en)) : null;
  const modal = abrirModal({
    titulo: nuevo ? 'Nuevo prospecto' : p.nombre, ancho: true,
    cuerpo: `<form class="form" id="pf">
      ${!nuevo ? `<div class="pros-ficha">
        <span><b>Llegó</b>${fmtFecha(p.creado_en.slice(0, 10))} · ${new Date(p.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
        <span><b>Origen</b>${ORIGENES[p.origen] || p.origen}${p.utm_campaign ? ` · ${esc(p.utm_campaign)}` : ''}${p.utm_term ? ` · “${esc(p.utm_term)}”` : ''}</span>
        <span><b>Primera respuesta</b>${respuesta ? `en ${respuesta}` : 'pendiente'}</span>
        ${p.calificado_en ? `<span><b>Calificado</b>${fmtFecha(p.calificado_en.slice(0, 10))}</span>` : ''}
      </div>` : ''}
      <div class="form-3">
        <label>Nombre<input name="nombre" required maxlength="120" value="${esc(d.nombre)}" ${ro}></label>
        <label>Empresa<input name="empresa" maxlength="120" value="${esc(d.empresa || '')}" ${ro}></label>
        <label>WhatsApp<input name="whatsapp" type="tel" inputmode="tel" maxlength="30" value="${esc(d.whatsapp || '')}" placeholder="81 1234 5678" ${ro}></label>
      </div>
      <div class="form-3">
        <label>Correo<input name="correo" type="email" maxlength="160" value="${esc(d.correo || '')}" ${ro}></label>
        <label>Tipo de obra<select name="tipo_obra" ${ro}><option value="">—</option>${[...new Set([...TIPOS, d.tipo_obra].filter(Boolean))].map((t) => `<option ${d.tipo_obra === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Metros cuadrados<input name="m2" type="number" min="0" inputmode="decimal" value="${d.m2 ?? ''}" ${ro}></label>
      </div>
      <div class="form-3">
        <label>Terreno<select name="tiene_terreno" ${ro}>${opt(TERRENO, d.tiene_terreno, '—')}</select></label>
        <label>¿Cuándo empieza?<select name="cuando" ${ro}>${opt(CUANDO, d.cuando, '—')}</select></label>
        <label>Ubicación<input name="ubicacion" maxlength="120" value="${esc(d.ubicacion || '')}" placeholder="Apodaca, Escobedo…" ${ro}></label>
      </div>
      <div class="form-3">
        <label>Origen<select name="origen" ${ro}>${Object.entries(ORIGENES).map(([k, t]) => `<option value="${k}" ${d.origen === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Estado<select name="estado" ${ro}>${Object.entries(ESTADOS).map(([k, e]) => `<option value="${k}" ${d.estado === k ? 'selected' : ''}>${e.t}</option>`).join('')}</select></label>
        <label>Monto estimado / contrato<input name="monto" type="number" min="0" step="1000" inputmode="decimal" value="${d.monto ?? ''}" ${ro}></label>
      </div>
      ${d.mensaje ? `<label>Lo que escribió<textarea rows="2" disabled>${esc(d.mensaje)}</textarea></label>` : ''}
      ${!nuevo && d.motivo ? `<label>Motivo<input name="motivo" maxlength="300" value="${esc(d.motivo)}" ${ro}></label>` : ''}
      <label>Notas de seguimiento<textarea name="notas" rows="3" maxlength="4000" placeholder="Qué se habló, cuándo volver a llamar…" ${ro}>${esc(d.notas || '')}</textarea></label>
    </form>`,
    pie: `${!nuevo && tieneRol(['administracion']) ? '<button class="btn btn-ghost peligro" id="pf-borrar">Borrar</button>' : ''}<span style="flex:1"></span>
      <button class="btn btn-ghost" data-cerrar>Cerrar</button>${puede() ? '<button class="btn btn-primary" id="pf-ok">Guardar</button>' : ''}`,
  });
  modal.querySelector('.modal-foot [data-cerrar]').addEventListener('click', cerrarModal);
  modal.querySelector('#pf-borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar a ${p.nombre}? Úsalo solo para pruebas o duplicados; para descartar, márcalo como perdido.`)) return;
    const { error } = await db().from('prospectos').delete().eq('id', p.id);
    if (error) return toast('No se pudo borrar: ' + error.message, true);
    pros = pros.filter((x) => x.id !== p.id); cerrarModal(); toast('Borrado'); pintar(); avisoMenu();
  });
  modal.querySelector('#pf-ok')?.addEventListener('click', async (ev) => {
    const f = modal.querySelector('#pf');
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const reg = {
      nombre: v.nombre.trim(), empresa: v.empresa.trim() || null, whatsapp: v.whatsapp.trim() || null, correo: v.correo.trim().toLowerCase() || null,
      tipo_obra: v.tipo_obra || null, m2: v.m2 ? Number(v.m2) : null, tiene_terreno: v.tiene_terreno || null, cuando: v.cuando || null,
      ubicacion: v.ubicacion.trim() || null, origen: v.origen, estado: v.estado, monto: v.monto ? Number(v.monto) : null,
      notas: v.notas.trim() || null, ...(v.motivo !== undefined ? { motivo: v.motivo.trim() || null } : {}),
    };
    if (!reg.whatsapp && !reg.correo) return toast('Pon al menos WhatsApp o correo', true);
    ev.currentTarget.disabled = true;
    if (nuevo) {
      const emp = estado.empresas.find((e) => e.nombre_corto === 'MEDCO') || estado.empresas[0];
      // Si llegó por WhatsApp, recomendación u otro medio, quien lo captura ya habló con él: no cuenta como "sin contestar"
      const yaContestado = YA_CONTESTADO.includes(reg.origen) ? { primera_respuesta: new Date().toISOString() } : {};
      const { data, error } = await db().from('prospectos').insert({ ...reg, ...yaContestado, org_id: estado.miembro.org_id, empresa_id: emp?.id }).select().single();
      if (error) { ev.currentTarget.disabled = false; return toast('No se pudo guardar: ' + error.message, true); }
      pros.unshift(data);
      st.filtro = FILTROS.atender.f(data) ? 'atender' : 'todos';
    } else if (!(await guardar(p, reg))) { ev.currentTarget.disabled = false; return; }
    cerrarModal(); toast('Guardado ✓'); pintar(); avisoMenu();
  });
}

// ---------- publicidad ----------
function resumenDe(lista, inv) {
  const cal = lista.filter(esCalificado);
  const gan = lista.filter((p) => p.estado === 'ganado');
  const invertido = inv.reduce((s, r) => s + Number(r.monto), 0);
  return {
    invertido, contactos: lista.length, calificados: cal.length,
    cotizados: lista.filter((p) => ['cotizado', 'ganado'].includes(p.estado) || (p.estado === 'perdido' && p.calificado_en)).length,
    ganados: gan.length, vendido: gan.reduce((s, p) => s + Number(p.monto || 0), 0),
    porContacto: lista.length ? invertido / lista.length : null,
    porCalificado: cal.length ? invertido / cal.length : null,
  };
}

function publicidad(el) {
  const meses = [...new Set([hoyISO().slice(0, 7), ...pros.map((p) => p.creado_en.slice(0, 7)), ...inversion.map((r) => r.semana.slice(0, 7))])].sort().reverse();
  if (!meses.includes(st.mes)) st.mes = meses[0];
  const enMes = (iso) => st.mes === 'todo' || iso.slice(0, 7) === st.mes;
  const P = pros.filter((p) => enMes(p.creado_en));
  const I = inversion.filter((r) => enMes(r.semana));
  const tot = resumenDe(P, I);
  const filas = Object.keys(PLATAFORMAS).map((k) => [k, resumenDe(P.filter((p) => PLATAFORMA_DE(p.origen) === k), I.filter((r) => r.plataforma === k))]);
  const tiempos = P.filter((p) => p.primera_respuesta).map((p) => new Date(p.primera_respuesta) - new Date(p.creado_en)).sort((a, b) => a - b);
  const mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : null;
  const enHora = tiempos.filter((t) => t <= UNA_HORA).length;

  // Contactos y calificados por semana (lunes), últimas 12 semanas con datos
  const semanas = new Map();
  [...P.map((p) => lunesDe(p.creado_en.slice(0, 10))), ...I.map((r) => r.semana)].forEach((s) => semanas.set(s, { c: 0, q: 0, inv: 0 }));
  P.forEach((p) => { const w = semanas.get(lunesDe(p.creado_en.slice(0, 10))); w.c++; if (esCalificado(p)) w.q++; });
  I.forEach((r) => { semanas.get(r.semana).inv += Number(r.monto); });
  const sem = [...semanas.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const maxC = Math.max(1, ...sem.map(([, w]) => w.c));
  const motivos = new Map();
  P.filter((p) => p.motivo && ['perdido', 'no_calificado'].includes(p.estado)).forEach((p) => motivos.set(p.motivo, (motivos.get(p.motivo) || 0) + 1));
  const n = (x) => (x == null ? '—' : fmt(x));

  el.innerHTML = `
    <div class="filtros" style="margin-bottom:12px">
      <select id="pp-mes" aria-label="Periodo">${meses.map((m) => `<option value="${m}" ${st.mes === m ? 'selected' : ''}>${etiquetaMes(m)}</option>`).join('')}
        <option value="todo" ${st.mes === 'todo' ? 'selected' : ''}>Desde el inicio</option></select>
      ${puede() ? '<button class="btn btn-ghost" id="pp-inv">＋ Registrar inversión</button><button class="btn btn-ghost" id="p-meta" title="Sube el archivo de contactos que descargas de Meta">Importar contactos de Meta</button>' : ''}
    </div>
    <div class="kpis">
      <div class="kpi"><span>Invertido en anuncios</span><strong>${fmt(tot.invertido)}</strong><small>Google ${fmt(filas[0][1].invertido)} · Meta ${fmt(filas[1][1].invertido)}</small></div>
      <div class="kpi"><span>Contactos</span><strong>${tot.contactos}</strong><small>${tot.porContacto != null ? `${fmt(tot.porContacto)} cada uno` : 'sin inversión registrada'}</small></div>
      <div class="kpi"><span>Costo por contacto calificado</span><strong>${n(tot.porCalificado)}</strong><small>${tot.calificados} calificados</small></div>
      <div class="kpi"><span>Obras ganadas</span><strong class="pos">${tot.ganados}</strong><small>${fmt(tot.vendido)} vendido</small></div>
    </div>

    <section class="panel">
      <div class="panel-head"><h3>Por plataforma</h3><span class="sub-meta">“Sin anuncio” = página web, WhatsApp directo y recomendaciones</span></div>
      <div class="tabla-wrap"><table class="tabla tabla-pub">
        <thead><tr><th>Plataforma</th><th class="num">Invertido</th><th class="num">Contactos</th><th class="num">Calificados</th><th class="num">Costo por calificado</th><th class="num">Cotizados</th><th class="num">Ganados</th><th class="num">Vendido</th></tr></thead>
        <tbody>${filas.map(([k, r]) => `<tr>
          <td data-l="Concepto"><b>${PLATAFORMAS[k]}</b></td>
          <td class="num" data-l="Invertido">${k === 'organico' ? '—' : fmt(r.invertido)}</td>
          <td class="num" data-l="Contactos">${r.contactos}</td>
          <td class="num" data-l="Calificados">${r.calificados}${r.contactos ? ` <small class="mut">${Math.round(r.calificados / r.contactos * 100)}%</small>` : ''}</td>
          <td class="num fuerte" data-l="Costo por calificado">${k === 'organico' ? '—' : n(r.porCalificado)}</td>
          <td class="num" data-l="Cotizados">${r.cotizados}</td>
          <td class="num" data-l="Ganados">${r.ganados}</td>
          <td class="num" data-l="Monto">${fmt(r.vendido)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${fmt(tot.invertido)}</td><td class="num">${tot.contactos}</td><td class="num">${tot.calificados}</td><td class="num">${n(tot.porCalificado)}</td><td class="num">${tot.cotizados}</td><td class="num">${tot.ganados}</td><td class="num">${fmt(tot.vendido)}</td></tr></tfoot>
      </table></div>
    </section>

    <div class="grid-2">
      <section class="panel"><h3>Contactos por semana</h3>
        ${sem.length ? `<ul class="barras">${sem.map(([s, w]) => `<li><span class="barra-nombre">Sem. ${fmtFecha(s).slice(0, 5)}${w.inv ? ` <small class="mut">${fmt(w.inv)}</small>` : ''}</span>
          <span class="barra-pista"><span style="width:${Math.max(2, w.c / maxC * 100)}%"></span></span><span class="barra-monto">${w.c} <small class="mut">${w.q} calif.</small></span></li>`).join('')}</ul>`
          : '<div class="vacio">Sin datos en este periodo</div>'}
      </section>
      <section class="panel"><h3>Tiempo de respuesta</h3>
        ${tiempos.length ? `<div class="kpi-linea"><span>Lo normal (mediana)</span><b>${duracion(mediana)}</b></div>
          <div class="kpi-linea"><span>Contestados en menos de 1 hora</span><b>${enHora} de ${tiempos.length}</b></div>
          <div class="kpi-linea"><span>Siguen sin respuesta</span><b class="${P.filter(sinContestar).length ? 'neg' : ''}">${P.filter(sinContestar).length}</b></div>` : '<div class="vacio">Todavía no hay respuestas registradas</div>'}
        ${motivos.size ? `<h3 style="margin-top:16px">Por qué se descartan</h3><ul class="barras">${[...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m, c]) =>
          `<li><span class="barra-nombre">${esc(m)}</span><span class="barra-pista"><span style="width:${c / Math.max(...motivos.values()) * 100}%"></span></span><span class="barra-monto">${c}</span></li>`).join('')}</ul>` : ''}
      </section>
    </div>

    <section class="panel">
      <div class="panel-head"><h3>Inversión registrada</h3><span class="sub-meta">Lo que cobraron Google y Meta cada semana (lunes a domingo)</span></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Semana</th><th>Plataforma</th><th>Notas</th><th class="num">Monto</th><th></th></tr></thead>
        <tbody>${I.map((r) => `<tr>
          <td class="nowrap" data-l="Fecha">${fmtFecha(r.semana)}</td>
          <td data-l="Concepto">${r.plataforma === 'google' ? 'Google Ads' : 'Meta'}</td>
          <td class="mut" data-l="Notas">${esc(r.notas || '')}</td>
          <td class="num fuerte" data-l="Monto">${fmt(r.monto)}</td>
          <td class="acciones">${puede() ? `<button class="btn btn-sm btn-ghost" data-inv="${r.id}">Editar</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="5" class="vacio">Sin inversión registrada en este periodo</td></tr>'}</tbody>
      </table></div>
    </section>`;

  el.querySelector('#pp-mes').addEventListener('change', (e) => { st.mes = e.target.value; pintar(); });
  el.querySelector('#pp-inv')?.addEventListener('click', () => editarInversion(null));
  el.querySelector('#p-meta')?.addEventListener('click', importarMeta);
  el.querySelectorAll('[data-inv]').forEach((b) => b.addEventListener('click', () => editarInversion(inversion.find((r) => r.id === b.dataset.inv))));
}

function editarInversion(r) {
  const nuevo = !r;
  const modal = abrirModal({
    titulo: nuevo ? 'Registrar inversión' : 'Editar inversión',
    cuerpo: `<form class="form" id="pi">
      <div class="form-2">
        <label>Semana (cualquier día)<input type="date" name="semana" required value="${r?.semana || lunesDe(hoyISO())}"></label>
        <label>Plataforma<select name="plataforma"><option value="google" ${r?.plataforma === 'google' ? 'selected' : ''}>Google Ads</option><option value="meta" ${r?.plataforma === 'meta' ? 'selected' : ''}>Meta (Instagram y Facebook)</option></select></label>
      </div>
      <label>Monto gastado (con IVA, como lo cobran)<input type="number" name="monto" min="0" step="0.01" inputmode="decimal" required value="${r?.monto ?? ''}"></label>
      <label>Notas<input name="notas" maxlength="300" value="${esc(r?.notas || '')}" placeholder="Campaña, cambios de esa semana…"></label>
      <p class="nota">Se guarda en la semana de lunes a domingo. Si ya hay un registro de esa semana y plataforma, se reemplaza.</p>
    </form>`,
    pie: `${!nuevo ? '<button class="btn btn-ghost peligro" id="pi-borrar">Borrar</button>' : ''}<span style="flex:1"></span><button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="pi-ok">Guardar</button>`,
  });
  modal.querySelector('.modal-foot [data-cerrar]').addEventListener('click', cerrarModal);
  modal.querySelector('#pi-borrar')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar este registro de inversión?')) return;
    const { error } = await db().from('inversion_publicidad').delete().eq('id', r.id);
    if (error) return toast('No se pudo borrar: ' + error.message, true);
    inversion = inversion.filter((x) => x.id !== r.id); cerrarModal(); pintar();
  });
  modal.querySelector('#pi-ok').addEventListener('click', async (ev) => {
    const f = modal.querySelector('#pi');
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const reg = { org_id: estado.miembro.org_id, empresa_id: (estado.empresas.find((e) => e.nombre_corto === 'MEDCO') || estado.empresas[0])?.id,
      semana: lunesDe(v.semana), plataforma: v.plataforma, monto: Number(v.monto), notas: v.notas.trim() || null };
    ev.currentTarget.disabled = true;
    const q = nuevo
      ? db().from('inversion_publicidad').upsert(reg, { onConflict: 'org_id,semana,plataforma' }).select().single()
      : db().from('inversion_publicidad').update(reg).eq('id', r.id).select().single();
    const { data, error } = await q;
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo guardar: ' + (error.code === '23505' ? 'ya hay un registro de esa semana y plataforma' : error.message), true); }
    inversion = [data, ...inversion.filter((x) => x.id !== data.id)].sort((a, b) => b.semana.localeCompare(a.semana));
    st.mes = data.semana.slice(0, 7);
    cerrarModal(); toast('Inversión guardada ✓'); pintar();
  });
}

// ---------- importar contactos del formulario de Meta (Instagram / Facebook) ----------
// En Meta: Administrador de anuncios → Centro de clientes potenciales (o el formulario) → Descargar (CSV).
// El archivo viene en UTF-16 con tabuladores o en UTF-8 con comas; se aceptan los dos.
function leerArchivo(file) {
  return file.arrayBuffer().then((buf) => {
    const b = new Uint8Array(buf);
    const enc = b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8';
    return new TextDecoder(enc).decode(buf).replace(/^\uFEFF/, '');
  });
}
export function parsearCSV(txt) {
  const primera = txt.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/\t/g) || []).length > (primera.match(/,/g) || []).length ? '\t' : ',';
  const filas = []; let fila = [], campo = '', comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x.trim())) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo); if (fila.some((x) => x.trim())) filas.push(fila);
  if (!filas.length) return [];
  const enc = filas[0].map((h) => normalizar(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return filas.slice(1).map((f) => Object.fromEntries(enc.map((h, i) => [h, (f[i] ?? '').trim()])));
}
// Meta antepone "p:" a los teléfonos y a veces "<test lead: …>" a los de prueba
const limpio = (x) => String(x || '').replace(/^p:/, '').trim();
const campo = (r, ...claves) => {
  for (const k of claves) {
    const hit = Object.keys(r).find((h) => h === k || h.includes(k));
    if (hit && limpio(r[hit])) return limpio(r[hit]);
  }
  return '';
};
function valorTipo(t) {
  const n = normalizar(t);
  if (!n) return null;
  if (/nave|bodega|industrial/.test(n)) return 'Nave o bodega';
  if (/plaza|local/.test(n)) return 'Plaza o locales';
  if (/estructura|metal/.test(n)) return 'Estructura metálica';
  if (/edificio|oficina/.test(n)) return 'Edificio u oficinas';
  return 'Otro';
}
function valorTerreno(t) {
  const n = normalizar(t);
  if (!n) return null;
  if (/proceso|buscando/.test(n)) return 'buscando';
  if (/^s[ií]?\b|^si|yes/.test(n)) return 'si';
  if (/^no/.test(n)) return 'no';
  return null;
}
function valorCuando(t) {
  const n = normalizar(t);
  if (!n) return null;
  if (/cotiz|explor/.test(n)) return 'explorando';
  if (/trimestre|ya|inmediat|mes(?!es)/.test(n) && !/6/.test(n)) return 'ya';
  if (/6|seis|ano/.test(n)) return '6_meses';
  if (/3|tres/.test(n)) return '3_meses';
  return null;
}
export function deMeta(r) {
  const plataforma = normalizar(campo(r, 'platform'));
  const nombre = campo(r, 'full_name', 'nombre_completo', 'nombre') || [campo(r, 'first_name'), campo(r, 'last_name')].filter(Boolean).join(' ');
  const tel = campo(r, 'phone_number', 'telefono', 'whatsapp', 'phone');
  const correo = campo(r, 'email', 'correo').toLowerCase();
  const fecha = Date.parse(campo(r, 'created_time'));
  const m2 = Number(campo(r, 'metros', 'm2', 'superficie').replace(/[^0-9.]/g, ''));
  const leadId = campo(r, 'id').replace(/^l:/, '');
  return {
    nombre: nombre.slice(0, 120), empresa: campo(r, 'company_name', 'empresa').slice(0, 120) || null,
    whatsapp: tel.slice(0, 30) || null, correo: /^\S+@\S+\.\S+$/.test(correo) ? correo.slice(0, 160) : null,
    tipo_obra: valorTipo(campo(r, 'construir', 'tipo_de_obra', 'tipo_obra', 'proyecto')),
    m2: m2 > 0 ? m2 : null,
    tiene_terreno: valorTerreno(campo(r, 'terreno')),
    cuando: valorCuando(campo(r, 'empezar', 'cuando', 'inicio')),
    ubicacion: campo(r, 'city', 'ciudad', 'ubicacion').slice(0, 120) || null,
    origen: plataforma === 'fb' || plataforma.includes('facebook') ? 'facebook' : 'instagram',
    campana: campo(r, 'campaign_name').slice(0, 160) || null,
    utm_source: plataforma === 'fb' || plataforma.includes('facebook') ? 'facebook' : 'instagram',
    utm_campaign: campo(r, 'campaign_name').slice(0, 160) || null,
    utm_term: campo(r, 'ad_name').slice(0, 160) || null,
    ...(Number.isFinite(fecha) ? { creado_en: new Date(fecha).toISOString() } : {}),
    externo_id: leadId ? `meta:${leadId}`.slice(0, 120) : null,
    prueba: /test lead|dummy/i.test(Object.values(r).join(' ')),
  };
}
const diez = (t) => String(t || '').replace(/\D/g, '').slice(-10);

function importarMeta() {
  const modal = abrirModal({
    titulo: 'Importar contactos de Meta', ancho: true,
    cuerpo: `<div class="form">
      <p class="nota">En el Administrador de anuncios de Meta abre <b>Centro de clientes potenciales</b> (o el formulario de la campaña) y descarga los contactos en CSV. Sube aquí ese archivo: se agregan como prospectos de Instagram o Facebook, con su campaña, y los que ya estaban no se duplican.</p>
      <label>Archivo CSV de Meta<input type="file" id="im-file" accept=".csv,.tsv,text/csv,text/tab-separated-values"></label>
      <div id="im-res"></div></div>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cerrar</button><button class="btn btn-primary" id="im-ok" disabled>Importar</button>`,
  });
  modal.querySelector('.modal-foot [data-cerrar]').addEventListener('click', cerrarModal);
  let nuevos = [];
  modal.querySelector('#im-file').addEventListener('change', async (e) => {
    const res = modal.querySelector('#im-res'); const ok = modal.querySelector('#im-ok');
    nuevos = []; ok.disabled = true;
    const file = e.target.files[0]; if (!file) { res.innerHTML = ''; return; }
    let filas;
    try { filas = parsearCSV(await leerArchivo(file)).map(deMeta); }
    catch (err) { res.innerHTML = `<div class="alerta-roja">No se pudo leer el archivo: ${esc(err.message)}</div>`; return; }
    const tels = new Set(pros.map((p) => diez(p.whatsapp)).filter(Boolean));
    const correos = new Set(pros.map((p) => p.correo).filter(Boolean));
    const ids = new Set(pros.map((p) => p.externo_id).filter(Boolean));
    const vistos = new Set(); let repetidos = 0, incompletos = 0, pruebas = 0;
    for (const f of filas) {
      if (f.prueba) { pruebas++; continue; }
      if (!f.nombre || (!f.whatsapp && !f.correo)) { incompletos++; continue; }
      const clave = diez(f.whatsapp) || f.correo;
      if ((f.externo_id && ids.has(f.externo_id)) || (diez(f.whatsapp) && tels.has(diez(f.whatsapp))) || (f.correo && correos.has(f.correo)) || vistos.has(clave)) { repetidos++; continue; }
      vistos.add(clave); delete f.prueba; nuevos.push(f);
    }
    res.innerHTML = !filas.length ? '<div class="vacio">El archivo no trae contactos.</div>' : `
      <div class="kpis kpis-3">
        <div class="kpi"><span>Nuevos</span><strong class="pos">${nuevos.length}</strong></div>
        <div class="kpi"><span>Ya estaban</span><strong>${repetidos}</strong></div>
        <div class="kpi"><span>Sin nombre o teléfono${pruebas ? ' / prueba' : ''}</span><strong>${incompletos + pruebas}</strong></div>
      </div>
      ${nuevos.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Nombre</th><th>WhatsApp</th><th>Obra</th><th>Origen</th><th>Llegó</th></tr></thead><tbody>
        ${nuevos.slice(0, 8).map((n) => `<tr><td data-l="Nombre">${esc(n.nombre)}</td><td data-l="WhatsApp">${esc(n.whatsapp || n.correo || '')}</td><td data-l="Obra">${esc(n.tipo_obra || '—')}</td><td data-l="Origen">${ORIGENES[n.origen]}</td><td data-l="Fecha">${n.creado_en ? fmtFecha(n.creado_en.slice(0, 10)) : 'hoy'}</td></tr>`).join('')}
        ${nuevos.length > 8 ? `<tr><td colspan="5" class="mut">y ${nuevos.length - 8} más…</td></tr>` : ''}</tbody></table></div>` : ''}`;
    ok.disabled = !nuevos.length;
    ok.textContent = nuevos.length ? `Importar ${nuevos.length}` : 'Importar';
  });
  modal.querySelector('#im-ok').addEventListener('click', async (ev) => {
    if (!nuevos.length) return;
    ev.currentTarget.disabled = true;
    const emp = estado.empresas.find((e) => e.nombre_corto === 'MEDCO') || estado.empresas[0];
    const filas = nuevos.map((n) => ({ ...n, estado: 'nuevo', org_id: estado.miembro.org_id, empresa_id: emp?.id }));
    const { data, error } = await db().from('prospectos').insert(filas).select();
    if (error) { ev.currentTarget.disabled = false; return toast('No se pudo importar: ' + (error.code === '23505' ? 'algunos contactos ya estaban importados; recarga la pantalla y vuelve a subir el archivo' : error.message), true); }
    pros = [...(data || []), ...pros].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
    st.filtro = 'atender'; st.vista = 'lista';
    cerrarModal(); toast(`${(data || []).length} prospectos importados ✓`); pintar(); avisoMenu();
  });
}
