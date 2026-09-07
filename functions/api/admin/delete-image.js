// Removes one photo from a product's gallery (image_urls) and keeps
// image_url (the "cover" photo every other part of the site reads) in
// sync with whatever is left at position 0.
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

  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  const adminRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_admins?user_id=eq.${user.id}&select=user_id`, { headers: sbHeaders });
  const adminRows = await adminRes.json();
  if (!Array.isArray(adminRows) || adminRows.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "No tienes permisos de administrador" }), { status: 403 });
  }

  const { product_id, image_url } = await request.json().catch(() => ({}));
  if (!product_id || !image_url) {
    return new Response(JSON.stringify({ ok: false, error: "Falta product_id o image_url" }), { status: 400 });
  }

  const productRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${product_id}&select=image_urls`, { headers: sbHeaders });
  const [product] = await productRes.json();
  const newImages = (product?.image_urls || []).filter((u) => u !== image_url);

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${product_id}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ image_urls: newImages, image_url: newImages[0] || null }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await updateRes.text() }), { status: 500 });
  }

  // Best-effort: also remove the file from storage. Non-fatal if it fails
  // (e.g. path already gone) — the DB no longer references it either way.
  try {
    const path = decodeURIComponent(image_url.split("/megasafety-products/")[1] || "");
    if (path) {
      await fetch(`${env.SUPABASE_URL}/storage/v1/object/megasafety-products/${path}`, {
        method: "DELETE",
        headers: sbHeaders,
      });
    }
  } catch {
    // ignore
  }

  return new Response(JSON.stringify({ ok: true, image_url: newImages[0] || null, image_urls: newImages }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
