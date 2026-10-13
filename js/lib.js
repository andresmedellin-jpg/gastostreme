import { SUPABASE_URL, SUPABASE_KEY, ESQUEMA } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
export const db = () => sb.schema(ESQUEMA);

// Estado de la sesión: usuario, membresía y catálogos compartidos
export const estado = { user: null, miembro: null, empresas: [], centros: [] };

// Rol principal + roles extra de la persona que entró
export const misRoles = () => estado.miembro ? [estado.miembro.rol, ...(estado.miembro.roles || [])] : [];
// El dueño siempre cuenta, igual que en la base (tiene_rol)
export const tieneRol = (lista) => misRoles().some((r) => r === 'dueno' || lista.includes(r));
export const esAdmin = () => tieneRol(['dueno', 'administracion']);

// ---------- formato ----------
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
export const fmt = (n) => mxn.format(Number(n || 0));
export const fmtFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
export const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ---------- avisos ----------
let toastTimer;
export function toast(msg, error = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), error ? 6000 : 3000);
}

// ---------- modal ----------
// bloqueado: no se puede cerrar sin terminar (p. ej. cambio obligatorio de contraseña)
export function abrirModal({ titulo, cuerpo, pie, bloqueado = false }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-back" ${bloqueado ? 'data-bloqueado' : 'data-cerrar'}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <div class="modal-head"><h2>${esc(titulo)}</h2>${bloqueado ? '' : '<button class="icon-btn" data-cerrar aria-label="Cerrar">✕</button>'}</div>
        <div class="modal-body">${cuerpo}</div>
        ${pie ? `<div class="modal-foot">${pie}</div>` : ''}
      </div>
    </div>`;
  root.querySelectorAll('[data-cerrar]').forEach((el) =>
    el.addEventListener('click', (e) => { if (e.target === el) cerrarModal(); }));
  const first = root.querySelector('input, select, textarea');
  first?.focus();
  return root.querySelector('.modal');
}
export const cerrarModal = () => (document.getElementById('modal-root').innerHTML = '');
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('#modal-root [data-bloqueado]')) cerrarModal();
});

// Contraseña legible para dar en persona: palabra-palabra-número
export function generarPassword() {
  const palabras = ['sol','mar','rio','luz','pino','roca','nube','lago','faro','trigo','cobre','plata','monte','brisa','cedro','olivo','arena','norte','cielo','bosque'];
  const r = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const a = r(palabras.length);
  const b = (a + 1 + r(palabras.length - 1)) % palabras.length;   // dos palabras distintas
  return `${palabras[a]}-${palabras[b]}-${1000 + r(9000)}`;
}

// ---------- imágenes ----------
export function comprimirImagen(file, maxDim = 1600, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; } else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir'))), 'image/jpeg', calidad);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

export const blobADataURL = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = rej;
  fr.readAsDataURL(blob);
});

// Sube una foto o PDF al almacenamiento y regresa su dirección.
// Si el almacenamiento la rechaza, la guarda dentro del registro (como hacían las páginas viejas).
export async function subirArchivo(blob, carpeta, ext = 'jpg', tipo = 'image/jpeg') {
  const ruta = `app/${estado.miembro.org_id}/${carpeta}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('comprobantes').upload(ruta, blob, { contentType: tipo, upsert: false });
  if (!error) return sb.storage.from('comprobantes').getPublicUrl(ruta).data.publicUrl;
  console.warn('Subida falló, se guarda en la base:', error.message);
  return blobADataURL(blob);
}

export function verFoto(url) {
  if (!url) return;
  abrirModal({ titulo: 'Foto', cuerpo: `<img src="${esc(url)}" alt="" style="width:100%;border-radius:8px">` });
}

export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function abrirComprobante(ruta) {
  if (!ruta) return;
  if (!ruta.startsWith('data:')) { window.open(ruta, '_blank', 'noopener'); return; }
  // Comprobantes viejos guardados dentro de la base (data URL)
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para ver el comprobante', true);
  const esPdf = ruta.startsWith('data:application/pdf');
  w.document.write(esPdf
    ? `<embed src="${ruta}" style="position:fixed;inset:0;width:100%;height:100%" type="application/pdf">`
    : `<body style="margin:0;background:#111;display:grid;place-items:center;height:100vh"><img src="${ruta}" style="max-width:100%;max-height:100%"></body>`);
}
