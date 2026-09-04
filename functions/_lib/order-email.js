import { buildInvoicePdf, bytesToBase64 } from "./pdf.js";

const LOGO_URL_PATH = "/assets/img/logo-email.png";
const LOGO_PDF_PATH = "/assets/img/logo-pdf.jpg";
const LOGO_PDF_WIDTH = 530;
const LOGO_PDF_HEIGHT = 200;

function money(n) {
  return `$${Number(n || 0).toLocaleString("es-CL")}`;
}

export function buildOrderEmailHtml(order, origin) {
  const logoUrl = new URL(LOGO_URL_PATH, origin).toString();
  const itemsHtml = order.items
    .map((i) => {
      const subtotal = (i.qty || 0) * (i.price || 0);
      return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e7ee;font-size:14px;color:#10141c;">${i.name}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e7ee;font-size:14px;color:#4a5468;text-align:center;">${i.qty}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e7ee;font-size:14px;color:#4a5468;text-align:right;">${money(i.price)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e7ee;font-size:14px;color:#10141c;text-align:right;font-weight:700;">${money(subtotal)}</td>
        </tr>`;
    })
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fa;padding:32px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e7ee;">
      <div style="background:#0b1f3a;padding:24px 32px;">
        <img src="${logoUrl}" alt="Mega Safety Chile" style="height:40px;display:block;">
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
              <th style="text-align:right;padding:8px 12px;font-size:12px;color:#4a5468;text-transform:uppercase;border-bottom:2px solid #0b1f3a;">P. unit.</th>
              <th style="text-align:right;padding:8px 12px;font-size:12px;color:#4a5468;text-transform:uppercase;border-bottom:2px solid #0b1f3a;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <table style="width:100%;margin-bottom:24px;">
          <tr><td style="padding:4px 12px;text-align:right;color:#4a5468;font-size:14px;">Total</td><td style="padding:4px 12px;text-align:right;font-weight:800;color:#0b1f3a;font-size:18px;width:120px;">${money(order.total)}</td></tr>
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

function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export async function buildOrderPdfBase64(order, origin) {
  const logoRes = await fetch(new URL(LOGO_PDF_PATH, origin));
  const logoBytes = new Uint8Array(await logoRes.arrayBuffer());

  const pageTop = 792;
  const marginX = 56;
  const rightX = 556;
  const navy = [0.043, 0.122, 0.227];
  const gold = [0.961, 0.706, 0.0];
  const gray = [0.29, 0.33, 0.41];
  const lightGray = [0.95, 0.96, 0.98];
  const white = [1, 1, 1];

  const ops = [];

  // --- Header: logo + title block ---
  const logoW = 143;
  const logoH = 54;
  ops.push({ type: "image", x: marginX, y: 706, w: logoW, h: logoH });
  ops.push({ type: "text", text: "COMPROBANTE DE PEDIDO", x: 340, y: 748, size: 10, bold: true, color: gray });
  ops.push({ type: "text", text: order.correlative_code, x: 340, y: 726, size: 18, bold: true, color: navy });
  ops.push({
    type: "text",
    text: new Date().toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" }),
    x: 340,
    y: 710,
    size: 10,
    color: gray,
  });
  ops.push({ type: "line", x1: marginX, y1: 696, x2: rightX, y2: 696, color: navy, width: 1.5 });

  // --- Customer box ---
  const boxTop = 690;
  const boxHeight = 76;
  ops.push({ type: "rect", x: marginX, y: boxTop - boxHeight, w: rightX - marginX, h: boxHeight, fill: lightGray });
  ops.push({ type: "text", text: "CLIENTE", x: marginX + 14, y: boxTop - 18, size: 9, bold: true, color: gold });
  ops.push({
    type: "text",
    text: `${order.customer_name} — RUT ${order.customer_rut}`,
    x: marginX + 14,
    y: boxTop - 34,
    size: 11,
    bold: true,
    color: navy,
  });
  ops.push({
    type: "text",
    text: `${order.customer_address}, ${order.customer_comuna}`,
    x: marginX + 14,
    y: boxTop - 50,
    size: 10,
    color: gray,
  });
  ops.push({ type: "text", text: order.customer_email, x: marginX + 14, y: boxTop - 64, size: 10, color: gray });

  // --- Items table ---
  const colProduct = marginX + 10;
  const colQty = 370;
  const colUnit = 420;
  const colSubtotal = rightX - 10;
  const rowHeight = 22;
  let y = boxTop - boxHeight - 24;

  ops.push({ type: "rect", x: marginX, y: y - rowHeight + 6, w: rightX - marginX, h: rowHeight, fill: navy });
  ops.push({ type: "text", text: "PRODUCTO", x: colProduct, y: y - 10, size: 9, bold: true, color: white });
  ops.push({ type: "text", text: "CANT.", x: colQty, y: y - 10, size: 9, bold: true, color: white });
  ops.push({ type: "text", text: "P. UNIT.", x: colUnit, y: y - 10, size: 9, bold: true, color: white });
  ops.push({ type: "text", text: "SUBTOTAL", x: colSubtotal - 46, y: y - 10, size: 9, bold: true, color: white });
  y -= rowHeight;

  order.items.forEach((item, idx) => {
    if (idx % 2 === 1) {
      ops.push({ type: "rect", x: marginX, y: y - rowHeight + 6, w: rightX - marginX, h: rowHeight, fill: lightGray });
    }
    const subtotal = (item.qty || 0) * (item.price || 0);
    ops.push({ type: "text", text: truncate(item.name, 44), x: colProduct, y: y - 10, size: 10, color: navy });
    ops.push({ type: "text", text: String(item.qty), x: colQty, y: y - 10, size: 10, color: gray });
    ops.push({ type: "text", text: money(item.price), x: colUnit, y: y - 10, size: 10, color: gray });
    ops.push({
      type: "text",
      text: money(subtotal),
      x: colSubtotal - String(money(subtotal)).length * 5.2,
      y: y - 10,
      size: 10,
      bold: true,
      color: navy,
    });
    y -= rowHeight;
  });

  ops.push({ type: "line", x1: marginX, y1: y + rowHeight - 4, x2: rightX, y2: y + rowHeight - 4, color: navy, width: 1 });

  // --- Total bar ---
  y -= 14;
  ops.push({ type: "rect", x: marginX, y: y - 28, w: rightX - marginX, h: 28, fill: navy });
  ops.push({ type: "text", text: "TOTAL", x: marginX + 16, y: y - 19, size: 12, bold: true, color: white });
  const totalText = money(order.total);
  ops.push({
    type: "text",
    text: totalText,
    x: rightX - 16 - totalText.length * 7.2,
    y: y - 19,
    size: 13,
    bold: true,
    color: gold,
  });

  // --- Footer ---
  ops.push({ type: "line", x1: marginX, y1: 70, x2: rightX, y2: 70, color: [0.85, 0.87, 0.91], width: 1 });
  ops.push({
    type: "text",
    text: "Mega Safety Chile — Artículos de seguridad industrial",
    x: marginX,
    y: 54,
    size: 9,
    bold: true,
    color: navy,
  });
  ops.push({
    type: "text",
    text: "Contacto: +56 9 8306 1338 · contacto@megasafetychile.cl · megasafetychile.cl",
    x: marginX,
    y: 40,
    size: 9,
    color: gray,
  });

  const pdfBytes = buildInvoicePdf({
    ops,
    image: { bytes: logoBytes, width: LOGO_PDF_WIDTH, height: LOGO_PDF_HEIGHT },
  });
  return bytesToBase64(pdfBytes);
}
