// Admin-only: removes one photo from a site image slot's gallery, keeping
// the rest. DB row is updated first (dropping that url from the array),
// the file is only deleted from storage afterward — same safe ordering as
// delete-image.js for products.
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

  const { key, url } = await request.json().catch(() => ({}));
  if (!key || !url) {
    return new Response(JSON.stringify({ ok: false, error: "Falta key o url" }), { status: 400 });
  }

  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  const existingRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_site_images?key=eq.${encodeURIComponent(key)}&select=urls,carousel_enabled`,
    { headers: sbHeaders }
  );
  const [existing] = await existingRes.json();
  if (!existing) {
    return new Response(JSON.stringify({ ok: false, error: "Esa imagen no existe" }), { status: 404 });
  }
  const newUrls = (existing.urls || []).filter((u) => u !== url);
  // A carousel needs at least 2 photos to actually rotate — turn it off
  // automatically if this removal drops below that, instead of leaving a
  // stuck "carousel" of just one photo.
  const carouselEnabled = existing.carousel_enabled && newUrls.length > 1;

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_site_images?key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ urls: newUrls, carousel_enabled: carouselEnabled, updated_at: new Date().toISOString() }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await updateRes.text() }), { status: 500 });
  }

  if (url.includes("/megasafety-products/")) {
    try {
      const path = decodeURIComponent(url.split("/megasafety-products/")[1] || "");
      if (path) {
        await fetch(`${env.SUPABASE_URL}/storage/v1/object/megasafety-products/${path}`, {
          method: "DELETE",
          headers: sbHeaders,
        });
      }
    } catch {
      // ignore
    }
  }

  return new Response(JSON.stringify({ ok: true, urls: newUrls, carousel_enabled: carouselEnabled }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
