// Asistente de Ayuda dentro de la plataforma (botón "Ayuda"). Responde cómo usar cada pantalla con base en manual.ts.
// Solo para personas que entraron a la plataforma (se revisa su sesión). No lee ni cambia datos del negocio.
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  obligatorio (sin ella el botón de Ayuda no aparece)
//   ASISTENTE_MODELO   opcional (por omisión claude-haiku-5-5)
//   ASISTENTE_LIMITE   opcional: preguntas por persona al día (por omisión 100)
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
import { GENERAL, MODULOS } from './manual.ts';

const env = (k: string) => Deno.env.get(k) || '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, authorization, x-client-info' };
const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo),
  { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });

const ROLES: Record<string, string> = { dueno: 'dueño', socio: 'socio', administracion: 'administración', cobranza: 'cobranza',
  operacion: 'captura de gastos', encargado: 'encargado de sitio', lectura: 'solo lectura' };

const REGLAS = `Eres el asistente de Ayuda de la plataforma administrativa {NEGOCIO}. Ayudas a las personas que la usan a encontrar
dónde se hace cada cosa y cómo hacerla, paso a paso.

CÓMO RESPONDES
- En español de México, claro, amable y corto: máximo 6 renglones o una lista de pasos numerados. Sin tecnicismos.
- Di exactamente qué botón tocar y en qué pantalla, con los nombres tal como aparecen (entre comillas).
- Solo sabes lo que dice el MANUAL de abajo. Si algo no está ahí, no lo inventes: di que no lo sabes con seguridad.
- La persona solo puede ver los módulos que aparecen en el manual. Si pregunta por algo que no le toca, dile que eso lo
  ve otra persona o que lo pida al dueño; no le expliques cómo hacerlo.
- No tienes acceso a los datos (montos, nombres, saldos). Si preguntan "¿cuánto debe X?", explica en qué pantalla lo ve.
- Nunca pidas ni repitas contraseñas.
- Si la persona dice que algo falla (error, no carga, no guarda, sale un número raro), que se borró algo por error, que
  necesita un permiso o algo que la plataforma no hace, o si después de 2 intentos no lo resuelves: da una respuesta breve
  y termina con una última línea exactamente así:
  ESCALAR: <resumen en una línea de lo que necesita, para el equipo de soporte>
- Las preguntas que no tengan que ver con la plataforma, contéstalas en una línea diciendo que solo ayudas con la plataforma.

Persona que pregunta: {NOMBRE} (puesto: {ROL}). Está en la pantalla: {PANTALLA}.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'GET') return json({ listo: !!env('ANTHROPIC_API_KEY') });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'La ayuda aún no está configurada.' }, 503);

  // 1) ¿Quién pregunta? (sesión de la plataforma)
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer .+/.test(auth)) return json({ error: 'Entra a la plataforma para usar la ayuda.' }, 401);
  let usuario: any;
  try {
    const r = await fetch(env('SUPABASE_URL') + '/auth/v1/user', { headers: { Authorization: auth, apikey: env('SUPABASE_ANON_KEY') } });
    if (!r.ok) return json({ error: 'Tu sesión expiró. Vuelve a entrar.' }, 401);
    usuario = await r.json();
  } catch (_) { return json({ error: 'Sin conexión' }, 502); }
  const miembro = (await rest(`miembros?user_id=eq.${usuario.id}&activo=eq.true&select=org_id,nombre,rol&limit=1`))?.[0];
  if (!miembro) return json({ error: 'Tu usuario no está activo.' }, 403);

  let b: any; try { b = await req.json(); } catch (_) { return json({ error: 'Solicitud inválida' }, 400); }
  const pregunta = String(b.pregunta || '').trim().slice(0, 1500);
  if (!pregunta) return json({ error: 'Escribe tu pregunta.' }, 400);

  // 2) Límite diario por persona
  const limite = Number(env('ASISTENTE_LIMITE')) || 100;
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const hoy = await rest(`asistente_preguntas?user_id=eq.${usuario.id}&creado_en=gte.${encodeURIComponent(desde)}&select=id&limit=1`, { Prefer: 'count=exact' }, true);
  if (hoy !== null && hoy >= limite) return json({ texto: 'Ya hiciste muchas preguntas hoy. Si es urgente, escríbele a soporte.', escalar: 'Llegó al límite de preguntas del día: ' + pregunta.slice(0, 150) });

  // 3) Manual: general + solo los módulos que la persona ve (primero la pantalla donde está)
  const pantalla = String(b.modulo || '').slice(0, 40);
  const visibles = (Array.isArray(b.modulos) ? b.modulos : []).map(String).filter((m: string) => m in MODULOS);
  const orden = [...new Set([pantalla, ...visibles].filter((m) => visibles.includes(m)))];
  const manual = 'MANUAL\n' + GENERAL + orden.map((m) => MODULOS[m]).join('');
  const titulos = (b.titulos && typeof b.titulos === 'object') ? b.titulos : {};
  const negocio = String(b.negocio || '').slice(0, 60);
  const sistema = REGLAS.replace('{NEGOCIO}', negocio ? 'de ' + negocio : '')
    .replace('{NOMBRE}', miembro.nombre || 'usuario').replace('{ROL}', ROLES[miembro.rol] || miembro.rol)
    .replace('{PANTALLA}', String(titulos[pantalla] || pantalla || 'Inicio').slice(0, 60));

  // Plática corta: últimas 6 vueltas
  const mensajes: { role: string; content: string }[] = [];
  for (const m of (Array.isArray(b.historial) ? b.historial : []).slice(-12)) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const content = String((m && m.content) || '').slice(0, 1500).trim();
    if (!content) continue;
    if (!mensajes.length && role === 'assistant') continue;
    if (mensajes.length && mensajes[mensajes.length - 1].role === role) mensajes[mensajes.length - 1].content += '\n' + content;
    else mensajes.push({ role, content });
  }
  if (mensajes.length && mensajes[mensajes.length - 1].role === 'user') mensajes[mensajes.length - 1].content += '\n' + pregunta;
  else mensajes.push({ role: 'user', content: pregunta });

  // 4) Claude (el manual va en caché: las preguntas siguientes cuestan ~10 % de la entrada)
  let texto = '', uso: any = {};
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env('ASISTENTE_MODELO') || 'claude-haiku-5-5', max_tokens: 600,
        system: [{ type: 'text', text: manual, cache_control: { type: 'ephemeral' } }, { type: 'text', text: sistema }],
        messages: mensajes
      })
    });
    if (!r.ok) { console.error('anthropic', r.status, await r.text()); return json({ error: 'La ayuda no respondió. Intenta otra vez.' }, 502); }
    const j = await r.json();
    texto = (j.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n').trim();
    uso = j.usage || {};
  } catch (e) { console.error('asistente', e); return json({ error: 'La ayuda no respondió. Intenta otra vez.' }, 502); }

  let escalar = '';
  const m = texto.match(/\n?\s*ESCALAR:\s*(.+)\s*$/i);
  if (m) { escalar = m[1].trim().slice(0, 300); texto = texto.slice(0, m.index).trim(); }
  if (!texto) texto = escalar ? 'Esto lo tiene que ver el equipo de soporte.' : 'Perdón, ¿me lo explicas de otra forma?';

  // 5) Registro (para ver qué se pregunta y mejorar el manual)
  await rest('asistente_preguntas', { Prefer: 'return=minimal' }, false, {
    org_id: miembro.org_id, user_id: usuario.id, nombre: miembro.nombre, modulo: pantalla || null, pregunta, respuesta: texto,
    escalar: escalar || null, tokens_entrada: (uso.input_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0),
    tokens_salida: uso.output_tokens || 0
  });
  return json({ texto, escalar });
});

// Consulta a la base con la llave del servidor (esquema app)
async function rest(ruta: string, extra: Record<string, string> = {}, contar = false, cuerpo?: unknown): Promise<any> {
  try {
    const llave = env('SUPABASE_SERVICE_ROLE_KEY');
    const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + ruta, {
      method: cuerpo ? 'POST' : 'GET',
      headers: { apikey: llave, Authorization: 'Bearer ' + llave, 'Accept-Profile': 'app', 'Content-Profile': 'app',
        'Content-Type': 'application/json', ...extra },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    if (!r.ok) { console.error('rest', ruta.split('?')[0], r.status, await r.text()); return null; }
    if (contar) { const cr = r.headers.get('content-range') || ''; return Number(cr.split('/')[1]) || 0; }
    return cuerpo ? true : await r.json();
  } catch (e) { console.error('rest', e); return null; }
}
