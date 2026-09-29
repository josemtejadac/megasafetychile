// Admin-only: adds one photo to a site image slot's gallery (hero,
// banners — not product photos, those go through upload-image.js). A slot
// can hold several photos now; the admin decides separately (a checkbox in
// the panel, written directly via the client since RLS already allows it)
// whether to just show the first one or auto-rotate them as a carousel.
// Order matters for safety: the new file is uploaded and appended to
// megasafety_site_images.urls FIRST — this endpoint never deletes anything.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
const MAX_PHOTOS = 6;
const HOTSPOT_KEYS = new Set(["hero-mobile", "hero-desktop", "compra-hero"]);

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
    `${env.SUPABASE_URL}/rest/v1/megasafety_site_images?key=eq.${encodeURIComponent(key)}&select=urls`,
    { headers: sbHeaders }
  );
  const [existing] = await existingRes.json();
  if (!existing) {
    return new Response(JSON.stringify({ ok: false, error: "Esa imagen no existe" }), { status: 404 });
  }
  const urls = existing.urls || [];
  // Images with fixed-position invisible hotspots on top (category/menu
  // buttons) can never rotate as a carousel — only urls[0] is ever shown —
  // so more than one photo there would just sit unused, confusingly.
  const limit = HOTSPOT_KEYS.has(key) ? 1 : MAX_PHOTOS;
  if (urls.length >= limit) {
    return new Response(JSON.stringify({ ok: false, error: `Máximo ${limit} foto${limit > 1 ? "s" : ""} por sección. Quita la actual antes de subir otra.` }), { status: 400 });
  }

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
  const newUrls = [...urls, newUrl];

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_site_images?key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ urls: newUrls, updated_at: new Date().toISOString() }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `DB update error: ${await updateRes.text()}` }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, urls: newUrls }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
