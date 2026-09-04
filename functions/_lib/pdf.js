// Minimal hand-rolled PDF generator (no dependencies — Cloudflare Pages
// Functions run without a bundler here, so npm PDF libs aren't usable).
// Produces a single-page, text-only PDF using the built-in Helvetica font.
// Good enough for a simple order/quote receipt; not meant for complex layout.

function escapePdfText(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// lines: array of { text, size?, bold?, color?: [r,g,b] (0-1), gapAfter? }
export function buildReceiptPdf(lines) {
  const pageWidth = 612; // US Letter
  const pageHeight = 792;
  const marginX = 56;
  let y = pageHeight - 70;

  const content = [];
  for (const line of lines) {
    const size = line.size || 11;
    const font = line.bold ? "/F2" : "/F1";
    const [r, g, b] = line.color || [0.06, 0.12, 0.23];
    content.push(`${r} ${g} ${b} rg`);
    content.push("BT");
    content.push(`${font} ${size} Tf`);
    content.push(`${marginX} ${y} Td`);
    content.push(`(${escapePdfText(line.text)}) Tj`);
    content.push("ET");
    y -= size + (line.gapAfter ?? 6);
  }
  const streamStr = content.join("\n");

  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`
  );
  objects.push(null); // placeholder for stream object (built below)
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const streamBytes = new TextEncoder().encode(streamStr);
  const streamObj = `<< /Length ${streamBytes.length} >>\nstream\n${streamStr}\nendstream`;
  objects[3] = streamObj;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
