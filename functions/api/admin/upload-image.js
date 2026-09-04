// Sube una imagen de producto a Supabase Storage y actualiza megasafety_products.image_url.
// Protegido por ADMIN_UPLOAD_TOKEN (Cloudflare env var) — sin ese token configurado,
// el endpoint rechaza todo por defecto (fail closed).
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_UPLOAD_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "Upload no configurado" }), { status: 501 });
  }

  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${env.ADMIN_UPLOAD_TOKEN}`) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const productId = form.get("product_id");
  if (!file || !productId) {
    return new Response(JSON.stringify({ ok: false, error: "Falta file o product_id" }), { status: 400 });
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

  const updateRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${productId}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_url: imageUrl }),
    }
  );

  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `DB update error: ${await updateRes.text()}` }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ ok: true, image_url: imageUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
