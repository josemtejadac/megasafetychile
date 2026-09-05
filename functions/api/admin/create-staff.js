// Admin-only: creates a brand-new staff member directly (RUT + password),
// no manual Supabase dashboard step needed. Under the hood every Supabase
// Auth user still needs an email, so we synthesize an internal one from the
// RUT (<rut>@staff.megasafetychile.internal) — the worker never sees or uses
// it, they only ever log in with their RUT via /api/staff/login.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

// Accepts a RUT typed with or without dots/dashes/spaces and always returns
// the same canonical form ("20811675-4"), matching login.js's normalizeRut.
function normalizeRut(rut) {
  const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

async function requireAdmin(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();

  const adminRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_admins?user_id=eq.${user.id}&role=eq.admin&select=user_id`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await adminRes.json();
  return Array.isArray(rows) && rows.length ? user : null;
}

export async function onRequestPost({ request, env }) {
  const caller = await requireAdmin(request, env);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const { rut, password, name, role, commission_rate } = await request.json();
  if (!rut || !password || !role) {
    return new Response(JSON.stringify({ ok: false, error: "Falta RUT, contraseña o rol" }), { status: 400 });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ ok: false, error: "La contraseña debe tener al menos 6 caracteres" }), {
      status: 400,
    });
  }

  const normalizedRut = normalizeRut(rut);
  const internalEmail = `${normalizedRut.toLowerCase()}@staff.megasafetychile.internal`;

  // Refuse if this RUT is already linked.
  const existingRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_admins?rut=eq.${encodeURIComponent(normalizedRut)}&select=user_id`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const existingRows = await existingRes.json();
  if (Array.isArray(existingRows) && existingRows.length) {
    return new Response(JSON.stringify({ ok: false, error: "Ya existe un trabajador con ese RUT" }), {
      status: 409,
    });
  }

  const createRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: internalEmail, password, email_confirm: true }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: createData.msg || createData.error_description || "Error creando la cuenta" }), {
      status: 500,
    });
  }

  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_admins`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        user_id: createData.id,
        rut: normalizedRut,
        email: internalEmail,
        name: name || null,
        role: role === "admin" ? "admin" : "vendedor",
        commission_rate: commission_rate || 0,
        active: true,
      },
    ]),
  });
  if (!insertRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await insertRes.text() }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
