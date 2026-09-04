// One-off diagnostic endpoint to verify the order-confirmation email (with
// PDF attachment) renders and sends correctly via Resend. Gated by the same
// secret used for the coming-soon preview link so it isn't publicly callable.
// Not meant to be wired into any UI — call directly with curl to test.
import { buildOrderEmailHtml, buildOrderPdfBase64 } from "../../_lib/order-email.js";

export async function onRequestPost({ request, env }) {
  const key = request.headers.get("X-Test-Key") || "";
  if (!env.PREVIEW_KEY || key !== env.PREVIEW_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const to = body.to || "josemtejadac2002@gmail.com";

  const order = {
    correlative_code: "MSC-TEST-0001",
    customer_name: "Juan Pérez Soto",
    customer_rut: "12.345.678-9",
    customer_email: to,
    customer_address: "Av. Providencia 1234, depto 56",
    customer_comuna: "Providencia, Región Metropolitana",
    items: [
      { name: "Casco de Seguridad Kbeen Amarillo", qty: 2, price: 8990 },
      { name: "Guante Cabritilla Combinado", qty: 10, price: 1070 },
      { name: "Zapatos de Seguridad Kbeen LI518", qty: 1, price: 24990 },
    ],
    total: 2 * 8990 + 10 * 1070 + 24990,
  };

  if (!env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY no configurada" }), { status: 500 });
  }

  const html = buildOrderEmailHtml(order);
  const pdfBase64 = buildOrderPdfBase64(order);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RFQ_FROM_EMAIL || "Mega Safety Chile <cotizaciones@megasafetychile.cl>",
      to: [to],
      subject: `Confirmación de pedido ${order.correlative_code} (prueba)`,
      html,
      attachments: [{ filename: `${order.correlative_code}.pdf`, content: pdfBase64 }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: `Resend ${res.status}: ${JSON.stringify(data)}` }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ ok: true, resendId: data.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
