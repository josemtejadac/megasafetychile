// Customer-facing: starts a Flow payment for an already-priced quote. The
// amount/email are looked up server-side from the quote row (never trusted
// from the client) so a customer can't tamper with the price they pay.
import { isFlowConfigured, createPaymentOrder } from "../../_lib/flow.js";

export async function onRequestPost({ request, env }) {
  if (!isFlowConfigured(env)) {
    return new Response(JSON.stringify({ ok: false, error: "Flow no está configurado todavía." }), { status: 501 });
  }

  const { quote_id } = await request.json().catch(() => ({}));
  if (!quote_id) {
    return new Response(JSON.stringify({ ok: false, error: "Falta quote_id" }), { status: 400 });
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quote_id}&select=*`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await res.json();
  const quote = rows[0];
  if (!quote) {
    return new Response(JSON.stringify({ ok: false, error: "Cotización no encontrada" }), { status: 404 });
  }
  if (quote.status !== "cotizada") {
    return new Response(JSON.stringify({ ok: false, error: "Esta cotización no está lista para pago" }), { status: 400 });
  }
  if (!quote.total || quote.total <= 0) {
    return new Response(JSON.stringify({ ok: false, error: "La cotización no tiene un total válido" }), { status: 400 });
  }

  const origin = new URL(request.url).origin;
  try {
    const order = await createPaymentOrder(env, {
      commerceOrder: quote.correlative_code,
      subject: `Pedido Mega Safety Chile ${quote.correlative_code}`,
      amount: quote.total,
      email: quote.correo,
      urlConfirmation: `${origin}/api/flow/confirm`,
      urlReturn: `${origin}/pago-resultado.html`,
    });
    return new Response(JSON.stringify({ ok: true, ...order }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), { status: 500 });
  }
}
