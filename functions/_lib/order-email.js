import { buildReceiptPdf, bytesToBase64 } from "./pdf.js";

const LOGO_URL = "https://megasafetychile.pages.dev/assets/img/logo-email.png";

export function buildOrderEmailHtml(order) {
  const itemsHtml = order.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e7ee;font-size:14px;color:#10141c;">${i.name}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e7ee;font-size:14px;color:#4a5468;text-align:center;">${i.qty}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e7ee;font-size:14px;color:#10141c;text-align:right;">$${Number(i.price || 0).toLocaleString("es-CL")}</td>
        </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fa;padding:32px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e7ee;">
      <div style="background:#0b1f3a;padding:24px 32px;">
        <img src="${LOGO_URL}" alt="Mega Safety Chile" style="height:40px;">
      </div>
      <div style="padding:32px;">
        <p style="color:#f5b400;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;font-size:12px;margin:0 0 8px;">Confirmación de pedido</p>
        <h1 style="color:#0b1f3a;font-size:22px;margin:0 0 4px;">${order.correlative_code}</h1>
        <p style="color:#4a5468;font-size:14px;margin:0 0 24px;">Gracias por tu compra, ${order.customer_name}. Este es el resumen de tu pedido.</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 12px;font-size:12px;color:#4a5468;text-transform:uppercase;border-bottom:2px solid #0b1f3a;">Producto</th>
              <th style="text-align:center;padding:8px 12px;font-size:12px;color:#4a5468;text-transform:uppercase;border-bottom:2px solid #0b1f3a;">Cant.</th>
              <th style="text-align:right;padding:8px 12px;font-size:12px;color:#4a5468;text-transform:uppercase;border-bottom:2px solid #0b1f3a;">Precio</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <table style="width:100%;margin-bottom:24px;">
          <tr><td style="padding:4px 12px;text-align:right;color:#4a5468;font-size:14px;">Total</td><td style="padding:4px 12px;text-align:right;font-weight:800;color:#0b1f3a;font-size:18px;width:120px;">$${Number(order.total).toLocaleString("es-CL")}</td></tr>
        </table>

        <div style="background:#f4f6fa;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:13px;color:#4a5468;"><strong style="color:#0b1f3a;">Datos de despacho</strong></p>
          <p style="margin:0;font-size:13px;color:#4a5468;line-height:1.6;">
            ${order.customer_name} — ${order.customer_rut}<br>
            ${order.customer_address}, ${order.customer_comuna}<br>
            ${order.customer_email}
          </p>
        </div>

        <p style="font-size:13px;color:#4a5468;">Adjuntamos el comprobante en PDF. Cualquier duda, escríbenos por WhatsApp al +56 9 8306 1338.</p>
      </div>
      <div style="background:#0b1f3a;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#6f80a0;">Mega Safety Chile — Artículos de seguridad industrial</p>
      </div>
    </div>
  </div>`;
}

export function buildOrderPdfBase64(order) {
  const lines = [
    { text: "MEGA SAFETY CHILE", size: 18, bold: true, color: [0.043, 0.122, 0.227], gapAfter: 4 },
    { text: "Artículos de seguridad industrial", size: 10, color: [0.29, 0.33, 0.41], gapAfter: 20 },
    { text: `Comprobante de pedido ${order.correlative_code}`, size: 14, bold: true, gapAfter: 16 },
    { text: `Cliente: ${order.customer_name}`, gapAfter: 2 },
    { text: `RUT: ${order.customer_rut}`, gapAfter: 2 },
    { text: `Correo: ${order.customer_email}`, gapAfter: 2 },
    { text: `Dirección: ${order.customer_address}, ${order.customer_comuna}`, gapAfter: 20 },
    { text: "Productos:", bold: true, gapAfter: 8 },
    ...order.items.map((i) => ({
      text: `  ${i.qty} x ${i.name} — $${Number(i.price || 0).toLocaleString("es-CL")}`,
      gapAfter: 4,
    })),
    { text: "", gapAfter: 10 },
    { text: `TOTAL: $${Number(order.total).toLocaleString("es-CL")}`, size: 14, bold: true, gapAfter: 20 },
    { text: "Gracias por tu compra. Contacto: +56 9 8306 1338", size: 9, color: [0.29, 0.33, 0.41] },
  ];
  const bytes = buildReceiptPdf(lines);
  return bytesToBase64(bytes);
}
