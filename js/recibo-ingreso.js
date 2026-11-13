// Recibo de un ingreso o de un abono a una cuenta por cobrar, con los datos de la empresa que cobra:
// MEDCO (azul, "Obra") o Treme (rojo vino, "Inmueble"). Lo usan Inicio (+ Ingreso, botón Recibo) y Patrimonio > Por cobrar (Abono).
import { db, estado, toast } from './lib.js';
import { pintarRecibo, abrirVentanaRecibo } from './recibo.js';
export { abrirVentanaRecibo };

const pesos = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function reciboIngreso(w, d) {
  const emp = (estado.todasEmpresas.length ? estado.todasEmpresas : estado.empresas).find((e) => e.id === d.empresaId) || {};
  const esMedco = /medco/i.test(`${emp.nombre || ''} ${emp.nombre_corto || ''}`);
  const emisor = esMedco ? 'Desarrollos y Proyectos MEDCO' : 'Grupo Inmobiliario Treme';
  const centro = (estado.todosCentros.length ? estado.todosCentros : estado.centros).find((c) => c.id === d.centroId);
  const abono = d.abono ?? d.saldo != null;
  const lugar = [d.referencia, centro?.nombre].filter(Boolean).join(' · ');
  const info = [['Recibí de', d.cliente || '—']];
  if (lugar) info.push([esMedco ? 'Obra' : 'Inmueble', lugar]);
  info.push(['Concepto', d.concepto || 'Pago'], ['Recibido por', emisor], ['Método de pago', d.forma || '—']);
  if (d.saldo != null) info.push(['Saldo pendiente', d.saldo > 0.5 ? `${pesos(d.saldo)} MXN después de este pago` : 'Cuenta liquidada']);
  const estadoTexto = !abono ? 'PAGO RECIBIDO'
    : d.saldo == null ? 'PAGO RECIBIDO — ABONO A CUENTA'
    : d.saldo > 0.5 ? 'PAGO RECIBIDO — ABONO A CUENTA' : 'PAGO RECIBIDO — CUENTA LIQUIDADA EN SU TOTALIDAD';
  return pintarRecibo(w, {
    emisor, logo: esMedco ? 'img/logo-medco.png' : null, color: esMedco ? '#1E4F9C' : null,
    titulo: `Recibo ${d.folio || ''} · ${d.cliente || emisor}`, folio: d.folio, fecha: d.fecha, info,
    lineas: [{ concepto: d.concepto || 'Pago', detalle: lugar, cantidad: 1, precio: d.monto, subtotal: d.monto }],
    total: d.monto, moneda: 'MXN', ivaTexto: 'No desglosado', estadoTexto,
    notas: d.notas || '',
    aviso: `Este recibo ampara el pago recibido por ${emisor} de parte de ${d.cliente || 'el cliente'}${lugar ? `, correspondiente a ${lugar}` : ''}.`,
  });
}

// Recibo de un abono ya guardado en pagos (con cxc_id): le asigna folio la primera vez y calcula el saldo que quedó
// después de ese pago (monto original menos todo lo abonado hasta ese pago, inclusive).
export async function reciboDeAbono(pagoId, ventana) {
  const w = ventana || abrirVentanaRecibo();
  if (!w) return toast('El navegador bloqueó la ventana del recibo. Permite ventanas emergentes para app.medco.mx.', true);
  const { data: p, error } = await db().from('pagos').select('id, empresa_id, centro_id, cxc_id, concepto, fecha, monto, forma_pago, notas, folio, creado_en').eq('id', pagoId).single();
  if (error || !p) { w.close(); return toast('No se encontró el pago', true); }
  const [{ data: c }, { data: otros }] = await Promise.all([
    db().from('cuentas_por_cobrar').select('cliente, referencia, monto_original, tipo').eq('id', p.cxc_id).single(),
    db().from('pagos').select('id, fecha, monto, creado_en').eq('cxc_id', p.cxc_id),
  ]);
  const antes = (otros || []).filter((o) => o.fecha < p.fecha || (o.fecha === p.fecha && (o.creado_en || '') <= (p.creado_en || '')));
  const saldo = c ? Math.max(0, Number(c.monto_original) - antes.reduce((s, o) => s + Number(o.monto), 0)) : null;
  if (!p.folio) {
    const { data } = await db().rpc('siguiente_folio_empresa', { p_empresa: p.empresa_id, p_fecha: p.fecha });
    if (data) { p.folio = data; await db().from('pagos').update({ folio: data }).eq('id', p.id); }
  }
  const compra = p.concepto === 'cartera';
  return reciboIngreso(w, {
    empresaId: p.empresa_id, centroId: p.centro_id, folio: p.folio, fecha: p.fecha, monto: Number(p.monto),
    concepto: compra ? (saldo != null && saldo <= 0.5 ? 'Liquidación de compra' : 'Abono a compra') : 'Pago de obra',
    referencia: c?.referencia || '', cliente: c?.cliente || '', forma: p.forma_pago,
    notas: (p.notas || '').split(' · ').filter((t) => t && t !== c?.referencia).join(' · '), abono: true, saldo,
  });
}
