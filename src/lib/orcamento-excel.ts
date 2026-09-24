/** Nome sugerido ao salvar: Nome-do-Cliente - ORC-2026-00001 */
export function buildOrcamentoFileBaseName(input: {
  numeroInterno?: string | null;
  clienteNome?: string | null;
}) {
  const numero = (input.numeroInterno ?? "orcamento").trim() || "orcamento";
  const cliente = (input.clienteNome ?? "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${cliente || "Cliente"} - ${numero}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type OrcamentoExcelItem = {
  descricao: string;
  codigoProduto: number;
  unidade: string | null;
  quantidade: number;
  /** CMC efetivo (maior entre Omie e interno). */
  cmc: number | null;
  valorUnitario: number;
};

export type OrcamentoExcelOptions = {
  empresaNome: string;
  empresaCnpj?: string | null;
  clienteNome: string;
  clienteCnpj?: string | null;
  clienteCodigo?: number | null;
  numeroInterno?: string | null;
  criadoPor?: string | null;
  dataPrevisao: string;
  observacao?: string | null;
  items: OrcamentoExcelItem[];
  showLineValues: boolean;
  showTotal: boolean;
  servicosMensais?: Array<{ nome: string; valor: number; quantidade?: number }>;
};

const DEFAULT_ENCARGOS = 0.16;
const DEFAULT_COMISSAO = 0.01;
const DEFAULT_DESP_EXTRAS = 0;
const DEFAULT_DESCONTO = 0;

function cellString(value: string, styleId?: string, mergeAcross?: number) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  const merge = mergeAcross != null && mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : "";
  return `<Cell${style}${merge}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function cellNumber(value: number, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  const num = Number.isFinite(value) ? String(value) : "0";
  return `<Cell${style}><Data ss:Type="Number">${num}</Data></Cell>`;
}

/** Fórmula em R1C1 (SpreadsheetML) — sem aspas. */
function cellFormula(formula: string, cachedValue: number, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  const num = Number.isFinite(cachedValue) ? String(cachedValue) : "0";
  return `<Cell${style} ss:Formula="=${formula}"><Data ss:Type="Number">${num}</Data></Cell>`;
}

function emptyCell(styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="String"></Data></Cell>`;
}

function emptyCells(count: number, styleId?: string) {
  return Array.from({ length: count }, () => emptyCell(styleId)).join("");
}

