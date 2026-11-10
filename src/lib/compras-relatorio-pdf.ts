import { APP_NAME } from "@/lib/brand";
import type { CompraHistoricoExcelInput } from "@/lib/compras-relatorio-excel";

const NAVY: [number, number, number] = [29, 24, 19];
const ACC: [number, number, number] = [254, 215, 6];
const INK: [number, number, number] = [125, 99, 0];
const MUT: [number, number, number] = [102, 97, 90];

function clean(s: string | number) {
  return String(s)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/–/g, "-");
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

export async function downloadComprasHistoricoPdf(input: CompraHistoricoExcelInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const W = 297;
  const M = 12;
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", M, 8, 18, 17.7);
    } catch {
      /* ignore */
    }
  }

  const total = input.rows.reduce((acc, r) => acc + (r.valorCompra ?? 0) * (r.qtd || 0), 0);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`${APP_NAME.toUpperCase()} · COMPRAS`, M + 22, 14);
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.text(clean(input.title), M + 22, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUT);
  doc.text(clean(input.generatedAt), W - M, 14, { align: "right" });
  doc.text(
    `${input.rows.length} registro(s) · ${formatMoney(total)}`,
    W - M,
    21,
    { align: "right" },
  );
  doc.setFillColor(...ACC);
  doc.rect(M, 26, W - 2 * M, 1.4, "F");
  doc.setFontSize(8);
  doc.text(clean(input.filtersLabel), M, 32);

  autoTable(doc, {
    startY: 36,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.2, textColor: [20, 32, 44], overflow: "linebreak" },
    head: [
      [
        "Quando",
        "Produto",
        "Qtd",
        "Status",
        "Solicitante",
        "Motivo",
        "Fornecedor",
        "Valor",
        "CMC",
        "Comprador",
      ],
    ],
    body:
      input.rows.length > 0
        ? input.rows.map((row) => [
            clean(row.quando),
            clean(row.produto),
            String(row.qtd),
            clean(row.status),
            clean(row.solicitante),
            clean(row.motivo || "—"),
            clean(row.fornecedor || "—"),
            clean(formatMoney(row.valorCompra)),
            clean(formatMoney(row.cmcNovo)),
            clean(row.comprador || "—"),
          ])
        : [["—", "Nenhum registro no filtro.", "", "", "", "", "", "", "", ""]],
  });

  const pageCount = doc.getNumberOfPages();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text(`${APP_NAME} · Histórico de compras`, M, H - 8);
    doc.text(`Página ${i}/${pageCount}`, W - M, H - 8, { align: "right" });
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Compras-Historico-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
