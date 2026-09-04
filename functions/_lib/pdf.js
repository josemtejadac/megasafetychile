// Minimal hand-rolled PDF generator (no dependencies — Cloudflare Pages
// Functions run without a bundler here, so npm PDF libs aren't usable).
// Builds a single-page, professionally laid-out order receipt: logo image,
// header, customer box, an items table with ruled lines, and a total bar.
//
// Text is written as WinAnsiEncoding (Latin-1) bytes so Spanish accents
// (á é í ó ú ñ ¿ ¡) render correctly — the previous version encoded text as
// UTF-8 with the default StandardEncoding font, which garbled every accented
// character.

function escapePdfText(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// Converts a JS string to Latin-1 (WinAnsiEncoding) bytes, one byte per
// character. Spanish text only ever needs code points 0x00-0xFF.
function latin1Bytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function concatBytes(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const ascii = (s) => new TextEncoder().encode(s);

class PdfBuilder {
  constructor() {
    this.objects = []; // each entry: Uint8Array of "N 0 obj\n...\nendobj\n"
  }

  // Reserves the next object number without writing it yet (for forward refs).
  reserve() {
    this.objects.push(null);
    return this.objects.length;
  }

  // Writes (or overwrites, for a reserved slot) object `num` with `body`
  // (a string for text objects, or a Uint8Array for streams already framed).
  set(num, body) {
    const bodyBytes = typeof body === "string" ? ascii(body) : body;
    this.objects[num - 1] = concatBytes([ascii(`${num} 0 obj\n`), bodyBytes, ascii("\nendobj\n")]);
  }

  add(body) {
    const num = this.reserve();
    this.set(num, body);
    return num;
  }

  addStream(dict, streamBytes) {
    const num = this.reserve();
    this.set(
      num,
      concatBytes([ascii(`${dict}\nstream\n`), streamBytes, ascii("\nendstream")])
    );
    return num;
  }

  build(rootNum) {
    const header = ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    let pdf = header;
    const offsets = [0];
    let cursor = pdf.length;
    for (const obj of this.objects) {
      offsets.push(cursor);
      pdf = concatBytes([pdf, obj]);
      cursor = pdf.length;
    }
    const xrefStart = pdf.length;
    let xref = `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= this.objects.length; i++) {
      xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${this.objects.length + 1} /Root ${rootNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return concatBytes([pdf, ascii(xref)]);
  }
}

// content: array of drawing ops, each one of:
//  { type: 'text', text, x, y, size, bold, color: [r,g,b] 0-1 }
//  { type: 'rect', x, y, w, h, fill?: [r,g,b], stroke?: [r,g,b], lineWidth? }
//  { type: 'line', x1, y1, x2, y2, color: [r,g,b], width? }
//  { type: 'image', ref, x, y, w, h }  // ref = XObject name, e.g. /Im1
export function buildInvoicePdf({ ops, image }) {
  const pdf = new PdfBuilder();
  const pageWidth = 612;
  const pageHeight = 792;

  const catalogNum = pdf.reserve();
  const pagesNum = pdf.reserve();
  const pageNum = pdf.reserve();
  const fontRegularNum = pdf.reserve();
  const fontBoldNum = pdf.reserve();
  const imageNum = image ? pdf.reserve() : null;

  const streamParts = [];
  for (const op of ops) {
    if (op.type === "text") {
      const size = op.size || 11;
      const font = op.bold ? "/F2" : "/F1";
      const [r, g, b] = op.color || [0.06, 0.12, 0.23];
      streamParts.push(ascii(`${r} ${g} ${b} rg\nBT\n${font} ${size} Tf\n${op.x} ${op.y} Td\n(`));
      streamParts.push(latin1Bytes(escapePdfText(op.text)));
      streamParts.push(ascii(") Tj\nET\n"));
    } else if (op.type === "rect") {
      const { x, y, w, h } = op;
      if (op.fill) {
        const [r, g, b] = op.fill;
        streamParts.push(ascii(`${r} ${g} ${b} rg\n${x} ${y} ${w} ${h} re\nf\n`));
      }
      if (op.stroke) {
        const [r, g, b] = op.stroke;
        streamParts.push(ascii(`${op.lineWidth || 1} w\n${r} ${g} ${b} RG\n${x} ${y} ${w} ${h} re\nS\n`));
      }
    } else if (op.type === "line") {
      const [r, g, b] = op.color || [0.7, 0.73, 0.8];
      streamParts.push(
        ascii(`${op.width || 1} w\n${r} ${g} ${b} RG\n${op.x1} ${op.y1} m\n${op.x2} ${op.y2} l\nS\n`)
      );
    } else if (op.type === "image" && image) {
      streamParts.push(ascii(`q\n${op.w} 0 0 ${op.h} ${op.x} ${op.y} cm\n/Im1 Do\nQ\n`));
    }
  }
  const streamBytes = concatBytes(streamParts);
  const contentsNum = pdf.addStream(`<< /Length ${streamBytes.length} >>`, streamBytes);

  const resources = image
    ? `/Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> /XObject << /Im1 ${imageNum} 0 R >> >>`
    : `/Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> >>`;

  pdf.set(catalogNum, `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);
  pdf.set(pagesNum, `<< /Type /Pages /Kids [${pageNum} 0 R] /Count 1 >>`);
  pdf.set(
    pageNum,
    `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ${resources} /Contents ${contentsNum} 0 R >>`
  );
  pdf.set(
    fontRegularNum,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  );
  pdf.set(
    fontBoldNum,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  );
  if (image) {
    pdf.set(
      imageNum,
      concatBytes([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
        ),
        image.bytes,
        ascii("\nendstream"),
      ])
    );
  }

  return pdf.build(catalogNum);
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
