// Sube una imagen de producto a Supabase Storage y actualiza megasafety_products.image_url.
// Autenticación: valida el access_token de la sesión Supabase del admin logueado
// (no un secreto fijo) — así el frontend nunca necesita guardar una clave.
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

  const adminRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_admins?user_id=eq.${user.id}&select=user_id`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const adminRows = await adminRes.json();
  if (!Array.isArray(adminRows) || adminRows.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "No tienes permisos de administrador" }), {
      status: 403,
    });
  }

  const form = await request.formData();
  const file = form.get("file");
  const productId = form.get("product_id");
  if (!file || !productId) {
    return new Response(JSON.stringify({ ok: false, error: "Falta file o product_id" }), { status: 400 });
  }

  const MAX_IMAGES = 5;
  const productRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${productId}&select=image_urls`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const [product] = await productRes.json();
  const existingImages = product?.image_urls || [];
  if (existingImages.length >= MAX_IMAGES) {
    return new Response(JSON.stringify({ ok: false, error: `Máximo ${MAX_IMAGES} fotos por producto. Quita alguna antes de subir otra.` }), { status: 400 });
  }

  const ext = (file.name || "photo.jpg").split(".").pop().toLowerCase();
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
    return new Response(JSON.stringify({ ok: false, error: `Storage error: ${await uploadRes.text()}` }), {
      status: 500,
    });
  }

  const imageUrl = `${env.SUPABASE_URL}/storage/v1/object/public/megasafety-products/${path}`;
  const newImages = [...existingImages, imageUrl];

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${productId}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    // image_url stays the "cover" photo (first in the gallery) — every other
    // consumer of this product (catalog cards, cart, PDFs, emails) only
    // knows about that single field, so it must always mirror image_urls[0].
    body: JSON.stringify({ image_url: newImages[0], image_urls: newImages }),
  });

  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `DB update error: ${await updateRes.text()}` }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ ok: true, image_url: newImages[0], image_urls: newImages }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
