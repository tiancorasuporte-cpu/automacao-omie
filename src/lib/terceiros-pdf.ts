import {
  type TerceiroConsolidadoReport,
  type TerceiroReport,
  formatTerceiroMoney,
  safeTerceiroFileName,
} from "@/lib/terceiros-report";

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
    const res = await fetch("/ancora-logo.png");
    if (!res.ok) return undefined;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return undefined;
  }
}

export async function downloadTerceiroPdf(report: TerceiroReport) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, 8, 18, 18);
    } catch {
      /* ignore */
    }
  }

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GRUPO ÂNCORA · OPERAÇÕES / FATURAMENTO", M + (logo ? 22 : 0), 14);
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.text(clean(report.titulo), M + (logo ? 22 : 0), 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUT);
  doc.text(`Emitido em ${report.emitidoEm}`, W - M, 21, { align: "right" });
  doc.setFillColor(...ACC);
  doc.rect(M, 28, W - 2 * M, 1.4, "F");

  let y = 34;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { textColor: MUT, cellWidth: 42 }, 1: { fontStyle: "bold" } },
    body: [
      ["Empresa", clean(report.empresaNome)],
      ["Documento", clean(report.documento ?? "—")],
      ["Contato", clean(report.contato ?? "—")],
      [
        "Contas",
        clean(
          `${report.qtdContasTotal} total (${report.qtdContasPadrao} comum + ${report.qtdContasExcecao} particularidade)`,
        ),
      ],
      ["Observação", clean(report.observacao || "—")],
    ],
  });
  y =
    (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 6;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    head: [["Grupo", "Item", "Detalhe", "Qtd.", "Unit.", "Subtotal"]],
    headStyles: { fillColor: NAVY, textColor: ACC, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.4 },
    alternateRowStyles: { fillColor: [247, 246, 243] },
    columnStyles: {
      3: { halign: "right", cellWidth: 16 },
      4: { halign: "right", cellWidth: 28 },
      5: { halign: "right", cellWidth: 28 },
    },
    body:
      report.linhas.length === 0
        ? [["—", "Sem itens ativos", "", "", "", ""]]
        : report.linhas.map((line) => [
            clean(line.grupo),
            clean(line.item),
            clean(line.detalhe || "—"),
            line.quantidade == null ? "—" : clean(line.quantidade),
            line.valorUnitario == null ? "—" : clean(formatTerceiroMoney(line.valorUnitario)),
            clean(formatTerceiroMoney(line.subtotal)),
          ]),
  });
  y =
    (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 6;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 70 }, 1: { halign: "right", fontStyle: "bold" } },
    body: [
      ["Monitoramento (preço comum)", clean(formatTerceiroMoney(report.monitoramentoPadrao))],
      ["Particularidades (à parte)", clean(formatTerceiroMoney(report.contasExcecao))],
      ["Proporcionais (período)", clean(formatTerceiroMoney(report.contasProporcionais))],
      ["Outros serviços", clean(formatTerceiroMoney(report.outrosServicos))],
      ["TOTAL MENSAL", clean(formatTerceiroMoney(report.totalMensal))],
    ],
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 4) {
        data.cell.styles.fillColor = [253, 243, 196];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
      }
    },
  });

  doc.save(`${safeTerceiroFileName(report.empresaNome, "cobranca")}.pdf`);
}

export async function downloadTerceirosConsolidadoPdf(report: TerceiroConsolidadoReport) {
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
      doc.addImage(logo, "PNG", M, 8, 16, 16);
    } catch {
      /* ignore */
    }
  }

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GRUPO ÂNCORA · OPERAÇÕES / FATURAMENTO", M + (logo ? 20 : 0), 13);
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.text(clean(report.titulo), M + (logo ? 20 : 0), 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUT);
  doc.text(`Emitido em ${report.emitidoEm}`, W - M, 20, { align: "right" });
  doc.setFillColor(...ACC);
  doc.rect(M, 26, W - 2 * M, 1.4, "F");

  autoTable(doc, {
    startY: 32,
    margin: { left: M, right: M },
    theme: "striped",
    head: [
      [
        "Empresa",
        "Documento",
        "Contas",
        "Comum",
        "Part.",
        "Preço comum",
        "Particularidades",
        "Serviços",
        "Total mensal",
      ],
    ],
    headStyles: { fillColor: NAVY, textColor: ACC, fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.3 },
    alternateRowStyles: { fillColor: [247, 246, 243] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right", fontStyle: "bold" },
    },
    body:
      report.itens.length === 0
        ? [["Nenhum terceiro", "", "", "", "", "", "", "", ""]]
        : report.itens.map((item) => [
            clean(item.nome),
            clean(item.documento ?? "—"),
            clean(item.qtdContasTotal),
            clean(item.qtdContasPadrao),
            clean(item.qtdContasExcecao),
            clean(formatTerceiroMoney(item.monitoramentoPadrao)),
            clean(formatTerceiroMoney(item.contasExcecao)),
            clean(formatTerceiroMoney(item.outrosServicos)),
            clean(formatTerceiroMoney(item.totalMensal)),
          ]),
    foot: [
      [
        "TOTAL",
        "",
        clean(report.totalContas),
        "",
        "",
        "",
        "",
        "",
        clean(formatTerceiroMoney(report.totalGeral)),
      ],
    ],
    footStyles: {
      fillColor: [253, 243, 196],
      textColor: [20, 32, 44],
      fontStyle: "bold",
      fontSize: 8,
    },
  });

  doc.save(`${safeTerceiroFileName("terceiros", "consolidado")}.pdf`);
}
