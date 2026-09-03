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

  const required = ["razon_social", "rut", "nombre_contacto", "telefono", "correo"];
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
    comuna: empresa.comuna || null,
    region: empresa.region || null,
    requiere_despacho: Boolean(empresa.requiere_despacho),
    observaciones: empresa.observaciones || null,
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
