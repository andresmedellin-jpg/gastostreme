import { MODULOS_ACTIVOS as MODULOS, MARCA, CLIENTE, MUNDOS } from './config.js';
import { sb, db, estado, esc, toast, abrirModal, cerrarModal, tieneRol, misRoles } from './lib.js';

const vistas = {
  inicio: () => import('./modulos/inicio.js'),
  gastos: () => import('./modulos/gastos.js'),
  usuarios: () => import('./modulos/usuarios.js'),
  cobranza: () => import('./modulos/cobranza.js'),
  rentas: () => import('./modulos/rentas.js'),
  personal: () => import('./modulos/personal.js'),
  reportes: () => import('./modulos/reportes.js'),
  obras: () => import('./modulos/obras.js'),
  patrimonio: () => import('./modulos/patrimonio.js'),
  inventario: () => import('./modulos/inventario.js'),
  bodegas: () => import('./modulos/bodegas.js'),
  cotizaciones: () => import('./modulos/cotizaciones.js'),
  prospectos: () => import('./modulos/prospectos.js'),
  lecturas: () => import('./modulos/lecturas.js'),
  importar: () => import('./modulos/importar.js'),
  turno: () => import('./modulos/turno.js'),
};

// ================= MARCA =================
(function aplicarMarca() {
  document.title = MARCA.nombre;
  if (MARCA.color) {
    const r = document.documentElement.style;
    r.setProperty('--primary', MARCA.color);
    r.setProperty('--primary-2', MARCA.color2 || MARCA.color);
    if (MARCA.colorSuave) r.setProperty('--primary-soft', MARCA.colorSuave);
  }
  // Encabezado: marca del grupo (los logos van en el selector de empresa)
  document.querySelector('.mx-marca').innerHTML = `<span class="mx-marca-txt">${esc(MARCA.marca.join(' · '))}</span>`;
  document.querySelector('.login-logos').innerHTML = MARCA.logos.length ? MARCA.logos.map((l) =>
    `<picture><img src="${l.src}" alt="${esc(l.alt)}" class="${l.clase || ''}"></picture>`).join('<span class="login-logos-sep" aria-hidden="true"></span>')
    : `<strong class="login-nombre">${esc(MARCA.marca.join(' / '))}</strong>`;   // cliente sin logo todavía: su nombre
  if (MARCA.demo) {
    const b = document.createElement('div');
    b.className = 'demo-banda';
    b.innerHTML = `<b>Demostración</b><span class="demo-txt"> · datos de ejemplo; lo que captures se borra al recargar</span> <button type="button" id="demo-reiniciar">Reiniciar</button>`;
    document.body.prepend(b);
    document.body.classList.add('con-demo');
    b.querySelector('#demo-reiniciar').addEventListener('click', () => location.reload());
  }
})();
const pendiente = () => import('./modulos/pendiente.js');

const $ = (id) => document.getElementById(id);

// ================= ACCESO =================
// Usuarios sin correo propio reciben uno interno con este dominio (nunca recibe mensajes)
const DOMINIO_INTERNO = MARCA.dominioUsuarios || '@usuarios.medco.mx';

// El usuario puede escribir su nombre de usuario o, si tiene, su correo
async function correoDe(usuario) {
  if (usuario.includes('@')) return usuario;
  const { data, error } = await db().rpc('correo_para_login', { p_usuario: usuario });
  if (error) throw new Error('No se pudo conectar. Intenta de nuevo en un momento.');
  return data;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('login-user').value.trim();
  const password = $('login-pass').value;
  if (!usuario || !password) return mensajeLogin('Escribe tu usuario y contraseña.');
  // Usuario de demostración: abre la plataforma completa con números inventados (no toca la base real)
  if (!CLIENTE && usuario.toLowerCase() === 'demo' && password === 'medco2026') { location.href = location.pathname + '?demo=medco#/inicio'; return; }
  $('login-btn').disabled = true;
  mensajeLogin('');
  try {
    const email = await correoDe(usuario);
    const { error } = email
      ? await sb.auth.signInWithPassword({ email, password })
      : { error: { message: 'Invalid login credentials' } };
    if (error) mensajeLogin(error.message === 'Invalid login credentials' ? 'Usuario o contraseña incorrectos.' : error.message);
  } catch (err) {
    mensajeLogin(err.message);
  } finally {
    $('login-btn').disabled = false;
  }
});

