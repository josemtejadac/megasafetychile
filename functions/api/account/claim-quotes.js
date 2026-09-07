// Called right after a customer logs in or signs up: links any past
// quotes that were submitted with their email but no account (guest
// checkout, or a quote registered manually by staff) to their account, so
// "Mis cotizaciones" shows their full history instead of just quotes made
// after they registered.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 401 });
  }

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Sesión inválida" }), { status: 401 });
  }
  const user = await userRes.json();
  if (!user.email) {
    return new Response(JSON.stringify({ ok: true, linked: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?correo=eq.${encodeURIComponent(user.email)}&customer_user_id=is.null`,
    { method: "PATCH", headers: sbHeaders, body: JSON.stringify({ customer_user_id: user.id }) }
  );
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: await res.text() }), { status: 500 });
  }
  const linked = await res.json();

  return new Response(JSON.stringify({ ok: true, linked: linked.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
