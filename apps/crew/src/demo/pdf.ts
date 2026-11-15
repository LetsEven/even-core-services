// PDF minimo (una pagina, texto) para el comprobante ficticio del demo.
function esc(s: string): string {
  return s.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, (c) => {
    const map: Record<string, string> = {
      á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ñ: "N",
    };
    return map[c] ?? "?";
  });
}

export function buildSimplePdf(lines: string[]): Uint8Array {
  const content =
    "BT /F1 14 Tf 56 780 Td 20 TL\n" +
    lines.map((l) => `(${esc(l)}) Tj T*`).join("\n") +
    "\nET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 840] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
