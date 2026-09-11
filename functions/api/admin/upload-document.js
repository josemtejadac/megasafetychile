// Sube un PDF (ficha técnica o registro ISP) de un producto a Supabase
// Storage y actualiza la columna correspondiente en megasafety_products.
// Mismo patrón de auth que upload-image.js.
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
const FIELD_BY_TYPE = { ficha_tecnica: "ficha_tecnica_url", registro_isp: "registro_isp_url" };

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
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const adminRows = await adminRes.json();
  if (!Array.isArray(adminRows) || adminRows.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "No tienes permisos de administrador" }), { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const productId = form.get("product_id");
  const docType = form.get("doc_type"); // "ficha_tecnica" | "registro_isp"
  const field = FIELD_BY_TYPE[docType];
  if (!file || !productId || !field) {
    return new Response(JSON.stringify({ ok: false, error: "Falta file, product_id o doc_type inválido" }), { status: 400 });
  }

  // Fetch the currently-stored file (if any) so it can be deleted from
  // storage once the new one is safely uploaded — otherwise every re-upload
  // (replacing a ficha técnica or ISP doc) leaves the old PDF as orphaned
  // junk in the bucket forever.
  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const existingRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${productId}&select=${field}`, { headers: sbHeaders });
  const [existingProduct] = await existingRes.json();
  const oldUrl = existingProduct?.[field];

  const path = `docs/${productId}-${docType}-${Date.now()}.pdf`;

  const uploadRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/megasafety-products/${path}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/pdf",
    },
    body: await file.arrayBuffer(),
  });
  if (!uploadRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `Storage error: ${await uploadRes.text()}` }), { status: 500 });
  }

  const docUrl = `${env.SUPABASE_URL}/storage/v1/object/public/megasafety-products/${path}`;

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${productId}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ [field]: docUrl }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `DB update error: ${await updateRes.text()}` }), { status: 500 });
  }

  // Best-effort: now that the product points at the new file, remove the
  // old one from storage. Non-fatal if it fails.
  if (oldUrl) {
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

  return new Response(JSON.stringify({ ok: true, url: docUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
