// Lee un estado de cuenta PDF de BBVA México (empresas: Maestra PyME, etc.) y devuelve sus movimientos.
// Se usa en el navegador (pdf.js de js/vendor) y en las pruebas con Node: recibe la librería pdf.js ya cargada.
// Comprueba contra los totales que trae el propio estado de cuenta ("TOTAL IMPORTE CARGOS / ABONOS").

const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };
const DINERO = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;
const num = (s) => Number(String(s).replace(/,/g, ''));
const PIE = /Estimado Cliente|Su Estado de Cuenta|También le informamos|el cual puede consultarlo|Con BBVA adelante|La GAT Real|BBVA MEXICO, S\.A\.|Paseo de la Reforma|PAGINA \d|MAESTRA PYME|Estado de Cuenta$|No\. Cuenta|No\. Cliente/;

async function lineas(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pag = await doc.getPage(n);
    const tc = await pag.getTextContent();
    const porY = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const k = [...porY.keys()].find((v) => Math.abs(v - y) <= 2) ?? y;
      if (!porY.has(k)) porY.set(k, []);
      porY.get(k).push({ x: it.transform[4], fin: it.transform[4] + it.width, t: it.str.trim() });
    }
    const ls = [...porY.entries()].sort((a, b) => b[0] - a[0])
      .map(([, its]) => { its.sort((a, b) => a.x - b.x); return { its, texto: its.map((i) => i.t).join(' ') }; });
    paginas.push(ls);
  }
  return paginas;
}

export async function leerEstadoBBVA(pdfjs, data) {
  const paginas = await lineas(pdfjs, data);
  const todo = paginas.flat().map((l) => l.texto).join('\n');
  const per = todo.match(/DEL (\d\d)\/(\d\d)\/(\d{4}) AL (\d\d)\/(\d\d)\/(\d{4})/);
  if (!per || !/BBVA/.test(todo)) throw new Error('No parece un estado de cuenta de BBVA');
  const desde = `${per[3]}-${per[2]}-${per[1]}`, hasta = `${per[6]}-${per[5]}-${per[4]}`;
  const finAnio = +per[6], finMes = +per[5];
  const cuenta = (todo.match(/No\. de Cuenta\s+(\d{6,})/) || todo.match(/No\. Cuenta\s+(\d{6,})/) || [])[1] || '';
  const rfc = (todo.match(/R\.F\.C\s+([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/) || [])[1] || '';
  const titular = (paginas.flat().find((l) => /S\.?A\.? DE C\.?V|S\.A\.P\.I|S DE RL/i.test(l.texto) && !/BBVA/.test(l.texto))?.its[0].t) || '';
  const producto = (todo.match(/\n(MAESTRA PYME BBVA|[A-Z ]+ BBVA)\n/) || [])[1] || 'Cuenta BBVA';
  const totCargos = num((todo.match(/TOTAL IMPORTE CARGOS\s+([\d,]+\.\d\d)/) || [])[1] || 0);
  const totAbonos = num((todo.match(/TOTAL IMPORTE ABONOS\s+([\d,]+\.\d\d)/) || [])[1] || 0);

  const fecha = (dm) => {
    const [d, m] = dm.split('/'); const mes = MESES[m];
    const anio = mes > finMes ? finAnio - 1 : finAnio;            // estado de enero que trae movimientos de diciembre
    return `${anio}-${String(mes).padStart(2, '0')}-${d}`;
  };

  const movs = [];
  let colC = 413, colA = 470, actual = null, fin = false;
  for (const ls of paginas) {
    for (const l of ls) {
      const its = l.its;
      const iC = its.find((i) => i.t === 'CARGOS'), iA = its.find((i) => i.t === 'ABONOS');
      if (iC && iA) { colC = iC.fin; colA = iA.fin; continue; }
      if (/Total de Movimientos|TOTAL IMPORTE/.test(l.texto)) { if (actual) movs.push(actual); actual = null; fin = true; continue; }
      if (fin) continue;
      const m0 = its[0].t.match(/^(\d\d\/[A-Z]{3})$/);
      if (m0 && its[0].x < 40) {
        if (actual) movs.push(actual);
        const montos = its.filter((i) => DINERO.test(i.t) && i.x > 300 && i.fin < colA + 25);
        const texto = its.filter((i) => !DINERO.test(i.t)).map((i) => i.t).slice(1).join(' ');
        const mm = texto.match(/^(\d\d\/[A-Z]{3})\s+([A-Z0-9]{3})\s+(.*)$/);
        if (!mm || !montos.length) { actual = null; continue; }
        const a = montos[0];
        actual = {
          fecha: fecha(m0[1]), fecha_liq: fecha(mm[1]), codigo: mm[2], descripcion: mm[3].replace(/\s+/g, ' ').trim(),
          tipo: Math.abs(a.fin - colC) < Math.abs(a.fin - colA) ? 'cargo' : 'abono', monto: num(a.t), lineas: [],
        };
        continue;
      }
      if (actual && its[0].x > 60 && its[0].x < 300 && !PIE.test(l.texto)) actual.lineas.push(l.texto.replace(/\s+/g, ' '));
    }
  }
  if (actual) movs.push(actual);

  // Detalle legible: concepto/referencia (1a línea) y quién pagó (última línea de un SPEI)
  const vistos = new Map();
  for (const m of movs) {
    const ls = m.lineas;
    m.detalle = ls[0] || '';
    const ultima = ls[ls.length - 1] || '';
    m.quien = /SPEI/.test(m.descripcion) && ls.length > 1 && /^[A-ZÁÉÍÓÚÑ ,.&]+$/i.test(ultima) && !/^\d/.test(ultima) && !/BNET|Ref\./.test(ultima) ? ultima : '';
    const ref = (m.detalle.match(/Ref\. ?([\w*]+)/) || [])[1] || m.detalle.slice(0, 40);
    const base = [m.fecha, m.codigo, m.tipo, m.monto.toFixed(2), ref].join('|');
    const n = (vistos.get(base) || 0) + 1; vistos.set(base, n);
    m.huella = n > 1 ? `${base}|${n}` : base;
    delete m.lineas;
  }
  const suma = (t) => Math.round(movs.filter((m) => m.tipo === t).reduce((s, m) => s + m.monto, 0) * 100) / 100;
  return {
    banco: 'BBVA', producto, cuenta, terminacion: cuenta.slice(-4), rfc, titular, desde, hasta, movs,
    totales: { cargos: totCargos, abonos: totAbonos, leidosCargos: suma('cargo'), leidosAbonos: suma('abono') },
    cuadra: Math.abs(suma('cargo') - totCargos) < 0.01 && Math.abs(suma('abono') - totAbonos) < 0.01,
  };
}
