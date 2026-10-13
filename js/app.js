import { MODULOS } from './config.js';
import { sb, db, estado, esc, toast, abrirModal, cerrarModal, tieneRol } from './lib.js';

const vistas = {
  inicio: () => import('./modulos/inicio.js'),
  gastos: () => import('./modulos/gastos.js'),
  usuarios: () => import('./modulos/usuarios.js'),
  cobranza: () => import('./modulos/cobranza.js'),
  rentas: () => import('./modulos/rentas.js'),
  personal: () => import('./modulos/personal.js'),
  reportes: () => import('./modulos/reportes.js'),
  patrimonio: () => import('./modulos/patrimonio.js'),
};
const pendiente = () => import('./modulos/pendiente.js');

const $ = (id) => document.getElementById(id);

// ================= ACCESO =================
// Usuarios sin correo propio reciben uno interno con este dominio (nunca recibe mensajes)
const DOMINIO_INTERNO = '@usuarios.medco.mx';

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
        <label>Contraseña nueva<input type="password" id="np-1" minlength="8" autocomplete="new-password" required></label>
        <label>Repítela<input type="password" id="np-2" minlength="8" autocomplete="new-password" required></label>
        <small>Mínimo 8 caracteres.</small></form>`,
    pie: `<button class="btn btn-primary" id="np-guardar">Guardar</button>`,
  });
  modal.querySelector('#np-guardar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const a = modal.querySelector('#np-1').value, b = modal.querySelector('#np-2').value;
    if (a.length < 8) return toast('La contraseña debe tener al menos 8 caracteres', true);
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
      .select('org_id, nombre, rol, roles, empresas, debe_cambiar_password').eq('user_id', user.id).eq('activo', true).maybeSingle();

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

    const etiquetas = [miembro.rol, ...(miembro.roles || [])].map(rolLegible);
    $('user-box').innerHTML = `<strong>${esc(miembro.nombre)}</strong><span>${esc([...new Set(etiquetas)].join(' · '))}</span>`;
    pintarNav();
    $('login').hidden = true;
    $('shell').hidden = false;
    navegar();
    if (miembro.debe_cambiar_password) pedirNuevaPassword({ obligatoria: true });
  })().finally(() => (entrando = null));
  return entrando;
}

const rolLegible = (r) => ({ dueno: 'Dueño', administracion: 'Administración', cobranza: 'Cobranza',
  operacion: 'Gastos', encargado: 'Encargado', lectura: 'Solo lectura' }[r] || r);

// ================= NAVEGACIÓN =================
const modulosDelUsuario = () => MODULOS.filter((m) => tieneRol(m.roles));

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
    if (!mod) {
      $('page-title').textContent = 'Sin módulos';
      $('view').innerHTML = '<div class="vacio">Tu usuario todavía no tiene módulos asignados. Pídele a Andrés que te dé acceso.</div>';
      return;
    }
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
