import { esc } from '../lib.js';

// Pantalla para módulos que todavía se están migrando
export function render(view, mod) {
  const ligas = (mod.legacy || []).map(([t, url]) =>
    `<a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('');
  view.innerHTML = `
    <div class="migrando">
      <div class="migrando-ico">${mod.icono}</div>
      <h2>${esc(mod.titulo)} se está migrando</h2>
      <p>Mientras termino esta pantalla, sigue usando la herramienta de siempre. Al terminarla, paso al día lo que hayas capturado ahí.</p>
      ${ligas ? `<div class="migrando-ligas">${ligas}</div>` : ''}
    </div>`;
}
