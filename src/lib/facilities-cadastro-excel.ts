import {
  FACILITIES_EMPRESAS,
  FACILITIES_ESCALAS,
  FACILITIES_FUNCOES,
  type FacilitiesEmpresaId,
  type FacilitiesEscalaId,
  type FacilitiesFuncaoId,
  isFacilitiesEmpresaId,
  isFacilitiesEscalaId,
  isFacilitiesFuncaoId,
} from "@/lib/facilities-domain";

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

function row(cells: string) {
  return `<Row>${cells}</Row>`;
}

function buildWorksheet(name: string, rowsXml: string, columnCount: number) {
  const cols = Array.from({ length: columnCount }, (_, i) => {
    const width = i === 0 ? 140 : 120;
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

function buildWorkbook(worksheets: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1"/></Style>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="12"/></Style>
  </Styles>
  ${worksheets}
</Workbook>`;
}

function downloadXml(filename: string, xml: string) {
  if (typeof document === "undefined") {
    throw new Error("Download disponível apenas no navegador.");
  }
  const blob = new Blob([`\uFEFF${xml}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadFacilitiesPostsModeloExcel() {
  const dados = [
    row(
      cellString("Nome", "Header") +
        cellString("Endereco", "Header") +
        cellString("Cidade", "Header") +
        cellString("Observacao", "Header"),
    ),
    row(
      cellString("Exemplo Condomínio Aurora") +
        cellString("Rua das Flores, 100") +
        cellString("São Paulo") +
        cellString("Portaria principal"),
    ),
    row(cellString("Exemplo Edifício Centro") + cellString("") + cellString("Campinas") + cellString("")),
  ].join("\n");

  const instrucoes = [
    row(cellString("Importação de postos de serviço", "Title")),
    row(""),
    row(cellString("1. Preencha a aba Dados (uma linha por posto).")),
    row(cellString("2. Nome é obrigatório. Endereço, cidade e observação são opcionais.")),
    row(cellString("3. Remova as linhas de exemplo antes de importar (ou deixe — nomes começando com 'Exemplo' serão ignorados).")),
    row(cellString("4. Salve o arquivo como .xls (Excel XML) ou CSV (.csv) e use Importar Excel em Cadastros.")),
    row(cellString("5. Postos com o mesmo nome (já cadastrados) serão ignorados.")),
  ].join("\n");

  const xml = buildWorkbook(
    buildWorksheet("Dados", dados, 4) + buildWorksheet("Instrucoes", instrucoes, 1),
  );
  downloadXml("Facilities-Modelo-Postos.xls", xml);
}

export function downloadFacilitiesCollaboratorsModeloExcel() {
  const dados = [
    row(
      cellString("Nome", "Header") +
        cellString("Empresa", "Header") +
        cellString("Funcao", "Header") +
        cellString("Escala", "Header") +
        cellString("Posto base", "Header") +
        cellString("Telefone", "Header"),
    ),
    row(
      cellString("Exemplo João Silva") +
        cellString("Âncora") +
        cellString("Vigilante") +
        cellString("12x36 Diurno") +
        cellString("Exemplo Condomínio Aurora") +
        cellString("11999990000"),
    ),
    row(
      cellString("Exemplo Maria Souza") +
        cellString("Angela") +
        cellString("Recepcionista") +
        cellString("Horário comercial") +
        cellString("") +
        cellString(""),
    ),
  ].join("\n");

  const empresas = FACILITIES_EMPRESAS.map((e) =>
    row(cellString(e.label) + cellString(e.id)),
  ).join("\n");
  const funcoes = FACILITIES_FUNCOES.map((e) =>
    row(cellString(e.label) + cellString(e.id)),
  ).join("\n");
  const escalas = FACILITIES_ESCALAS.map((e) =>
    row(cellString(e.label) + cellString(e.id)),
  ).join("\n");

  const instrucoes = [
    row(cellString("Importação de colaboradores", "Title")),
    row(""),
    row(cellString("1. Preencha a aba Dados (uma linha por colaborador).")),
    row(cellString("2. Obrigatórios: Nome, Empresa, Função, Escala.")),
    row(cellString("3. Posto base e Telefone são opcionais. Posto base deve bater com o nome do posto já cadastrado.")),
    row(cellString("4. Use os valores das abas Empresa / Funcao / Escala (rótulo ou código).")),
    row(
      cellString(
        `Empresas: ${FACILITIES_EMPRESAS.map((e) => e.label).join(", ")}.`,
      ),
    ),
    row(
      cellString(
        `Funções: ${FACILITIES_FUNCOES.map((e) => e.label).join(", ")}.`,
      ),
    ),
    row(
      cellString(
        `Escalas: ${FACILITIES_ESCALAS.map((e) => e.label).join(", ")}.`,
      ),
    ),
    row(cellString("5. Remova as linhas de exemplo (ou deixe — nomes começando com 'Exemplo' serão ignorados).")),
    row(cellString("6. Salve como .xls (Excel XML) ou CSV e use Importar Excel em Cadastros.")),
    row(cellString("7. Colaboradores com o mesmo nome (já cadastrados) serão ignorados.")),
  ].join("\n");

  const xml = buildWorkbook(
    buildWorksheet("Dados", dados, 6) +
      buildWorksheet("Instrucoes", instrucoes, 1) +
      buildWorksheet(
        "Empresa",
        row(cellString("Rotulo", "Header") + cellString("Codigo", "Header")) + "\n" + empresas,
        2,
      ) +
      buildWorksheet(
        "Funcao",
        row(cellString("Rotulo", "Header") + cellString("Codigo", "Header")) + "\n" + funcoes,
        2,
      ) +
      buildWorksheet(
        "Escala",
        row(cellString("Rotulo", "Header") + cellString("Codigo", "Header")) + "\n" + escalas,
        2,
      ),
  );
  downloadXml("Facilities-Modelo-Colaboradores.xls", xml);
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isExampleRow(nome: string) {
  return /^exemplo\b/i.test(nome.trim());
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const first = lines[0]!;
  const delimiter =
    (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length ? ";" : ",";
  return lines.map((line) => parseCsvLine(line, delimiter));
}

function parseSpreadsheetMlMatrix(xml: string): string[][] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Arquivo Excel XML inválido.");
  }
  const worksheets = Array.from(doc.getElementsByTagName("Worksheet"));
  const dados =
    worksheets.find((ws) => {
      const name = ws.getAttribute("ss:Name") ?? ws.getAttribute("Name") ?? "";
      return normalizeKey(name) === "dados" || normalizeKey(name) === "data";
    }) ?? worksheets[0];
  if (!dados) throw new Error("Planilha sem abas.");
  const table = dados.getElementsByTagName("Table")[0] ?? dados;
  const rows = Array.from(table.getElementsByTagName("Row"));
  return rows.map((rowEl) => {
    const cells = Array.from(rowEl.getElementsByTagName("Cell"));
    const values: string[] = [];
    let col = 0;
    for (const cell of cells) {
      const indexAttr = cell.getAttribute("ss:Index") ?? cell.getAttribute("Index");
      if (indexAttr) {
        const index = Number(indexAttr);
        if (Number.isFinite(index) && index > 0) {
          while (col < index - 1) {
            values.push("");
            col++;
          }
        }
      }
      const data = cell.getElementsByTagName("Data")[0];
      values.push((data?.textContent ?? "").trim());
      col++;
    }
    return values;
  });
}

export async function readFacilitiesSpreadsheetMatrix(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const text = await file.text();
  const trimmed = text.trimStart();
  if (
    name.endsWith(".csv") ||
    (!trimmed.startsWith("<") && !trimmed.startsWith("<?xml"))
  ) {
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
      throw new Error(
        "Use o modelo .xls baixado aqui, ou salve como CSV / Excel XML 2003 (.xls).",
      );
    }
    return parseCsvMatrix(text);
  }
  return parseSpreadsheetMlMatrix(text);
}

function headerIndex(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizeKey);
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    const idx = normalized.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

function cellAt(row: string[], index: number) {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

export type ParsedFacilitiesPostRow = {
  nome: string;
  endereco: string | null;
  cidade: string | null;
  observacao: string | null;
};

export type ParsedFacilitiesCollaboratorRow = {
  nome: string;
  empresa: FacilitiesEmpresaId;
  funcao: FacilitiesFuncaoId;
  escala: FacilitiesEscalaId;
  postoBaseNome: string | null;
  telefone: string | null;
};

export function parseFacilitiesPostsFromMatrix(matrix: string[][]): {
  rows: ParsedFacilitiesPostRow[];
  errors: string[];
} {
  if (matrix.length === 0) {
    return { rows: [], errors: ["Arquivo vazio."] };
  }
  const headerRow = matrix[0] ?? [];
  const nomeIdx = headerIndex(headerRow, ["nome", "posto", "posto de servico"]);
  if (nomeIdx < 0) {
    return { rows: [], errors: ["Coluna obrigatória 'Nome' não encontrada."] };
  }
  const enderecoIdx = headerIndex(headerRow, ["endereco", "endereço"]);
  const cidadeIdx = headerIndex(headerRow, ["cidade"]);
  const obsIdx = headerIndex(headerRow, ["observacao", "observação", "obs"]);

  const rows: ParsedFacilitiesPostRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    const nome = normalizeName(cellAt(line, nomeIdx));
    if (!nome || isExampleRow(nome)) continue;
    if (nome.length > 200) {
      errors.push(`Linha ${i + 1}: nome muito longo.`);
      continue;
    }
    rows.push({
      nome,
      endereco: normalizeName(cellAt(line, enderecoIdx)) || null,
      cidade: normalizeName(cellAt(line, cidadeIdx)) || null,
      observacao: normalizeName(cellAt(line, obsIdx)) || null,
    });
  }
  return { rows, errors };
}

function resolveEmpresa(raw: string): FacilitiesEmpresaId | null {
  const value = raw.trim();
  if (!value) return null;
  if (isFacilitiesEmpresaId(value)) return value;
  const key = normalizeKey(value);
  const byLabel = FACILITIES_EMPRESAS.find((e) => normalizeKey(e.label) === key);
  if (byLabel) return byLabel.id;
  if (key === "ancora" || key === "ancoras") return "ancora";
  return null;
}

function resolveFuncao(raw: string): FacilitiesFuncaoId | null {
  const value = raw.trim();
  if (!value) return null;
  if (isFacilitiesFuncaoId(value)) return value;
  const key = normalizeKey(value);
  const byLabel = FACILITIES_FUNCOES.find((e) => normalizeKey(e.label) === key);
  return byLabel?.id ?? null;
}

function resolveEscala(raw: string): FacilitiesEscalaId | null {
  const value = raw.trim();
  if (!value) return null;
  if (isFacilitiesEscalaId(value)) return value;
  const key = normalizeKey(value);
  const byLabel = FACILITIES_ESCALAS.find((e) => normalizeKey(e.label) === key);
  if (byLabel) return byLabel.id;
  if (key.includes("diurno")) return "12x36_diurno";
  if (key.includes("noturno")) return "12x36_noturno";
  if (key.includes("comercial") || key.includes("escritorio")) return "comercial";
  return null;
}

export function parseFacilitiesCollaboratorsFromMatrix(matrix: string[][]): {
  rows: ParsedFacilitiesCollaboratorRow[];
  errors: string[];
} {
  if (matrix.length === 0) {
    return { rows: [], errors: ["Arquivo vazio."] };
  }
  const headerRow = matrix[0] ?? [];
  const nomeIdx = headerIndex(headerRow, ["nome", "colaborador", "funcionario", "funcionário"]);
  const empresaIdx = headerIndex(headerRow, ["empresa"]);
  const funcaoIdx = headerIndex(headerRow, ["funcao", "função", "cargo"]);
  const escalaIdx = headerIndex(headerRow, ["escala", "turno", "jornada"]);
  const postoIdx = headerIndex(headerRow, [
    "posto base",
    "postobase",
    "posto",
    "posto de servico",
  ]);
  const telefoneIdx = headerIndex(headerRow, ["telefone", "fone", "celular", "whatsapp"]);

  if (nomeIdx < 0 || empresaIdx < 0 || funcaoIdx < 0 || escalaIdx < 0) {
    return {
      rows: [],
      errors: ["Cabeçalho incompleto. Use Nome, Empresa, Funcao e Escala."],
    };
  }

  const rows: ParsedFacilitiesCollaboratorRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    const nome = normalizeName(cellAt(line, nomeIdx));
    if (!nome || isExampleRow(nome)) continue;
    const empresa = resolveEmpresa(cellAt(line, empresaIdx));
    const funcao = resolveFuncao(cellAt(line, funcaoIdx));
    const escala = resolveEscala(cellAt(line, escalaIdx));
    if (!empresa) {
      errors.push(`Linha ${i + 1} (${nome}): empresa inválida.`);
      continue;
    }
    if (!funcao) {
      errors.push(`Linha ${i + 1} (${nome}): função inválida.`);
      continue;
    }
    if (!escala) {
      errors.push(`Linha ${i + 1} (${nome}): escala inválida.`);
      continue;
    }
    rows.push({
      nome,
      empresa,
      funcao,
      escala,
      postoBaseNome: normalizeName(cellAt(line, postoIdx)) || null,
      telefone: normalizeName(cellAt(line, telefoneIdx)).slice(0, 32) || null,
    });
  }
  return { rows, errors };
}