export function buildOrcamentoExcelXml(options: OrcamentoExcelOptions) {
  const mergeAcross = 7;
  const numero = options.numeroInterno?.trim() || "—";
  const itemCount = options.items.length;
  // Layout fixo do protótipo:
  // 1 título, 2 subtítulo, 3–8 meta+cálculos, 9 vazio, 10 cabeçalho, 11… dados, última TOTAL
  const firstDataRow = 11;
  const lastDataRow = firstDataRow + itemCount - 1;
  const totalRow = lastDataRow + 1;

  const saleTotal = options.items.reduce(
    (sum, item) => sum + item.quantidade * item.valorUnitario,
    0,
  );
  const cmcTotal = options.items.reduce((sum, item) => {
    const cmc = item.cmc != null && Number.isFinite(item.cmc) ? item.cmc : 0;
    return sum + item.quantidade * cmc;
  }, 0);

  const encargosVal = saleTotal * DEFAULT_ENCARGOS;
  const comissaoVal = saleTotal * DEFAULT_COMISSAO;
  const despExtrasVal = DEFAULT_DESP_EXTRAS;
  const subTotalCalc = encargosVal + comissaoVal + despExtrasVal;
  const descontoVal = -(saleTotal * DEFAULT_DESCONTO);
  const lucroVal = saleTotal + descontoVal - cmcTotal - subTotalCalc;
  const lucroPct = saleTotal > 0 ? lucroVal / saleTotal : 0;

  // R1C1 absoluto para a linha TOTAL (H = C8, F = C6)
  const hTotal = `R${totalRow}C8`;
  const fTotal = `R${totalRow}C6`;

  const metaLeft: Array<[string, string]> = [
    ["Nº orçamento", numero],
    ["CNPJ empresa", options.empresaCnpj?.trim() || "—"],
    ["Cliente", options.clienteNome],
    ["CNPJ/CPF cliente", options.clienteCnpj?.trim() || "—"],
    ["Elaborado por", options.criadoPor?.trim() || "—"],
  ];

  // Linha 3: só bloco de cálculo (Encargos)
  const row3 = `<Row ss:AutoFitHeight="0" ss:Height="20">${emptyCells(3)}${cellNumber(
    DEFAULT_ENCARGOS,
    "inputPct",
  )}${cellString("Encargos", "calcLabel")}${cellFormula(
    `RC[-2]*${hTotal}`,
    encargosVal,
    "calcMoney",
  )}${emptyCells(2)}</Row>`;

  // Linhas 4–8: meta à esquerda + cálculos à direita
  const calcRows = [
    // 4 Comissão
    {
      pct: cellNumber(DEFAULT_COMISSAO, "inputPct"),
      label: cellString("Comissão", "calcLabel"),
      value: cellFormula(`RC[-2]*${hTotal}`, comissaoVal, "calcMoney"),
    },
    // 5 Desp. Extras — % automático (F5/Htotal), valor editável
    {
      pct: cellFormula(`RC[2]/${hTotal}`, saleTotal > 0 ? despExtrasVal / saleTotal : 0, "calcPct"),
      label: cellString("Desp. Extras", "calcLabel"),
      value: cellNumber(despExtrasVal, "inputMoney"),
    },
    // 6 SubTotal
    {
      pct: cellString("SubTotal", "calcSubLabel"),
      label: emptyCell("calcSubFill"),
      value: cellFormula("SUM(R[-3]C:R[-1]C)", subTotalCalc, "calcSubMoney"),
    },
    // 7 Desconto
    {
      pct: cellNumber(DEFAULT_DESCONTO, "inputPctDiscount"),
      label: cellString("Desconto", "calcDiscountLabel"),
      value: cellFormula(`-${hTotal}*RC[-2]`, descontoVal, "calcDiscountMoney"),
    },
    // 8 Lucro
    {
      pct: cellFormula(`RC[2]/${hTotal}`, lucroPct, "calcLucroPct"),
      label: cellString("Lucro", "calcLucroLabel"),
      value: cellFormula(
        `(${hTotal}+R[-1]C)-(${fTotal}+R[-2]C)`,
        lucroVal,
        "calcLucroMoney",
      ),
    },
  ];

  const metaCalcXml = calcRows
    .map((calc, index) => {
      const [label, value] = metaLeft[index]!;
      return `<Row ss:AutoFitHeight="0" ss:Height="20">${cellString(label, "metaLabel")}${cellString(
        value,
        "metaValue",
      )}${emptyCell()}${calc.pct}${calc.label}${calc.value}${emptyCells(2)}</Row>`;
    })
    .join("\n      ");

  const headerXml = `<Row ss:AutoFitHeight="0" ss:Height="24">${[
    "Produto",
    "Código",
    "Unidade",
    "Qtd",
    "CMC",
    "CMC Subt.",
    "Unitário",
    "Subtotal",
  ]
    .map((h) => cellString(h, "colHeader"))
    .join("")}</Row>`;

  const rowsXml = options.items
    .map((item, index) => {
      const rowStyle = index % 2 === 0 ? "rowEven" : "rowOdd";
      const numStyle = index % 2 === 0 ? "numEven" : "numOdd";
      const codeStyle = index % 2 === 0 ? "codeEven" : "codeOdd";
      const moneyStyle = index % 2 === 0 ? "moneyEven" : "moneyOdd";
      const cmc = item.cmc != null && Number.isFinite(item.cmc) ? item.cmc : 0;
      const cmcSub = item.quantidade * cmc;
      const subtotal = item.quantidade * item.valorUnitario;
      return `<Row ss:AutoFitHeight="0" ss:Height="20">${[
        cellString(item.descricao, rowStyle),
        cellNumber(item.codigoProduto, codeStyle),
        cellString(item.unidade || "UN", rowStyle),
        cellNumber(item.quantidade, numStyle),
        cellNumber(cmc, moneyStyle),
        cellFormula("RC[-2]*RC[-1]", cmcSub, moneyStyle),
        cellNumber(item.valorUnitario, moneyStyle),
        cellFormula("RC[-4]*RC[-1]", subtotal, moneyStyle),
      ].join("")}</Row>`;
    })
    .join("\n      ");

  const totalXml =
    options.showTotal && itemCount > 0
      ? `<Row ss:AutoFitHeight="0" ss:Height="24">${[
          cellString("TOTAL", "totalLabel"),
          emptyCell("totalFill"),
          emptyCell("totalFill"),
          emptyCell("totalFill"),
          emptyCell("totalFill"),
          cellFormula(`SUM(R${firstDataRow}C6:R${lastDataRow}C6)`, cmcTotal, "totalMoney"),
          emptyCell("totalFill"),
          cellFormula(`SUM(R${firstDataRow}C8:R${lastDataRow}C8)`, saleTotal, "totalMoney"),
        ].join("")}</Row>`
      : "";

  const obsXml = options.observacao?.trim()
    ? `<Row/><Row ss:AutoFitHeight="0" ss:Height="20">${cellString(
        "Observação",
        "metaLabel",
      )}${cellString(options.observacao.trim(), "metaValue", 6)}</Row>`
    : "";

  const servicosList = (options.servicosMensais ?? []).filter(
    (s) => s.nome.trim() && Number.isFinite(s.valor),
  );
  const totalServicosMensais = servicosList.reduce((sum, s) => {
    const qtd = s.quantidade != null && s.quantidade > 0 ? s.quantidade : 1;
    return sum + qtd * s.valor;
  }, 0);
  const servicoXml = servicosList.length
    ? `<Row/>${servicosList
        .map((s, index) => {
          const qtd = s.quantidade != null && s.quantidade > 0 ? s.quantidade : 1;
          const subtotal = qtd * s.valor;
          return `<Row ss:AutoFitHeight="0" ss:Height="20">${cellString(
            index === 0 ? "Serviço mensal" : "",
            "metaLabel",
          )}${cellString(s.nome.trim(), "metaValue", 2)}${cellNumber(
            qtd,
            "numEven",
          )}${cellNumber(s.valor, "moneyEven")}${cellNumber(
            subtotal,
            "moneyEven",
          )}${cellString("/ mês", "metaValue")}</Row>`;
        })
        .join("\n      ")}<Row ss:AutoFitHeight="0" ss:Height="20">${cellString(
        "Total mensal",
        "metaLabel",
      )}${emptyCells(4)}${cellNumber(totalServicosMensais, "totalMoney")}${cellString(
        "/ mês",
        "metaValue",
      )}</Row>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>${escapeXml(
      buildOrcamentoFileBaseName({
        numeroInterno: options.numeroInterno,
        clienteNome: options.clienteNome,
      }),
    )}</Title>
    <Author>${escapeXml(options.empresaNome)}</Author>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
    </Style>
    <Style ss:ID="title">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0B3D5C" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="subtitle">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0B3D5C"/>
      <Interior ss:Color="#E8F1F6" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="metaLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0B3D5C"/>
    </Style>
    <Style ss:ID="metaValue">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
    </Style>
    <Style ss:ID="inputPct">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.00%"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
      </Borders>
    </Style>
    <Style ss:ID="inputMoney">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00;&quot;R$&quot;\\ -#,##0.00;&quot;R$&quot;\\ -"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
      </Borders>
    </Style>
    <Style ss:ID="inputPctDiscount">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F8CBAD" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0%"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E59A7A"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E59A7A"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E59A7A"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E59A7A"/>
      </Borders>
    </Style>
    <Style ss:ID="calcLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
    </Style>
    <Style ss:ID="calcMoney">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00;&quot;R$&quot;\\ -#,##0.00;&quot;R$&quot;\\ -"/>
    </Style>
    <Style ss:ID="calcPct">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <NumberFormat ss:Format="0.00%"/>
    </Style>
    <Style ss:ID="calcSubLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="calcSubFill">
      <Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="calcSubMoney">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00;&quot;R$&quot;\\ -#,##0.00;&quot;R$&quot;\\ -"/>
    </Style>
    <Style ss:ID="calcDiscountLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F8CBAD" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="calcDiscountMoney">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F8CBAD" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00;&quot;R$&quot;\\ -#,##0.00;&quot;R$&quot;\\ -"/>
    </Style>
    <Style ss:ID="calcLucroPct">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.00%"/>
    </Style>
    <Style ss:ID="calcLucroLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="calcLucroMoney">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00;&quot;R$&quot;\\ -#,##0.00;&quot;R$&quot;\\ -"/>
    </Style>
    <Style ss:ID="colHeader">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0B3D5C" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="rowEven">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="rowOdd">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F7FAFC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="numEven">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0.00"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="numOdd">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F7FAFC" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0.00"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="codeEven">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="General"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="codeOdd">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F7FAFC" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="General"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="moneyEven">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="moneyOdd">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1C1B1F"/>
      <Interior ss:Color="#F7FAFC" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8EEF2"/>
      </Borders>
    </Style>
    <Style ss:ID="totalLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0B3D5C" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="totalFill">
      <Interior ss:Color="#0B3D5C" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="totalMoney">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0B3D5C" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Orçamento">
    <Table ss:DefaultRowHeight="18">
      <Column ss:Width="260"/>
      <Column ss:Width="160"/>
      <Column ss:Width="55"/>
      <Column ss:Width="70"/>
      <Column ss:Width="90"/>
      <Column ss:Width="95"/>
      <Column ss:Width="85"/>
      <Column ss:Width="95"/>
      <Row ss:AutoFitHeight="0" ss:Height="32">
        ${cellString("ORÇAMENTO", "title", mergeAcross)}
      </Row>
      <Row ss:AutoFitHeight="0" ss:Height="22">
        ${cellString(
          `${options.empresaNome}  ·  ${numero === "—" ? "Sem número" : numero}`,
          "subtitle",
          mergeAcross,
        )}
      </Row>
      ${row3}
      ${metaCalcXml}
      <Row/>
      ${headerXml}
      ${rowsXml}
      ${totalXml}
      ${servicoXml}
      ${obsXml}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>10</SplitHorizontal>
      <TopRowBottomPane>10</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
}

export function downloadOrcamentoExcel(options: OrcamentoExcelOptions) {
  if (!options.items.length) {
    throw new Error("Inclua ao menos um produto para exportar o Excel.");
  }
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }

  const xml = buildOrcamentoExcelXml(options);
  const blob = new Blob([`\uFEFF${xml}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${buildOrcamentoFileBaseName({
    numeroInterno: options.numeroInterno,
    clienteNome: options.clienteNome,
  })}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
