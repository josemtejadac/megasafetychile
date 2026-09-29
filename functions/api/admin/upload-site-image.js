// Admin-only: replaces one of the site's own marketing images (hero,
// banners — not product photos, those go through upload-image.js). Order
// matters for safety, same pattern as replace-image.js: upload the new
// file and update megasafety_site_images FIRST, only delete the old
// uploaded file afterward (and only if it was itself an upload, never the
// static assets/img/... default shipped with the site).
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

  const form = await request.formData();
  const file = form.get("file");
  const key = form.get("key");
  if (!file || !key) {
    return new Response(JSON.stringify({ ok: false, error: "Falta file o key" }), { status: 400 });
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
  if (!existing) {
    return new Response(JSON.stringify({ ok: false, error: "Esa imagen no existe" }), { status: 404 });
  }
  const oldUrl = existing.url;

  const ext = (file.name || "photo.jpg").split(".").pop().toLowerCase();
  const path = `site/${key}-${Date.now()}.${ext}`;

  const uploadRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/megasafety-products/${path}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": file.type || "image/jpeg",
    },
    body: await file.arrayBuffer(),
  });
  if (!uploadRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `Storage error: ${await uploadRes.text()}` }), { status: 500 });
  }

  const newUrl = `${env.SUPABASE_URL}/storage/v1/object/public/megasafety-products/${path}`;

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_site_images?key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ url: newUrl, updated_at: new Date().toISOString() }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `DB update error: ${await updateRes.text()}` }), { status: 500 });
  }

  // Best-effort: only clean up the previous file if it was itself an
  // upload (lives under our own storage bucket) — never touch the static
  // assets/img/... default, that one ships with the site's own code.
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

  return new Response(JSON.stringify({ ok: true, url: newUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
