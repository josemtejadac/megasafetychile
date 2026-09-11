// Replaces one photo already in a product's gallery with a re-compressed
// version, keeping its position in image_urls (and image_url in sync if
// it's the cover photo) — used by the admin panel's one-time "Comprimir
// fotos existentes" cleanup. Order matters for safety: the new file is
// uploaded and the DB row is updated FIRST; the old file is only deleted
// from storage after that succeeds, so a failure midway never loses a
// photo that's still referenced by the product.
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

  const form = await request.formData();
  const file = form.get("file");
  const productId = form.get("product_id");
  const oldUrl = form.get("old_image_url");
  if (!file || !productId || !oldUrl) {
    return new Response(JSON.stringify({ ok: false, error: "Falta file, product_id o old_image_url" }), { status: 400 });
  }

  const productRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${productId}&select=image_urls`, { headers: sbHeaders });
  const [product] = await productRes.json();
  const images = product?.image_urls || [];
  const idx = images.indexOf(oldUrl);
  if (idx === -1) {
    return new Response(JSON.stringify({ ok: false, error: "Esa foto ya no está en el producto (se saltó, no se perdió nada)" }), { status: 404 });
  }

  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${productId}-${Date.now()}.${ext}`;

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
  const newImages = [...images];
  newImages[idx] = newUrl;

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${productId}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ image_urls: newImages, image_url: newImages[0] }),
  });
  if (!updateRes.ok) {
    // The new file is now orphaned storage, but nothing about the product
    // was lost — the old photo is still the one referenced and still live.
    return new Response(JSON.stringify({ ok: false, error: `DB update error: ${await updateRes.text()}` }), { status: 500 });
  }

  // Only now, with the product safely pointing at the new (compressed)
  // file, remove the old one. Best-effort — a failure here just leaves one
  // unreferenced file behind, never a broken product.
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

  return new Response(JSON.stringify({ ok: true, image_url: newImages[0], image_urls: newImages }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
