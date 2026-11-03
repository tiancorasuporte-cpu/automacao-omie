export type FrotaKmExcelRow = {
  occurredAt: string;
  vehicleName: string;
  vehiclePlate: string | null;
  previousOdometer: number | null;
  odometer: number;
  kmDay: number | null;
  reason: string | null;
  driverName: string | null;
  createdByName: string | null;
  notes: string | null;
};

export type FrotaKmExcelInput = {
  title: string;
  generatedAt: string;
  rows: FrotaKmExcelRow[];
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

function formatDateBr(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR");
}

export function buildFrotaKmExcelXml(input: FrotaKmExcelInput) {
  const totalKm = input.rows.reduce((acc, r) => acc + (r.kmDay ?? 0), 0);
  const body = [
    row(cellString(input.title, "Title")),
    row(cellString(`Gerado em ${input.generatedAt}`)),
    row(cellString("Registros") + cellNumber(input.rows.length) + cellString("KM total") + cellNumber(totalKm, "Num")),
    row(""),
    row(
      cellString("Data/hora", "Header") +
        cellString("Veículo", "Header") +
        cellString("Placa", "Header") +
        cellString("KM anterior", "Header") +
        cellString("KM atual", "Header") +
        cellString("KM do dia", "Header") +
        cellString("Motivo", "Header") +
        cellString("Motorista", "Header") +
        cellString("Lançado por", "Header") +
        cellString("Observação", "Header"),
    ),
    ...input.rows.map((item) =>
      row(
        cellString(formatDateBr(item.occurredAt)) +
          cellString(item.vehicleName) +
          cellString(item.vehiclePlate ?? "") +
          cellNumber(item.previousOdometer, "Num") +
          cellNumber(item.odometer, "Num") +
          cellNumber(item.kmDay, "Num") +
          cellString(item.reason ?? "") +
          cellString(item.driverName ?? "") +
          cellString(item.createdByName ?? "") +
          cellString(item.notes ?? ""),
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
    <Style ss:ID="Num"><NumberFormat ss:Format="0.0"/></Style>
  </Styles>
  <Worksheet ss:Name="KM do dia">
    <Table>${body}</Table>
  </Worksheet>
</Workbook>`;
}

export function downloadFrotaKmExcel(input: FrotaKmExcelInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const xml = buildFrotaKmExcelXml(input);
  const blob = new Blob([`\uFEFF${xml}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Frota-KM-do-dia-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
