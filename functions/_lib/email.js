export async function sendQuoteNotification(env, quote, items, attachment) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY no configurada" };

  const to = env.RFQ_NOTIFY_EMAIL || "contacto@megasafetychile.cl";
  const itemsHtml = items
    .map((i) => `<li>${i.quantity} x ${i.product_name}${i.brand ? ` (${i.brand})` : ""}</li>`)
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

  if (attachment && attachment.base64 && attachment.filename) {
    payload.attachments = [{ filename: attachment.filename, content: attachment.base64 }];
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
