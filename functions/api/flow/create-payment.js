import { isFlowConfigured, createPaymentOrder } from "../../_lib/flow.js";

export async function onRequestPost({ request, env }) {
  if (!isFlowConfigured(env)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Flow no está configurado todavía (faltan FLOW_API_KEY / FLOW_SECRET_KEY)." }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), { status: 400 });
  }

  const { commerceOrder, subject, amount, email } = body || {};
  if (!commerceOrder || !subject || !amount || !email) {
    return new Response(
      JSON.stringify({ ok: false, error: "Faltan campos: commerceOrder, subject, amount, email" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const origin = new URL(request.url).origin;

  try {
    const order = await createPaymentOrder(env, {
      commerceOrder,
      subject,
      amount,
      email,
      urlConfirmation: `${origin}/api/flow/confirm`,
      urlReturn: `${origin}/pago-resultado.html`,
    });
    // order.url + order.token -> redirigir al cliente a `${order.url}?token=${order.token}`
    return new Response(JSON.stringify({ ok: true, ...order }), {
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