$('login-olvide').addEventListener('click', async () => {
  const usuario = $('login-user').value.trim();
  if (!usuario) return mensajeLogin('Escribe tu usuario y vuelve a darle a "¿Olvidaste tu contraseña?".');
  try {
    const email = await correoDe(usuario);
    if (email && !email.endsWith(DOMINIO_INTERNO)) {
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    }
    // Mismo mensaje exista o no el usuario, para no revelar quién tiene cuenta
    mensajeLogin('Si tu usuario tiene correo, te llegó un enlace para cambiar la contraseña. Si no tienes correo, pídele a Andrés que te la cambie.');
  } catch (err) {
    mensajeLogin(err.message);
  }
});

// Pide una contraseña nueva. obligatoria = primera entrada con la contraseña temporal
function pedirNuevaPassword({ obligatoria = false } = {}) {
  const modal = abrirModal({
    titulo: obligatoria ? 'Crea tu contraseña' : 'Nueva contraseña',
    bloqueado: obligatoria,
    cuerpo: `<form class="form" id="np-form">
        ${obligatoria ? '<p class="nota">Estás entrando con una contraseña temporal. Elige una tuya que solo tú sepas.</p>' : ''}
        <label>Contraseña nueva<input type="password" id="np-1" minlength="6" autocomplete="new-password" required></label>
        <label>Repítela<input type="password" id="np-2" minlength="6" autocomplete="new-password" required></label>
        <small>Mínimo 6 caracteres.</small></form>`,
    pie: `<button class="btn btn-primary" id="np-guardar">Guardar</button>`,
  });
  modal.querySelector('#np-guardar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const a = modal.querySelector('#np-1').value, b = modal.querySelector('#np-2').value;
    if (a.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', true);
    if (a !== b) return toast('Las contraseñas no coinciden', true);
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) {
      btn.disabled = false;
      return toast(error.message.includes('different') ? 'Debe ser distinta a la temporal' : error.message, true);
    }
    await db().rpc('marcar_password_cambiado');
    if (estado.miembro) estado.miembro.debe_cambiar_password = false;
    cerrarModal();
    toast('Contraseña guardada ✓');
  });
}

// Al abrir el enlace de "olvidé mi contraseña", pedir la nueva
sb.auth.onAuthStateChange((evento) => {
  if (evento === 'PASSWORD_RECOVERY') setTimeout(() => pedirNuevaPassword(), 0);
});

$('logout').addEventListener('click', () => sb.auth.signOut());

function mensajeLogin(t) { $('login-msg').textContent = t; }

sb.auth.onAuthStateChange((_evento, sesion) => {
  // Se difiere para no llamar a la base dentro del callback de auth
  setTimeout(() => (sesion ? entrar(sesion.user) : salir()), 0);
});

function salir() {
  estado.user = estado.miembro = null;
  $('shell').hidden = true;
  $('login').hidden = false;
}

let entrando = null;
async function entrar(user) {
  if (estado.user?.id === user.id && estado.miembro) return;
  if (entrando) return entrando;
  entrando = (async () => {
    estado.user = user;
    const { data: miembro, error } = await db().from('miembros')
      .select('org_id, nombre, rol, roles, empresas, centros, modulos, debe_cambiar_password, empleado_id').eq('user_id', user.id).eq('activo', true).maybeSingle();

    if (error || !miembro) {
      $('login').hidden = false; $('shell').hidden = true;
      mensajeLogin(error
        ? 'No se pudo conectar con la base: ' + error.message
        : 'Tu usuario todavía no tiene acceso a la plataforma. Pídele a Andrés que te dé de alta.');
      return;
    }
    estado.miembro = miembro;

    const [emp, cen] = await Promise.all([
      db().from('empresas').select('id, nombre, nombre_corto, color').eq('activo', true).order('nombre_corto'),
      db().from('centros').select('id, nombre, tipo, empresa_id, en_gastos').eq('activo', true).order('nombre'),
    ]);
    estado.todasEmpresas = estado.empresas = emp.data || [];
    estado.todosCentros = estado.centros = cen.data || [];

    const etiquetas = [miembro.rol, ...(miembro.roles || [])].map(rolLegible);
    $('user-box').innerHTML = `<span class="user-avatar" aria-hidden="true">${esc((miembro.nombre || '?').trim().charAt(0).toUpperCase())}</span>
      <span class="user-txt"><strong>${esc(miembro.nombre)}</strong></span>`;
    $('login').hidden = true;
    $('shell').hidden = false;
    navegar();
    if (miembro.debe_cambiar_password) pedirNuevaPassword({ obligatoria: true });
  })().finally(() => (entrando = null));
  return entrando;
}

