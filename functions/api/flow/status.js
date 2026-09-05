// Public read of a Flow payment's status by token, for the pago-resultado.html
// page to poll after Flow redirects the browser back. Only exposes the
// minimal safe fields — never the secret key.
import { isFlowConfigured, getPaymentStatus } from "../../_lib/flow.js";

export async function onRequestGet({ request, env }) {
  if (!isFlowConfigured(env)) {
    return new Response(JSON.stringify({ ok: false, error: "Flow no configurado" }), { status: 501 });
  }
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "Falta token" }), { status: 400 });
  }
  try {
    const status = await getPaymentStatus(env, token);
    return new Response(
      JSON.stringify({ ok: true, status: status.status, commerceOrder: status.commerceOrder }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), { status: 500 });
  }
}
