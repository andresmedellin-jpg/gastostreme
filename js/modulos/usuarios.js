import { PERFILES, SUGERIDOS } from '../config.js';
import { sb, db, estado, esc, toast, abrirModal, cerrarModal, generarPassword } from '../lib.js';

let raiz;
let lista = [];

export async function render(view) {
  raiz = view;
  document.getElementById('page-actions').innerHTML =
    `<button class="btn btn-primary" id="u-nuevo">＋ Nuevo usuario</button>`;
  document.getElementById('u-nuevo').addEventListener('click', () => formulario());
  view.innerHTML = `
    <div id="u-sugeridos"></div>
    <section class="panel">
      <div class="panel-head"><h3>Personas con acceso</h3></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Acceso</th><th>Empresas</th><th>Último acceso</th><th></th></tr></thead>
        <tbody id="u-tbody"><tr><td colspan="6" class="vacio">Cargando…</td></tr></tbody>
      </table></div>
    </section>
    <p class="nota">Nadie puede ver las contraseñas, ni siquiera tú: se guardan cifradas. Si alguien olvida la suya,
      dale una nueva con “Contraseña” y al entrar la cambiará por una propia.</p>`;
  await cargar();
}

async function cargar() {
  const { data, error } = await db().rpc('usuarios_lista');
  if (error) { toast('No se pudo cargar la lista: ' + error.message, true); return; }
  lista = data || [];
  pintar();
}

// ---------- utilidades ----------
const perfilDe = (u) => PERFILES.find((p) => p.rol === u.rol &&
  [...p.roles].sort().join() === [...(u.roles || [])].sort().join());
const etiquetaAcceso = (u) => u.rol === 'dueno' ? 'Dueño (todo)' : (perfilDe(u)?.titulo || 'Personalizado');
const nombresEmpresas = (ids) => ids == null ? 'Todas'
  : ids.map((id) => estado.empresas.find((e) => e.id === id)?.nombre_corto || '?').join(', ');
const idsEmpresas = (spec) => spec === 'todas' ? null
  : estado.empresas.filter((e) => spec.includes(e.nombre_corto)).map((e) => e.id);
const fechaHora = (iso) => iso
  ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Nunca';

async function llamar(cuerpo) {
  const { data, error } = await sb.functions.invoke('usuarios', { body: cuerpo });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* respuesta sin JSON */ }
    throw new Error(msg);
  }
  return data;
}

