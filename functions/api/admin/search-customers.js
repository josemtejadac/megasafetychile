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
  // Commas/parentheses would break PostgREST's or=(...) syntax.
  const q = (url.searchParams.get("q") || "").replace(/[,()*\\]/g, " ").trim();
  if (q.length < 2) {
    return new Response(JSON.stringify({ ok: true, customers: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const encoded = encodeURIComponent(`*${q}*`);
  const quoteFilter = `or=(rut.ilike.${encoded},razon_social.ilike.${encoded})`;
  const accountFilter = `or=(rut.ilike.${encoded},company_rut.ilike.${encoded},company_name.ilike.${encoded},first_name.ilike.${encoded},last_name.ilike.${encoded},email.ilike.${encoded})`;
  const [res, accountsRes] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?${quoteFilter}&select=razon_social,rut,nombre_contacto,telefono,correo,direccion,comuna,region,created_at&order=created_at.desc&limit=50`,
      { headers: sbHeaders }
    ),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/megasafety_customers?${accountFilter}&select=first_name,last_name,email,phone,rut,company_name,company_rut,address,comuna,region&order=updated_at.desc&limit=20`,
      { headers: sbHeaders }
    ),
  ]);
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: await res.text() }), { status: 500 });
  }
  const rows = await res.json();
  const accounts = accountsRes.ok ? await accountsRes.json() : [];

  // Registered accounts first (the customer keeps that data up to date
  // themselves), then quote history; dedupe by RUT (ignoring dots/dashes).
  const rutKey = (rut) => String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  const seen = new Map();
  for (const a of accounts) {
    const fullName = [a.first_name, a.last_name].filter(Boolean).join(" ");
    const row = {
      razon_social: a.company_name || fullName,
      rut: a.company_rut || a.rut || "",
      nombre_contacto: fullName,
      telefono: a.phone || "",
      correo: a.email || "",
      direccion: a.address || "",
      comuna: a.comuna || "",
      region: a.region || "",
      source: "cuenta",
    };
    const key = rutKey(row.rut) || `email:${(row.correo || "").toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  for (const row of rows) {
    const key = rutKey(row.rut) || `raw:${row.rut}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  const customers = Array.from(seen.values()).slice(0, 8);

  return new Response(JSON.stringify({ ok: true, customers }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
