export async function sendQuoteNotification(env, quote, items, attachment, rfqPdfBase64) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY no configurada" };

  const to = env.RFQ_NOTIFY_EMAIL || "contacto@megasafetychile.cl";
  const itemsHtml = items
    .map((i) => `<li>${i.quantity} x ${i.product_name}${i.brand ? ` (${i.brand})` : ""}${i.variant ? ` <strong>[${i.variant}]</strong>` : ""}</li>`)
    .join("");

  const html = `
    <h2>Nueva solicitud de cotización — ${quote.correlative_code}</h2>
    <p><strong>Razón social:</strong> ${quote.razon_social}</p>
    <p><strong>RUT:</strong> ${quote.rut}</p>
    <p><strong>Contacto:</strong> ${quote.nombre_contacto}</p>
    <p><strong>Teléfono:</strong> ${quote.telefono}</p>
    <p><strong>Correo:</strong> ${quote.correo}</p>
    <p><strong>Comuna / Región:</strong> ${quote.comuna || "-"} / ${quote.region || "-"}</p>
    <p><strong>Requiere despacho:</strong> ${quote.requiere_despacho ? "Sí" : "No"}</p>
    <p><strong>Observaciones:</strong> ${quote.observaciones || "-"}</p>
    <h3>Productos solicitados</h3>
    <ul>${itemsHtml}</ul>
  `;

  const payload = {
    from: env.RFQ_FROM_EMAIL || "Mega Safety Chile <cotizaciones@megasafetychile.cl>",
    to: [to],
    subject: `Nueva solicitud de cotización ${quote.correlative_code}`,
    html,
  };

  payload.attachments = [];
  if (rfqPdfBase64) {
    payload.attachments.push({ filename: `${quote.correlative_code}.pdf`, content: rfqPdfBase64 });
  }
  if (attachment && attachment.base64 && attachment.filename) {
    payload.attachments.push({ filename: attachment.filename, content: attachment.base64 });
  }
  if (!payload.attachments.length) delete payload.attachments;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { sent: false, reason: `Resend error ${res.status}: ${await res.text()}` };
  }
  return { sent: true };
}

// Sent to the customer when a staff member registers their order manually
// (phone/WhatsApp) and clicks "Crear cotización" — unlike the site's own
// self-service RFQ flow, this one is a single, staff-triggered send, so it
// doesn't carry the "don't email every customer" cost concern.
export async function sendManualRfqToCustomer(env, quote, items, rfqPdfBase64) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY no configurada" };

  const itemsHtml = items
    .map((i) => `<li>${i.quantity} x ${i.product_name}${i.brand ? ` (${i.brand})` : ""}</li>`)
    .join("");

  const html = `
    <h2>Recibimos tu solicitud — ${quote.correlative_code}</h2>
    <p>Hola ${quote.nombre_contacto}, registramos tu pedido con Mega Safety Chile. Un vendedor la revisará y te enviaremos el precio a este mismo correo.</p>
    <h3>Productos solicitados</h3>
    <ul>${itemsHtml}</ul>
    <p>Adjuntamos un resumen en PDF de tu solicitud. Cualquier duda, escríbenos por WhatsApp al +56 9 8306 1338.</p>
  `;

  const payload = {
    from: env.RFQ_FROM_EMAIL || "Mega Safety Chile <cotizaciones@megasafetychile.cl>",
    to: [quote.correo],
    subject: `Recibimos tu solicitud ${quote.correlative_code}`,
    html,
  };
  if (rfqPdfBase64) {
    payload.attachments = [{ filename: `${quote.correlative_code}.pdf`, content: rfqPdfBase64 }];
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { sent: false, reason: `Resend error ${res.status}: ${await res.text()}` };
  }
  return { sent: true };
}
