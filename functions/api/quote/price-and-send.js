// Admin/staff-only: sets unit prices on a quote's items, computes totals,
// marks the quote as "cotizada", and emails the customer a priced PDF with
// an "aceptar y pagar" link. This is the step that turns an RFQ into a
// payable quotation (the whole site works as "cotización con pago después").
import { buildQuoteSentEmailHtml } from "../../_lib/order-email.js";
import { buildQuotePdfBase64 } from "../../_lib/quote-pdf.js";

const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function requireStaff(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();

  const staffRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_admins?user_id=eq.${user.id}&active=eq.true&select=user_id,role`,
    { headers: sbHeaders(env) }
  );
  const rows = await staffRes.json();
  return Array.isArray(rows) && rows.length ? user : null;
}

export async function onRequestPost({ request, env }) {
  const caller = await requireStaff(request, env);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const { quote_id, items } = await request.json().catch(() => ({}));
  if (!quote_id || !Array.isArray(items) || !items.length) {
    return new Response(JSON.stringify({ ok: false, error: "Faltan quote_id o items" }), { status: 400 });
  }
  for (const it of items) {
    if (!it.id || typeof it.unit_price !== "number" || it.unit_price < 0) {
      return new Response(JSON.stringify({ ok: false, error: "Cada item necesita id y un unit_price válido" }), { status: 400 });
    }
  }

  // Update each item's price.
  for (const it of items) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items?id=eq.${it.id}`, {
      method: "PATCH",
      headers: sbHeaders(env),
      body: JSON.stringify({ unit_price: it.unit_price }),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Error actualizando item ${it.id}: ${await res.text()}` }), { status: 500 });
    }
  }

  // Recompute totals from the freshly-saved rows (which have quantity) rather
  // than trusting the request body — the client only sends {id, unit_price}.
  const itemsRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items?quote_id=eq.${quote_id}&select=*`,
    { headers: sbHeaders(env) }
  );
  const fullItems = await itemsRes.json();

  const subtotal = fullItems.reduce((sum, it) => sum + (it.unit_price || 0) * (it.quantity || 0), 0);
  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;

  const quoteRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quote_id}`, {
    method: "PATCH",
    headers: sbHeaders(env, { Prefer: "return=representation" }),
    body: JSON.stringify({
      subtotal,
      iva,
      total,
      status: "cotizada",
      quoted_at: new Date().toISOString(),
      quoted_by: caller.id,
    }),
  });
  if (!quoteRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await quoteRes.text() }), { status: 500 });
  }
  const [quote] = await quoteRes.json();

  let emailResult = { sent: false, reason: "RESEND_API_KEY no configurada" };
  if (env.RESEND_API_KEY) {
    const origin = new URL(request.url).origin;
    const html = buildQuoteSentEmailHtml(quote, fullItems, origin);
    const { base64: pdfBase64 } = await buildQuotePdfBase64(quote, fullItems, origin);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RFQ_FROM_EMAIL || "Mega Safety Chile <cotizaciones@megasafetychile.cl>",
        to: [quote.correo],
        subject: `Tu cotización ${quote.correlative_code} está lista`,
        html,
        attachments: [{ filename: `${quote.correlative_code}.pdf`, content: pdfBase64 }],
      }),
    });
    if (res.ok) {
      emailResult = { sent: true };
    } else {
      emailResult = { sent: false, reason: `Resend ${res.status}: ${await res.text()}` };
    }
  }

  return new Response(JSON.stringify({ ok: true, quote, email: emailResult }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
