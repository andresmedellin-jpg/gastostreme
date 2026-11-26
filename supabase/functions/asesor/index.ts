// Asesor de ventas y rentas de Grupo Inmobiliario Treme (26/11/2026).
// Recibe los mensajes de WhatsApp e Instagram (webhook de Meta) y del formulario de inmuebles.medco.mx,
// contesta con IA usando el inventario REAL de la plataforma (app.activos con publicar = true y sin contrato activo),
// registra al interesado en Treme → Prospectos y avisa a Miguel cuando hay visita o piden hablar con una persona.
// Cuenta de IA propia de Treme (secreto ANTHROPIC_API_KEY); nada de Unaria.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY      llave de la cuenta de Anthropic de Treme
//   META_APP_SECRET        "Clave secreta de la app" de Meta (firma de los avisos)
//   META_VERIFY_TOKEN      palabra que se escribe al dar de alta el webhook en Meta
//   WA_TOKEN               token permanente (usuario del sistema) con whatsapp_business_messaging
//   WA_PHONE_ID            identificador del número de teléfono de Treme en Meta
//   IG_TOKEN, IG_ID        token y cuenta de Instagram (@treme.mx) para contestar mensajes directos
//   AVISO_WHATSAPP         WhatsApp de Miguel (52 + 10 dígitos)
//   AVISO_PLANTILLA        (opcional) nombre de la plantilla aprobada para avisarle a Miguel
//   MODELO                 (opcional) modelo de Claude; por omisión claude-sonnet-5-5
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const GRAPH = `https://graph.facebook.com/${env('GRAPH_VERSION', 'v23.0')}`;
const db = createClient(env('SUPABASE_URL', 'http://localhost'), env('SUPABASE_SERVICE_ROLE_KEY', 'x'), { db: { schema: 'app' } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

type Canal = 'whatsapp' | 'instagram' | 'web';
type Entrante = { canal: Canal; contacto: string; nombre?: string; texto: string; metaId?: string };

// ---------------------------------------------------------------- entrada
if (!env('PRUEBA_LOCAL')) Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Alta del webhook en Meta: devuelve el "challenge" si la palabra coincide
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env('META_VERIFY_TOKEN');
    return new Response(ok ? url.searchParams.get('hub.challenge') : 'no', { status: ok ? 200 : 403 });
  }
  if (req.method !== 'POST') return new Response('no', { status: 405 });

  const crudo = await req.text();

  // Formulario de la página (inmuebles.medco.mx): registra y saluda por WhatsApp si lo autorizó
  if (url.searchParams.get('fuente') === 'web') {
    try { return await formularioWeb(JSON.parse(crudo)); }
    catch (e) { return json({ ok: false, error: String((e as Error).message || e) }, 400); }
  }

  // Bandeja de app.medco.mx: alguien del equipo contesta desde la plataforma (con su sesión)
  if (url.searchParams.get('fuente') === 'equipo') {
    try { return await desdeEquipo(req, JSON.parse(crudo)); }
    catch (e) { return json({ ok: false, error: String((e as Error).message || e) }, 400); }
  }

  // Avisos de Meta: solo si vienen firmados con la clave de la app
  if (!(await firmaValida(crudo, req.headers.get('x-hub-signature-256')))) return new Response('firma', { status: 401 });
  const cuerpo = JSON.parse(crudo);
  const { entrantes, ecos } = leerMeta(cuerpo);
  // Contestamos 200 de inmediato (Meta reintenta si tardamos) y trabajamos en segundo plano
  const trabajo = (async () => {
    for (const e of ecos) await respondioPersona(e).catch(console.error);
    for (const m of entrantes) await atender(m).catch((err) => console.error('atender', err));
  })();
  // @ts-ignore EdgeRuntime existe en Supabase
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabajo); else await trabajo;
  return new Response('ok');
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });

async function firmaValida(crudo: string, firma: string | null) {
  const secreto = env('META_APP_SECRET');
  if (!secreto || !firma?.startsWith('sha256=')) return false;
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(crudo)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const recibida = firma.slice(7);
  if (hex.length !== recibida.length) return false;
  let dif = 0; for (let i = 0; i < hex.length; i++) dif |= hex.charCodeAt(i) ^ recibida.charCodeAt(i);
  return dif === 0;
}

