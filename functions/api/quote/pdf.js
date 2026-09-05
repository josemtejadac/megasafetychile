// Downloads a quote as PDF. Allowed for: staff/admin (any quote), or the
// customer who owns the quote (their own only).
import { buildQuotePdfBase64 } from "../../_lib/quote-pdf.js";

const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

const sbHeaders = (env, extra = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const quoteId = url.searchParams.get("id");
  const tokenFromQuery = url.searchParams.get("token");
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "") || tokenFromQuery;
  if (!quoteId || !token) {
    return new Response(JSON.stringify({ ok: false, error: "Falta id o autorización" }), { status: 400 });
  }

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Sesión inválida" }), { status: 401 });
  }
  const user = await userRes.json();

  const quoteRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quoteId}&select=*`,
    { headers: sbHeaders(env) }
  );
  const [quote] = await quoteRes.json();
  if (!quote) {
    return new Response(JSON.stringify({ ok: false, error: "Cotización no encontrada" }), { status: 404 });
  }

  const isOwner = quote.customer_user_id === user.id;
  let isStaff = false;
  if (!isOwner) {
    const staffRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/megasafety_admins?user_id=eq.${user.id}&active=eq.true&select=user_id`,
      { headers: sbHeaders(env) }
    );
    const rows = await staffRes.json();
    isStaff = Array.isArray(rows) && rows.length > 0;
  }
  if (!isOwner && !isStaff) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const itemsRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items?quote_id=eq.${quoteId}&select=*`,
    { headers: sbHeaders(env) }
  );
  const items = await itemsRes.json();

  const origin = new URL(request.url).origin;
  const { bytes } = await buildQuotePdfBase64(quote, items, origin);

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.correlative_code}.pdf"`,
    },
  });
}
