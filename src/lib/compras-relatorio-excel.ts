export type CompraHistoricoExcelRow = {
  quando: string;
  produto: string;
  qtd: number;
  origem: string;
  status: string;
  solicitante: string;
  motivo: string | null;
  fornecedor: string | null;
  valorCompra: number | null;
  cmcNovo: number | null;
  comprador: string | null;
  quoteNumero: string | null;
  links: string[];
};

export type CompraHistoricoExcelInput = {
  title: string;
  generatedAt: string;
  filtersLabel: string;
  rows: CompraHistoricoExcelRow[];
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

export function buildComprasHistoricoExcelXml(input: CompraHistoricoExcelInput) {
  const total = input.rows.reduce((acc, r) => acc + (r.valorCompra ?? 0) * (r.qtd || 0), 0);
  const body = [
    row(cellString(input.title, "Title")),
    row(cellString(`Gerado em ${input.generatedAt}`)),
    row(cellString(input.filtersLabel)),
    row(
      cellString("Registros") +
        cellNumber(input.rows.length) +
        cellString("Total estimado") +
        cellNumber(total, "Money"),
    ),
    row(""),
    row(
      cellString("Quando", "Header") +
        cellString("Produto", "Header") +
        cellString("Qtd", "Header") +
        cellString("Origem", "Header") +
        cellString("Status", "Header") +
        cellString("Solicitante", "Header") +
        cellString("Motivo", "Header") +
        cellString("Fornecedor", "Header") +
        cellString("Valor un.", "Header") +
        cellString("CMC novo", "Header") +
        cellString("Comprador", "Header") +
        cellString("Orçamento", "Header") +
        cellString("Links", "Header"),
    ),
    ...input.rows.map((item) =>
      row(
        cellString(item.quando) +
          cellString(item.produto) +
          cellNumber(item.qtd, "Num") +
          cellString(item.origem) +
          cellString(item.status) +
          cellString(item.solicitante) +
          cellString(item.motivo ?? "") +
          cellString(item.fornecedor ?? "") +
          cellNumber(item.valorCompra, "Money") +
          cellNumber(item.cmcNovo, "Money") +
          cellString(item.comprador ?? "") +
          cellString(item.quoteNumero ?? "") +
          cellString(item.links.join(" | ")),
      ),
    ),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Num"><NumberFormat ss:Format="0.###"/></Style>
    <Style ss:ID="Money"><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  </Styles>
  <Worksheet ss:Name="Histórico">
    <Table>${body}</Table>
  </Worksheet>
</Workbook>`;
}

export function downloadComprasHistoricoExcel(input: CompraHistoricoExcelInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const xml = buildComprasHistoricoExcelXml(input);
  const blob = new Blob([`\uFEFF${xml}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Compras-Historico-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
