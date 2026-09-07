// Staff-only: looks up past customers by RUT or razón social so the manual
// quote form can auto-fill their company data instead of retyping it every
// time. Source of truth is quote history itself (there's no separate
// "customers" table) — most recent quote per matching RUT wins.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

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
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await staffRes.json();
  return Array.isArray(rows) && rows.length ? user : null;
}

export async function onRequestGet({ request, env }) {
  const caller = await requireStaff(request, env);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return new Response(JSON.stringify({ ok: true, customers: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoded = encodeURIComponent(`*${q}*`);
  const filter = `or=(rut.ilike.${encoded},razon_social.ilike.${encoded})`;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?${filter}&select=razon_social,rut,nombre_contacto,telefono,correo,direccion,comuna,region,created_at&order=created_at.desc&limit=50`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: await res.text() }), { status: 500 });
  }
  const rows = await res.json();

  // Dedupe by RUT, keeping the most recent quote's data for each client.
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.rut)) seen.set(row.rut, row);
  }
  const customers = Array.from(seen.values()).slice(0, 8);

  return new Response(JSON.stringify({ ok: true, customers }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
