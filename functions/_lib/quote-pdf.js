import { buildInvoicePdf, bytesToBase64 } from "./pdf.js";

const LOGO_PDF_PATH = "/assets/img/logo-pdf.jpg";
const LOGO_PDF_WIDTH = 530;
const LOGO_PDF_HEIGHT = 200;

function money(n) {
  return `$${Number(n || 0).toLocaleString("es-CL")}`;
}

function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// quote: row from megasafety_b2b_quotes; items: rows from megasafety_b2b_quote_items (with unit_price)
export async function buildQuotePdfBase64(quote, items, origin) {
  const logoRes = await fetch(new URL(LOGO_PDF_PATH, origin));
  const logoBytes = new Uint8Array(await logoRes.arrayBuffer());

  const marginX = 50;
  const rightX = 562;
  const navy = [0.043, 0.122, 0.227];
  const gold = [0.961, 0.706, 0.0];
  const gray = [0.29, 0.33, 0.41];
  const lightGray = [0.95, 0.96, 0.98];
  const white = [1, 1, 1];

  const ops = [];

  // --- Header row: COTIZACIÓN (left) / ID + fecha (right) ---
  ops.push({ type: "text", text: "COTIZACIÓN", x: marginX, y: 748, size: 22, bold: true, color: navy });
  const dateStr = new Date(quote.quoted_at || quote.created_at).toLocaleDateString("es-CL");
  ops.push({ type: "text", text: "ID único", x: 430, y: 754, size: 9, bold: true, color: gray });
  ops.push({ type: "text", text: quote.correlative_code, x: 470, y: 754, size: 9, color: navy });
  ops.push({ type: "text", text: dateStr, x: rightX - dateStr.length * 5.2, y: 754, size: 9, color: gray });

  // --- Logo + company info block ---
  const logoW = 120;
  const logoH = 45;
  ops.push({ type: "image", x: marginX, y: 680, w: logoW, h: logoH });

  const companyLines = [
    "MEGA SAFETY CHILE SPA",
    "RUT: 78.463.919-3",
    "Venta al por menor de elementos de protección personal (EPP)",
    "San Eduardo 0446, La Cisterna",
    "Los Militares 5620, of. 905, Las Condes",
    "www.megasafetychile.cl · contacto@megasafetychile.cl",
  ];
  let cy = 718;
  companyLines.forEach((line, idx) => {
    ops.push({
      type: "text",
      text: line,
      x: 190,
      y: cy,
      size: idx === 0 ? 11 : 9,
      bold: idx === 0,
      color: idx === 0 ? navy : gray,
    });
    cy -= idx === 0 ? 16 : 13;
  });

  ops.push({ type: "line", x1: marginX, y1: 672, x2: rightX, y2: 672, color: navy, width: 1.5 });

  // --- Customer row ---
  ops.push({ type: "text", text: "NOMBRE / RAZÓN SOCIAL", x: marginX, y: 650, size: 9, bold: true, color: gold });
  ops.push({ type: "text", text: quote.razon_social, x: marginX, y: 634, size: 12, bold: true, color: navy });
  ops.push({ type: "text", text: `RUT: ${quote.rut}`, x: marginX, y: 618, size: 10, color: gray });
  ops.push({
    type: "text",
    text: `${quote.direccion ? quote.direccion + ", " : ""}${quote.comuna || ""}${quote.region ? ", " + quote.region : ""}`,
    x: marginX,
    y: 602,
    size: 10,
    color: gray,
  });
  ops.push({ type: "text", text: `${quote.nombre_contacto} · ${quote.telefono} · ${quote.correo}`, x: marginX, y: 586, size: 10, color: gray });
  ops.push({
    type: "text",
    text: "Condición de pago: Transferencia o pago en línea (Flow)",
    x: rightX - 250,
    y: 618,
    size: 9,
    color: gray,
  });

  // --- Items table ---
  const colDesc = marginX + 10;
  const colQty = 350;
  const colUnit = 410;
  const colSubtotal = rightX - 10;
  const rowHeight = 22;
  let y = 556;

  ops.push({ type: "rect", x: marginX, y: y - rowHeight + 6, w: rightX - marginX, h: rowHeight, fill: navy });
  ops.push({ type: "text", text: "DESCRIPCIÓN", x: colDesc, y: y - 10, size: 9, bold: true, color: white });
  ops.push({ type: "text", text: "CANT.", x: colQty, y: y - 10, size: 9, bold: true, color: white });
  ops.push({ type: "text", text: "P. UNIT.", x: colUnit, y: y - 10, size: 9, bold: true, color: white });
  ops.push({ type: "text", text: "SUBTOTAL", x: colSubtotal - 46, y: y - 10, size: 9, bold: true, color: white });
  y -= rowHeight;

  items.forEach((item, idx) => {
    if (idx % 2 === 1) {
      ops.push({ type: "rect", x: marginX, y: y - rowHeight + 6, w: rightX - marginX, h: rowHeight, fill: lightGray });
    }
    const unitPrice = item.unit_price || 0;
    const lineTotal = unitPrice * (item.quantity || 0);
    const name = item.brand ? `${item.product_name} (${item.brand})` : item.product_name;
    ops.push({ type: "text", text: truncate(name, 42), x: colDesc, y: y - 10, size: 10, color: navy });
    ops.push({ type: "text", text: String(item.quantity), x: colQty, y: y - 10, size: 10, color: gray });
    ops.push({ type: "text", text: money(unitPrice), x: colUnit, y: y - 10, size: 10, color: gray });
    const totalTxt = money(lineTotal);
    ops.push({ type: "text", text: totalTxt, x: colSubtotal - totalTxt.length * 5.2, y: y - 10, size: 10, bold: true, color: navy });
    y -= rowHeight;
  });

  ops.push({ type: "line", x1: marginX, y1: y + rowHeight - 4, x2: rightX, y2: y + rowHeight - 4, color: navy, width: 1 });

  // --- Totals ---
  y -= 10;
  const totalsRows = [
    ["Subtotal", quote.subtotal],
    ["IVA (19%)", quote.iva],
  ];
  totalsRows.forEach(([label, val]) => {
    ops.push({ type: "text", text: label, x: colUnit - 30, y: y - 12, size: 10, color: gray });
    const txt = money(val);
    ops.push({ type: "text", text: txt, x: colSubtotal - txt.length * 5.2, y: y - 12, size: 10, color: navy });
    y -= 18;
  });

  y -= 6;
  ops.push({ type: "rect", x: colUnit - 40, y: y - 26, w: rightX - (colUnit - 40), h: 26, fill: navy });
  ops.push({ type: "text", text: "TOTAL", x: colUnit - 30, y: y - 18, size: 11, bold: true, color: white });
  const totalTxt = money(quote.total);
  ops.push({ type: "text", text: totalTxt, x: rightX - 12 - totalTxt.length * 7.2, y: y - 18, size: 12, bold: true, color: gold });

  const isPaid = quote.status === "pagada";

  // --- Datos bancarios (o confirmación de pago si ya se pagó) ---
  y -= 50;
  ops.push({
    type: "text",
    text: isPaid ? "PAGO CONFIRMADO" : "DATOS BANCARIOS (transferencia)",
    x: marginX,
    y,
    size: 9,
    bold: true,
    color: isPaid ? [0.09, 0.5, 0.24] : gold,
  });
  const bankLines = isPaid
    ? [
        `Fecha de pago: ${quote.paid_at ? new Date(quote.paid_at).toLocaleString("es-CL") : "-"}`,
        `Método: ${quote.payment_method || "Flow"}`,
        `Orden Flow: ${quote.flow_order || "-"}`,
      ]
    : [
        "Nombre: Mega Safety Chile Spa",
        "RUT: 78.463.919-3",
        "Cuenta Vista N° 00-075-97261-94 — Banco de Chile",
        "Correo: contacto@megasafetychile.cl",
      ];
  y -= 16;
  bankLines.forEach((line) => {
    ops.push({ type: "text", text: line, x: marginX, y, size: 9.5, color: gray });
    y -= 14;
  });

  // --- Footer ---
  ops.push({ type: "line", x1: marginX, y1: 60, x2: rightX, y2: 60, color: [0.85, 0.87, 0.91], width: 1 });
  ops.push({
    type: "text",
    text: "Mega Safety Chile — Artículos de seguridad industrial · +56 9 8306 1338",
    x: marginX,
    y: 44,
    size: 9,
    color: gray,
  });

  const pdfBytes = buildInvoicePdf({
    ops,
    image: { bytes: logoBytes, width: LOGO_PDF_WIDTH, height: LOGO_PDF_HEIGHT },
  });
  return { base64: bytesToBase64(pdfBytes), bytes: pdfBytes };
}
