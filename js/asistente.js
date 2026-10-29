// Asistente de Ayuda: botón "Ayuda" en la barra de arriba que abre un panel para preguntar cómo usar la plataforma.
// Responde la función "asistente" de Supabase (supabase/functions/asistente) con el manual de las pantallas que la persona ve.
// Si el servidor no tiene llave de Anthropic, el botón no aparece. En el demo tampoco.
import { SUPABASE_URL, SUPABASE_KEY, MARCA, MODULOS_ACTIVOS as MODULOS } from './config.js';
import { sb, estado, esc, tieneRol } from './lib.js';

const API = SUPABASE_URL + '/functions/v1/asistente';
const SUGERENCIAS = {
  inicio: ['¿De dónde salen los ingresos del mes?', '¿Por qué un gasto no sale en este mes?'],
  reportes: ['¿Cómo descargo el reporte en PDF?'],
  gastos: ['¿Cómo capturo un gasto?', '¿Cómo corrijo un gasto mal capturado?', '¿Cómo marco un gasto como pagado?'],
  cobranza: ['¿Cómo registro un pago de mantenimiento?', '¿Cómo saco un recibo?'],
  rentas: ['¿Cómo registro el pago de una renta?', '¿Cómo descargo el recibo?'],
  obras: ['¿Cómo veo cuánto llevo gastado en una obra?'],
  prospectos: ['¿Cómo doy de alta un prospecto?', '¿Qué significa "calificado"?'],
  patrimonio: ['¿Cómo agrego una deuda?'],
  personal: ['¿Cómo pago la nómina de la semana?', '¿Cómo registro la asistencia?', '¿Cuántos días de vacaciones le tocan?'],
  usuarios: ['¿Cómo doy de alta a una persona?', '¿Cómo le cambio la contraseña a alguien?'],
};
const GENERALES = ['¿Dónde encuentro cada cosa?', 'Olvidé cómo hacer algo'];

let listo = false, abierto = false, enviando = false;
let historial = [];                       // [{ role: 'user'|'assistant', content }]
try { historial = JSON.parse(sessionStorage.getItem('ayuda-historial') || '[]'); } catch (_) { historial = []; }
const guardar = () => { try { sessionStorage.setItem('ayuda-historial', JSON.stringify(historial.slice(-30))); } catch (_) {} };

const pantallaActual = () => {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  const m = MODULOS.find((x) => x.id === id);
  return m ? (m.vista || m.id) : 'inicio';
};
const misModulos = () => [...new Set(MODULOS.filter((m) => tieneRol(m.roles)).map((m) => m.vista || m.id))];
const titulos = () => Object.fromEntries(MODULOS.map((m) => [m.vista || m.id, (MARCA.titulos || {})[m.id] || m.titulo]));

async function token() {
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || '';
}

