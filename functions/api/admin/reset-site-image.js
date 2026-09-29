// Admin-only: reverts one site image back to the original static asset
// that ships with the site (clears the DB override) and cleans up the
// uploaded file, in that order — same safe pattern as everything else
// touching this table.
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

  const { key } = await request.json().catch(() => ({}));
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: "Falta key" }), { status: 400 });
  }

  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  const existingRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_site_images?key=eq.${encodeURIComponent(key)}&select=url`,
    { headers: sbHeaders }
  );
  const [existing] = await existingRes.json();
  const oldUrl = existing?.url;

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_site_images?key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ url: null, updated_at: new Date().toISOString() }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await updateRes.text() }), { status: 500 });
  }

  if (oldUrl && oldUrl.includes("/megasafety-products/")) {
    try {
      const oldPath = decodeURIComponent(oldUrl.split("/megasafety-products/")[1] || "");
      if (oldPath) {
        await fetch(`${env.SUPABASE_URL}/storage/v1/object/megasafety-products/${oldPath}`, {
          method: "DELETE",
          headers: sbHeaders,
        });
      }
    } catch {
      // ignore
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
