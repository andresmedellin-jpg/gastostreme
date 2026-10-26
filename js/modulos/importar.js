// Alta de un cliente con Excel: se baja la plantilla, se llena (unidades, inquilinos, empleados, medidores) y se sube.
// Antes de guardar se enseña qué entra y qué tiene errores; nada se guarda hasta que el dueño le da "Importar".
// Lo que ya existe (misma unidad en el mismo edificio, mismo empleado, mismo medidor) no se duplica.
import { db, todo, estado, esc, toast, normalizar, hoyISO } from '../lib.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const TIPOS_UNIDAD = { local: 'local', depto: 'depto', departamento: 'depto', oficina: 'oficina', bodega: 'bodega', casa: 'casa', terreno: 'terreno', loft: 'loft', otro: 'otro' };
const SERVICIOS = { luz: 'luz', electricidad: 'luz', gas: 'gas', agua: 'agua' };

// Hojas de la plantilla: columnas (la primera fila del Excel) y un renglón de ejemplo
const HOJAS = {
  Unidades:   { cols: ['Edificio', 'Unidad', 'Tipo', 'Metros'], ej: ['Torre 1', 'Depto 301', 'depto', 85],
                ayuda: 'Cada local, oficina o departamento. Tipo: local, depto, oficina, bodega, casa, terreno, loft u otro.' },
  Inquilinos: { cols: ['Edificio', 'Unidad', 'Inquilino', 'Renta', 'Día de pago', 'Teléfono', 'Correo', 'Inicio', 'Fin'],
                ej: ['Torre 1', 'Depto 301', 'Juan Pérez', 14500, 5, '8112345678', 'juan@correo.com', '2026-01-01', '2026-12-31'],
                ayuda: 'Un renglón por contrato de renta vigente. Si la unidad no está en la hoja Unidades, se crea.' },
  Empleados:  { cols: ['Nombre', 'Puesto', 'Centro', 'Sueldo semanal', 'Días por semana', 'Fecha de ingreso', 'Entrada', 'Salida'],
                ej: ['María López', 'Limpieza', 'Torre 1', 2800, 6, '2024-03-15', '08:00', '17:00'],
                ayuda: 'Centro = dónde trabaja (debe existir). Fecha de ingreso cuenta para vacaciones.' },
  Medidores:  { cols: ['Edificio', 'Unidad', 'Servicio', 'Serie', 'Lectura inicial', 'Dónde está', 'Orden'],
                ej: ['Torre 1', 'Depto 301', 'luz', 'L1234567', 15230, 'Cuarto de medidores', 1],
                ayuda: 'Servicio: luz, gas o agua. Lectura inicial = la última lectura tomada antes de empezar.' },
};

let raiz, plan = null;

export async function render(view) {
  raiz = view;
  document.getElementById('page-actions').innerHTML = '';
  view.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h3>1 · Baja la plantilla y llénala</h3><button class="btn btn-ghost" id="im-plantilla">Descargar plantilla de Excel</button></div>
      <ul class="im-lista">${Object.entries(HOJAS).map(([h, x]) => `<li><b>${h}:</b> ${esc(x.ayuda)}</li>`).join('')}</ul>
      <p class="nota">No tienes que llenar todas las hojas: puedes subir solo las que tengas. Los centros y edificios deben existir: ${estado.centros.map((c) => `<b>${esc(c.nombre)}</b>`).join(', ') || 'todavía no hay'}.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>2 · Sube el archivo</h3></div>
      <label class="im-archivo" for="im-file"><input type="file" id="im-file" accept=".xlsx,.xls,.csv" hidden>
        <span id="im-file-txt">Toca para elegir el Excel (.xlsx) o un .csv</span></label>
    </section>
    <div id="im-revision"></div>`;
  view.querySelector('#im-plantilla').addEventListener('click', plantilla);
  view.querySelector('#im-file').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) leer(f); });
}

let carga;
const cargarXLSX = () => carga ||= new Promise((ok, mal) => {
  if (window.XLSX) return ok(window.XLSX);
  const s = document.createElement('script'); s.src = XLSX_URL;
  s.onload = () => ok(window.XLSX); s.onerror = () => { carga = null; mal(new Error('No se pudo cargar el lector de Excel. Revisa tu internet.')); };
  document.head.appendChild(s);
});

async function plantilla() {
  try {
    const X = await cargarXLSX();
    const wb = X.utils.book_new();
    for (const [h, x] of Object.entries(HOJAS)) {
      const ws = X.utils.aoa_to_sheet([x.cols, x.ej]);
      ws['!cols'] = x.cols.map((c) => ({ wch: Math.max(12, c.length + 4) }));
      X.utils.book_append_sheet(wb, ws, h);
    }
    X.writeFile(wb, 'Plantilla de alta.xlsx');
  } catch (e) { toast(e.message, true); }
}

// ---------- lectura y revisión ----------
const clave = (s) => normalizar(s).replace(/[^a-z0-9]/g, '');
const txt = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
function fecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return 'mal';
}
const hora = (v) => { const s = txt(v); if (!s) return null; const m = s.match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}:00` : 'mal'; };