const rolLegible = (r) => ({ dueno: 'Dueño', socio: 'Socio', administracion: 'Administración', cobranza: 'Cobranza',
  operacion: 'Gastos', encargado: 'Encargado', lectura: 'Solo lectura', equipo: 'Equipo' }[r] || r);

// ================= NAVEGACIÓN =================
// soloRoles: módulos que solo ve quien tiene ese rol (el dueño no los ve en su menú, p. ej. "Mi turno" del personal)
// miembros.modulos (si lo tiene) limita las secciones de esa persona; p. ej. Liz y Barby solo ven Mantenimiento
const modulosDelUsuario = () => MODULOS.filter((m) => (m.soloRoles ? misRoles().some((r) => m.soloRoles.includes(r)) : tieneRol(m.roles))
  && (!estado.miembro?.modulos || estado.miembro.modulos.includes(m.vista || m.id) || (m.id === 'cobranza' && estado.miembro.modulos.includes('luz'))));
// Quien solo cobra luz (Víctor) ve la sección con ese nombre
const soloLuz = () => estado.miembro?.modulos?.includes('luz') && !estado.miembro.modulos.includes('cobranza');

// Mundos: Grupo (todo junto), Treme y MEDCO. Cada uno con sus propias secciones y sus propios datos.
const LOGOS = Object.fromEntries((MARCA.logos || []).map((l) => [l.clase, l]));
function empresaDe(mundo) { return mundo.empresa ? estado.todasEmpresas.find((e) => mundo.empresa.test(e.nombre) || mundo.empresa.test(e.nombre_corto || '')) : null; }
function mundosDelUsuario() {
  const mios = modulosDelUsuario();
  const lista = MUNDOS.map((w) => {
    const emp = empresaDe(w);
    if (w.empresa && !emp) return null;                        // el usuario no ve esa empresa
    const mods = w.modulos.map((id) => mios.find((m) => m.id === id)).filter(Boolean);
    return mods.length ? { ...w, emp, mods } : null;
  }).filter(Boolean);
  // Grupo solo tiene sentido si ve más de una empresa
  const empresas = lista.filter((w) => w.emp);
  const final = empresas.length > 1 ? lista : lista.filter((w) => w.emp);
  if (final.length) return final;
  return [{ id: 'grupo', nombre: MARCA.marca[0] || 'Inicio', mods: mios, titulos: {}, color: '#101216' }];   // marca sin mundos
}
const tituloEn = (w, m) => (m.id === 'cobranza' && soloLuz() ? 'Luz' : w.titulos?.[m.id] || m.titulo);

function pintarNav(w, todos) {
  const unico = todos.length < 2;
  $('mundos').hidden = unico;
  $('mundos').innerHTML = todos.map((x) => {
    const logo = x.logo && LOGOS[x.logo];
    return `<a href="#/${x.id}/${x.mods[0].id}" class="mx-mundo${x.id === w.id ? ' activo' : ''}" data-mundo="${x.id}" style="--w:${x.color}">
      ${logo ? `<img src="${logo.src}" alt="" class="mx-mundo-logo ${x.logo}">` : '<span class="mx-mundo-ico" aria-hidden="true"></span>'}
      <span class="mx-mundo-txt"><strong>${esc(x.nombre)}</strong>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span></a>`;
  }).join('');
  $('nav').innerHTML = w.mods.map((m) => `<a href="#/${w.id}/${m.id}" data-mod="${m.id}">${esc(tituloEn(w, m))}</a>`).join('');
}

