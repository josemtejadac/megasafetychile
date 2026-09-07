// Staff-only: lets an admin/vendedor register a quote on behalf of a
// customer who called or wrote in directly (WhatsApp, phone) instead of
// using the site. Same shape as a customer-submitted RFQ (empresa + items) —
// auto-claimed by whoever created it, no company-notification email (staff
// already know). If every item was given a unit_price, the quote is created
// already priced (status "cotizada") and the customer gets the priced quote
// email straight away instead of the unpriced "recibimos tu solicitud" one.
import { insertQuote, insertQuoteItems } from "../../_lib/supabase.js";
import { sendManualRfqToCustomer } from "../../_lib/email.js";
import { buildRfqPdfBase64, buildQuotePdfBase64 } from "../../_lib/quote-pdf.js";
import { buildQuoteSentEmailHtml } from "../../_lib/order-email.js";

const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

function badRequest(message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
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
    `${env.SUPABASE_URL}/rest/v1/megasafety_admins?user_id=eq.${user.id}&active=eq.true&select=user_id`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await staffRes.json();
  return Array.isArray(rows) && rows.length ? user : null;
}

export async function onRequestPost({ request, env }) {
  const caller = await requireStaff(request, env);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const { empresa, items } = await request.json().catch(() => ({}));
  if (!empresa || !Array.isArray(items) || items.length === 0) {
    return badRequest("Faltan datos de empresa o productos");
  }

  const required = ["razon_social", "rut", "nombre_contacto", "telefono", "correo"];
  for (const field of required) {
    if (!empresa[field] || String(empresa[field]).trim() === "") {
      return badRequest(`Falta el campo: ${field}`);
    }
  }
  for (const item of items) {
    if (!item.product_name || !item.quantity) {
      return badRequest("Cada producto necesita nombre y cantidad");
    }
  }

  const allPriced = items.every((item) => typeof item.unit_price === "number" && item.unit_price > 0);
  let subtotal = 0;
  let iva = 0;
  let total = 0;
  if (allPriced) {
    subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    iva = Math.round(subtotal * 0.19);
    total = subtotal + iva;
  }

  const quotePayload = {
    razon_social: empresa.razon_social,
    rut: empresa.rut,
    nombre_contacto: empresa.nombre_contacto,
    telefono: empresa.telefono,
    correo: empresa.correo,
    direccion: empresa.direccion || null,
    comuna: empresa.comuna || null,
    region: empresa.region || null,
    requiere_despacho: Boolean(empresa.requiere_despacho),
    observaciones: empresa.observaciones || null,
    customer_user_id: null,
    status: allPriced ? "cotizada" : "en_proceso",
    claimed_by: caller.id,
    claimed_at: new Date().toISOString(),
    ...(allPriced ? { subtotal, iva, total, quoted_at: new Date().toISOString(), quoted_by: caller.id } : {}),
  };

  try {
    const quote = await insertQuote(env, quotePayload);
    const itemRows = items.map((item) => ({
      quote_id: quote.id,
      category_id: item.category_id || null,
      product_name: item.product_name,
      brand: item.brand || null,
      quantity: item.quantity,
      variant: item.variant || null,
      ...(allPriced ? { unit_price: item.unit_price } : {}),
    }));
    await insertQuoteItems(env, itemRows);

    let emailResult = { sent: false, reason: "RESEND_API_KEY no configurada" };
    const origin = new URL(request.url).origin;
    try {
      if (allPriced) {
        const html = buildQuoteSentEmailHtml(quote, itemRows, origin);
        const { base64: pdfBase64 } = await buildQuotePdfBase64(quote, itemRows, origin);
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
        emailResult = res.ok ? { sent: true } : { sent: false, reason: `Resend ${res.status}: ${await res.text()}` };
      } else {
        const { base64: rfqPdfBase64 } = await buildRfqPdfBase64(quote, itemRows, origin);
        emailResult = await sendManualRfqToCustomer(env, quote, itemRows, rfqPdfBase64);
      }
    } catch (err) {
      emailResult = { sent: false, reason: String(err.message || err) };
    }

    return new Response(
      JSON.stringify({ ok: true, correlative_code: quote.correlative_code, priced: allPriced, email: emailResult }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