async function leer(file) {
  raiz.querySelector('#im-file-txt').textContent = `Leyendo ${file.name}…`;
  try {
    const X = await cargarXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const hojas = {};
    for (const nombre of wb.SheetNames) {
      const h = Object.keys(HOJAS).find((k) => clave(k) === clave(nombre)) || (wb.SheetNames.length === 1 ? adivinar(X, wb.Sheets[nombre]) : null);
      if (!h) continue;
      const filas = X.utils.sheet_to_json(wb.Sheets[nombre], { defval: '', raw: true });
      // las columnas se reconocen sin importar acentos o mayúsculas
      hojas[h] = filas.map((f, i) => ({ n: i + 2, v: Object.fromEntries(Object.entries(f).map(([k, x]) => [clave(k), x])) }))
        .filter((r) => Object.values(r.v).some((x) => txt(x) !== ''));
    }
    if (!Object.keys(hojas).length) throw new Error('No encontré hojas con los nombres de la plantilla (Unidades, Inquilinos, Empleados, Medidores).');
    raiz.querySelector('#im-file-txt').textContent = `${file.name} · toca para cambiar de archivo`;
    plan = await revisar(hojas);
    pintarRevision();
  } catch (e) {
    raiz.querySelector('#im-file-txt').textContent = 'Toca para elegir el Excel (.xlsx) o un .csv';
    toast(e.message || 'No se pudo leer el archivo', true);
  }
}
// Un .csv de una sola hoja: se adivina cuál es por sus columnas
function adivinar(X, ws) {
  const cab = (X.utils.sheet_to_json(ws, { header: 1 })[0] || []).map(clave);
  let mejor = null, pts = 0;
  for (const [h, x] of Object.entries(HOJAS)) { const p = x.cols.filter((c) => cab.includes(clave(c))).length; if (p > pts) { pts = p; mejor = h; } }
  return pts >= 2 ? mejor : null;
}

