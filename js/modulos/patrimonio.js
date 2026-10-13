// Patrimonio: activos (inmuebles) y pasivos (deudas). Solo el dueño lo ve.
import { db, estado, fmt, fmtFecha, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';

const st = { vista: 'activos', entidad: '', q: '' };
let raiz, activos = [], pasivos = [];

// Campos editables: [columna, etiqueta, tipo, opciones]
const CAMPOS_ACTIVO = [
  ['codigo', 'Código', 'text'], ['entidad_legal', 'Dueño legal', 'text', 'lista-entidades'],
  ['tipo_unidad', 'Tipo', 'text', 'lista-tipos'], ['identificador', 'Unidad / nombre', 'text'],
  ['direccion', 'Dirección', 'text'], ['ciudad', 'Ciudad', 'text'],
  ['superficie_m2', 'Superficie (m²)', 'number'], ['clave_catastral', 'Clave catastral', 'text'],
  ['valor_comercial', 'Valor comercial', 'number'], ['moneda', 'Moneda', 'select', ['MXN', 'USD']],
  ['fecha_valuacion', 'Valuación (fecha o fuente)', 'text'], ['costo_adquisicion', 'Costo de adquisición', 'number'],
  ['fecha_adquisicion', 'Fecha de adquisición', 'date'], ['uso_actual', 'Uso actual', 'text'],
  ['inquilino', 'Inquilino', 'text'], ['ingreso_mensual', 'Renta mensual', 'number'],
  ['renta_mercado_estimada', 'Renta de mercado estimada', 'number'], ['fecha_vencimiento_contrato', 'Vence contrato', 'date'],
  ['notas', 'Notas', 'textarea'],
];
const CAMPOS_PASIVO = [
  ['acreedor', 'Acreedor', 'text'], ['tipo_pasivo', 'Tipo', 'select', ['Hipoteca', 'Línea de crédito', 'Crédito simple', 'Proveedor a largo plazo', 'Préstamo de socio', 'Otro']],
  ['saldo_actual', 'Saldo actual', 'number'], ['fecha_saldo', 'Saldo al', 'date'],
  ['pago_mensual', 'Pago mensual', 'number'], ['tasa_interes', 'Tasa (%)', 'number'],
  ['moneda', 'Moneda', 'select', ['MXN', 'USD']], ['fecha_inicio', 'Inicio', 'date'],
  ['fecha_vencimiento', 'Vencimiento', 'date'], ['activo_ref', 'Para qué / qué inmueble', 'text'],
  ['garantia', 'Garantía', 'text'], ['notas', 'Notas', 'textarea'],
];

export async function render(view) {
  raiz = view;
  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        <button role="tab" data-vista="activos">🏢 Activos</button><button role="tab" data-vista="pasivos">💳 Pasivos</button>
      </div>
      <div class="sub-meta">Solo tú ves esta sección</div>
    </div>
    <div id="pt-kpis"></div>
    <div id="pt-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    if (st.vista !== b.dataset.vista) { st.q = ''; st.entidad = ''; }
    st.vista = b.dataset.vista; pintar();
  }));
  await cargar();
}

async function cargar() {
  const [a, p] = await Promise.all([
    db().from('activos').select('*').order('codigo'),
    db().from('pasivos').select('*').order('saldo_actual', { ascending: false }),
  ]);
  const err = a.error || p.error;
  if (err) { toast('No se pudo cargar el patrimonio: ' + err.message, true); return; }
  activos = a.data; pasivos = p.data;
  pintar();
}

const num = (v) => Number(v || 0);
const sumaPor = (lista, campo, moneda) => lista.filter((r) => (r.moneda || 'MXN') === moneda).reduce((s, r) => s + num(r[campo]), 0);
const usd = (v) => '$' + Math.round(v).toLocaleString('es-MX') + ' USD';
const corto = (v) => {
  const a = Math.abs(v);
  return (v < 0 ? '−' : '') + (a >= 1e6 ? `$${(a / 1e6).toFixed(1)} M` : fmt(a));
};

