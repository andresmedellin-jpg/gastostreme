import { MODULOS } from './config.js';
import { sb, db, estado, esc, toast } from './lib.js';

const vistas = {
  gastos: () => import('./modulos/gastos.js'),
};
const pendiente = () => import('./modulos/pendiente.js');

const $ = (id) => document.getElementById(id);

// ================= ACCESO =================
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const password = $('login-pass').value;
  if (!password) return mensajeLogin('Escribe tu contraseña o pide un enlace al correo.');
  $('login-btn').disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $('login-btn').disabled = false;
  if (error) mensajeLogin(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
});

$('login-link').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  if (!email) return mensajeLogin('Escribe tu correo primero.');
  const { error } = await sb.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
  });
  mensajeLogin(error ? error.message : 'Listo: revisa tu correo y abre el enlace desde este mismo dispositivo.');
});

$('logout').addEventListener('click', () => sb.auth.signOut());
$('menu-btn').addEventListener('click', () => $('sidebar').classList.toggle('open'));

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
      .select('org_id, nombre, rol, empresas').eq('user_id', user.id).eq('activo', true).maybeSingle();

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
      db().from('centros').select('id, nombre, tipo, empresa_id').eq('activo', true).order('nombre'),
    ]);
    estado.empresas = emp.data || [];
    estado.centros = cen.data || [];

    $('user-box').innerHTML = `<strong>${esc(miembro.nombre)}</strong><span>${esc(rolLegible(miembro.rol))}</span>`;
    pintarNav();
    $('login').hidden = true;
    $('shell').hidden = false;
    navegar();
  })().finally(() => (entrando = null));
  return entrando;
}

const rolLegible = (r) => ({ dueno: 'Dueño', administracion: 'Administración', cobranza: 'Cobranza',
  operacion: 'Operación', encargado: 'Encargado', lectura: 'Solo lectura' }[r] || r);

// ================= NAVEGACIÓN =================
const modulosDelUsuario = () => MODULOS.filter((m) => m.roles.includes(estado.miembro.rol));

function pintarNav() {
  $('nav').innerHTML = modulosDelUsuario().map((m) => `
    <a href="#/${m.id}" data-mod="${m.id}">
      <span class="nav-ico">${m.icono}</span>${esc(m.titulo)}
      ${m.listo ? '' : '<span class="nav-tag">pronto</span>'}
    </a>`).join('');
}

window.addEventListener('hashchange', navegar);

async function navegar() {
  if (!estado.miembro) return;
  const mios = modulosDelUsuario();
  let id = location.hash.replace(/^#\/?/, '').split('?')[0];
  let mod = mios.find((m) => m.id === id);
  if (!mod) {
    mod = mios.find((m) => m.listo) || mios[0];
    history.replaceState(null, '', '#/' + mod.id);
  }
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.mod === mod.id));
  $('sidebar').classList.remove('open');
  $('page-title').textContent = mod.titulo;
  $('page-actions').innerHTML = '';
  const view = $('view');
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    const m = await (vistas[mod.id] || pendiente)();
    await m.render(view, mod);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="vacio">No se pudo cargar el módulo.<br><small>${esc(e.message)}</small></div>`;
  }
  view.focus({ preventScroll: true });
}

// Arranque: si no hay sesión, mostrar acceso
sb.auth.getSession().then(({ data }) => { if (!data.session) salir(); });
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Error inesperado', true));