async function revisar(hojas) {
  const centroDe = (nombre) => estado.centros.find((c) => clave(c.nombre) === clave(nombre));
  const [u, e, m] = await Promise.all([
    todo(() => db().from('unidades').select('id, centro_id, identificador')),
    todo(() => db().from('empleados').select('id, nombre')),
    hojas.Medidores ? todo(() => db().from('medidores').select('id, unidad_id, servicio')) : { data: [] },
  ]);
  const unidades = u.data || [], empleados = e.data || [], medidores = m.data || [];
  const p = { Unidades: [], Inquilinos: [], Empleados: [], Medidores: [], unidadesNuevas: new Map() };
  const keyU = (c, id) => `${c}|${clave(id)}`;
  const existeU = (c, id) => unidades.find((x) => x.centro_id === c && clave(x.identificador) === clave(id));
  // unidad que pide otra hoja: si no existe ni viene en Unidades, se crea
  const pedirUnidad = (c, id, tipo = 'otro') => { if (!existeU(c, id) && !p.unidadesNuevas.has(keyU(c, id))) p.unidadesNuevas.set(keyU(c, id), { centro_id: c, identificador: txt(id), tipo, superficie_m2: null }); };

  for (const r of hojas.Unidades || []) {
    const v = r.v, c = centroDe(v.edificio), errs = [];
    if (!txt(v.edificio)) errs.push('Falta el edificio'); else if (!c) errs.push(`No existe "${txt(v.edificio)}"`);
    if (!txt(v.unidad)) errs.push('Falta la unidad');
    const tipo = TIPOS_UNIDAD[clave(v.tipo)] || (txt(v.tipo) ? null : 'otro');
    if (!tipo) errs.push(`Tipo "${txt(v.tipo)}" no válido`);
    const m2 = num(v.metros); if (Number.isNaN(m2)) errs.push('Metros no es número');
    const ya = c && existeU(c.id, v.unidad);
    p.Unidades.push({ n: r.n, desc: `${txt(v.edificio)} · ${txt(v.unidad)}`, errs, ya: !!ya || (c && p.unidadesNuevas.has(keyU(c.id, v.unidad))) });
    if (!errs.length && !ya) p.unidadesNuevas.set(keyU(c.id, v.unidad), { centro_id: c.id, identificador: txt(v.unidad), tipo, superficie_m2: m2 });
  }
  for (const r of hojas.Inquilinos || []) {
    const v = r.v, c = centroDe(v.edificio), errs = [];
    if (!c) errs.push(txt(v.edificio) ? `No existe "${txt(v.edificio)}"` : 'Falta el edificio');
    if (!txt(v.unidad)) errs.push('Falta la unidad');
    if (!txt(v.inquilino)) errs.push('Falta el inquilino');
    const renta = num(v.renta); if (renta == null || Number.isNaN(renta)) errs.push('Renta no es número');
    const dia = num(v.diadepago); if (dia != null && (Number.isNaN(dia) || dia < 1 || dia > 31)) errs.push('Día de pago entre 1 y 31');
    const ini = fecha(v.inicio), fin = fecha(v.fin); if (ini === 'mal' || fin === 'mal') errs.push('Fecha no válida (usa 2026-01-31 o 31/01/2026)');
    if (!errs.length) pedirUnidad(c.id, v.unidad);
    p.Inquilinos.push({ n: r.n, desc: `${txt(v.unidad)} · ${txt(v.inquilino)}`, errs,
      fila: errs.length ? null : { centro_id: c.id, unidad: txt(v.unidad), arrendatario: txt(v.inquilino), monto: renta, moneda: 'MXN', dia_pago: dia || null,
        telefono: txt(v.telefono) || null, email: txt(v.correo) || null, fecha_inicio: ini, fecha_fin: fin, activo: true } });
  }
  for (const r of hojas.Empleados || []) {
    const v = r.v, c = centroDe(v.centro), errs = [];
    if (!txt(v.nombre)) errs.push('Falta el nombre');
    if (txt(v.centro) && !c) errs.push(`No existe el centro "${txt(v.centro)}"`);
    const sueldo = num(v.sueldosemanal); if (Number.isNaN(sueldo)) errs.push('Sueldo no es número');
    const dias = num(v.diasporsemana); if (dias != null && (Number.isNaN(dias) || dias < 1 || dias > 7)) errs.push('Días por semana entre 1 y 7');
    const ing = fecha(v.fechadeingreso); if (ing === 'mal') errs.push('Fecha de ingreso no válida');
    const he = hora(v.entrada), hs = hora(v.salida); if (he === 'mal' || hs === 'mal') errs.push('Hora no válida (usa 08:00)');
    const ya = empleados.some((x) => clave(x.nombre) === clave(v.nombre));
    const empresa = (c ? estado.empresas.find((x) => x.id === c.empresa_id) : estado.empresas[0])?.id;
    p.Empleados.push({ n: r.n, desc: txt(v.nombre), errs, ya,
      fila: errs.length || ya ? null : { empresa_id: empresa, centro_id: c?.id || null, nombre: txt(v.nombre), puesto: txt(v.puesto) || null,
        salario_semanal: sueldo || 0, dias_semana: dias || 6, fecha_ingreso: ing, ...(he ? { hora_entrada: he } : {}), ...(hs ? { hora_salida: hs } : {}), activo: true } });
  }
  for (const r of hojas.Medidores || []) {
    const v = r.v, c = centroDe(v.edificio), errs = [];
    if (!c) errs.push(txt(v.edificio) ? `No existe "${txt(v.edificio)}"` : 'Falta el edificio');
    if (!txt(v.unidad)) errs.push('Falta la unidad');
    const serv = SERVICIOS[clave(v.servicio)]; if (!serv) errs.push('Servicio: luz, gas o agua');
    const ini = num(v.lecturainicial); if (Number.isNaN(ini)) errs.push('Lectura inicial no es número');
    const orden = num(v.orden); if (Number.isNaN(orden)) errs.push('Orden no es número');
    const uni = c && existeU(c.id, v.unidad);
    const ya = uni && medidores.some((x) => x.unidad_id === uni.id && x.servicio === serv);
    if (!errs.length && !ya) pedirUnidad(c.id, v.unidad);
    p.Medidores.push({ n: r.n, desc: `${txt(v.unidad)} · ${txt(v.servicio)}`, errs, ya,
      fila: errs.length || ya ? null : { centro_id: c.id, unidad: txt(v.unidad), servicio: serv, serie: txt(v.serie) || null, lectura_inicial: ini || 0,
        zona: txt(v.dondeesta) || null, orden: orden ?? 0, activo: true } });
  }
  p.hojas = Object.keys(hojas);
  p.unidades = unidades;
  return p;
}

