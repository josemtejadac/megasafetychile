// Staff-only: removes one product line from a quote (e.g. added by mistake
// while building the cart from a customer's attached PDF/photo listing).
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

const sbHeaders = (env, extra = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

async function requireStaff(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const staffRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_admins?user_id=eq.${user.id}&active=eq.true&select=user_id`,
    { headers: sbHeaders(env) }
  );
  const rows = await staffRes.json();
  return Array.isArray(rows) && rows.length ? user : null;
}

export async function onRequestPost({ request, env }) {
  const caller = await requireStaff(request, env);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const { item_id } = await request.json().catch(() => ({}));
  if (!item_id) {
    return new Response(JSON.stringify({ ok: false, error: "Falta item_id" }), { status: 400 });
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items?id=eq.${item_id}`, {
    method: "DELETE",
    headers: sbHeaders(env),
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: await res.text() }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
