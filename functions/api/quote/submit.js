import { insertQuote, insertQuoteItems, markEmailSent } from "../../_lib/supabase.js";
import { sendQuoteNotification } from "../../_lib/email.js";

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

  const { empresa, items, attachment } = body || {};
  if (!empresa || !Array.isArray(items) || items.length === 0) {
    return badRequest("Faltan datos de empresa o productos");
  }

  // Si el cliente está logueado, vinculamos la cotización a su cuenta.
  let customerUserId = null;
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token) {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1", Authorization: `Bearer ${token}` },
    });
    if (userRes.ok) {
      const user = await userRes.json();
      customerUserId = user.id;
    }
  }

  const required = ["razon_social", "rut", "nombre_contacto", "telefono", "correo", "direccion", "comuna", "region"];
  for (const field of required) {
    if (!empresa[field] || String(empresa[field]).trim() === "") {
      return badRequest(`Falta el campo: ${field}`);
    }
  }

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
  };

  let quote;
  try {
    quote = await insertQuote(env, quotePayload);

    const itemRows = items.map((item) => ({
      quote_id: quote.id,
      category_id: item.category_id || null,
      product_name: item.product_name,
      brand: item.brand || null,
      quantity: item.quantity,
    }));
    await insertQuoteItems(env, itemRows);

    // Persist the customer's attached file (PDF/Excel/photo) to storage so
    // staff can open it from the admin panel, not just find it buried in an
    // email — it's the reference they'll build the priced quote from.
    if (attachment && attachment.base64 && attachment.filename) {
      try {
        const bytes = Uint8Array.from(atob(attachment.base64), (c) => c.charCodeAt(0));
        const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `quote-attachments/${quote.id}-${safeName}`;
        const uploadRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/megasafety-products/${path}`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": attachment.mime || "application/octet-stream",
          },
          body: bytes,
        });
        if (uploadRes.ok) {
          const attachmentUrl = `${env.SUPABASE_URL}/storage/v1/object/public/megasafety-products/${path}`;
          await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quote.id}`, {
            method: "PATCH",
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ attachment_url: attachmentUrl }),
          });
          quote.attachment_url = attachmentUrl;
        }
      } catch {
        // Non-fatal — the quote itself is already saved; the attachment still
        // goes out via email below as a fallback.
      }
    }

    const emailResult = await sendQuoteNotification(env, quote, itemRows, attachment);
    if (emailResult.sent) await markEmailSent(env, quote.id);

    return new Response(
      JSON.stringify({ ok: true, correlative_code: quote.correlative_code, email: emailResult }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
