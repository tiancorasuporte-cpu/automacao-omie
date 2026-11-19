import { formatBRL, formatKm, formatKmPerLiter, monthLabelPt } from "@/lib/frota-domain";

export type FrotaReportExportData = {
  periodDays: number;
  cost: number;
  revenue: number;
  balance: number;
  refuelTotal: number;
  refuelLiters: number;
  expenseTotal: number;
  serviceTotal: number;
  incomeTotal: number;
  distanceKm: number;
  counts: {
    refuel: number;
    expense: number;
    service: number;
    income: number;
    route: number;
    reading: number;
    checklist: number;
    reminder: number;
  };
  refueling: {
    cost: number;
    costPerDay: number;
    costPerKm: number;
    liters: number;
    litersPerRefuel: number;
    litersPerDay: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    avgEfficiency: number;
    minEfficiency: number;
    maxEfficiency: number;
    kmBetween: number;
    frequencyDays: number;
    monthlyProjection: number;
    fullTankQty: number;
    fullTankPct: number;
  };
  monthly: {
    refuel: Array<{ month: string; total: number }>;
    expense: Array<{ month: string; total: number }>;
    income: Array<{ month: string; total: number }>;
    service: Array<{ month: string; total: number }>;
  };
};

export type FrotaReportExcelInput = {
  title: string;
  generatedAt: string;
  vehicleLabel: string;
  periodLabel: string;
  report: FrotaReportExportData;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cellString(value: string, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function cellNumber(value: number | null, styleId?: string) {
  if (value == null || !Number.isFinite(value)) return cellString("—", styleId);
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="Number">${value}</Data></Cell>`;
}

function row(cells: string) {
  return `<Row>${cells}</Row>`;
}

function kv(label: string, value: string) {
  return row(cellString(label) + cellString(value));
}

function monthlyBlock(title: string, data: Array<{ month: string; total: number }>) {
  return [
    row(cellString(title, "Header") + cellString("Total", "Header")),
    ...data.map((r) => row(cellString(monthLabelPt(r.month)) + cellString(formatBRL(r.total)))),
    row(""),
  ];
}

export function buildFrotaReportExcelXml(input: FrotaReportExcelInput) {
  const r = input.report;
  const rf = r.refueling;
  const body = [
    row(cellString(input.title, "Title")),
    row(cellString(`Gerado em ${input.generatedAt}`)),
    kv("Veículo", input.vehicleLabel),
    kv("Período", input.periodLabel),
    kv("Dias no período", String(r.periodDays)),
    row(""),
    row(cellString("Resumo geral", "Header") + cellString("Valor", "Header")),
    kv("Saldo", formatBRL(r.balance)),
    kv("Custo", formatBRL(r.cost)),
    kv("Receita", formatBRL(r.revenue)),
    kv("Abastecimento", formatBRL(r.refuelTotal)),
    kv("Despesas", formatBRL(r.expenseTotal)),
    kv("Serviços", formatBRL(r.serviceTotal)),
    kv("Receitas (lançamentos)", formatBRL(r.incomeTotal)),
    kv("Distância (percursos)", formatKm(r.distanceKm)),
    kv("Litros", `${r.refuelLiters.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`),
    row(""),
    row(cellString("Quantidades", "Header") + cellString("Qtd", "Header")),
    kv("Abastecimentos", String(r.counts.refuel)),
    kv("Despesas", String(r.counts.expense)),
    kv("Serviços", String(r.counts.service)),
    kv("Receitas", String(r.counts.income)),
    kv("Percursos", String(r.counts.route)),
    kv("KM", String(r.counts.reading)),
    kv("Checklists", String(r.counts.checklist)),
    kv("Lembretes ativos", String(r.counts.reminder)),
    row(""),
    row(cellString("Abastecimento — detalhe", "Header") + cellString("Valor", "Header")),
    kv("Custo / dia", formatBRL(rf.costPerDay)),
    kv("Custo / km", rf.costPerKm > 0 ? formatBRL(rf.costPerKm) : "—"),
    kv("L / abastecimento", rf.litersPerRefuel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })),
    kv("L / dia", rf.litersPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 2 })),
    kv("Preço médio / L", formatBRL(rf.avgPrice)),
    kv("Menor preço / L", formatBRL(rf.minPrice)),
    kv("Maior preço / L", formatBRL(rf.maxPrice)),
    kv("Média km/L", formatKmPerLiter(rf.avgEfficiency || null)),
    kv("Menor km/L", formatKmPerLiter(rf.minEfficiency || null)),
    kv("Maior km/L", formatKmPerLiter(rf.maxEfficiency || null)),
    kv("KM entre abastecimentos", rf.kmBetween > 0 ? formatKm(Math.round(rf.kmBetween)) : "—"),
    kv(
      "Frequência",
      rf.frequencyDays > 0
        ? `${rf.frequencyDays.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dias`
        : "—",
    ),
    kv("Projeção mensal", formatBRL(rf.monthlyProjection)),
    kv(
      "Tanque cheio",
      `${rf.fullTankQty} de ${r.counts.refuel} (${rf.fullTankPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`,
    ),
    row(""),
    ...monthlyBlock("Abastecimento mensal", r.monthly.refuel),
    ...monthlyBlock("Despesas mensais", r.monthly.expense),
    ...monthlyBlock("Receitas mensais", r.monthly.income),
    ...monthlyBlock("Serviços mensais", r.monthly.service),
  ].join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#1D1813" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style>
  </Styles>
  <Worksheet ss:Name="Relatório">
    <Table>${body}</Table>
  </Worksheet>
</Workbook>`;
}

export function downloadFrotaReportExcel(input: FrotaReportExcelInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const xml = buildFrotaReportExcelXml(input);
  const blob = new Blob([`\uFEFF${xml}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Frota-Relatorio-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
