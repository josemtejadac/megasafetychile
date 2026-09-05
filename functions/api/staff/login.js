// Unified login: the admin (owner) signs in with the company email, workers
// sign in with their RUT. Both end up doing a normal Supabase password grant —
// this endpoint just resolves a RUT to its associated email first, using the
// service role (RUT lookups can't go through the public anon key since
// megasafety_admins isn't publicly readable).
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

// Accepts a RUT typed with or without dots/dashes/spaces (e.g. "20.811.675-4",
// "208116754", "20811675-4") and always returns the same canonical form
// ("20811675-4"), so lookups match regardless of how the user typed it.
function normalizeRut(rut) {
  const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const { identifier, password } = body || {};
  if (!identifier || !password) {
    return json({ ok: false, error: "Falta correo/RUT o contraseña" }, 400);
  }

  let email = identifier;

  if (!identifier.includes("@")) {
    // Treat as RUT — look up the associated email via service role.
    const rut = normalizeRut(identifier);
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/megasafety_admins?rut=eq.${encodeURIComponent(rut)}&select=email&active=eq.true`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    const rows = res.ok ? await res.json() : [];
    if (!rows.length || !rows[0].email) {
      return json({ ok: false, error: "RUT o contraseña incorrectos" }, 401);
    }
    email = rows[0].email;
  }

  const tokenRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    return json({ ok: false, error: "RUT/correo o contraseña incorrectos" }, 401);
  }

  return json({
    ok: true,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
