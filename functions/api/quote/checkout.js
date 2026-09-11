// Public "buy now" checkout — used when every item in the customer's cart
// already has a real catalog price (see compra-empresa.js: the add-to-cart
// button reads "Agregar al carrito" instead of "Agregar a cotización" in
// that case). Unlike /api/quote/submit (always creates an unpriced RFQ),
// this creates the quote already priced (status "cotizada") so the customer
// can be sent straight to pagar.html to pay with Flow — no staff step in
// between. Prices are always re-read from megasafety_products here, never
// trusted from the client, so a tampered request can't under-pay.
import { insertQuote, insertQuoteItems } from "../../_lib/supabase.js";
import { buildQuotePdfBase64 } from "../../_lib/quote-pdf.js";
import { buildQuoteSentEmailHtml } from "../../_lib/order-email.js";

const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

function badRequest(message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }

  const { empresa, items } = body || {};
  if (!empresa || !Array.isArray(items) || items.length === 0) {
    return badRequest("Faltan datos de empresa o productos");
  }

  const required = ["razon_social", "rut", "nombre_contacto", "telefono", "correo", "direccion", "comuna", "region"];
  for (const field of required) {
    if (!empresa[field] || String(empresa[field]).trim() === "") {
      return badRequest(`Falta el campo: ${field}`);
    }
  }
  for (const item of items) {
    if (!item.id || !item.quantity) {
      return badRequest("Cada producto necesita id y cantidad");
    }
  }

  let customerUserId = null;
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token) {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (userRes.ok) customerUserId = (await userRes.json()).id;
  }

  // Re-fetch each product's canonical price straight from the catalog — the
  // cart's remembered price is only ever a display hint.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(items.map((i) => i.id))];
  if (ids.some((id) => !uuidRe.test(id))) return badRequest("Id de producto inválido");
  const prodRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_products?id=in.(${ids.join(",")})&select=id,name,brand,category_id,price,discount_percent`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!prodRes.ok) return badRequest("No se pudo verificar el catálogo");
  const products = await prodRes.json();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const itemRows = [];
  let subtotal = 0;
  for (const item of items) {
    const p = byId[item.id];
    if (!p || p.price == null) {
      return badRequest("Uno de los productos ya no tiene precio disponible. Vuelve a intentarlo desde el catálogo.");
    }
    const unitPrice = p.discount_percent > 0 ? Math.round(p.price * (1 - p.discount_percent / 100)) : p.price;
    subtotal += unitPrice * item.quantity;
    itemRows.push({
      category_id: p.category_id,
      product_name: p.name,
      brand: p.brand || null,
      quantity: item.quantity,
      variant: item.variant || null,
      unit_price: unitPrice,
    });
  }
  const MIN_PURCHASE = 15000;
  if (subtotal < MIN_PURCHASE) {
    return badRequest(`La compra mínima es de $${MIN_PURCHASE.toLocaleString("es-CL")}`);
  }

  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;

  const quotePayload = {
    razon_social: empresa.razon_social,
    rut: empresa.rut,
    nombre_contacto: empresa.nombre_contacto,
    telefono: empresa.telefono,
    correo: empresa.correo,
    direccion: empresa.direccion,
    comuna: empresa.comuna || null,
    region: empresa.region || null,
    requiere_despacho: Boolean(empresa.requiere_despacho),
    observaciones: empresa.observaciones || null,
    customer_user_id: customerUserId,
    status: "cotizada",
    subtotal,
    iva,
    total,
    quoted_at: new Date().toISOString(),
  };

  try {
    const quote = await insertQuote(env, quotePayload);
    const rows = itemRows.map((row) => ({ ...row, quote_id: quote.id }));
    await insertQuoteItems(env, rows);

    let emailResult = { sent: false, reason: "RESEND_API_KEY no configurada" };
    try {
      const origin = new URL(request.url).origin;
      const html = buildQuoteSentEmailHtml(quote, rows, origin);
      const { base64: pdfBase64 } = await buildQuotePdfBase64(quote, rows, origin);
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
    } catch (err) {
      emailResult = { sent: false, reason: String(err.message || err) };
    }

    return new Response(
      JSON.stringify({ ok: true, quote_id: quote.id, correlative_code: quote.correlative_code, total, email: emailResult }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
