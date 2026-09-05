import { isFlowConfigured, getPaymentStatus } from "../../_lib/flow.js";
import { buildQuotePaidEmailHtml } from "../../_lib/order-email.js";
import { buildQuotePdfBase64 } from "../../_lib/quote-pdf.js";

const sbHeaders = (env, extra = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

// Flow llama a esta URL (server-to-server) tras un intento de pago, enviando
// el `token` como application/x-www-form-urlencoded. Hay que responder 200
// rápido o Flow reintenta.
export async function onRequestPost({ request, env }) {
  if (!isFlowConfigured(env)) {
    return new Response("Flow no configurado", { status: 501 });
  }

  const form = await request.formData();
  const token = form.get("token");
  if (!token) return new Response("Falta token", { status: 400 });

  try {
    const status = await getPaymentStatus(env, token);
    // status.status: 1 pendiente, 2 pagado, 3 rechazado, 4 anulado.
    if (status.status === 2) {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?correlative_code=eq.${encodeURIComponent(status.commerceOrder)}&select=*`,
        { headers: sbHeaders(env) }
      );
      const rows = await res.json();
      const quote = rows[0];
      if (quote && quote.status !== "pagada") {
        // Flow's paymentData.media names the actual rail used (Webpay, Khipu,
        // Servipag, etc.) — surfaced to staff so they know how the customer
        // paid, not just that they did.
        const paymentMethod = status.paymentData?.media || status.optional?.media || null;
        await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${quote.id}`, {
          method: "PATCH",
          headers: sbHeaders(env),
          body: JSON.stringify({
            status: "pagada",
            paid_at: new Date().toISOString(),
            flow_token: token,
            flow_order: String(status.flowOrder || ""),
            payment_method: paymentMethod,
            payer_email: status.payer || null,
          }),
        });

        if (env.RESEND_API_KEY) {
          const origin = new URL(request.url).origin;
          const itemsRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items?quote_id=eq.${quote.id}&select=*`,
            { headers: sbHeaders(env) }
          );
          const items = await itemsRes.json();
          const paidQuote = { ...quote, status: "pagada", payment_method: paymentMethod, paid_at: new Date().toISOString() };
          const html = buildQuotePaidEmailHtml(paidQuote, items, origin);
          const { base64: pdfBase64 } = await buildQuotePdfBase64(paidQuote, items, origin);

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: env.RFQ_FROM_EMAIL || "Mega Safety Chile <cotizaciones@megasafetychile.cl>",
              to: [quote.correo],
              subject: `Pago confirmado — pedido ${quote.correlative_code}`,
              html,
              attachments: [{ filename: `${quote.correlative_code}.pdf`, content: pdfBase64 }],
            }),
          });

          const notifyTo = env.RFQ_NOTIFY_EMAIL || "contacto@megasafetychile.cl";
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: env.RFQ_FROM_EMAIL || "Mega Safety Chile <cotizaciones@megasafetychile.cl>",
              to: [notifyTo],
              subject: `Pago recibido — pedido ${quote.correlative_code}`,
              html: `<p>Se pagó el pedido <strong>${quote.correlative_code}</strong> de ${quote.razon_social} por ${quote.total}. Revisa el panel de administración.</p>`,
              attachments: [{ filename: `${quote.correlative_code}.pdf`, content: pdfBase64 }],
            }),
          });
        }
      }
    }
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Flow confirm error", err);
    return new Response("Error", { status: 500 });
  }
}
