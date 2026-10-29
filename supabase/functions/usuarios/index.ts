// Alta y administración de usuarios de la plataforma.
// Solo el dueño puede usarla. Corre con la llave de servicio, que nunca sale del servidor.
import { createClient } from "jsr:@supabase/supabase-js@2";

// Correo interno para quien no tiene correo propio. Treme / MEDCO usa usuarios.medco.mx; Unaria y sus clientes,
// usuarios.unaria.mx. El secreto DOMINIO_INTERNO lo cambia si algún cliente quiere el suyo.
const DOMINIO_INTERNO = Deno.env.get("DOMINIO_INTERNO") ??
  ((Deno.env.get("SUPABASE_URL") ?? "").includes("mqzuaxxnidaokhdqcurm") ? "usuarios.medco.mx" : "usuarios.unaria.mx");
const ROLES = ["dueno", "socio", "administracion", "cobranza", "operacion", "encargado", "lectura"];
const ORIGENES = ["https://app.medco.mx", "https://unaria.mx", "https://www.unaria.mx", "https://andresmedellin-jpg.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(origin) ? origin : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
const falla = (req: Request, mensaje: string, status = 400) => json(req, { error: mensaje }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return falla(req, "Método no permitido", 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
  });

  // ¿Quién llama?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quien } = await admin.auth.getUser(token);
  if (!quien?.user) return falla(req, "Sesión no válida", 401);

  const { data: yo } = await admin.from("miembros").select("org_id, rol")
    .eq("user_id", quien.user.id).eq("activo", true).maybeSingle();
  if (!yo || yo.rol !== "dueno") return falla(req, "Solo el dueño puede administrar usuarios", 403);
  const orgId: string = yo.org_id;
  const miId: string = quien.user.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return falla(req, "Solicitud inválida"); }

  // Validaciones comunes
  const validarRoles = (rol: unknown, roles: unknown) => {
    if (typeof rol !== "string" || !ROLES.includes(rol) || rol === "dueno") return "Rol inválido";
    if (!Array.isArray(roles) || roles.some((r) => !ROLES.includes(r) || r === "dueno")) return "Roles inválidos";
    return null;
  };
  const validarEmpresas = async (empresas: unknown) => {
    if (empresas === null) return null;
    if (!Array.isArray(empresas) || !empresas.length) return "Elige al menos una empresa";
    const { data } = await admin.from("empresas").select("id").eq("org_id", orgId).in("id", empresas as string[]);
    return (data?.length ?? 0) === empresas.length ? null : "Empresa inválida";
  };
  const validarPassword = (p: unknown) =>
    typeof p === "string" && p.length >= 6 && p.length <= 72 ? null : "La contraseña debe tener entre 6 y 72 caracteres";

  const miembroDeMiOrg = async (userId: unknown) => {
    if (typeof userId !== "string") return null;
    const { data } = await admin.from("miembros").select("user_id, rol")
      .eq("org_id", orgId).eq("user_id", userId).maybeSingle();
    return data;
  };

  switch (body.accion) {
    case "crear": {
      const nombre = String(body.nombre ?? "").trim();
      const usuario = String(body.usuario ?? "").trim().toLowerCase();
      if (!nombre) return falla(req, "Escribe el nombre");
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return falla(req, "El usuario debe tener de 3 a 30 letras o números, sin espacios ni acentos");
      const e1 = validarRoles(body.rol, body.roles ?? []) ?? validarPassword(body.password) ?? await validarEmpresas(body.empresas ?? null);
      if (e1) return falla(req, e1);

      const { data: existe } = await admin.from("miembros").select("user_id").eq("usuario", usuario).maybeSingle();
      if (existe) return falla(req, `El usuario "${usuario}" ya existe`);

      const { data: creado, error } = await admin.auth.admin.createUser({
        email: `${usuario}@${DOMINIO_INTERNO}`,
        password: body.password as string,
        email_confirm: true,
        user_metadata: { nombre },
      });
      if (error || !creado.user) return falla(req, "No se pudo crear la cuenta: " + (error?.message ?? ""));

      const { error: e2 } = await admin.from("miembros").insert({
        org_id: orgId, user_id: creado.user.id, nombre, usuario,
        rol: body.rol, roles: body.roles ?? [], empresas: body.empresas ?? null,
        activo: true, debe_cambiar_password: true,
      });
      if (e2) {
        await admin.auth.admin.deleteUser(creado.user.id); // no dejar cuentas a medias
        return falla(req, "No se pudo dar de alta: " + e2.message);
      }
      return json(req, { ok: true, user_id: creado.user.id });
    }

    case "password": {
      const m = await miembroDeMiOrg(body.user_id);
      if (!m) return falla(req, "Usuario no encontrado", 404);
      const e = validarPassword(body.password);
      if (e) return falla(req, e);
      const { error } = await admin.auth.admin.updateUserById(m.user_id, { password: body.password as string });
      if (error) return falla(req, error.message);
      if (m.user_id !== miId) {
        await admin.from("miembros").update({ debe_cambiar_password: true }).eq("user_id", m.user_id);
      }
      return json(req, { ok: true });
    }

    case "editar": {
      const m = await miembroDeMiOrg(body.user_id);
      if (!m) return falla(req, "Usuario no encontrado", 404);
      if (m.user_id === miId || m.rol === "dueno") return falla(req, "No puedes cambiar los permisos del dueño");
      const nombre = String(body.nombre ?? "").trim();
      if (!nombre) return falla(req, "Escribe el nombre");
      const e = validarRoles(body.rol, body.roles ?? []) ?? await validarEmpresas(body.empresas ?? null);
      if (e) return falla(req, e);
      const { error } = await admin.from("miembros").update({
        nombre, rol: body.rol, roles: body.roles ?? [], empresas: body.empresas ?? null,
      }).eq("user_id", m.user_id).eq("org_id", orgId);
      return error ? falla(req, error.message) : json(req, { ok: true });
    }

    case "activo": {
      const m = await miembroDeMiOrg(body.user_id);
      if (!m) return falla(req, "Usuario no encontrado", 404);
      if (m.user_id === miId || m.rol === "dueno") return falla(req, "No puedes desactivar al dueño");
      const activo = body.activo === true;
      // Desactivado = no puede entrar ni con la sesión que ya tenía abierta
      const { error } = await admin.auth.admin.updateUserById(m.user_id, { ban_duration: activo ? "none" : "876000h" });
      if (error) return falla(req, error.message);
      await admin.from("miembros").update({ activo }).eq("user_id", m.user_id).eq("org_id", orgId);
      return json(req, { ok: true });
    }

    default:
      return falla(req, "Acción desconocida");
  }
});
