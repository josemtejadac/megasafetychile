// Staff-only: adds a product line to an existing quote — used when the
// customer only sent a PDF/photo/Excel listing what they need, and staff
// has to build the actual cart for them before pricing and sending it back.
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

  const { quote_id, product_name, brand, category_id, quantity, unit_price } = await request.json().catch(() => ({}));
  if (!quote_id || !product_name || !quantity || quantity <= 0) {
    return new Response(JSON.stringify({ ok: false, error: "Falta quote_id, product_name o quantity" }), { status: 400 });
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items`, {
    method: "POST",
    headers: sbHeaders(env, { Prefer: "return=representation" }),
    body: JSON.stringify([
      {
        quote_id,
        product_name,
        brand: brand || null,
        category_id: category_id || null,
        quantity,
        unit_price: unit_price || null,
      },
    ]),
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: await res.text() }), { status: 500 });
  }
  const [item] = await res.json();

  return new Response(JSON.stringify({ ok: true, item }), { status: 200, headers: { "Content-Type": "application/json" } });
}
