// Links an existing Supabase Auth user (by email) to megasafety_admins with a
// role + commission rate. The auth account itself must already exist (created
// manually via the Supabase dashboard) — this just looks up its user id and
// upserts the staff row. Gated to callers whose session belongs to role='admin'.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

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

  const { email, name, role, commission_rate } = await request.json();
  if (!email || !role) {
    return new Response(JSON.stringify({ ok: false, error: "Falta email o rol" }), { status: 400 });
  }

  // Look up the auth user id by email via the Admin API.
  const listRes = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!listRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Error consultando usuarios" }), { status: 500 });
  }
  const listData = await listRes.json();
  const match = (listData.users || []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) {
    return new Response(
      JSON.stringify({ ok: false, error: "No existe una cuenta con ese correo. Créala primero en Supabase → Authentication → Users." }),
      { status: 404 }
    );
  }

  const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_admins`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([
      { user_id: match.id, name: name || null, role, commission_rate: commission_rate || 0, active: true },
    ]),
  });
  if (!upsertRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await upsertRes.text() }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