// WhatsApp (whatsapp_business_account) e Instagram (instagram) llegan con formas distintas
export function leerMeta(c: any): { entrantes: Entrante[]; ecos: Entrante[] } {
  const entrantes: Entrante[] = [], ecos: Entrante[] = [];
  for (const entry of c?.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (ch.field === 'messages') {
        const nombres = Object.fromEntries((v.contacts || []).map((k: any) => [k.wa_id, k.profile?.name]));
        for (const m of v.messages || []) {
          const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
            ?? (m.type === 'image' || m.type === 'document' || m.type === 'audio' || m.type === 'video' ? `[El cliente mandó ${m.type === 'audio' ? 'un audio' : 'un archivo'}]` : null);
          if (texto) entrantes.push({ canal: 'whatsapp', contacto: m.from, nombre: nombres[m.from], texto: String(texto).slice(0, 3000), metaId: m.id });
        }
      }
      // Coexistencia: lo que se escribe desde la app de WhatsApp Business llega como eco → la conversación la tomó una persona
      if (ch.field === 'smb_message_echoes') {
        for (const m of v.message_echoes || []) if (m.to) ecos.push({ canal: 'whatsapp', contacto: m.to, texto: m.text?.body || '[mensaje desde la app]', metaId: m.id });
      }
    }
    for (const ev of entry.messaging || []) {                       // Instagram
      const m = ev.message; if (!m || m.is_deleted) continue;
      if (m.is_echo) { if (env('IG_ID') && ev.sender?.id === env('IG_ID') && !(m.app_id)) ecos.push({ canal: 'instagram', contacto: ev.recipient?.id, texto: m.text || '[mensaje]', metaId: m.mid }); continue; }
      const texto = m.text ?? (m.attachments?.length ? '[El cliente mandó un archivo]' : null);
      if (texto && ev.sender?.id) entrantes.push({ canal: 'instagram', contacto: ev.sender.id, texto: String(texto).slice(0, 3000), metaId: m.mid });
    }
  }
  return { entrantes, ecos };
}

// ---------------------------------------------------------------- empresa, conversación y mensajes
let TREME: { id: string; org_id: string } | null = null;
async function treme() {
  if (TREME) return TREME;
  const { data, error } = await db.from('empresas').select('id, org_id').eq('nombre_corto', 'Treme').eq('activo', true).limit(1).single();
  if (error) throw error;
  return (TREME = data);
}

async function conversacion(m: Entrante) {
  const t = await treme();
  const { data, error } = await db.from('bot_conversaciones')
    .upsert({ org_id: t.org_id, empresa_id: t.id, canal: m.canal, contacto: m.contacto }, { onConflict: 'empresa_id,canal,contacto', ignoreDuplicates: false })
    .select().single();
  if (error) throw error;
  if (m.nombre && !data.nombre) await db.from('bot_conversaciones').update({ nombre: m.nombre.slice(0, 120) }).eq('id', data.id);
  return { ...data, nombre: data.nombre || m.nombre || null };
}

async function guardar(conv: string, rol: string, texto: string, metaId?: string) {
  const { error } = await db.from('bot_mensajes').insert({ conversacion_id: conv, rol, texto: texto.slice(0, 4000), meta_id: metaId || null });
  if (error?.code === '23505') return false;                       // Meta reintentó: ya lo teníamos
  if (error) throw error;
  await db.from('bot_conversaciones').update({ actualizado_en: new Date().toISOString(), ...(rol === 'cliente' ? { ultimo_cliente: new Date().toISOString() } : {}) }).eq('id', conv);
  return true;
}

async function respondioPersona(e: Entrante) {
  const c = await conversacion(e);
  if (await guardar(c.id, 'humano', e.texto, e.metaId)) await db.from('bot_conversaciones').update({ bot_activo: false }).eq('id', c.id);
}

