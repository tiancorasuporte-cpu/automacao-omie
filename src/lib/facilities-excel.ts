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
  horasExtra?: number;
  trocas: number;
  permutas: number;
  almoco?: number;
  pagamento?: number;
  desconto?: number;
  ferias?: number;
  feriasDias?: number;
  feriasHoras?: number;
  bySubstituto: Array<{
    nome: string;
    empresa: string;
    escala: string;
    trocas: number;
    horas: number;
    horasExtra?: number;
    almoco?: number;
    pagamento?: number;
    desconto?: number;
  }>;
  byPosto: Array<{
    nome: string;
    trocas: number;
    horas: number;
    horasExtra?: number;
    almoco?: number;
    pagamento?: number;
    desconto?: number;
  }>;
  byAusente?: Array<{
    nome: string;
    empresa: string;
    escala: string;
    lancamentos: number;
    horas: number;
    desconto: number;
  }>;
  byMotivo?: Array<{
    motivoLabel: string;
    pagaHoras: boolean;
    trocas: number;
    horas: number;
    pagamento?: number;
    desconto?: number;
  }>;
  byCoberturaFerias?: Array<{
    nome: string;
    empresa: string;
    escala: string;
    ferias: number;
    dias: number;
    horas: number;
    propria: number;
  }>;
  lancamentos: Array<{
    data: string;
    postoNome: string;
    ausenteNome: string;
    ausenteEmpresa: string;
    substitutoNome: string;
    substitutoEmpresa: string;
    substitutoEscala?: string;
    motivoLabel: string;
    periodoLabel?: string;
    periodoExtraLabel?: string | null;
    horas: number;
    horasExtra?: number;
    tarifaHora?: number;
    tarifaExtra?: number;
    tarifaDesconto?: number;
    pagaHoras: boolean;
    aplicaDesconto?: boolean;
    valorPagamento?: number;
    valorDesconto?: number;
    pagaAlmoco?: boolean;
    valorAlmoco?: number;
    hasAtestado?: boolean;
    foraDoPostoBase?: boolean;
    observacao: string | null;
    registradoPor: string | null;
  }>;
  feriasLancamentos?: Array<{
    dataInicio: string;
    dataFim: string;
    dias: number;
    postoNome: string;
    colaboradorNome: string;
    colaboradorEmpresa: string;
    coberturaNome: string;
    coberturaEmpresa: string;
    horas: number;
    coberturaPropria: boolean;
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
        cellString("Hora extra") +
        cellNumber(input.horasExtra ?? 0, "Money") +
        cellString("Lançamentos") +
        cellNumber(input.trocas) +
        cellString("Permutas (sem pgto)") +
        cellNumber(input.permutas),
    ),
    row(
      cellString("Pagamento R$") +
        cellNumber(input.pagamento ?? 0, "Money") +
        cellString("Desconto R$") +
        cellNumber(input.desconto ?? 0, "Money") +
        cellString("Almoço") +
        cellNumber(input.almoco ?? 0, "Money"),
    ),
    row(
      cellString("Férias (períodos)") +
        cellNumber(input.ferias ?? 0) +
        cellString("Férias (dias)") +
        cellNumber(input.feriasDias ?? 0) +
        cellString("Férias (horas)") +
        cellNumber(input.feriasHoras ?? 0, "Money"),
    ),
    row(""),
    row(
      cellString("#", "Header") +
        cellString("Colaborador", "Header") +
        cellString("Empresa", "Header") +
        cellString("Escala", "Header") +
        cellString("Coberturas", "Header") +
        cellString("Horas a pagar", "Header") +
        cellString("Hora extra", "Header") +
        cellString("Almoço R$", "Header") +
        cellString("Pagamento R$", "Header"),
    ),
    ...input.bySubstituto.map(
      (item, index) =>
        row(
          cellNumber(index + 1) +
            cellString(item.nome) +
            cellString(item.empresa) +
            cellString(item.escala) +
            cellNumber(item.trocas) +
            cellNumber(item.horas, "Money") +
            cellNumber(item.horasExtra ?? 0, "Money") +
            cellNumber(item.almoco ?? 0, "Money") +
            cellNumber(item.pagamento ?? 0, "Money"),
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
              cellNumber(input.horasPagar, "Money") +
              cellNumber(input.horasExtra ?? 0, "Money") +
              cellNumber(
                input.bySubstituto.reduce((sum, item) => sum + (item.almoco ?? 0), 0),
                "Money",
              ) +
              cellNumber(input.pagamento ?? 0, "Money"),
          ),
        ]),
  ].join("\n");

  const postoRows = [
    row(cellString(`Horas a pagar por posto — ${input.monthLabel}`, "Title")),
    row(""),
    row(
      cellString("Posto", "Header") +
        cellString("Lançamentos", "Header") +
        cellString("Horas a pagar", "Header") +
        cellString("Hora extra", "Header") +
        cellString("Pagamento R$", "Header") +
        cellString("Desconto R$", "Header") +
        cellString("Almoço R$", "Header"),
    ),
    ...input.byPosto.map(
      (item) =>
        row(
          cellString(item.nome) +
            cellNumber(item.trocas) +
            cellNumber(item.horas, "Money") +
            cellNumber(item.horasExtra ?? 0, "Money") +
            cellNumber(item.pagamento ?? 0, "Money") +
            cellNumber(item.desconto ?? 0, "Money") +
            cellNumber(item.almoco ?? 0, "Money"),
        ),
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
              ) +
              cellNumber(
                input.byPosto.reduce((sum, item) => sum + (item.horasExtra ?? 0), 0),
                "Money",
              ) +
              cellNumber(
                input.byPosto.reduce((sum, item) => sum + (item.pagamento ?? 0), 0),
                "Money",
              ) +
              cellNumber(
                input.byPosto.reduce((sum, item) => sum + (item.desconto ?? 0), 0),
                "Money",
              ) +
              cellNumber(
                input.byPosto.reduce((sum, item) => sum + (item.almoco ?? 0), 0),
                "Money",
              ),
          ),
        ]),
  ].join("\n");

  const ausenteRows = [
    row(cellString(`Desconto por ausente — ${input.monthLabel}`, "Title")),
    row(""),
    row(
      cellString("Ausente", "Header") +
        cellString("Empresa", "Header") +
        cellString("Escala", "Header") +
        cellString("Lançamentos", "Header") +
        cellString("Horas", "Header") +
        cellString("Desconto R$", "Header"),
    ),
    ...(input.byAusente ?? []).map((item) =>
      row(
        cellString(item.nome) +
          cellString(item.empresa) +
          cellString(item.escala) +
          cellNumber(item.lancamentos) +
          cellNumber(item.horas, "Money") +
          cellNumber(item.desconto, "Money"),
      ),
    ),
    ...((input.byAusente ?? []).length === 0
      ? [row(cellString("Nenhum desconto neste mês."))]
      : [
          row(
            cellString("TOTAL", "Header") +
              cellString("") +
              cellString("") +
              cellNumber(
                (input.byAusente ?? []).reduce((sum, item) => sum + item.lancamentos, 0),
                "Header",
              ) +
              cellNumber(
                (input.byAusente ?? []).reduce((sum, item) => sum + item.horas, 0),
                "Money",
              ) +
              cellNumber(input.desconto ?? 0, "Money"),
          ),
        ]),
  ].join("\n");

  const motivoRows = [
    row(cellString(`Por motivo — ${input.monthLabel}`, "Title")),
    row(""),
    row(
      cellString("Motivo", "Header") +
        cellString("Lançamentos", "Header") +
        cellString("Horas", "Header") +
        cellString("Pagamento R$", "Header") +
        cellString("Desconto R$", "Header") +
        cellString("Paga horas", "Header"),
    ),
    ...(input.byMotivo ?? []).map((item) =>
      row(
        cellString(item.motivoLabel) +
          cellNumber(item.trocas) +
          cellNumber(item.horas, "Money") +
          cellNumber(item.pagamento ?? 0, "Money") +
          cellNumber(item.desconto ?? 0, "Money") +
          cellString(item.pagaHoras ? "Sim" : "Não"),
      ),
    ),
    ...((input.byMotivo ?? []).length === 0
      ? [row(cellString("Nenhum lançamento neste mês."))]
      : []),
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
        cellString("Escala substituto", "Header") +
        cellString("Motivo", "Header") +
        cellString("Período", "Header") +
        cellString("Horas", "Header") +
        cellString("Hora extra", "Header") +
        cellString("Período HE", "Header") +
        cellString("Tarifa R$/h", "Header") +
        cellString("Tarifa HE R$/h", "Header") +
        cellString("Tarifa desc. R$/h", "Header") +
        cellString("Horas a pagar", "Header") +
        cellString("Aplica desconto", "Header") +
        cellString("Pagamento R$", "Header") +
        cellString("Desconto R$", "Header") +
        cellString("Almoço", "Header") +
        cellString("Atestado", "Header") +
        cellString("Fora posto base", "Header") +
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
            cellString(item.substitutoEscala ?? "") +
            cellString(item.motivoLabel) +
            cellString(item.periodoLabel ?? "") +
            cellNumber(item.horas, "Money") +
            cellNumber(item.horasExtra ?? 0, "Money") +
            cellString(item.periodoExtraLabel ?? "") +
            cellNumber(item.tarifaHora ?? 0, "Money") +
            cellNumber(item.tarifaExtra ?? 0, "Money") +
            cellNumber(item.tarifaDesconto ?? 0, "Money") +
            cellString(item.pagaHoras ? "Sim" : "Não") +
            cellString(item.aplicaDesconto ? "Sim" : "Não") +
            cellNumber(item.valorPagamento ?? 0, "Money") +
            cellNumber(item.valorDesconto ?? 0, "Money") +
            cellNumber(item.pagaAlmoco ? Number(item.valorAlmoco ?? 0) : 0, "Money") +
            cellString(item.hasAtestado ? "Sim" : "Não") +
            cellString(item.foraDoPostoBase ? "Sim" : "Não") +
            cellString(item.observacao ?? "") +
            cellString(item.registradoPor ?? ""),
        ),
    ),
    ...(input.lancamentos.length === 0
      ? [row(cellString("Nenhum lançamento neste mês."))]
      : []),
  ].join("\n");

  const feriasRows = [
    row(cellString(`Férias — ${input.monthLabel}`, "Title")),
    row(
      cellString("Períodos") +
        cellNumber(input.ferias ?? 0) +
        cellString("Dias") +
        cellNumber(input.feriasDias ?? 0) +
        cellString("Horas") +
        cellNumber(input.feriasHoras ?? 0, "Money"),
    ),
    row(""),
    row(
      cellString("Cobertura", "Header") +
        cellString("Empresa", "Header") +
        cellString("Períodos", "Header") +
        cellString("Dias", "Header") +
        cellString("Horas", "Header") +
        cellString("Próprias", "Header"),
    ),
    ...(input.byCoberturaFerias ?? []).map((item) =>
      row(
        cellString(item.nome) +
          cellString(item.empresa) +
          cellNumber(item.ferias) +
          cellNumber(item.dias) +
          cellNumber(item.horas, "Money") +
          cellNumber(item.propria),
      ),
    ),
    ...((input.byCoberturaFerias ?? []).length === 0
      ? [row(cellString("Sem férias neste mês."))]
      : []),
    row(""),
    row(
      cellString("Início", "Header") +
        cellString("Fim", "Header") +
        cellString("Dias", "Header") +
        cellString("Em férias", "Header") +
        cellString("Cobertura", "Header") +
        cellString("Posto", "Header") +
        cellString("Horas", "Header") +
        cellString("Própria", "Header") +
        cellString("Observação", "Header"),
    ),
    ...(input.feriasLancamentos ?? []).map((item) =>
      row(
        cellString(item.dataInicio) +
          cellString(item.dataFim) +
          cellNumber(item.dias) +
          cellString(item.colaboradorNome) +
          cellString(item.coberturaNome) +
          cellString(item.postoNome) +
          cellNumber(item.horas, "Money") +
          cellString(item.coberturaPropria ? "Sim" : "Não") +
          cellString(item.observacao ?? ""),
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
  ${headerStyles}
  ${buildWorksheet("Por colaborador", resumoRows, 9)}
  ${buildWorksheet("Por posto", postoRows, 7)}
  ${buildWorksheet("Descontos", ausenteRows, 6)}
  ${buildWorksheet("Por motivo", motivoRows, 6)}
  ${buildWorksheet("Lancamentos", lancRows, 24)}
  ${buildWorksheet("Ferias", feriasRows, 9)}
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
