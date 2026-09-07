// Customer-facing: lets the customer who owns a priced quote reject it, with
// an optional reason, so staff/admin see why instead of it just going quiet.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

const sbHeaders = (env, extra = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  let user = null;
  if (token) {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (userRes.ok) user = await userRes.json();
  }

  const { quote_id, reason } = await request.json().catch(() => ({}));
  if (!quote_id) {
    return new Response(JSON.stringify({ ok: false, error: "Falta quote_id" }), { status: 400 });
  }

  const quoteRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quote_id}&select=*`,
    { headers: sbHeaders(env) }
  );
  const [quote] = await quoteRes.json();
  if (!quote) {
    return new Response(JSON.stringify({ ok: false, error: "Cotización no encontrada" }), { status: 404 });
  }
  // A quote with no linked account (created manually, or the customer never
  // registered) has nothing to check the caller's identity against — the
  // quote's own unguessable UUID is the access control, same as /api/quote/pay.
  // Otherwise it must be the logged-in owner.
  if (quote.customer_user_id && quote.customer_user_id !== user?.id) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }
  if (quote.status !== "cotizada") {
    return new Response(JSON.stringify({ ok: false, error: "Esta cotización no se puede rechazar en su estado actual" }), { status: 400 });
  }

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quote_id}`, {
    method: "PATCH",
    headers: sbHeaders(env),
    body: JSON.stringify({
      status: "rechazada",
      rejected_reason: reason || null,
      rejected_at: new Date().toISOString(),
    }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await updateRes.text() }), { status: 500 });
  }

  await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_quote_events`, {
    method: "POST",
    headers: sbHeaders(env),
    body: JSON.stringify([{ quote_id, user_id: user?.id || null, event_type: "rejected_by_customer", detail: { reason: reason || null } }]),
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
