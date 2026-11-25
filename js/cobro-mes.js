// Tarjetas "cuánto llevo cobrado este mes" de mantenimiento y luz de un edificio (25/11/2026, petición de Andrés).
// Las usan Cobranza → Pagos del mes (para cambiar entre mantenimiento y luz) y el Resumen (acceso directo a Elysium).
import { fmt, esc } from './lib.js';

// Cifras de un concepto en un mes. filas: [{ cuota (número), exento (bool), pagado (número del mes) }]
// Igual que la cobranza: una unidad está pagada en el mes si tiene al menos un pago.
export function cifrasMes(filas) {
  const cobran = filas.filter((r) => !r.exento);
  const pagaron = cobran.filter((r) => r.pagado > 0).length;
  const esperado = cobran.reduce((s, r) => s + r.cuota, 0);
  const cobrado = filas.reduce((s, r) => s + r.pagado, 0);
  const pendiente = cobran.filter((r) => !(r.pagado > 0)).reduce((s, r) => s + r.cuota, 0);
  return { n: cobran.length, pagaron, faltan: cobran.length - pagaron, esperado, cobrado, pendiente,
    pct: esperado ? Math.min(100, Math.round(cobrado / esperado * 100)) : 0 };
}

const TITULO = { mantenimiento: 'Mantenimiento', luz: 'Luz (CFE)' };

// conceptos: { mantenimiento: cifras, luz: cifras }. destino(k): { href } o { data } para cada tarjeta.
export function tarjetasCobro({ conceptos, periodo, activo = '', destino }) {
  const ks = Object.keys(conceptos);
  const tot = ks.reduce((t, k) => ({ esperado: t.esperado + conceptos[k].esperado, cobrado: t.cobrado + conceptos[k].cobrado,
    pendiente: t.pendiente + conceptos[k].pendiente }), { esperado: 0, cobrado: 0, pendiente: 0 });
  const tarjeta = (k) => {
    const c = conceptos[k], d = destino(k);
    const tag = d.href ? 'a' : 'button';
    const attr = d.href ? `href="${esc(d.href)}"` : `type="button" data-conc="${k}"`;
    return `<${tag} class="cbm-c ${k === activo ? 'activo' : ''}" ${attr} aria-pressed="${k === activo}">
      <span class="cbm-eti">${TITULO[k]} · ${esc(periodo)}</span>
      <strong>${fmt(c.cobrado)}</strong>
      <span class="cbm-de">cobrado de ${fmt(c.esperado)}</span>
      <div class="ry-pista"><span style="width:${c.pct}%"></span></div>
      <small><b>${c.pagaron}</b> de ${c.n} unidades pagaron${c.faltan ? ` · por cobrar <b class="neg">${fmt(c.pendiente)}</b>` : ' · todas pagaron'}</small>
      <span class="cbm-ver">${k === activo ? 'Viendo la lista' : 'Ver lista →'}</span>
    </${tag}>`;
  };
  const pctT = tot.esperado ? Math.min(100, Math.round(tot.cobrado / tot.esperado * 100)) : 0;
  return `<div class="cbm ${ks.length > 1 ? '' : 'uno'}">
    ${ks.map(tarjeta).join('')}
    ${ks.length > 1 ? `<div class="cbm-c cbm-total">
      <span class="cbm-eti">Total del mes</span>
      <strong>${fmt(tot.cobrado)}</strong>
      <span class="cbm-de">cobrado de ${fmt(tot.esperado)}</span>
      <div class="ry-pista"><span style="width:${pctT}%"></span></div>
      <small>Por cobrar <b class="${tot.pendiente ? 'neg' : ''}">${fmt(tot.pendiente)}</b></small>
    </div>` : ''}
  </div>`;
}
