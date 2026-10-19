// PDF de cotización con la marca de la instalación (logo y nombre de MARCA en config.js), tamaño carta.
// Misma mecánica que los recibos: ventana nueva con "Descargar PDF" (html2pdf, en js/vendor) e "Imprimir".
import { MARCA } from './config.js';
import { totales } from './modulos/cotizaciones.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const larga = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };

async function comoDato(src) {
  if (!src || src.startsWith('data:')) return src || '';
  try {
    const b = await (await fetch(new URL(src, location.href))).blob();
    return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
  } catch { return ''; }
}

export async function pdfCotizacion(c, empresaDe) {
  const w = window.open('', '_blank');
  if (!w) return alert('Permite ventanas emergentes para ver la cotización');
  w.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Generando cotización…</p>');
  const emp = empresaDe(c.empresa_id) || {};
  const logo = await comoDato(MARCA.logoDocumento || MARCA.logos[0]?.src);
  const t = totales(c.partidas);
  const color = MARCA.color || '#8B1A1A';
  const vence = (() => { const d = new Date(c.fecha + 'T12:00:00'); d.setDate(d.getDate() + Number(c.vigencia_dias || 15)); return d.toISOString().slice(0, 10); })();
  const archivo = `Cotizacion ${c.folio} ${c.cliente}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
  const libPDF = new URL('js/vendor/html2pdf.bundle.min.js', location.href).href;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(c.folio)} · ${esc(c.cliente)}</title>
<style>
  @page{size:letter;margin:0} *{box-sizing:border-box}
  body{margin:0;background:#eef0f3;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .barra{position:sticky;top:0;z-index:2;display:flex;gap:8px;justify-content:center;padding:12px;background:#1a1a1a}
  .barra button{font:600 14px Arial,sans-serif;padding:9px 16px;border-radius:4px;border:0;cursor:pointer}
  .barra .ok{background:${color};color:#fff} .barra button:disabled{opacity:.6;cursor:wait}
  .hoja{width:8.5in;min-height:11in;max-width:100%;margin:24px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.1)}
  body.pdf{width:8.5in;margin:0;background:#fff} body.pdf .barra{display:none} body.pdf .hoja{margin:0;box-shadow:none;width:8.5in;max-width:none;min-height:0}
  .top{height:8px;background:${color}} .c{padding:30px 54px 36px}
  .head{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1.5px solid #1a1a1a;padding-bottom:16px;margin-bottom:20px}
  .head img{max-width:200px;max-height:70px;object-fit:contain} .emp{font-size:10px;color:#555;margin-top:6px;line-height:1.5}
  .t{text-align:right} .t h1{font-size:20px;margin:0 0 6px;letter-spacing:.5px} .t div{font-size:11.5px;margin:2px 0;color:#333} .t b{color:${color}}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .caja{border:1px solid #d9d9d9;padding:10px 12px;font-size:11px;line-height:1.6} .caja .l{color:${color};font-weight:700;font-size:10px;letter-spacing:.4px}
  .asunto{font-size:12px;margin:0 0 12px} table{width:100%;border-collapse:collapse}
  th{background:#1a1a1a;color:#fff;padding:8px 10px;font-size:10.5px;text-align:left} td{border:1px solid #d9d9d9;padding:7px 10px;font-size:11px;vertical-align:top}
  .r{text-align:right} .ce{text-align:center} small{color:#777;font-size:9.5px}
  .tot{margin:10px 0 0 auto;width:46%;font-size:11.5px} .tot div{display:flex;justify-content:space-between;padding:4px 10px}
  .tot .g{background:#1a1a1a;color:#fff;font-weight:700;font-size:13px;padding:9px 10px;margin-top:4px}
  .cond{font-size:10.5px;color:#333;margin-top:22px;border-top:1px solid #d9d9d9;padding-top:10px;line-height:1.6}
  .firma{margin-top:46px;display:flex;justify-content:space-between;gap:40px;font-size:10.5px;text-align:center}
  .firma div{flex:1;border-top:1px solid #1a1a1a;padding-top:6px}
  .pie{margin-top:26px;text-align:center;font-size:8.5px;color:#888}
  @media print{body{background:#fff}.barra{display:none}.hoja{margin:0;box-shadow:none;width:100%;min-height:0}}
</style></head><body>
<div class="barra"><button class="ok" id="pdf">Descargar PDF</button><button onclick="print()">Imprimir</button><button onclick="close()">Cerrar</button></div>
<div class="hoja"><div class="top"></div><div class="c">
  <div class="head"><div>${logo ? `<img src="${logo}" alt="">` : `<strong style="font-size:22px">${esc(emp.nombre || MARCA.nombre)}</strong>`}
      <div class="emp">${esc(emp.nombre || '')}${emp.rfc ? ' · RFC ' + esc(emp.rfc) : ''}${MARCA.contacto ? '<br>' + esc(MARCA.contacto) : ''}</div></div>
    <div class="t"><h1>COTIZACIÓN</h1><div>Folio: <b>${esc(c.folio)}</b></div><div>Fecha: ${larga(c.fecha)}</div><div>Vigencia: hasta el ${larga(vence)}</div></div></div>
  <div class="grid">
    <div class="caja"><div class="l">CLIENTE</div><b>${esc(c.cliente)}</b>${c.contacto ? `<br>Atención: ${esc(c.contacto)}` : ''}${c.correo ? `<br>${esc(c.correo)}` : ''}</div>
    <div class="caja"><div class="l">CONDICIONES</div>Moneda: pesos mexicanos (MXN)<br>IVA: 16 %<br>Vigencia: ${Number(c.vigencia_dias || 15)} días</div>
  </div>
  ${c.titulo ? `<p class="asunto"><b>Asunto:</b> ${esc(c.titulo)}</p>` : ''}
  <table><tr><th style="width:5%">#</th><th>Descripción</th><th class="ce" style="width:10%">Cant.</th><th class="r" style="width:16%">Precio unit.</th><th class="r" style="width:16%">Importe</th></tr>
    ${c.partidas.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.descripcion)}${x.clave ? `<br><small>Clave ${esc(x.clave)}</small>` : ''}</td>
      <td class="ce">${esc(x.cantidad)} ${esc(x.unidad === 'servicio' ? '' : x.unidad || '')}</td><td class="r">${dinero(x.precio)}</td><td class="r">${dinero(Number(x.cantidad) * Number(x.precio))}</td></tr>`).join('')}
  </table>
  <div class="tot"><div><span>Subtotal</span><span>${dinero(t.subtotal)}</span></div><div><span>IVA 16 %</span><span>${dinero(t.iva)}</span></div>
    <div class="g"><span>TOTAL</span><span>${dinero(t.total)} MXN</span></div></div>
  ${c.condiciones ? `<div class="cond"><b>Condiciones y notas:</b> ${esc(c.condiciones)}</div>` : ''}
  <div class="firma"><div>Elaboró<br>${esc(emp.nombre || MARCA.nombre)}</div><div>Acepto la cotización<br>${esc(c.cliente)}</div></div>
  <div class="pie">${esc(emp.nombre || MARCA.nombre)} · Cotización ${esc(c.folio)}</div>
</div></div>
<script>
  document.getElementById('pdf').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Generando PDF…';
    function listo() { b.disabled = false; b.textContent = 'Descargar PDF'; }
    function generar() {
      document.body.classList.add('pdf');
      html2pdf().set({ margin: 0, filename: ${JSON.stringify(archivo)}, image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: Math.max(816, window.innerWidth), scrollY: 0, scrollX: 0 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] }
      }).from(document.querySelector('.hoja')).toContainer()
        .then(function () { var c = this.prop.container; c.style.marginLeft = '0'; c.style.marginRight = '0'; })
        .save().then(function () { document.body.classList.remove('pdf'); listo(); })
        .catch(function (e) { document.body.classList.remove('pdf'); listo(); alert('No se pudo generar el PDF: ' + e.message + '. Usa Imprimir → Guardar como PDF.'); });
    }
    if (window.html2pdf) return generar();
    var sc = document.createElement('script'); sc.src = ${JSON.stringify(libPDF)}; sc.onload = generar;
    sc.onerror = function () { listo(); alert('No se pudo cargar el generador de PDF. Usa Imprimir → Guardar como PDF.'); };
    document.head.appendChild(sc);
  });
</script></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}
