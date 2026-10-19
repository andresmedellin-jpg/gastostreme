// Recibo de pago con el formato de Grupo Inmobiliario Treme (el mismo para rentas, mantenimiento y luz).
// Se abre en una ventana nueva con dos botones: "Descargar PDF" (guarda el archivo directo, con html2pdf en
// js/vendor, cargado solo al usarlo) e "Imprimir" (impresión del navegador, tamaño carta).
import { MESES } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const dinero = (n, moneda = 'MXN') => (moneda === 'USD' ? 'US$' : '$') +
  Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fechaLarga = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  return `${String(d.getDate()).padStart(2, '0')} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
};

// Abrir la ventana ANTES de cualquier espera, para que el navegador no la bloquee
export function abrirVentanaRecibo() {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Generando recibo…</p>');
  return w;
}

// Logo y letra (Inter) van incrustados, para que salgan igual al guardar como PDF y sin depender de internet
const cache = {};
async function incrustar(ruta) {
  if (cache[ruta] !== undefined) return cache[ruta];
  try {
    const blob = await (await fetch(new URL(ruta, location.href))).blob();
    cache[ruta] = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
  } catch { cache[ruta] = ''; }
  return cache[ruta];
}
const logo = () => incrustar('img/logo-treme.png');
async function fuentes() {
  const pesos = await Promise.all([400, 600, 700].map((p) => incrustar(`fonts/inter-latin-${p}-normal.woff2`)));
  return [400, 600, 700].map((p, i) => pesos[i]
    ? `@font-face{font-family:Inter;font-weight:${p};font-style:normal;src:url(${pesos[i]}) format('woff2')}` : '').join('');
}

/**
 * d = { titulo, folio, fecha (ISO), info: [[etiqueta, valor], …], lineas: [{ concepto, detalle, cantidad, precio, subtotal }],
 *       total, moneda, liquidado, aviso, notas }
 */
export async function pintarRecibo(w, d) {
  const [img, ff] = await Promise.all([logo(), fuentes()]);
  const m = d.moneda || 'MXN';
  const libPDF = new URL('js/vendor/html2pdf.bundle.min.js', location.href).href;
  const quien = (d.info.find(([k]) => /recib[ií] de/i.test(k)) || [])[1] || '';
  const archivo = (`Recibo ${d.folio || ''} ${quien}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Recibo') + '.pdf';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(d.titulo || 'Recibo')}</title>