// ---------- pintar ----------
function pintar() {
  const existentes = new Set(lista.map((u) => (u.usuario || '').toLowerCase()));
  const pendientes = SUGERIDOS.filter((s) => !existentes.has(s.usuario));
  raiz.querySelector('#u-sugeridos').innerHTML = pendientes.length ? `
    <section class="panel">
      <h3>Listos para dar de alta</h3>
      <div class="sugeridos">${pendientes.map((s, i) => {
        const p = PERFILES.find((x) => x.id === s.perfil);
        return `<div class="sugerido">
          <div><strong>${esc(s.nombre)}</strong><span>usuario: ${esc(s.usuario)}</span><span>${esc(p.titulo)} · ${esc(s.empresas === 'todas' ? 'Todas las empresas' : s.empresas.join(', '))}</span></div>
          <button class="btn btn-primary btn-sm" data-sug="${i}">Dar de alta</button></div>`;
      }).join('')}</div>
    </section>` : '';
  raiz.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => {
    const s = pendientes[+b.dataset.sug];
    formulario(null, { nombre: s.nombre, usuario: s.usuario, perfil: s.perfil, empresas: idsEmpresas(s.empresas) });
  }));

  const tbody = raiz.querySelector('#u-tbody');
  if (!lista.length) { tbody.innerHTML = `<tr><td colspan="6" class="vacio">Sin usuarios</td></tr>`; return; }
  tbody.innerHTML = lista.map((u) => {
    const dueno = u.rol === 'dueno';
    return `<tr class="${u.activo ? '' : 'inactivo'}">
      <td data-l="Nombre"><strong>${esc(u.nombre)}</strong>${u.activo ? '' : ' <span class="tag tag-suave">desactivado</span>'}
        ${u.debe_cambiar_password && u.activo ? ' <span class="tag tag-aviso" title="Todavía no cambia su contraseña temporal">temporal</span>' : ''}</td>
      <td class="mut" data-l="Usuario">${esc(u.usuario || u.correo)}</td>
      <td data-l="Acceso">${esc(etiquetaAcceso(u))}</td>
      <td class="mut" data-l="Empresas">${esc(nombresEmpresas(u.empresas))}</td>
      <td class="mut nowrap" data-l="Último acceso">${esc(fechaHora(u.ultimo_acceso))}</td>
      <td class="acciones">
        <button class="btn btn-sm btn-ghost" data-pass="${u.user_id}">Contraseña</button>
        ${dueno ? '' : `<button class="btn btn-sm btn-ghost" data-edit="${u.user_id}">Editar</button>
          <button class="btn btn-sm btn-ghost" data-act="${u.user_id}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}
      </td></tr>`;
  }).join('');
  const porId = (id) => lista.find((u) => u.user_id === id);
  tbody.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => cambiarPassword(porId(b.dataset.pass))));
  tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => formulario(porId(b.dataset.edit))));
  tbody.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => alternarActivo(porId(b.dataset.act))));
}

// ---------- alta / edición ----------
function formulario(u = null, pre = {}) {
  const editando = !!u;
  const perfilActual = editando ? (perfilDe(u)?.id || PERFILES[0].id) : (pre.perfil || PERFILES[0].id);
  const empresasActuales = editando ? u.empresas : ('empresas' in pre ? pre.empresas : null);
  const modal = abrirModal({
    titulo: editando ? `Editar a ${u.nombre}` : 'Nuevo usuario',
    cuerpo: `
      <form class="form" id="uf" novalidate autocomplete="off">
        <label>Nombre<input name="nombre" required maxlength="80" value="${esc(editando ? u.nombre : pre.nombre || '')}"></label>
        <label>Usuario <small>(con el que entra; sin espacios ni acentos)</small>
          <input name="usuario" required maxlength="30" autocapitalize="none" spellcheck="false"
            value="${esc(editando ? u.usuario || '' : pre.usuario || '')}" ${editando ? 'disabled' : ''}></label>
        <fieldset class="opciones"><legend>¿A qué tiene acceso?</legend>
          ${PERFILES.map((p) => `<label class="opcion"><input type="radio" name="perfil" value="${p.id}" ${p.id === perfilActual ? 'checked' : ''}>
            <span><strong>${esc(p.titulo)}</strong><small>${esc(p.desc)}</small></span></label>`).join('')}
        </fieldset>
        <fieldset class="opciones"><legend>Empresas</legend>
          <label class="opcion opcion-linea"><input type="checkbox" name="todas" ${empresasActuales == null ? 'checked' : ''}> Todas</label>
          ${estado.empresas.map((e) => `<label class="opcion opcion-linea"><input type="checkbox" name="emp" value="${e.id}"
            ${empresasActuales == null || empresasActuales.includes(e.id) ? 'checked' : ''} ${empresasActuales == null ? 'disabled' : ''}> ${esc(e.nombre)}</label>`).join('')}
        </fieldset>
        ${editando ? '' : `<label>Contraseña temporal <small>(se la das en persona; la cambia al entrar)</small>
          <div class="campo-boton"><input name="password" required minlength="8" value="${esc(generarPassword())}" spellcheck="false">
            <button type="button" class="btn btn-ghost btn-sm" id="uf-gen">Otra</button></div></label>`}
      </form>`,
    pie: `<button class="btn btn-ghost" id="uf-cancelar">Cancelar</button>
          <button class="btn btn-primary" id="uf-guardar">${editando ? 'Guardar cambios' : 'Dar de alta'}</button>`,
  });
  const form = modal.querySelector('#uf');
  modal.querySelector('#uf-cancelar').addEventListener('click', cerrarModal);
  modal.querySelector('#uf-gen')?.addEventListener('click', () => (form.password.value = generarPassword()));
  form.todas.addEventListener('change', () => form.querySelectorAll('[name=emp]').forEach((c) => {
    c.disabled = form.todas.checked; if (form.todas.checked) c.checked = true;
  }));

  modal.querySelector('#uf-guardar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const perfil = PERFILES.find((p) => p.id === form.perfil.value);
    const empresas = form.todas.checked ? null
      : [...form.querySelectorAll('[name=emp]:checked')].map((c) => c.value);
    const cuerpo = {
      accion: editando ? 'editar' : 'crear',
      user_id: u?.user_id,
      nombre: form.nombre.value.trim(),
      usuario: editando ? undefined : form.usuario.value.trim().toLowerCase(),
      rol: perfil.rol, roles: perfil.roles, empresas,
      password: editando ? undefined : form.password.value,
    };
    if (!cuerpo.nombre) return toast('Escribe el nombre', true);
    if (empresas && !empresas.length) return toast('Elige al menos una empresa', true);
    if (!editando && !/^[a-z0-9._-]{3,30}$/.test(cuerpo.usuario)) return toast('El usuario debe tener de 3 a 30 letras o números, sin espacios ni acentos', true);
    if (!editando && cuerpo.password.length < 8) return toast('La contraseña debe tener al menos 8 caracteres', true);

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await llamar(cuerpo);
      await cargar();
      if (editando) { cerrarModal(); toast('Cambios guardados ✓'); }
      else mostrarDatos(cuerpo.nombre, cuerpo.usuario, cuerpo.password, `${cuerpo.nombre} ya tiene acceso ✓`);
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false; btn.textContent = editando ? 'Guardar cambios' : 'Dar de alta';
    }
  });
}

// ---------- contraseña ----------
function cambiarPassword(u) {
  const propio = u.user_id === estado.user.id;
  const modal = abrirModal({
    titulo: `Contraseña de ${u.nombre}`,
    cuerpo: `<form class="form" id="pf" autocomplete="off">
      <p class="nota">${propio ? 'Escribe tu nueva contraseña.'
        : 'Dale esta contraseña temporal en persona. Al entrar, la plataforma le pedirá cambiarla por una suya.'}</p>
      <label>Contraseña nueva
        <div class="campo-boton"><input name="password" minlength="8" spellcheck="false" ${propio ? 'type="password" autocomplete="new-password"' : `value="${esc(generarPassword())}"`}>
          ${propio ? '' : '<button type="button" class="btn btn-ghost btn-sm" id="pf-gen">Otra</button>'}</div></label>
    </form>`,
    pie: `<button class="btn btn-ghost" id="pf-cancelar">Cancelar</button><button class="btn btn-primary" id="pf-guardar">Guardar</button>`,
  });
  const form = modal.querySelector('#pf');
  modal.querySelector('#pf-cancelar').addEventListener('click', cerrarModal);
  modal.querySelector('#pf-gen')?.addEventListener('click', () => (form.password.value = generarPassword()));
  modal.querySelector('#pf-guardar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const password = form.password.value;
    if (password.length < 8) return toast('Mínimo 8 caracteres', true);
    btn.disabled = true;
    try {
      await llamar({ accion: 'password', user_id: u.user_id, password });
      await cargar();
      if (propio) { cerrarModal(); toast('Contraseña actualizada ✓'); }
      else mostrarDatos(u.nombre, u.usuario, password, `Contraseña nueva para ${u.nombre} ✓`);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  });
}

function mostrarDatos(nombre, usuario, password, titulo) {
  const url = location.origin + location.pathname;
  const texto = `Hola ${nombre.split(' ')[0]}, estos son tus datos para entrar a la plataforma:\n${url}\nUsuario: ${usuario}\nContraseña temporal: ${password}\nAl entrar te pedirá cambiarla por una tuya.`;
  const modal = abrirModal({
    titulo,
    cuerpo: `<p class="nota">Pásale estos datos. Por seguridad, después de cerrar esta ventana ya no podrás ver la contraseña.</p>
      <dl class="datos"><dt>Dirección</dt><dd>${esc(url)}</dd><dt>Usuario</dt><dd>${esc(usuario)}</dd>
      <dt>Contraseña temporal</dt><dd class="mono">${esc(password)}</dd></dl>`,
    pie: `<button class="btn btn-ghost" id="md-copiar">Copiar mensaje</button><button class="btn btn-primary" id="md-ok">Listo</button>`,
  });
  modal.querySelector('#md-ok').addEventListener('click', cerrarModal);
  modal.querySelector('#md-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado; pégalo en WhatsApp'); }
    catch { toast('No se pudo copiar; cópialo a mano', true); }
  });
}

// ---------- activar / desactivar ----------
async function alternarActivo(u) {
  const activar = !u.activo;
  if (!confirm(activar ? `¿Volver a dar acceso a ${u.nombre}?`
    : `¿Quitarle el acceso a ${u.nombre}?\nNo podrá entrar, ni siquiera si ya tenía la sesión abierta. Su historial se conserva.`)) return;
  try {
    await llamar({ accion: 'activo', user_id: u.user_id, activo: activar });
    await cargar();
    toast(activar ? 'Acceso restaurado ✓' : 'Acceso retirado ✓');
  } catch (e) { toast(e.message, true); }
}
