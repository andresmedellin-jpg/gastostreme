// MODO DEMO — reemplaza a Supabase con una base de datos en memoria, para enseñar la plataforma a un cliente
// sin tocar ni mostrar datos reales. Se activa abriendo la página con ?demo. Todo lo que se capture vive solo
// en esta pestaña: al recargar, el demo vuelve a empezar con los mismos datos de ejemplo (js/demo/datos-demo.js).
(function () {
  'use strict';
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | 0).toString(16)));
  const hoy = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const copia = (o) => JSON.parse(JSON.stringify(o));
  const espera = () => new Promise((r) => setTimeout(r, 60 + Math.random() * 90));   // que se sienta como internet

  // ---------- datos ----------
  const D = window.__DEMO_DATOS ? window.__DEMO_DATOS() : {};
  const T = (t) => (D[t] ||= []);
  const DEFAULTS = {
    gastos: { moneda: 'MXN', categoria: 'Otros', forma_pago: 'Transferencia', estado: 'pagado' },
    pagos: { moneda: 'MXN', es_ajuste: false, fecha: hoy },
    ingresos: { moneda: 'MXN' },
    empleados: { salario_semanal: 0, dias_semana: 6, hora_entrada: '08:00:00', hora_salida: '17:00:00', tolerancia_min: 10,
      dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB', activo: true, imss: false, prima_vacacional: false },
    centros: { activo: true, en_gastos: true },
    asistencia: { estado: 'presente', minutos_tarde: 0, minutos_salida_temprano: 0, monto_descuento: 0, horas_descontadas: 0 },
    tareas: { fecha: hoy, tipo: 'tarea', estado: 'pendiente' },
    tareas_plantilla: { frecuencia: 'diaria', activo: true },
    prestamos: { abono_semanal: 0, fecha: hoy, liquidado: false },
    prestamo_abonos: { fecha: hoy },
    vacaciones: { tipo: 'disfrutadas' },
    cuentas_por_cobrar: { moneda: 'MXN' },
    nomina_lineas: { dias_trabajados: 0, sueldo: 0, extras: 0, descuentos: 0, abono_prestamo: 0 },
    nomina_periodos: { estado: 'borrador' },
  };
  const SIN_ID = ['miembros', 'tipo_cambio'];
  function nuevaFila(t, v) {
    const r = {};
    Object.entries(DEFAULTS[t] || {}).forEach(([k, x]) => { r[k] = typeof x === 'function' ? x() : x; });
    Object.assign(r, copia(v));
    if (!SIN_ID.includes(t) && !r.id) r.id = uid();
    if (!('creado_en' in r)) r.creado_en = new Date().toISOString();
    if (t === 'nomina_lineas') r.total = Number(r.sueldo || 0) + Number(r.extras || 0) - Number(r.descuentos || 0) - Number(r.abono_prestamo || 0);
    return r;
  }

  // Vistas de la base
  const VISTAS = {
    v_saldos_cxc: () => T('cuentas_por_cobrar').map((c) => {
      const pagado = T('pagos').filter((p) => p.cxc_id === c.id).reduce((s, p) => s + Number(p.monto || 0), 0);
      return { ...c, pagado, saldo: Number(c.monto_original || 0) - pagado };
    }),
  };
  // Relaciones que se piden dentro de un select, p. ej. 'id, nomina_lineas(*)'
  const HIJOS = { nomina_periodos: { nomina_lineas: 'periodo_id' } };

  // ---------- filtros ----------
  const num = (x) => (x !== null && x !== '' && !isNaN(x) && typeof x !== 'boolean' ? Number(x) : null);
  function cmp(a, b) {
    const na = num(a), nb = num(b);
    if (na !== null && nb !== null && !/^\d{4}-\d\d/.test(String(a))) return na - nb;
    return String(a ?? '').localeCompare(String(b ?? ''));
  }
  const valor = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
  function prueba(op, a, b) {
    switch (op) {
      case 'eq': return a != null && String(a) === String(b);
      case 'neq': return a == null || String(a) !== String(b);
      case 'gt': return a != null && cmp(a, b) > 0;
      case 'gte': return a != null && cmp(a, b) >= 0;
      case 'lt': return a != null && cmp(a, b) < 0;
      case 'lte': return a != null && cmp(a, b) <= 0;
      case 'in': return (Array.isArray(b) ? b : String(b).replace(/^\(|\)$/g, '').split(',')).map(String).includes(String(a));
      case 'is': return b === null || b === 'null' ? a == null : a === valor(String(b));
      case 'like': case 'ilike': {
        const re = new RegExp('^' + String(b).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', op === 'ilike' ? 'i' : '');
        return re.test(String(a ?? ''));
      }
      case 'contains': return Array.isArray(a) && [].concat(b).every((x) => a.includes(x));
      default: console.warn('[demo] filtro no soportado', op); return true;
    }
  }
  function parseOr(txt) {         // 'periodo.gte.2026-05-01,fecha.gte.2026-05-01'
    return txt.split(',').map((p) => { const [col, op, ...r] = p.split('.'); return { col, op, val: valor(r.join('.')) }; });
  }

  // ---------- consultas ----------
  class Consulta {
    constructor(t) { this.t = t; this.op = 'select'; this.filtros = []; this.orden = []; this.rango = null; this.lim = null; this.uno = null; this.devolver = false; }
    select(cols) { if (this.op === 'select') this.cols = cols; else this.devolver = true; return this; }
    insert(v) { this.op = 'insert'; this.valores = v; return this; }
    upsert(v, o) { this.op = 'upsert'; this.valores = v; this.conflicto = (o?.onConflict || 'id').split(','); return this; }
    update(v) { this.op = 'update'; this.valores = v; return this; }
    delete() { this.op = 'delete'; return this; }
    _f(fn) { this.filtros.push(fn); return this; }
    eq(c, v) { return this._f((r) => prueba('eq', r[c], v)); }
    neq(c, v) { return this._f((r) => prueba('neq', r[c], v)); }
    gt(c, v) { return this._f((r) => prueba('gt', r[c], v)); }
    gte(c, v) { return this._f((r) => prueba('gte', r[c], v)); }
    lt(c, v) { return this._f((r) => prueba('lt', r[c], v)); }
    lte(c, v) { return this._f((r) => prueba('lte', r[c], v)); }
    in(c, v) { return this._f((r) => prueba('in', r[c], v)); }
    is(c, v) { return this._f((r) => prueba('is', r[c], v)); }
    like(c, v) { return this._f((r) => prueba('like', r[c], v)); }
    ilike(c, v) { return this._f((r) => prueba('ilike', r[c], v)); }
    contains(c, v) { return this._f((r) => prueba('contains', r[c], v)); }
    not(c, op, v) { return this._f((r) => !prueba(op, r[c], v)); }
    match(o) { Object.entries(o).forEach(([c, v]) => this.eq(c, v)); return this; }
    filter(c, op, v) { return this._f((r) => prueba(op, r[c], v)); }
    or(txt) { const cs = parseOr(txt); return this._f((r) => cs.some((x) => prueba(x.op, r[x.col], x.val))); }
    order(c, o = {}) { this.orden.push({ c, asc: o.ascending !== false }); return this; }
    range(a, b) { this.rango = [a, b]; return this; }
    limit(n) { this.lim = n; return this; }
    single() { this.uno = 'single'; return this; }
    maybeSingle() { this.uno = 'maybe'; return this; }
    abortSignal() { return this; }
    then(ok, mal) { return espera().then(() => this._correr()).then(ok, mal); }

    _filas() {
      const base = VISTAS[this.t] ? VISTAS[this.t]() : T(this.t);
      return base.filter((r) => this.filtros.every((f) => f(r)));
    }
    _correr() {
      try {
        let data;
        if (this.op === 'select') {
          data = this._filas();
          for (const o of [...this.orden].reverse()) {
            data = [...data].sort((a, b) => { const x = cmp(a[o.c], b[o.c]); return o.asc ? x : -x; });
          }
          if (this.rango) data = data.slice(this.rango[0], this.rango[1] + 1);
          if (this.lim != null) data = data.slice(0, this.lim);
          data = data.map((r) => this._con_hijos(copia(r)));
        } else if (this.op === 'insert' || this.op === 'upsert') {
          const filas = [].concat(this.valores).map((v) => {
            if (this.op === 'upsert') {
              const ya = T(this.t).find((r) => this.conflicto.every((c) => String(r[c]) === String(v[c])));
              if (ya) { Object.assign(ya, copia(v)); return ya; }
            }
            const r = nuevaFila(this.t, v); T(this.t).push(r); return r;
          });
          data = filas.map(copia);
        } else if (this.op === 'update') {
          const filas = this._filas();
          filas.forEach((r) => Object.assign(r, copia(this.valores)));
          data = filas.map(copia);
        } else if (this.op === 'delete') {
          const filas = this._filas();
          D[this.t] = T(this.t).filter((r) => !filas.includes(r));
          if (this.t === 'nomina_lineas') {} // el gasto ligado se borra desde la pantalla
          data = filas.map(copia);
        }
        if (this.op !== 'select' && !this.devolver && !this.uno) data = null;
        if (this.uno) {
          const lista = data || [];
          if (this.uno === 'single' && lista.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'No se encontró el registro' } };
          data = lista[0] ?? null;
        }
        return { data, error: null, count: Array.isArray(data) ? data.length : null, status: 200 };
      } catch (e) {
        console.error('[demo]', e);
        return { data: null, error: { message: e.message } };
      }
    }
    _con_hijos(r) {
      const rel = HIJOS[this.t];
      if (rel && this.cols) Object.entries(rel).forEach(([hijo, fk]) => {
        if (this.cols.includes(hijo + '(')) r[hijo] = T(hijo).filter((h) => h[fk] === r.id).map(copia);
      });
      return r;
    }
  }

  // ---------- funciones de la base (las mismas reglas que en Supabase) ----------
  const miembro = () => T('miembros')[0];
  const horas = (t) => { const [h, m] = String(t || '08:00').split(':').map(Number); return h + (m || 0) / 60; };
  const RPC = {
    correo_para_login: () => 'demo@demo.mx',
    marcar_password_cambiado: () => null,
    siguiente_folio_renta: () => 'REC-' + String(T('pagos').filter((p) => p.concepto === 'renta').length + 1).padStart(4, '0'),
    siguiente_folio_cuota: ({ p_periodo }) => 'REC-' + String(p_periodo).slice(0, 7).replace('-', '') + '-' + String(T('pagos').filter((p) => p.folio).length + 1).padStart(4, '0'),
    equipo_de: ({ p_centro }) => T('empleados').filter((e) => e.centro_id === p_centro && e.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(({ id, nombre, puesto, hora_entrada, hora_salida, tolerancia_min, dias_laborales }) => ({ id, nombre, puesto, hora_entrada, hora_salida, tolerancia_min, dias_laborales })),
    usuarios_lista: () => T('miembros').map((m) => ({ ...m, correo: m.usuario + '@usuarios.demo', ultimo_acceso: m.ultimo_acceso || new Date().toISOString() })),
    asistencia_marcar: ({ p_empleado, p_fecha, p_accion }) => {
      const e = T('empleados').find((x) => x.id === p_empleado);
      if (!e) throw new Error('Empleado no encontrado');
      let jornada = horas(e.hora_salida || '17:00') - horas(e.hora_entrada || '08:00'); if (jornada <= 0) jornada += 24;
      const diaria = Number(e.salario_semanal || 0) / (e.dias_semana || 6), tarifa = diaria / jornada;
      let r = T('asistencia').find((a) => a.empleado_id === e.id && a.fecha === p_fecha);
      if (!r) { r = nuevaFila('asistencia', { org_id: e.org_id, empleado_id: e.id, fecha: p_fecha }); T('asistencia').push(r); }
      const ahora = new Date(), mins = ahora.getHours() * 60 + ahora.getMinutes();
      if (p_accion === 'entrada') {
        const tarde = Math.max(0, Math.round(mins - horas(e.hora_entrada) * 60) - (e.tolerancia_min || 0));
        const h = Math.min(tarde / 60, jornada);
        Object.assign(r, { estado: tarde > 0 ? 'retardo' : 'presente', hora_entrada: ahora.toISOString(), minutos_tarde: tarde, horas_descontadas: h, monto_descuento: Math.round(h * tarifa) });
      } else if (p_accion === 'salida') {
        const temprano = Math.max(0, Math.round(horas(e.hora_salida) * 60 - mins) - (e.tolerancia_min || 0));
        const h = Math.min(Number(r.horas_descontadas || 0) + temprano / 60, jornada);
        Object.assign(r, { estado: ['falta', 'permiso'].includes(r.estado) ? r.estado : h > 0 ? 'retardo' : 'presente',
          hora_salida: ahora.toISOString(), minutos_salida_temprano: temprano, horas_descontadas: h, monto_descuento: Math.round(h * tarifa) });
      } else {
        Object.assign(r, { estado: p_accion, hora_entrada: null, hora_salida: null, minutos_tarde: 0, minutos_salida_temprano: 0,
          horas_descontadas: p_accion === 'falta' ? jornada : 0, monto_descuento: p_accion === 'falta' ? Math.round(diaria) : 0 });
      }
      r.registrado_por = miembro()?.nombre;
      return copia(r);
    },
    nomina_pagar: ({ p_empleado, p_semana, p_monto, p_fecha, p_forma, p_notas }) => {
      const e = T('empleados').find((x) => x.id === p_empleado);
      if (!e) throw new Error('Empleado no encontrado');
      let per = T('nomina_periodos').find((p) => p.empresa_id === e.empresa_id && p.fecha_inicio === p_semana);
      if (!per) { per = nuevaFila('nomina_periodos', { org_id: e.org_id, empresa_id: e.empresa_id, fecha_inicio: p_semana, estado: 'pagada' }); T('nomina_periodos').push(per); }
      if (T('nomina_lineas').some((l) => l.periodo_id === per.id && l.empleado_id === e.id)) throw new Error('Ya hay un pago de nómina de esta persona en esa semana');
      const c = T('centros').find((x) => x.id === e.centro_id);
      const [y, m, d] = p_semana.split('-');
      const g = nuevaFila('gastos', { org_id: e.org_id, empresa_id: c?.empresa_id || e.empresa_id, centro_id: e.centro_id, fecha: p_fecha,
        monto: Math.round(p_monto * 100) / 100, concepto: 'Nómina — ' + e.nombre, proveedor: e.nombre, categoria: 'Nómina', forma_pago: p_forma,
        notas: `Semana del ${d}/${m}/${y}` + (p_notas ? ' · ' + p_notas : ''), capturado_por: miembro()?.nombre });
      T('gastos').push(g);
      const faltas = T('asistencia').filter((a) => a.empleado_id === e.id && a.estado === 'falta' && a.fecha >= p_semana && a.fecha <= sumar(p_semana, 6)).length;
      const l = nuevaFila('nomina_lineas', { org_id: e.org_id, periodo_id: per.id, empleado_id: e.id, centro_id: e.centro_id,
        dias_trabajados: Math.max((e.dias_semana || 6) - faltas, 0), sueldo: Math.round(p_monto * 100) / 100, forma_pago: p_forma,
        notas: p_notas || null, fecha: p_fecha, gasto_id: g.id });
      T('nomina_lineas').push(l);
      return l.id;
    },
  };
  function sumar(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  // ---------- sesión ----------
  const usuario = { id: 'demo-usuario', email: 'demo@demo.mx' };
  const sesion = { user: usuario, access_token: 'demo' };
  let conSesion = true;
  const oyentes = [];
  const avisar = (ev) => oyentes.forEach((cb) => { try { cb(ev, conSesion ? sesion : null); } catch (e) { console.error(e); } });
  const auth = {
    getSession: async () => ({ data: { session: conSesion ? sesion : null }, error: null }),
    getUser: async () => ({ data: { user: conSesion ? usuario : null }, error: null }),
    onAuthStateChange(cb) { oyentes.push(cb); setTimeout(() => cb(conSesion ? 'SIGNED_IN' : 'SIGNED_OUT', conSesion ? sesion : null), 0);
      return { data: { subscription: { unsubscribe() { oyentes.splice(oyentes.indexOf(cb), 1); } } } }; },
    signInWithPassword: async () => { conSesion = true; setTimeout(() => avisar('SIGNED_IN'), 0); return { data: { session: sesion, user: usuario }, error: null }; },
    signOut: async () => { conSesion = false; setTimeout(() => avisar('SIGNED_OUT'), 0); return { error: null }; },
    updateUser: async () => ({ data: { user: usuario }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
  };

  const rpc = async (nombre, args = {}) => {
    await espera();
    const fn = RPC[nombre];
    if (!fn) return { data: null, error: { message: `Función ${nombre} no disponible en el demo` } };
    try { return { data: copia(fn(args) ?? null), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; }
  };
  const cliente = {
    auth, rpc,
    from: (t) => new Consulta(t),
    schema: () => ({ from: (t) => new Consulta(t), rpc }),
    // Sin almacenamiento en el demo: las fotos y PDFs se guardan dentro del registro (la app ya sabe hacerlo)
    storage: { from: () => ({ upload: async () => ({ data: null, error: { message: 'demo' } }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    // Alta y edición de usuarios: en el demo se simula (no se crea ninguna cuenta real)
    functions: { invoke: async (nombre, { body } = {}) => {
      await espera();
      if (nombre !== 'usuarios' || !body) return { data: null, error: { message: 'No disponible en el demo' } };
      const M = T('miembros');
      if (body.accion === 'crear') {
        if (M.some((m) => m.usuario === body.usuario)) return { data: null, error: { message: 'Ese usuario ya existe' } };
        M.push({ org_id: M[0].org_id, user_id: uid(), nombre: body.nombre, usuario: body.usuario, rol: body.rol, roles: body.roles || [],
          empresas: body.empresas, activo: true, debe_cambiar_password: true, creado_en: new Date().toISOString() });
      } else if (body.accion === 'editar' || body.accion === 'activo') {
        const m = M.find((x) => x.user_id === body.user_id);
        if (m) Object.entries(body).forEach(([k, v]) => { if (!['accion', 'user_id', 'password'].includes(k) && v !== undefined) m[k] = v; });
      }
      return { data: { ok: true }, error: null };
    } },
  };
  window.supabase = { createClient: () => cliente };
  window.__DEMO = { datos: D };
})();