// Contador en el menú de prospectos que llevan más de una hora sin respuesta (se revisa cada 5 minutos)
async function avisoProspectos() {
  const a = document.querySelector('#nav a[data-mod="prospectos"]');
  if (!a) return;
  try {
    const desde = new Date(Date.now() - 3600e3).toISOString();
    const { count, error } = await db().from('prospectos').select('id', { count: 'exact', head: true })
      .eq('estado', 'nuevo').is('primera_respuesta', null).lt('creado_en', desde);
    if (error) return;
    a.querySelector('.nav-badge')?.remove();
    if (count) a.insertAdjacentHTML('beforeend', `<span class="nav-badge" title="Sin contestar hace más de 1 hora">${count}</span>`);
  } catch (e) { /* sin aviso si no hay conexión */ }
}
setInterval(() => { if (estado.miembro) avisoProspectos(); }, 5 * 60e3);

window.addEventListener('hashchange', navegar);

async function navegar() {
  if (!estado.miembro) return;
  const todos = mundosDelUsuario();
  const partes = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  let w = todos.find((x) => x.id === partes[0]);
  let id = w ? partes[1] : partes[0];                          // también acepta las ligas viejas "#/gastos"
  if (!w) w = todos.find((x) => x.id === mundoActual && x.mods.some((m) => m.id === id))
    || todos.find((x) => x.mods.some((m) => m.id === id)) || todos.find((x) => x.id === mundoActual) || todos[0];
  let mod = w.mods.find((m) => m.id === id);
  if (!mod) {
    mod = w.mods.find((m) => m.listo) || w.mods[0];
    if (!mod) {
      $('page-title').textContent = 'Sin módulos';
      $('view').innerHTML = '<div class="vacio">Tu usuario todavía no tiene módulos asignados. Pídele a Andrés que te dé acceso.</div>';
      return;
    }
  }
  const destino = `#/${w.id}/${mod.id}` + (location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?')) : '');
  if (location.hash !== destino) history.replaceState(null, '', destino);
  // Alcance: en Treme o MEDCO solo se leen sus datos (empleados, gastos, centros…); en Grupo, todo
  mundoActual = w.id;
  estado.mundo = w;
  estado.foco = w.emp ? w.emp.id : null;
  estado.empresas = w.emp ? [w.emp] : estado.todasEmpresas;
  estado.centros = w.emp ? estado.todosCentros.filter((c) => c.empresa_id === w.emp.id) : estado.todosCentros;
  document.documentElement.style.setProperty('--primary', w.emp ? w.color : (MARCA.color || '#8B1A1A'));
  document.body.dataset.mundo = w.id;
  pintarNav(w, todos);
  avisoProspectos();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.mod === mod.id));
  document.querySelector('#nav a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  const titulo = tituloEn(w, mod);
  $('page-title').textContent = titulo;
  $('page-eyebrow').textContent = w.emp ? `${w.nombre} · ${w.sub}` : (todos.length > 1 ? 'Grupo · Treme y MEDCO' : (mod.grupo || ''));
  document.title = `${titulo} · ${w.emp ? w.nombre : MARCA.nombre}`;
  $('top-fecha').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
  $('page-actions').innerHTML = '';
  // Cada vez que se abre un módulo se le da una caja nueva. Si una carga anterior sigue en camino
  // (doble clic, cambio rápido de pantalla, sesión que se renueva), termina en su caja vieja y no estorba.
  const mio = ++turno;
  const view = $('view');
  const caja = document.createElement('div');
  caja.className = 'vista';
  caja.innerHTML = '<div class="cargando">Cargando…</div>';
  view.replaceChildren(caja);
  try {
    const m = await (vistas[mod.vista || mod.id] || pendiente)();
    if (mio !== turno) return;
    await m.render(caja, { ...mod, titulo: tituloEn(w, mod) });
  } catch (e) {
    console.error(e);
    if (mio === turno) caja.innerHTML = `<div class="vacio">No se pudo cargar el módulo.<br><small>${esc(e.message)}</small></div>`;
  }
  if (mio === turno) view.focus({ preventScroll: true });
}
let turno = 0;
let mundoActual = null;

// Arranque: si no hay sesión, mostrar acceso
sb.auth.getSession().then(({ data }) => { if (!data.session) salir(); });
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Error inesperado', true));