// Se llama al entrar. Pregunta al servidor si la ayuda está lista y, si sí, pone el botón.
export async function iniciarAsistente() {
  if (MARCA.demo || MARCA.asistente === false || document.getElementById('ayuda-btn')) return;
  try {
    const t = await token();
    const r = await fetch(API, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + (t || SUPABASE_KEY) } });
    listo = r.ok && (await r.json()).listo === true;
  } catch (_) { listo = false; }
  if (!listo) return;
  estilos();
  const barra = document.querySelector('.topbar');
  if (!barra) return;
  const btn = document.createElement('button');
  btn.id = 'ayuda-btn'; btn.type = 'button'; btn.className = 'ayuda-btn';
  btn.setAttribute('aria-label', 'Ayuda: pregunta cómo usar la plataforma');
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/></svg><span>Ayuda</span>`;
  btn.addEventListener('click', () => (abierto ? cerrar() : abrir()));
  barra.appendChild(btn);
}

export function quitarAsistente() {
  cerrar();
  document.getElementById('ayuda-btn')?.remove();
  historial = []; guardar();
}

function abrir() {
  abierto = true;
  let p = document.getElementById('ayuda-panel');
  if (!p) {
    p = document.createElement('aside');
    p.id = 'ayuda-panel'; p.className = 'ayuda-panel';
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Ayuda');
    p.innerHTML = `
      <div class="ayuda-head">
        <div><strong>Ayuda</strong><span>Pregunta cómo hacer cualquier cosa en la plataforma</span></div>
        <button type="button" class="ayuda-x" aria-label="Cerrar">✕</button>
      </div>
      <div class="ayuda-msgs" aria-live="polite"></div>
      <div class="ayuda-sug"></div>
      <form class="ayuda-form">
        <textarea rows="1" maxlength="1500" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"></textarea>
        <button type="submit" class="btn btn-primary">Enviar</button>
      </form>
      <div class="ayuda-pie">Responde con el manual de la plataforma; no ve tus datos.${historial.length ? ' <button type="button" class="ayuda-nueva">Nueva plática</button>' : ''}</div>`;
    document.body.appendChild(p);
    p.querySelector('.ayuda-x').addEventListener('click', cerrar);
    const ta = p.querySelector('textarea');
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.querySelector('form').requestSubmit(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    p.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const v = ta.value.trim(); if (v) { ta.value = ''; ta.style.height = 'auto'; preguntar(v); } });
    p.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sug]'); if (s) preguntar(s.dataset.sug);
      if (e.target.closest('.ayuda-nueva')) { historial = []; guardar(); pintar(); e.target.remove(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierto) cerrar(); });
  }
  p.hidden = false;
  document.getElementById('ayuda-btn')?.classList.add('activo');
  pintar();
  setTimeout(() => p.querySelector('textarea')?.focus(), 30);
}

function cerrar() {
  abierto = false;
  const p = document.getElementById('ayuda-panel'); if (p) p.hidden = true;
  document.getElementById('ayuda-btn')?.classList.remove('activo');
}

function pintar(pensando = false) {
  const p = document.getElementById('ayuda-panel'); if (!p) return;
  const nombre = (estado.miembro?.nombre || '').trim().split(/\s+/)[0];
  const caja = p.querySelector('.ayuda-msgs');
  const saludo = `<div class="ayuda-msg de-ayuda">Hola${nombre ? ' ' + esc(nombre) : ''}. ¿Qué necesitas hacer? Te digo paso a paso dónde está.</div>`;
  caja.innerHTML = saludo + historial.map((m) => `<div class="ayuda-msg ${m.role === 'user' ? 'de-persona' : 'de-ayuda'}">${formato(m.content)}${m.escalar ? escalarHtml(m.escalar) : ''}</div>`).join('')
    + (pensando ? '<div class="ayuda-msg de-ayuda ayuda-pensando"><span></span><span></span><span></span></div>' : '');
  caja.scrollTop = caja.scrollHeight;
  const sug = historial.length ? [] : [...(SUGERENCIAS[pantallaActual()] || []), ...GENERALES].slice(0, 4);
  p.querySelector('.ayuda-sug').innerHTML = sug.map((s) => `<button type="button" data-sug="${esc(s)}">${esc(s)}</button>`).join('');
}

// Texto con saltos de línea, **negritas** y listas sencillas
function formato(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function escalarHtml(resumen) {
  const s = MARCA.soporte || {};
  const quien = estado.miembro?.nombre || '';
  if (s.whatsapp) {
    const txt = encodeURIComponent(`Hola, soy ${quien}. Necesito ayuda con la plataforma: ${resumen}`);
    return `<a class="ayuda-escalar" href="https://wa.me/${String(s.whatsapp).replace(/\D/g, '')}?text=${txt}" target="_blank" rel="noopener">Escribir a soporte por WhatsApp</a>`;
  }
  return `<div class="ayuda-escalar-nota">Quedó anotado para ${esc(s.nombre || 'el dueño de la plataforma')}.</div>`;
}

async function preguntar(texto) {
  if (enviando) return;
  enviando = true;
  const previo = historial.slice(-12).map(({ role, content }) => ({ role, content }));
  historial.push({ role: 'user', content: texto });
  pintar(true);
  const form = document.querySelector('#ayuda-panel form button'); if (form) form.disabled = true;
  let respuesta;
  try {
    const t = await token();
    if (!t) throw Object.assign(new Error(), { amable: 'Tu sesión expiró. Vuelve a entrar.' });
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t },
      body: JSON.stringify({ pregunta: texto, historial: previo, modulo: pantallaActual(), modulos: misModulos(),
        titulos: titulos(), negocio: (MARCA.marca || []).join(' / ') || MARCA.nombre })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.texto) throw Object.assign(new Error(), { amable: j.error });
    respuesta = { role: 'assistant', content: j.texto, escalar: j.escalar || '' };
  } catch (e) {
    respuesta = { role: 'assistant', content: e.amable || 'No me pude conectar. Revisa tu internet e intenta otra vez.' };
  }
  historial.push(respuesta);
  guardar();
  enviando = false;
  if (form) form.disabled = false;
  pintar();
}

function estilos() {
  if (document.getElementById('ayuda-css')) return;
  const st = document.createElement('style');
  st.id = 'ayuda-css';
  st.textContent = `
