// Staff-only: lets an admin/vendedor register a quote on behalf of a
// customer who called or wrote in directly (WhatsApp, phone) instead of
// using the site. Same shape as a customer-submitted RFQ (empresa + items,
// no prices yet) so it goes through the exact same "revisar y poner precio"
// flow — the only difference is it's auto-claimed by whoever created it and
// doesn't trigger the company-notification email (staff already know).
import { insertQuote, insertQuoteItems } from "../../_lib/supabase.js";

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
    status: "en_proceso",
    claimed_by: caller.id,
    claimed_at: new Date().toISOString(),
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
    }));
    await insertQuoteItems(env, itemRows);

    return new Response(JSON.stringify({ ok: true, correlative_code: quote.correlative_code }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
