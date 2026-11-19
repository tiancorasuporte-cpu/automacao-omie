import { formatBRL, formatKm, formatKmPerLiter, monthLabelPt } from "@/lib/frota-domain";
import type { FrotaReportExcelInput } from "@/lib/frota-report-excel";

const NAVY: [number, number, number] = [29, 24, 19];
const ACC: [number, number, number] = [254, 215, 6];
const INK: [number, number, number] = [125, 99, 0];
const MUT: [number, number, number] = [102, 97, 90];

function clean(s: string | number) {
  return String(s)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/–/g, "-");
}

function lastTableY(doc: { lastAutoTable?: { finalY: number } }, fallback: number) {
  return doc.lastAutoTable?.finalY ?? fallback;
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

export async function downloadFrotaReportPdf(input: FrotaReportExcelInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210;
  const M = 12;
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", M, 8, 18, 17.7);
    } catch {
      /* ignore */
    }
  }

  const r = input.report;
  const rf = r.refueling;
  const docWithTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GRUPO ÂNCORA · FROTA", M + 22, 14);
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.text(clean(input.title), M + 22, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUT);
  doc.text(clean(input.generatedAt), W - M, 14, { align: "right" });
  doc.text(clean(input.vehicleLabel), W - M, 21, { align: "right" });
  doc.setFillColor(...ACC);
  doc.rect(M, 26, W - 2 * M, 1.4, "F");

  doc.setTextColor(...MUT);
  doc.setFontSize(9);
  doc.text(clean(`Período: ${input.periodLabel} · ${r.periodDays} dias`), M, 33);

  autoTable(doc, {
    startY: 38,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 32, 44] },
    head: [["Resumo geral", "Valor"]],
    body: [
      ["Saldo", formatBRL(r.balance)],
      ["Custo", formatBRL(r.cost)],
      ["Receita", formatBRL(r.revenue)],
      ["Abastecimento", formatBRL(r.refuelTotal)],
      ["Despesas", formatBRL(r.expenseTotal)],
      ["Serviços", formatBRL(r.serviceTotal)],
      ["Receitas (lançamentos)", formatBRL(r.incomeTotal)],
      ["Distância (percursos)", formatKm(r.distanceKm)],
      ["Litros", `${r.refuelLiters.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`],
    ].map((row) => row.map(clean)),
  });

  autoTable(doc, {
    startY: lastTableY(docWithTable, 38) + 6,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 32, 44] },
    head: [["Abastecimento — detalhe", "Valor"]],
    body: [
      ["Custo / dia", formatBRL(rf.costPerDay)],
      ["Custo / km", rf.costPerKm > 0 ? formatBRL(rf.costPerKm) : "—"],
      ["L / abastecimento", rf.litersPerRefuel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })],
      ["L / dia", rf.litersPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 2 })],
      ["Preço médio / L", formatBRL(rf.avgPrice)],
      ["Média km/L", formatKmPerLiter(rf.avgEfficiency || null)],
      ["KM entre abastecimentos", rf.kmBetween > 0 ? formatKm(Math.round(rf.kmBetween)) : "—"],
      [
        "Frequência",
        rf.frequencyDays > 0
          ? `${rf.frequencyDays.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dias`
          : "—",
      ],
      ["Projeção mensal", formatBRL(rf.monthlyProjection)],
      [
        "Tanque cheio",
        `${rf.fullTankQty}/${r.counts.refuel} (${rf.fullTankPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`,
      ],
    ].map((row) => row.map(clean)),
  });

  const monthlyRows = [
    ...r.monthly.refuel.map((x) => ["Abastecimento", monthLabelPt(x.month), formatBRL(x.total)]),
    ...r.monthly.expense.map((x) => ["Despesa", monthLabelPt(x.month), formatBRL(x.total)]),
    ...r.monthly.income.map((x) => ["Receita", monthLabelPt(x.month), formatBRL(x.total)]),
    ...r.monthly.service.map((x) => ["Serviço", monthLabelPt(x.month), formatBRL(x.total)]),
  ];

  if (monthlyRows.length) {
    autoTable(doc, {
      startY: lastTableY(docWithTable, 90) + 6,
      margin: { left: M, right: M },
      theme: "striped",
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 1.2, textColor: [20, 32, 44] },
      head: [["Tipo", "Mês", "Total"]],
      body: monthlyRows.map((row) => row.map(clean)),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text("Grupo Âncora · Frota", M, 287);
    doc.text(`Página ${i}/${pageCount}`, W - M, 287, { align: "right" });
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Frota-Relatorio-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