// ---------------------------------------------------------------- inventario (lo único que el asesor puede ofrecer)
export async function inventario() {
  const [{ data: act }, { data: ligas }] = await Promise.all([
    db.from('activos').select('id, identificador, tipo_unidad, superficie_m2, precio_renta, renta_mas_iva, precio_venta, descripcion_publica, centro_id, centros(nombre)').eq('publicar', true),
    db.from('activo_contrato').select('activo_id, contratos!inner(activo, fecha_fin)').eq('contratos.activo', true),
  ]);
  const hoy = new Date().toISOString().slice(0, 10);
  const rentados = new Set((ligas || []).filter((l: any) => !l.contratos.fecha_fin || l.contratos.fecha_fin >= hoy).map((l: any) => l.activo_id));
  return (act || []).filter((a: any) => !rentados.has(a.id)).map((a: any) => ({
    espacio: a.identificador, tipo: a.tipo_unidad, edificio: a.centros?.nombre || 'Torre Elysium', m2: Number(a.superficie_m2) || null,
    renta: a.precio_renta ? `$${Number(a.precio_renta).toLocaleString('es-MX')} al mes${a.renta_mas_iva ? ' + IVA' : ''}` : 'no disponible en renta',
    venta: a.precio_venta ? `$${Number(a.precio_venta).toLocaleString('es-MX')}` : 'precio de venta a consultar',
    nota: a.descripcion_publica || undefined,
  }));
}

// ---------------------------------------------------------------- IA
const HERRAMIENTAS = [
  { name: 'registrar_interesado', description: 'Guarda o actualiza los datos del interesado en el sistema de Treme. Úsala en cuanto sepas algo nuevo (nombre, qué busca, espacio, metros, giro, cuándo).',
    input_schema: { type: 'object', properties: {
      nombre: { type: 'string' }, empresa: { type: 'string' }, correo: { type: 'string' },
      operacion: { type: 'string', enum: ['renta', 'venta', 'ambas'], description: 'venta = el cliente quiere comprar' },
      espacio: { type: 'string', description: 'Nombre exacto del espacio del inventario, o "Otro espacio"' },
      m2: { type: 'number' }, giro: { type: 'string', description: 'Para qué lo usaría: despacho, consultorio, vivienda…' },
      cuando: { type: 'string', enum: ['ya', '3_meses', '6_meses', 'explorando'] }, resumen: { type: 'string', description: 'Una línea con lo que busca' } } } },
  { name: 'agendar_visita', description: 'Cuando el cliente quiere ver un espacio: registra el día y la hora que propone. Miguel confirma después.',
    input_schema: { type: 'object', properties: { cuando: { type: 'string', description: 'Día y hora que propone el cliente, en sus palabras' }, espacio: { type: 'string' } }, required: ['cuando'] } },
  { name: 'pasar_a_persona', description: 'Pide que una persona de Treme continúe la conversación: si el cliente lo pide, si quiere negociar precio o condiciones, si pregunta algo que no está en tu información, o si está molesto.',
    input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] } },
];

function instrucciones(inv: unknown[], canal: Canal, nombre: string | null) {
  return `Eres el asesor virtual de ventas y rentas de Grupo Inmobiliario Treme, en Monterrey, Nuevo León. Atiendes por ${canal === 'instagram' ? 'mensajes de Instagram' : 'WhatsApp'}.
Tu objetivo: atender bien y rápido, entender qué busca la persona y llevarla a agendar una visita con Miguel, del equipo de Treme.

Cómo escribes:
- Español de México, trato de usted, cálido y profesional. Mensajes cortos (2 a 4 renglones), como en WhatsApp. Sin emojis, o uno como máximo.
- Una sola pregunta a la vez. No mandes listas largas; si hay muchos espacios, menciona los 2 o 3 que mejor le queden.
- Si te preguntan, di con claridad que eres un asistente virtual y que una persona del equipo puede atenderle cuando lo desee.
${nombre ? `- El cliente se llama ${nombre} (según su perfil); confírmalo antes de usarlo en el sistema.` : ''}

Lo que sabes (NO inventes nada fuera de esto):
- Torre Elysium: Av. Fundadores 105, Col. Lomas de Montecristo, Monterrey, N.L. (zona Valle Oriente). Edificio de usos mixtos con locales, oficinas y departamentos; alberca, gimnasio, salón de eventos, terraza con asador, 5 niveles de estacionamiento y seguridad 24 horas.
- Treme también tiene Plaza Maranta, Plaza Ellion, Plaza GM 202 y Plaza Hudson (locales comerciales). Hoy no hay locales publicados como disponibles: si alguien busca local, toma sus datos y dile que le avisarán en cuanto haya uno.
- Espacios disponibles hoy, con precio (es la única lista válida; si no está aquí, no está disponible):
${JSON.stringify(inv, null, 1)}
- Las oficinas se rentan más IVA. Precio de venta en pesos mexicanos.
- Cualquier dato que no esté aquí (cajones de estacionamiento por unidad, cuota de mantenimiento, acabados, depósito, plazo, planos, si aceptan mascotas, crédito, etc.): di que lo confirma Miguel y ofrece pasarle la conversación o agendar visita. Nunca adivines.
- No negocies ni ofrezcas descuentos. Si piden mejor precio, usa pasar_a_persona.

Proceso:
1. Saluda y pregunta en qué le puede ayudar, si no lo dijo ya.
2. Entiende: ¿renta o compra?, ¿para qué lo usaría?, ¿cuántos m² más o menos?, ¿para cuándo? Pregunta solo lo que falte, una cosa a la vez.
3. Recomienda los espacios que le queden y da precio claro.
4. Ofrece visita: pregunta qué día y hora le acomoda (lunes a sábado). Usa agendar_visita y dile que Miguel le confirma por este medio.
5. Usa registrar_interesado cada vez que obtengas un dato nuevo, sin decírselo al cliente.
Nunca pidas datos bancarios, identificaciones ni contraseñas.`;
}

