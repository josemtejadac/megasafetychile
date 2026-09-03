import { isFlowConfigured, getPaymentStatus } from "../../_lib/flow.js";

// Flow llama a esta URL (server-to-server) tras un intento de pago, enviando
// el `token` como application/x-www-form-urlencoded. Hay que responder 200
// rápido o Flow reintenta. Acá solo se verifica el estado; falta conectar
// esto a una tabla de pedidos/pagos cuando se construya esa parte del portal.
export async function onRequestPost({ request, env }) {
  if (!isFlowConfigured(env)) {
    return new Response("Flow no configurado", { status: 501 });
  }

  const form = await request.formData();
  const token = form.get("token");
  if (!token) return new Response("Falta token", { status: 400 });

  try {
    const status = await getPaymentStatus(env, token);
    // TODO: cuando exista la tabla de pedidos/pagos, actualizar aquí
    // según status.status (1 pendiente, 2 pagado, 3 rechazado, 4 anulado).
    console.log("Flow confirm", status.commerceOrder, status.status);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Flow confirm error", err);
    return new Response("Error", { status: 500 });
  }
}