<style>
  ${ff}
  @page{size:letter;margin:0} *{box-sizing:border-box}
  body{margin:0;background:#eef0f3;font-family:Inter,Arial,Helvetica,sans-serif;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .barra{position:sticky;top:0;z-index:2;display:flex;gap:8px;justify-content:center;padding:12px;background:#1a1a1a}
  .barra button{font:600 14px Inter,Arial,sans-serif;padding:9px 16px;border-radius:4px;border:0;cursor:pointer}
  .hoja{width:8.5in;min-height:11in;max-width:100%;margin:24px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.1)}
  .topbar{height:8px;background:#8B1A1A}
  .c{padding:30px 54px 40px}
  .head{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1a1a1a;padding-bottom:16px;margin-bottom:22px;gap:16px}
  .head img{width:185px;max-width:45%;height:auto;object-fit:contain}
  .t{text-align:right} .t h1{font-size:19px;margin:0 0 6px;letter-spacing:.5px;font-weight:700}
  .t div{font-size:11.5px;margin:2px 0;color:#333} .t b{color:#8B1A1A}
  .st{color:#8B1A1A;font-weight:700;font-size:11px;margin:20px 0 8px;letter-spacing:.4px}
  table{width:100%;border-collapse:collapse}
  .info td{border:1px solid #d9d9d9;padding:8px 10px;font-size:11px} .info td.l{background:#f4f4f4;font-weight:600;width:24%}
  .det th{background:#1a1a1a;color:#fff;padding:8px 10px;font-size:10.5px;font-weight:600;text-align:left}
  .det td{border:1px solid #d9d9d9;padding:8px 10px;font-size:11px;vertical-align:middle}
  .r{text-align:right!important} .ce{text-align:center!important}
  .tot{margin-top:8px;font-size:11px} .tot div{display:flex;justify-content:flex-end;gap:8px;padding:4px 10px}
  .tot .g{background:#1a1a1a;color:#fff;font-weight:700;font-size:12px;padding:9px 10px;margin-top:4px}
  .estado{border:1.5px solid #8B1A1A;text-align:center;padding:11px;font-weight:700;font-size:11.5px;letter-spacing:.6px;margin:24px 0 20px}
  .nota{font-size:11px;margin:-6px 0 16px}
  .aviso{font-size:9.5px;font-style:italic;color:#555;border-top:1px solid #d9d9d9;padding-top:10px;text-align:center;line-height:1.6}
  .pie{margin-top:36px;border-top:1px solid #d9d9d9;padding-top:10px;text-align:center;font-size:8.5px;color:#888;line-height:1.6}
  .barra .ok{background:#8B1A1A;color:#fff} .barra button:disabled{opacity:.6;cursor:wait}
  body.pdf{width:8.5in;margin:0;background:#fff} body.pdf .barra{display:none}
  body.pdf .hoja{margin:0;box-shadow:none;width:8.5in;max-width:none;min-height:0}
  @media print{body{background:#fff}.barra{display:none}.hoja{margin:0;box-shadow:none;width:100%;min-height:0}}
  @media (max-width:640px){.c{padding:20px 16px}.head{flex-direction:column;align-items:flex-start}.head img{max-width:60%}.t{text-align:left}}
</style></head><body>
<div class="barra"><button class="ok" id="pdf">Descargar PDF</button><button onclick="print()">Imprimir</button><button onclick="close()">Cerrar</button></div>
<div class="hoja"><div class="topbar"></div><div class="c">
  <div class="head">${img ? `<img src="${img}" alt="Grupo Inmobiliario Treme">` : '<strong style="font-size:24px">Grupo Inmobiliario Treme</strong>'}
    <div class="t"><h1>RECIBO DE PAGO</h1><div>Folio: <b>${esc(d.folio || '—')}</b></div><div>Fecha: ${fechaLarga(d.fecha)}</div></div></div>
  <div class="st">INFORMACIÓN DE PAGO</div>
  <table class="info">${d.info.map(([k, v]) => `<tr><td class="l">${esc(k)}:</td><td>${esc(v)}</td></tr>`).join('')}</table>
  <div class="st">DETALLE DE CONCEPTOS</div>
  <table class="det">
    <tr><th style="width:6%">#</th><th>Concepto</th><th class="ce" style="width:13%">Cantidad</th><th class="r" style="width:17%">Precio Unit.</th><th class="r" style="width:17%">Subtotal</th></tr>
    ${d.lineas.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.concepto)}${l.detalle ? `<br>${esc(l.detalle)}` : ''}</td>
      <td class="ce">${esc(l.cantidad ?? 1)}</td><td class="r">${dinero(l.precio, m)}</td><td class="r">${dinero(l.subtotal, m)}</td></tr>`).join('')}
  </table>
  <div class="tot">
    <div><span>Subtotal:</span><span>${dinero(d.total, m)}</span></div>
    <div><span>IVA (incluido):</span><span>Incluido en el total</span></div>
    <div class="g"><span>TOTAL PAGADO:</span><span>${dinero(d.total, m)} ${m}</span></div>
  </div>
  <div class="estado">${d.liquidado === false ? 'PAGO RECIBIDO' : 'PAGO RECIBIDO — LIQUIDADO EN SU TOTALIDAD'}</div>
  ${d.notas ? `<div class="nota"><b>Notas:</b> ${esc(d.notas)}</div>` : ''}
  <div class="aviso">${esc(d.aviso)} Para cualquier aclaración, comuníquese con el departamento de administración de Grupo Inmobiliario Treme.</div>
  <div class="pie">Grupo Inmobiliario Treme<br>Este recibo es comprobante de pago válido • Consérvelo para sus registros</div>
</div></div>
<script>
  // Descarga directa del PDF (tamaño carta), con el nombre del folio y de quien pagó
  document.getElementById('pdf').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Generando PDF…';
    function listo() { b.disabled = false; b.textContent = 'Descargar PDF'; }
    function generar() {
      document.body.classList.add('pdf');
      html2pdf().set({
        margin: 0, filename: ${JSON.stringify(archivo)},
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: Math.max(816, window.innerWidth), scrollY: 0, scrollX: 0 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] }
      }).from(document.querySelector('.hoja')).toContainer()
        .then(function () { var c = this.prop.container; c.style.marginLeft = '0'; c.style.marginRight = '0'; }) // sin esto sale recorrido en pantallas anchas
        .save()
        .then(function () { document.body.classList.remove('pdf'); listo(); })
        .catch(function (e) { document.body.classList.remove('pdf'); listo(); alert('No se pudo generar el PDF: ' + e.message + '. Usa Imprimir → Guardar como PDF.'); });
    }
    if (window.html2pdf) return generar();
    var sc = document.createElement('script'); sc.src = ${JSON.stringify(libPDF)};
    sc.onload = generar;
    sc.onerror = function () { listo(); alert('No se pudo cargar el generador de PDF. Usa Imprimir → Guardar como PDF.'); };
    document.head.appendChild(sc);
  });
</script></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}