async function claude(system: string, mensajes: any[]) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('MODELO', 'claude-sonnet-5-5'), max_tokens: 700, system, tools: HERRAMIENTAS, messages: mensajes }),
  });
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

// Historial para la IA: cliente = user; asesor y persona = assistant (juntando seguidos)
function historial(filas: any[]) {
  const out: { role: string; content: string }[] = [];
  for (const f of filas) {
    if (f.rol === 'sistema') continue;
    const role = f.rol === 'cliente' ? 'user' : 'assistant';
    const txt = f.rol === 'humano' ? `[Miguel escribió] ${f.texto}` : f.texto;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + txt; else out.push({ role, content: txt });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// ---------------------------------------------------------------- atender un mensaje
export async function atender(m: Entrante) {
  const conv = await conversacion(m);
  if (!(await guardar(conv.id, 'cliente', m.texto, m.metaId))) return;        // duplicado
  if (!conv.bot_activo) return;                                                 // la atiende una persona

  const [{ data: filas }, inv] = await Promise.all([
    db.from('bot_mensajes').select('rol, texto').eq('conversacion_id', conv.id).order('creado_en', { ascending: false }).limit(40),
    inventario(),
  ]);
  const mensajes: any[] = historial((filas || []).reverse());
  const system = instrucciones(inv, m.canal, conv.nombre);
  let respuesta = '';
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    let r;
    try { r = await claude(system, mensajes); }
    catch (e) {                                                      // sin IA (llave, saldo, caída): que no se quede sin respuesta
      console.error(e);
      respuesta = 'Gracias por escribir a Grupo Inmobiliario Treme. En un momento le atiende una persona del equipo.';
      await db.from('bot_conversaciones').update({ bot_activo: false, pidio_humano: true }).eq('id', conv.id);
      await avisar(`El asesor virtual no pudo contestar a ${conv.nombre || m.contacto} (${m.canal}). Mensaje: "${m.texto.slice(0, 200)}"`);
      break;
    }
    const usos = (r.content || []).filter((b: any) => b.type === 'tool_use');
    respuesta = (r.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (!usos.length) break;
    mensajes.push({ role: 'assistant', content: r.content });
    const resultados = [];
    for (const u of usos) resultados.push({ type: 'tool_result', tool_use_id: u.id, content: await herramienta(u.name, u.input || {}, conv, m) });
    mensajes.push({ role: 'user', content: resultados });
  }
  if (!respuesta) respuesta = 'Gracias por escribir a Grupo Inmobiliario Treme. En un momento le atiende una persona del equipo.';
  await enviar(m.canal, m.contacto, respuesta);
  await guardar(conv.id, 'asesor', respuesta);
}

async function prospecto(conv: any, m: Entrante, datos: Record<string, unknown>) {
  const t = await treme();
  const limpio = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  const reg: Record<string, unknown> = {
    nombre: limpio(datos.nombre, 120), empresa: limpio(datos.empresa, 120),
    correo: typeof datos.correo === 'string' && /^\S+@\S+\.\S+$/.test(datos.correo) ? datos.correo.toLowerCase().slice(0, 160) : undefined,
    operacion: ['renta', 'venta', 'ambas'].includes(datos.operacion as string) ? datos.operacion : undefined,
    tipo_obra: limpio(datos.espacio, 60), m2: typeof datos.m2 === 'number' && datos.m2 > 0 ? datos.m2 : undefined,
    ubicacion: limpio(datos.giro, 120), cuando: ['ya', '3_meses', '6_meses', 'explorando'].includes(datos.cuando as string) ? datos.cuando : undefined,
    mensaje: limpio(datos.resumen, 2000),
  };
  Object.keys(reg).forEach((k) => reg[k] === undefined && delete reg[k]);
  if (conv.prospecto_id) {
    if (Object.keys(reg).length) await db.from('prospectos').update(reg).eq('id', conv.prospecto_id);
    return conv.prospecto_id;
  }
  // ¿Ya llegó por el formulario de la página o antes? Mismo WhatsApp (últimos 10 dígitos) en los últimos 60 días → el mismo prospecto
  if (m.canal === 'whatsapp') {
    const diez = m.contacto.replace(/\D/g, '').slice(-10);
    const desde = new Date(Date.now() - 60 * 864e5).toISOString();
    const { data: prev } = await db.from('prospectos').select('id').eq('empresa_id', t.id).like('whatsapp', `%${diez}`).gte('creado_en', desde).order('creado_en', { ascending: false }).limit(1);
    if (prev?.length) {
      await db.from('bot_conversaciones').update({ prospecto_id: prev[0].id }).eq('id', conv.id);
      conv.prospecto_id = prev[0].id;
      if (Object.keys(reg).length) await db.from('prospectos').update(reg).eq('id', prev[0].id);
      return prev[0].id;
    }
  }
  const { data, error } = await db.from('prospectos').insert({
    org_id: t.org_id, empresa_id: t.id, nombre: (reg.nombre as string) || conv.nombre || 'Sin nombre',
    whatsapp: m.canal === 'whatsapp' ? m.contacto : null, origen: m.canal === 'instagram' ? 'instagram' : m.canal === 'web' ? 'web' : 'whatsapp',
    primera_respuesta: new Date().toISOString(), notas: 'Atendido por el asesor virtual.', ...reg,
  }).select('id').single();
  if (error) throw error;
  await db.from('bot_conversaciones').update({ prospecto_id: data.id }).eq('id', conv.id);
  conv.prospecto_id = data.id;
  return data.id;
}

async function herramienta(nombre: string, datos: any, conv: any, m: Entrante): Promise<string> {
  try {
    if (nombre === 'registrar_interesado') { await prospecto(conv, m, datos); return 'Guardado.'; }
    if (nombre === 'agendar_visita') {
      const id = await prospecto(conv, m, { espacio: datos.espacio });
      const { data: p } = await db.from('prospectos').select('nombre, notas, estado').eq('id', id).single();
      await db.from('prospectos').update({
        estado: p?.estado === 'nuevo' ? 'calificado' : p?.estado,
        notas: `${p?.notas ? p.notas + '\n' : ''}Visita pedida: ${datos.cuando}${datos.espacio ? ' · ' + datos.espacio : ''}`.slice(0, 4000),
      }).eq('id', id);
      await avisar(`Visita pedida — ${p?.nombre || conv.nombre || m.contacto}: ${datos.cuando}${datos.espacio ? ', ' + datos.espacio : ''}. Canal: ${m.canal}${m.canal === 'whatsapp' ? ' +' + m.contacto : ''}.`);
      return 'Visita registrada; Miguel ya recibió el aviso y confirmará.';
    }
    if (nombre === 'pasar_a_persona') {
      await prospecto(conv, m, {});
      await db.from('bot_conversaciones').update({ bot_activo: false, pidio_humano: true }).eq('id', conv.id);
      await avisar(`Quieren hablar con una persona — ${conv.nombre || m.contacto} (${m.canal}${m.canal === 'whatsapp' ? ' +' + m.contacto : ''}). Motivo: ${datos.motivo}`);
      return 'Listo: el asesor virtual queda en pausa y Miguel continúa. Despídete brevemente diciendo que Miguel le escribe en breve.';
    }
    return 'Herramienta desconocida.';
  } catch (e) { console.error(nombre, e); return 'No se pudo guardar, sigue la conversación normalmente.'; }
}

// ---------------------------------------------------------------- envíos
async function enviar(canal: Canal, a: string, texto: string) {
  if (canal === 'whatsapp' || canal === 'web') {
    const r = await fetch(`${GRAPH}/${env('WA_PHONE_ID')}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${env('WA_TOKEN')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: a, type: 'text', text: { body: texto, preview_url: true } }),
    });
    if (!r.ok) console.error('WhatsApp', r.status, await r.text());
    return r.ok;
  }
  const r = await fetch(`${GRAPH}/${env('IG_ID')}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${env('IG_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { id: a }, message: { text: texto.slice(0, 1000) } }),
  });
  if (!r.ok) console.error('Instagram', r.status, await r.text());
  return r.ok;
}

// Aviso a Miguel: con plantilla aprobada llega siempre; sin plantilla, solo si él escribió al número en las últimas 24 h
async function avisar(texto: string) {
  const a = env('AVISO_WHATSAPP'); if (!a) return;
  const plantilla = env('AVISO_PLANTILLA');
  const body = plantilla
    ? { messaging_product: 'whatsapp', to: a, type: 'template', template: { name: plantilla, language: { code: 'es_MX' }, components: [{ type: 'body', parameters: [{ type: 'text', text: texto.slice(0, 900) }] }] } }
    : { messaging_product: 'whatsapp', to: a, type: 'text', text: { body: `Asesor Treme · ${texto}` } };
  const r = await fetch(`${GRAPH}/${env('WA_PHONE_ID')}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${env('WA_TOKEN')}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) console.error('Aviso', r.status, await r.text());
}

// ---------------------------------------------------------------- formulario de la página
async function formularioWeb(p: any) {
  const tel = String(p.whatsapp || '').replace(/\D/g, '').slice(-10);
  const { error } = await db.rpc('registrar_prospecto', { p: { ...p, marca: 'treme', whatsapp: tel || null } });
  if (error) return json({ ok: false, error: error.message }, 400);
  // Saludo por WhatsApp solo si marcó la casilla y hay plantilla aprobada (fuera de la ventana de 24 h Meta solo permite plantillas)
  if (p.acepta_whatsapp && tel.length === 10 && env('BIENVENIDA_PLANTILLA')) {
    const a = '52' + tel;
    const r = await fetch(`${GRAPH}/${env('WA_PHONE_ID')}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${env('WA_TOKEN')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: a, type: 'template', template: { name: env('BIENVENIDA_PLANTILLA'), language: { code: 'es_MX' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: String(p.nombre || '').split(' ')[0].slice(0, 40) || 'hola' }, { type: 'text', text: String(p.tipo_obra || 'nuestros espacios').slice(0, 60) }] }] } }),
    });
    if (r.ok) {
      const conv = await conversacion({ canal: 'whatsapp', contacto: a, nombre: p.nombre, texto: '' });
      await guardar(conv.id, 'sistema', `Formulario de la página: ${p.nombre} · ${p.tipo_obra || ''} · ${p.operacion || ''}. Se le mandó saludo por WhatsApp.`);
    }
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------- bandeja del equipo (Treme → Prospectos → Conversaciones)
// La persona entra con su sesión de app.medco.mx; si la base le deja ver la conversación (rol administración), puede contestar.
async function desdeEquipo(req: Request, p: any) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ ok: false, error: 'Inicie sesión de nuevo.' }, 401);
  const comoUsuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { db: { schema: 'app' }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: conv } = await comoUsuario.from('bot_conversaciones').select('*').eq('id', p.conversacion_id).maybeSingle();
  if (!conv) return json({ ok: false, error: 'No tiene permiso para esta conversación.' }, 403);
  const texto = String(p.texto || '').trim().slice(0, 3500);
  if (!texto) return json({ ok: false, error: 'Escriba un mensaje.' }, 400);
  // Meta solo deja escribir libremente dentro de las 24 h después del último mensaje del cliente
  const horas = conv.ultimo_cliente ? (Date.now() - new Date(conv.ultimo_cliente).getTime()) / 36e5 : 999;
  if (horas > 24) return json({ ok: false, error: 'Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp e Instagram ya no dejan escribirle libremente. Espere a que el cliente vuelva a escribir.' }, 409);
  const ok = await enviar(conv.canal, conv.contacto, texto);
  if (!ok) return json({ ok: false, error: 'Meta no aceptó el mensaje. Revise que el número y el Instagram estén conectados.' }, 502);
  await db.from('bot_mensajes').insert({ conversacion_id: conv.id, rol: 'humano', texto, enviado_por: u.user.id });
  await db.from('bot_conversaciones').update({ bot_activo: false, pidio_humano: false, actualizado_en: new Date().toISOString() }).eq('id', conv.id);
  return json({ ok: true });
}
