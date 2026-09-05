// Admin-only: permanently deletes a quote and its items.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

const sbHeaders = (env, extra = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

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
    { headers: sbHeaders(env) }
  );
  const rows = await adminRes.json();
  return Array.isArray(rows) && rows.length ? user : null;
}

export async function onRequestPost({ request, env }) {
  const caller = await requireAdmin(request, env);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const { quote_id } = await request.json().catch(() => ({}));
  if (!quote_id) {
    return new Response(JSON.stringify({ ok: false, error: "Falta quote_id" }), { status: 400 });
  }

  await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items?quote_id=eq.${quote_id}`, {
    method: "DELETE",
    headers: sbHeaders(env),
  });
  await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_quote_events?quote_id=eq.${quote_id}`, {
    method: "DELETE",
    headers: sbHeaders(env),
  });
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quote_id}`, {
    method: "DELETE",
    headers: sbHeaders(env),
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: await res.text() }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