function pintar() {
  raiz.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-selected', b.dataset.vista === st.vista));
  const valMXN = sumaPor(activos, 'valor_comercial', 'MXN'), valUSD = sumaPor(activos, 'valor_comercial', 'USD');
  const deuda = sumaPor(pasivos, 'saldo_actual', 'MXN'), deudaUSD = sumaPor(pasivos, 'saldo_actual', 'USD');
  const renta = sumaPor(activos, 'ingreso_mensual', 'MXN');
  const pagos = sumaPor(pasivos, 'pago_mensual', 'MXN');
  const sinValor = activos.filter((a) => !num(a.valor_comercial)).length;
  raiz.querySelector('#pt-kpis').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Valor de activos</span><strong class="pos">${corto(valMXN)}</strong>
        <small>${activos.length} inmuebles${valUSD ? ` · + ${usd(valUSD)}` : ''}${sinValor ? ` · ${sinValor} sin valor` : ''}</small></div>
      <div class="kpi"><span>Deuda total</span><strong class="neg">${corto(deuda)}</strong>
        <small>${pasivos.length} pasivos${deudaUSD ? ` · + ${usd(deudaUSD)}` : ''} · ${valMXN ? Math.round(deuda / valMXN * 100) : 0}% del valor</small></div>
      <div class="kpi"><span>Patrimonio neto</span><strong>${corto(valMXN - deuda)}</strong><small>activos − deuda (en pesos)</small></div>
      <div class="kpi"><span>Flujo mensual</span><strong class="${renta - pagos >= 0 ? 'pos' : 'neg'}">${fmt(renta - pagos)}</strong>
        <small>${fmt(renta)} rentas − ${fmt(pagos)} pagos de deuda</small></div>
    </div>`;
  document.getElementById('page-actions').innerHTML =
    `<button class="btn btn-primary" id="pt-nuevo">＋ ${st.vista === 'activos' ? 'Activo' : 'Pasivo'}</button>`;
  document.getElementById('pt-nuevo').addEventListener('click', () => editar(st.vista, null));
  const el = raiz.querySelector('#pt-cuerpo');
  st.vista === 'activos' ? pintarActivos(el) : pintarPasivos(el);
}

function pintarActivos(el) {
  const entidades = [...new Set(activos.map((a) => a.entidad_legal || 'Sin asignar'))].sort();
  const porEntidad = entidades.map((e) => {
    const l = activos.filter((a) => (a.entidad_legal || 'Sin asignar') === e);
    return { e, n: l.length, mxn: sumaPor(l, 'valor_comercial', 'MXN'), usd: sumaPor(l, 'valor_comercial', 'USD'), renta: sumaPor(l, 'ingreso_mensual', 'MXN') };
  }).sort((a, b) => b.mxn - a.mxn);
  const max = Math.max(1, ...porEntidad.map((x) => x.mxn));
  const filas = activos.filter((a) => (!st.entidad || (a.entidad_legal || 'Sin asignar') === st.entidad)
    && (!st.q || normalizar([a.codigo, a.identificador, a.tipo_unidad, a.ciudad, a.inquilino, a.uso_actual].join(' ')).includes(normalizar(st.q))));
  el.innerHTML = `
    <section class="panel"><h3>Por dueño legal</h3>
      <ul class="barras">${porEntidad.map((x) => `<li class="clic ${st.entidad === x.e ? 'activa' : ''}" data-entidad="${esc(x.e)}" tabindex="0" role="button">
        <span class="barra-nombre">${esc(x.e)} <em>${x.n} · renta ${fmt(x.renta)}/mes</em></span>
        <span class="barra-pista"><span class="pos" style="width:${Math.max(2, x.mxn / max * 100)}%"></span></span>
        <span class="barra-monto">${corto(x.mxn)}${x.usd ? ` + ${usd(x.usd)}` : ''}</span></li>`).join('')}</ul>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>${filas.length} activo${filas.length !== 1 ? 's' : ''}${st.entidad ? ' · ' + esc(st.entidad) : ''}</h3>
        <input type="search" id="pt-q" placeholder="Buscar código, unidad, inquilino…" value="${esc(st.q)}" aria-label="Buscar activo"></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Código</th><th>Inmueble</th><th>Uso / inquilino</th><th class="num">m²</th><th class="num">Valor</th><th class="num">Renta/mes</th><th class="num">Rend. anual</th></tr></thead>
        <tbody>${filas.length ? filas.map((a) => {
          const val = num(a.valor_comercial), ren = num(a.ingreso_mensual);
          const dinero = (v) => v ? (a.moneda === 'USD' ? usd(v) : fmt(v)) : '—';
          return `<tr class="clic" data-editar="${a.id}" tabindex="0">
            <td data-l="Código"><b>${esc(a.codigo || '—')}</b></td>
            <td data-l="Inmueble">${esc(a.tipo_unidad || '—')}${a.identificador ? ' · ' + esc(a.identificador) : ''}<small class="sub">${esc(a.ciudad || '')}</small></td>
            <td data-l="Uso">${esc(a.uso_actual || '—')}${a.inquilino ? `<small class="sub">${esc(a.inquilino)}</small>` : ''}</td>
            <td data-l="m²" class="num">${a.superficie_m2 ? num(a.superficie_m2).toLocaleString('es-MX') : '—'}</td>
            <td data-l="Valor" class="num">${dinero(val)}</td>
            <td data-l="Renta/mes" class="num pos">${dinero(ren)}</td>
            <td data-l="Rend. anual" class="num">${val && ren ? (ren * 12 / val * 100).toFixed(1) + '%' : '—'}</td></tr>`;
        }).join('') : '<tr><td colspan="7" class="vacio">Sin activos para este filtro</td></tr>'}</tbody>
      </table></div>
    </section>`;
  el.querySelectorAll('[data-entidad]').forEach((b) => activar(b, () => { st.entidad = st.entidad === b.dataset.entidad ? '' : b.dataset.entidad; pintar(); }));
  conectarTabla(el, 'activos');
}

function pintarPasivos(el) {
  const filas = pasivos.filter((p) => !st.q || normalizar([p.acreedor, p.tipo_pasivo, p.activo_ref, p.notas].join(' ')).includes(normalizar(st.q)));
  el.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h3>${filas.length} pasivo${filas.length !== 1 ? 's' : ''} · ${fmt(sumaPor(filas, 'saldo_actual', 'MXN'))}</h3>
        <input type="search" id="pt-q" placeholder="Buscar acreedor…" value="${esc(st.q)}" aria-label="Buscar pasivo"></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Acreedor</th><th>Tipo</th><th class="num">Saldo</th><th class="num">Pago mensual</th><th class="num">Tasa</th><th>Vence</th><th>Para qué</th></tr></thead>
        <tbody>${filas.length ? filas.map((p) => `<tr class="clic" data-editar="${p.id}" tabindex="0">
          <td data-l="Acreedor"><b>${esc(p.acreedor || '—')}</b></td>
          <td data-l="Tipo">${esc(p.tipo_pasivo || '—')}</td>
          <td data-l="Saldo" class="num neg">${p.moneda === 'USD' ? usd(num(p.saldo_actual)) : fmt(p.saldo_actual)}${p.fecha_saldo ? `<small class="sub">al ${fmtFecha(p.fecha_saldo)}</small>` : ''}</td>
          <td data-l="Pago mensual" class="num">${p.pago_mensual ? fmt(p.pago_mensual) : '—'}</td>
          <td data-l="Tasa" class="num">${p.tasa_interes != null ? tasa(p.tasa_interes) : '—'}</td>
          <td data-l="Vence">${p.fecha_vencimiento ? fmtFecha(p.fecha_vencimiento) : '—'}</td>
          <td data-l="Para qué">${esc(p.activo_ref || '—')}</td></tr>`).join('')
          : '<tr><td colspan="7" class="vacio">Sin pasivos</td></tr>'}</tbody>
      </table></div>
    </section>`;
  conectarTabla(el, 'pasivos');
}