function pintarRevision() {
  const el = raiz.querySelector('#im-revision');
  const res = p => ({ ok: p.filter((r) => !r.errs.length && !r.ya).length, ya: p.filter((r) => r.ya && !r.errs.length).length, mal: p.filter((r) => r.errs.length) });
  const hojas = plan.hojas.map((h) => ({ h, ...res(plan[h]) }));
  const nuevasUnidades = plan.unidadesNuevas.size;
  const total = hojas.reduce((a, x) => a + (x.h === 'Unidades' ? 0 : x.ok), 0) + nuevasUnidades;
  const errores = hojas.flatMap((x) => x.mal.map((r) => ({ h: x.h, ...r })));
  el.innerHTML = `<section class="panel">
    <div class="panel-head"><h3>3 · Revisa y confirma</h3>
      <button class="btn btn-primary" id="im-ok" ${total ? '' : 'disabled'}>Importar ${total} registro${total === 1 ? '' : 's'}</button></div>
    <div class="kpis">${hojas.map((x) => `<div class="kpi"><span>${x.h}</span>
      <strong>${x.h === 'Unidades' ? nuevasUnidades : x.ok}</strong><small>${x.h === 'Unidades' ? 'unidades nuevas (con las que piden otras hojas)' : 'nuevos'}${x.ya ? ` · ${x.ya} ya existían` : ''}${x.mal.length ? ` · <b style="color:var(--neg)">${x.mal.length} con error</b>` : ''}</small></div>`).join('')}</div>
    ${errores.length ? `<h3 style="margin-top:14px">Renglones con error (no se importan)</h3>
      <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Hoja</th><th>Renglón</th><th>Qué es</th><th>Problema</th></tr></thead>
      <tbody>${errores.slice(0, 200).map((r) => `<tr><td>${r.h}</td><td class="num">${r.n}</td><td>${esc(r.desc)}</td><td style="color:var(--neg)">${esc(r.errs.join(' · '))}</td></tr>`).join('')}</tbody></table></div>
      <p class="nota" style="margin-top:10px">Corrige el Excel y vuélvelo a subir; lo que ya se haya importado no se duplica.</p>` : '<p class="nota">Todo se ve bien. Lo que ya existía no se vuelve a crear.</p>'}
  </section>`;
  el.querySelector('#im-ok').addEventListener('click', importar);
}

async function insertar(tabla, filas, devolver = 'id') {
  const fuera = [];
  for (let i = 0; i < filas.length; i += 500) {
    const { data, error } = await db().from(tabla).insert(filas.slice(i, i + 500)).select(devolver);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    fuera.push(...data);
  }
  return fuera;
}

async function importar(ev) {
  const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Importando…';
  const org = estado.miembro.org_id, hecho = [];
  try {
    const nuevas = [...plan.unidadesNuevas.values()].map((x) => ({ ...x, org_id: org, activo: true }));
    const creadas = nuevas.length ? await insertar('unidades', nuevas, 'id, centro_id, identificador') : [];
    if (creadas.length) hecho.push(`${creadas.length} unidades`);
    const todas = [...plan.unidades, ...creadas];
    const idU = (c, id) => todas.find((x) => x.centro_id === c && clave(x.identificador) === clave(id))?.id;
    const contratos = plan.Inquilinos.filter((r) => r.fila).map(({ fila: { unidad, ...f } }) => ({ ...f, org_id: org, unidad_id: idU(f.centro_id, unidad) }));
    if (contratos.length) { await insertar('contratos', contratos); hecho.push(`${contratos.length} inquilinos`); }
    const emps = plan.Empleados.filter((r) => r.fila).map((r) => ({ ...r.fila, org_id: org }));
    if (emps.length) { await insertar('empleados', emps); hecho.push(`${emps.length} empleados`); }
    const meds = plan.Medidores.filter((r) => r.fila).map(({ fila: { unidad, ...f } }) => ({ ...f, org_id: org, unidad_id: idU(f.centro_id, unidad) }));
    if (meds.length) { await insertar('medidores', meds); hecho.push(`${meds.length} medidores`); }
    toast(hecho.length ? `Importado: ${hecho.join(', ')} ✓` : 'No había nada nuevo que importar');
    raiz.querySelector('#im-revision').innerHTML = `<section class="panel"><h3>Listo ✓</h3><p class="nota">Se importaron ${esc(hecho.join(', ') || 'cero registros')} el ${hoyISO()}. Ya los ves en sus módulos.</p></section>`;
    plan = null;
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Reintentar';
    toast('Se detuvo: ' + e.message + (hecho.length ? `. Ya se habían guardado: ${hecho.join(', ')}` : ''), true);
  }
}