.ayuda-btn { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; flex: none; background: var(--surface); color: var(--text);
  border: 1px solid #d6d6d6; border-radius: var(--radius); padding: 6px 11px; font: inherit; font-size: 13px; cursor: pointer; }
.ayuda-btn:hover, .ayuda-btn.activo { border-color: var(--primary); color: var(--primary); }
.ayuda-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 380px; max-width: 100vw; z-index: 45; background: var(--surface);
  border-left: 1px solid var(--border); box-shadow: -8px 0 30px rgba(0,0,0,.08); display: flex; flex-direction: column; }
.ayuda-panel[hidden] { display: none; }
.ayuda-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 2px solid #141414; }
.ayuda-head strong { display: block; font-size: 16px; }
.ayuda-head span { display: block; font-size: 12px; color: var(--text-3); margin-top: 2px; }
.ayuda-x { background: none; border: 0; font-size: 16px; cursor: pointer; color: var(--text-2); padding: 2px 6px; }
.ayuda-msgs { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.ayuda-msg { max-width: 88%; padding: 9px 12px; border-radius: var(--radius); font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; }
.de-ayuda { background: var(--surface-2); color: var(--text); align-self: flex-start; }
.de-persona { background: var(--primary); color: #fff; align-self: flex-end; }
.ayuda-escalar { display: inline-block; margin-top: 8px; padding: 6px 10px; background: #fff; border: 1px solid var(--primary); color: var(--primary);
  border-radius: var(--radius); font-size: 13px; font-weight: 600; text-decoration: none; }
.ayuda-escalar-nota { margin-top: 6px; font-size: 12px; color: var(--text-3); }
.ayuda-pensando { display: flex; gap: 4px; padding: 12px 14px; }
.ayuda-pensando span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); animation: ayuda-p 1s infinite ease-in-out; }
.ayuda-pensando span:nth-child(2) { animation-delay: .15s; } .ayuda-pensando span:nth-child(3) { animation-delay: .3s; }
@keyframes ayuda-p { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
.ayuda-sug { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 18px 10px; }
.ayuda-sug:empty { display: none; }
.ayuda-sug button { background: var(--surface); border: 1px solid #d6d6d6; border-radius: var(--radius); padding: 6px 10px; font: inherit;
  font-size: 13px; color: var(--text-2); cursor: pointer; text-align: left; }
.ayuda-sug button:hover { border-color: var(--primary); color: var(--primary); }
.ayuda-form { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border); align-items: flex-end; }
.ayuda-form textarea { flex: 1; resize: none; font: inherit; font-size: 15px; padding: 8px 10px; border: 1px solid #d6d6d6;
  border-radius: var(--radius); min-height: 38px; max-height: 120px; }
.ayuda-form textarea:focus { outline: none; border-color: var(--primary); }
.ayuda-pie { padding: 0 18px 12px; font-size: 11px; color: var(--text-3); }
.ayuda-nueva { background: none; border: 0; padding: 0; margin-left: 6px; font: inherit; font-size: 11px; color: var(--primary); text-decoration: underline; cursor: pointer; }
@media (max-width: 760px) {
  .ayuda-btn span { display: none; }
  .ayuda-btn { padding: 6px 8px; }
  .ayuda-panel { width: 100vw; border-left: 0; }
}`;
  document.head.appendChild(st);
}