// La tasa se guarda como fracción (0.025 = 2.5%)
const tasa = (t) => (num(t) * 100).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '%';

function activar(elem, fn) {
  elem.addEventListener('click', fn);
  elem.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
}

function conectarTabla(el, tipo) {
  const q = el.querySelector('#pt-q');
  q.addEventListener('input', (e) => {
    st.q = e.target.value; const pos = e.target.selectionStart; pintar();
    const n = raiz.querySelector('#pt-q'); n.focus(); n.setSelectionRange(pos, pos);
  });
  el.querySelectorAll('[data-editar]').forEach((tr) => activar(tr, () => editar(tipo, tr.dataset.editar)));
}

// ---------- edición ----------
function editar(tipo, id) {
  const campos = tipo === 'activos' ? CAMPOS_ACTIVO : CAMPOS_PASIVO;
  const lista = tipo === 'activos' ? activos : pasivos;
  const r = id ? lista.find((x) => x.id === id) : { moneda: 'MXN' };
  const valor = (c) => {
    const v = r[c];
    if (v == null) return '';
    return c === 'tasa_interes' ? +(num(v) * 100).toFixed(4) : v;
  };
  const datalists = `
    <datalist id="lista-entidades">${[...new Set(activos.map((a) => a.entidad_legal).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
    <datalist id="lista-tipos">${[...new Set(activos.map((a) => a.tipo_unidad).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const campo = ([c, et, t, op]) => {
    if (t === 'textarea') return `<label class="ancho">${et}<textarea name="${c}" rows="2">${esc(valor(c))}</textarea></label>`;
    if (t === 'select') return `<label>${et}<select name="${c}">${op.map((o) => `<option ${valor(c) === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    return `<label>${et}<input name="${c}" type="${t}" ${t === 'number' ? 'step="any" inputmode="decimal"' : ''} ${op ? `list="${op}"` : ''} value="${esc(valor(c))}"></label>`;
  };
  const titulo = tipo === 'activos' ? (id ? `Activo ${r.codigo || ''}` : 'Nuevo activo') : (id ? `Pasivo · ${r.acreedor || ''}` : 'Nuevo pasivo');
  const modal = abrirModal({
    titulo,
    cuerpo: `<form id="pt-f" class="form"><div class="form-2">${campos.map(campo).join('')}</div>${datalists}</form>`,
    pie: `${id ? '<button class="btn btn-ghost peligro" id="pt-borrar">Eliminar</button>' : ''}<span style="flex:1"></span>
      <button class="btn btn-ghost" id="pt-cancelar">Cancelar</button><button class="btn btn-primary" id="pt-ok">Guardar</button>`,
  });
  modal.querySelector('#pt-cancelar').addEventListener('click', cerrarModal);
  const f = modal.querySelector('#pt-f');
  modal.querySelector('#pt-ok').addEventListener('click', async (ev) => {
    const datos = {};
    for (const [c, , t] of campos) {
      const v = f[c].value.trim();
      datos[c] = v === '' ? null : t === 'number' ? Number(v) : v;
    }
    if (datos.tasa_interes != null) datos.tasa_interes = datos.tasa_interes / 100;
    if (tipo === 'activos' && !datos.codigo && !datos.identificador) return toast('Escribe al menos el código o la unidad', true);
    if (tipo === 'pasivos' && !datos.acreedor) return toast('Escribe el acreedor', true);
    datos.moneda = datos.moneda || 'MXN';
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
    const { error } = id
      ? await db().from(tipo).update(datos).eq('id', id)
      : await db().from(tipo).insert({ ...datos, org_id: estado.miembro.org_id, empresa_id: empresaPara(datos) });
    btn.disabled = false; btn.textContent = 'Guardar';
    if (error) return toast('No se pudo guardar: ' + error.message, true);
    cerrarModal(); toast('Guardado'); cargar();
  });
  modal.querySelector('#pt-borrar')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Toca otra vez'; return; }
    const { error } = await db().from(tipo).delete().eq('id', id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    cerrarModal(); toast('Eliminado'); cargar();
  });
}

// Empresa a la que se liga un registro nuevo: la que coincide con el dueño legal, o Treme
function empresaPara(datos) {
  const ent = normalizar(datos.entidad_legal || '');
  const e = estado.empresas.find((x) => ent && (ent.includes(normalizar(x.nombre_corto)) || normalizar(x.nombre).includes(ent)));
  return (e || estado.empresas.find((x) => x.nombre_corto === 'Treme') || estado.empresas[0])?.id ?? null;
}
