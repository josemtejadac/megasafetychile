// Removes a product document (ficha técnica or registro ISP): clears the
// DB column and deletes the actual file from storage, mirroring
// delete-image.js — otherwise replaced/removed PDFs stay as orphaned junk
// in the bucket forever.
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

  const { product_id, doc_type } = await request.json().catch(() => ({}));
  const field = FIELD_BY_TYPE[doc_type];
  if (!product_id || !field) {
    return new Response(JSON.stringify({ ok: false, error: "Falta product_id o doc_type inválido" }), { status: 400 });
  }

  const productRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${product_id}&select=${field}`, { headers: sbHeaders });
  const [product] = await productRes.json();
  const oldUrl = product?.[field];

  const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_products?id=eq.${product_id}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify({ [field]: null }),
  });
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await updateRes.text() }), { status: 500 });
  }

  // Best-effort: also remove the file from storage. Non-fatal if it fails —
  // the DB no longer references it either way.
  if (oldUrl) {
    try {
      const path = decodeURIComponent(oldUrl.split("/megasafety-products/")[1] || "");
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

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
