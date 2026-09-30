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

export type FacilitiesFechamentoExcelInput = {
  monthKey: string;
  monthLabel: string;
  horasPagar: number;
  trocas: number;
  permutas: number;
  bySubstituto: Array<{
    nome: string;
    empresa: string;
    escala: string;
    trocas: number;
    horas: number;
  }>;
  byPosto: Array<{
    nome: string;
    trocas: number;
    horas: number;
  }>;
  lancamentos: Array<{
    data: string;
    postoNome: string;
    ausenteNome: string;
    ausenteEmpresa: string;
    substitutoNome: string;
    substitutoEmpresa: string;
    motivoLabel: string;
    horas: number;
    pagaHoras: boolean;
    observacao: string | null;
    registradoPor: string | null;
  }>;
};

function row(cells: string) {
  return `<Row>${cells}</Row>`;
}

function buildWorksheet(name: string, rowsXml: string, columnCount: number) {
  const cols = Array.from({ length: columnCount }, (_, i) => {
    const width = i === 0 ? 80 : i === 1 ? 140 : 100;
    return `<Column ss:Index="${i + 1}" ss:AutoFitWidth="0" ss:Width="${width}"/>`;
  }).join("");
  return `
  <Worksheet ss:Name="${escapeXml(name)}">
    <Table>
      ${cols}
      ${rowsXml}
    </Table>
  </Worksheet>`;
}

export function buildFacilitiesFechamentoExcelXml(input: FacilitiesFechamentoExcelInput) {
  const headerStyles = `
  <Styles>
    <Style ss:ID="Title">
      <Font ss:Bold="1" ss:Size="14"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Money">
      <NumberFormat ss:Format="0.00"/>
    </Style>
  </Styles>`;

  const resumoRows = [
    row(cellString(`Facilities — Fechamento ${input.monthLabel}`, "Title")),
    row(cellString(`Competência: ${input.monthKey}`)),
    row(
      cellString("Horas a pagar") +
        cellNumber(input.horasPagar, "Money") +
        cellString("Lançamentos") +
        cellNumber(input.trocas) +
        cellString("Permutas (sem pgto)") +
        cellNumber(input.permutas),
    ),
    row(""),
    row(
      cellString("#", "Header") +
        cellString("Colaborador", "Header") +
        cellString("Empresa", "Header") +
        cellString("Escala", "Header") +
        cellString("Coberturas", "Header") +
        cellString("Horas a pagar", "Header"),
    ),
    ...input.bySubstituto.map(
      (item, index) =>
        row(
          cellNumber(index + 1) +
            cellString(item.nome) +
            cellString(item.empresa) +
            cellString(item.escala) +
            cellNumber(item.trocas) +
            cellNumber(item.horas, "Money"),
        ),
    ),
    ...(input.bySubstituto.length === 0
      ? [row(cellString("Sem horas a pagar neste mês."))]
      : [
          row(
            cellString("") +
              cellString("") +
              cellString("") +
              cellString("TOTAL", "Header") +
              cellNumber(
                input.bySubstituto.reduce((sum, item) => sum + item.trocas, 0),
                "Header",
              ) +
              cellNumber(input.horasPagar, "Money"),
          ),
        ]),
  ].join("\n");

  const postoRows = [
    row(cellString(`Horas a pagar por posto — ${input.monthLabel}`, "Title")),
    row(""),
    row(
      cellString("Posto", "Header") +
        cellString("Lançamentos", "Header") +
        cellString("Horas a pagar", "Header"),
    ),
    ...input.byPosto.map(
      (item) =>
        row(cellString(item.nome) + cellNumber(item.trocas) + cellNumber(item.horas, "Money")),
    ),
    ...(input.byPosto.length === 0
      ? [row(cellString("Sem lançamentos neste mês."))]
      : [
          row(
            cellString("TOTAL", "Header") +
              cellNumber(
                input.byPosto.reduce((sum, item) => sum + item.trocas, 0),
                "Header",
              ) +
              cellNumber(
                input.byPosto.reduce((sum, item) => sum + item.horas, 0),
                "Money",
              ),
          ),
        ]),
  ].join("\n");

  const lancRows = [
    row(cellString(`Lançamentos — ${input.monthLabel}`, "Title")),
    row(cellString("Solicitações de troca aparecem com 'Não' em Horas a pagar.")),
    row(""),
    row(
      cellString("Data", "Header") +
        cellString("Posto", "Header") +
        cellString("Ausente", "Header") +
        cellString("Empresa ausente", "Header") +
        cellString("Substituto", "Header") +
        cellString("Empresa substituto", "Header") +
        cellString("Motivo", "Header") +
        cellString("Horas", "Header") +
        cellString("Horas a pagar", "Header") +
        cellString("Observação", "Header") +
        cellString("Registrado por", "Header"),
    ),
    ...input.lancamentos.map(
      (item) =>
        row(
          cellString(item.data) +
            cellString(item.postoNome) +
            cellString(item.ausenteNome) +
            cellString(item.ausenteEmpresa) +
            cellString(item.substitutoNome) +
            cellString(item.substitutoEmpresa) +
            cellString(item.motivoLabel) +
            cellNumber(item.horas, "Money") +
            cellString(item.pagaHoras ? "Sim" : "Não") +
            cellString(item.observacao ?? "") +
            cellString(item.registradoPor ?? ""),
        ),
    ),
    ...(input.lancamentos.length === 0
      ? [row(cellString("Nenhum lançamento neste mês."))]
      : []),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  ${headerStyles}
  ${buildWorksheet("Por colaborador", resumoRows, 6)}
  ${buildWorksheet("Por posto", postoRows, 3)}
  ${buildWorksheet("Lancamentos", lancRows, 11)}
</Workbook>`;
}

export function downloadFacilitiesFechamentoExcel(input: FacilitiesFechamentoExcelInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const xml = buildFacilitiesFechamentoExcelXml(input);
  const blob = new Blob([`\uFEFF${xml}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safeMonth = input.monthKey.replaceAll("-", "");
  link.download = `Facilities-Fechamento-${safeMonth}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
