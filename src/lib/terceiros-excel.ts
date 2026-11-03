import {
  type TerceiroConsolidadoReport,
  type TerceiroReport,
  formatTerceiroMoney,
  safeTerceiroFileName,
} from "@/lib/terceiros-report";

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

function cellNumber(value: number, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  const num = Number.isFinite(value) ? String(value) : "0";
  return `<Cell${style}><Data ss:Type="Number">${num}</Data></Cell>`;
}

function row(cells: string) {
  return `<Row>${cells}</Row>`;
}

const STYLES = `
<Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#1D1813" ss:Pattern="Solid"/><Font ss:Color="#FED706"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
  <Style ss:ID="Label"><Font ss:Bold="1"/><Font ss:Color="#66615A"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="MoneyBold"><Font ss:Bold="1"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="Total"><Font ss:Bold="1"/><Interior ss:Color="#FDF3C4" ss:Pattern="Solid"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
</Styles>`;

function downloadXml(xml: string, fileName: string) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const blob = new Blob([`\uFEFF${xml}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTerceiroExcel(report: TerceiroReport) {
  const bodyRows = [
    row(cellString(report.titulo, "Title")),
    row(cellString(`Emitido em ${report.emitidoEm}`)),
    row(""),
    row(`${cellString("Empresa", "Label")}${cellString(report.empresaNome)}`),
    row(`${cellString("Documento", "Label")}${cellString(report.documento ?? "—")}`),
    row(`${cellString("Contato", "Label")}${cellString(report.contato ?? "—")}`),
    row(
      `${cellString("Contas", "Label")}${cellString(
        `${report.qtdContasTotal} total (${report.qtdContasPadrao} comum + ${report.qtdContasExcecao} particularidade)`,
      )}`,
    ),
    row(`${cellString("Observação", "Label")}${cellString(report.observacao || "—")}`),
    row(""),
    row(
      [
        cellString("Grupo", "Header"),
        cellString("Item", "Header"),
        cellString("Detalhe", "Header"),
        cellString("Qtd.", "Header"),
        cellString("Valor unit.", "Header"),
        cellString("Subtotal", "Header"),
      ].join(""),
    ),
    ...report.linhas.map((line) =>
      row(
        [
          cellString(line.grupo),
          cellString(line.item),
          cellString(line.detalhe),
          line.quantidade == null ? cellString("—") : cellNumber(line.quantidade),
          line.valorUnitario == null
            ? cellString("—")
            : cellNumber(line.valorUnitario, "Money"),
          cellNumber(line.subtotal, "Money"),
        ].join(""),
      ),
    ),
    row(""),
    row(
      `${cellString("Monitoramento (preço comum)", "Label")}${cellNumber(report.monitoramentoPadrao, "MoneyBold")}`,
    ),
    row(
      `${cellString("Particularidades (à parte)", "Label")}${cellNumber(report.contasExcecao, "MoneyBold")}`,
    ),
    row(
      `${cellString("Proporcionais (período)", "Label")}${cellNumber(report.contasProporcionais, "MoneyBold")}`,
    ),
    row(`${cellString("Outros serviços", "Label")}${cellNumber(report.outrosServicos, "MoneyBold")}`),
    row(`${cellString("TOTAL MENSAL", "Label")}${cellNumber(report.totalMensal, "Total")}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  ${STYLES}
  <Worksheet ss:Name="Cobranca">
    <Table>${bodyRows.join("\n")}</Table>
  </Worksheet>
</Workbook>`;

  downloadXml(xml, safeTerceiroFileName(report.empresaNome, "cobranca"));
}

export function downloadTerceirosConsolidadoExcel(report: TerceiroConsolidadoReport) {
  const bodyRows = [
    row(cellString(report.titulo, "Title")),
    row(cellString(`Emitido em ${report.emitidoEm}`)),
    row(
      cellString(
        `Totais: ${report.itens.length} terceiro(s) · ${report.totalContas} conta(s) · ${formatTerceiroMoney(report.totalGeral)}`,
      ),
    ),
    row(""),
    row(
      [
        cellString("Empresa", "Header"),
        cellString("Documento", "Header"),
        cellString("Contato", "Header"),
        cellString("Contas", "Header"),
        cellString("Comum", "Header"),
        cellString("Particularidade", "Header"),
        cellString("Preço comum (R$)", "Header"),
        cellString("Part. (R$)", "Header"),
        cellString("Serviços (R$)", "Header"),
        cellString("Total mensal (R$)", "Header"),
        cellString("Status", "Header"),
      ].join(""),
    ),
    ...report.itens.map((item) =>
      row(
        [
          cellString(item.nome),
          cellString(item.documento ?? "—"),
          cellString(item.contato ?? "—"),
          cellNumber(item.qtdContasTotal),
          cellNumber(item.qtdContasPadrao),
          cellNumber(item.qtdContasExcecao),
          cellNumber(item.monitoramentoPadrao, "Money"),
          cellNumber(item.contasExcecao, "Money"),
          cellNumber(item.outrosServicos, "Money"),
          cellNumber(item.totalMensal, "MoneyBold"),
          cellString(item.active ? "Ativo" : "Inativo"),
        ].join(""),
      ),
    ),
    row(""),
    row(
      [
        cellString("TOTAL", "Label"),
        cellString(""),
        cellString(""),
        cellNumber(report.totalContas),
        cellString(""),
        cellString(""),
        cellString(""),
        cellString(""),
        cellString(""),
        cellNumber(report.totalGeral, "Total"),
        cellString(""),
      ].join(""),
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  ${STYLES}
  <Worksheet ss:Name="Consolidado">
    <Table>${bodyRows.join("\n")}</Table>
  </Worksheet>
</Workbook>`;

  downloadXml(xml, safeTerceiroFileName("terceiros", "consolidado"));
}
