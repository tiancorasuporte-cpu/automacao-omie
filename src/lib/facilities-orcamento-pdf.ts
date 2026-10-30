import type { RelatorioPosto } from "@/lib/facilities-orcamento-report";

const NAVY: [number, number, number] = [29, 24, 19];
const ACC: [number, number, number] = [254, 215, 6];
const INK: [number, number, number] = [125, 99, 0];
const MUT: [number, number, number] = [102, 97, 90];

function clean(s: string | number) {
  return String(s)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/–/g, "-");
}

async function loadLogoDataUrl() {
  try {
    const res = await fetch("/ancora-postos-logo.jpeg");
    if (!res.ok) return undefined;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return undefined;
  }
}

export async function buildPostoPdf(rel: RelatorioPosto) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", M, 8, 22, 21.7);
    } catch {
      /* ignore */
    }
  }

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GRUPO ÂNCORA · POSTOS DE SERVIÇO", M + 27, 15);
  doc.setTextColor(...NAVY);
  doc.setFontSize(15);
  doc.text(clean(rel.titulo) + (rel.tipo === "interno" ? " (uso interno)" : ""), M + 27, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUT);
  doc.text("Emitido em " + rel.data, W - M, 22, { align: "right" });
  doc.setFillColor(...ACC);
  doc.rect(M, 32, W - 2 * M, 1.6, "F");

  let y = 37;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.2, textColor: [20, 32, 44] },
    columnStyles: { 0: { textColor: MUT, cellWidth: 50 }, 1: { fontStyle: "bold" } },
    body: rel.info.map((r) => [clean(r[0]), clean(r[1])]),
  });
  y = (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY + 4;

  if (rel.tipo === "cliente") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Itens contemplados no valor do posto", M, y + 3);
    y += 6;
  }

  for (const b of rel.blocos) {
    if ("lista" in b) {
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        theme: "plain",
        head: [[clean(b.titulo)]],
        headStyles: {
          textColor: NAVY,
          fontStyle: "bold",
          fontSize: 10,
          cellPadding: { top: 2, bottom: 1, left: 0 },
        },
        styles: { fontSize: 9, cellPadding: { top: 0.6, bottom: 0.6, left: 3 } },
        body: b.lista.map((i) => ["• " + clean(i)]),
      });
    } else {
      const tres = (b.linhas[0]?.length ?? 0) > 2;
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        theme: "striped",
        head: [[clean(b.titulo), "Valor"].concat(tres ? ["% preço"] : [])],
        headStyles: { fillColor: NAVY, textColor: ACC, fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 1.4 },
        alternateRowStyles: { fillColor: [247, 246, 243] },
        columnStyles: {
          1: { halign: "right", cellWidth: 38 },
          2: { halign: "right", cellWidth: 20, textColor: MUT },
        },
        body: b.linhas.map((l) => l.map(clean)),
        foot: [b.total.map(clean)],
        footStyles: {
          fillColor: [253, 243, 196],
          textColor: [20, 32, 44],
          fontStyle: "bold",
          halign: "left",
        },
        didParseCell: (d) => {
          if (d.section === "foot" && d.column.index > 0) d.cell.styles.halign = "right";
        },
      });
    }
    y = (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 3;
  }

  const h = 6 + rel.destaque.length * 7;
  if (y + h > 270) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...NAVY);
  doc.rect(M, y, W - 2 * M, h, "F");
  doc.setFillColor(...ACC);
  doc.rect(M, y, 1.8, h, "F");
  let yy = y + 8;
  for (const [k, v, main] of rel.destaque) {
    doc.setFont("helvetica", main ? "bold" : "normal");
    doc.setFontSize(main ? 12 : 10);
    doc.setTextColor(255, 255, 255);
    doc.text(clean(k), M + 5, yy);
    doc.setTextColor(...ACC);
    doc.text(clean(v), W - M - 4, yy, { align: "right" });
    yy += 7;
  }
  y += h + 6;
  doc.setTextColor(...MUT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const n of rel.notas) {
    const ls = doc.splitTextToSize(clean(n), W - 2 * M);
    doc.text(ls, M, y);
    y += ls.length * 4 + 1;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(213, 219, 226);
    doc.line(M, 284, W - M, 284);
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text("Grupo Âncora", M, 289);
    doc.text("atendimento@ancoraseguranca.com.br", W - M, 289, { align: "right" });
  }
  return doc;
}

export async function downloadPostoPdf(rel: RelatorioPosto, filename: string) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const doc = await buildPostoPdf(rel);
  const name = (filename.endsWith(".pdf") ? filename : `${filename}.pdf`).replace(
    /[\\/:*?"<>|]/g,
    "",
  );
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
