import { formatBRL, itemLabel, uniformConditionLabel } from "@/lib/uniformes-domain";

type TermoItem = {
  direcao: "saida" | "entrada";
  condicao: string | null;
  descricao: string;
  tamanho: string | null;
  quantidade: number;
  custoUnitario: number;
  proximaTroca: string | null;
};

type TermoMovement = {
  id: number;
  tipoLabel: string;
  createdAt: string;
  createdByName: string | null;
  observacao: string | null;
  status: string;
  collaboratorNome: string;
  collaboratorMatricula: string | null;
  collaboratorDepartamento: string | null;
  collaboratorCargo: string | null;
  items: TermoItem[];
};

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dateBr(value: string | null) {
  if (!value) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; font-size: 13px; }
  h1 { font-size: 18px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .5px; }
  h2 { font-size: 14px; margin: 24px 0 8px; }
  .muted { color: #555; }
  .box { border: 1px solid #ccc; border-radius: 6px; padding: 12px; margin-top: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; font-size: 12px; }
  .right { text-align: right; }
  .clause { margin-top: 16px; line-height: 1.5; text-align: justify; }
  .sign { margin-top: 32px; display: flex; gap: 48px; }
  .sign div { flex: 1; text-align: center; }
  .sign img { max-height: 90px; max-width: 100%; }
  .line { border-top: 1px solid #111; margin-top: 4px; padding-top: 4px; }
  .stamp { display: inline-block; border: 2px solid #b91c1c; color: #b91c1c; padding: 2px 10px; font-weight: bold; margin-top: 8px; }
  @media print { body { margin: 16mm; } .noprint { display: none; } }
`;

function openPrintWindow(title: string, body: string) {
  if (typeof window === "undefined") throw new Error("Impressão disponível apenas no navegador.");
  const win = window.open("", "_blank");
  if (!win) throw new Error("Libere pop-ups para imprimir o termo.");
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
    <title>${esc(title)}</title><style>${PRINT_CSS}</style></head>
    <body>
      <div class="noprint" style="margin-bottom:16px">
        <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">Imprimir / Salvar PDF</button>
      </div>
      ${body}
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function collaboratorBlock(m: {
  collaboratorNome: string;
  collaboratorMatricula: string | null;
  collaboratorDepartamento: string | null;
  collaboratorCargo: string | null;
}) {
  return `<div class="box grid">
    <div><strong>Colaborador:</strong> ${esc(m.collaboratorNome)}</div>
    <div><strong>Matrícula:</strong> ${esc(m.collaboratorMatricula ?? "—")}</div>
    <div><strong>Setor/Posto:</strong> ${esc(m.collaboratorDepartamento ?? "—")}</div>
    <div><strong>Cargo:</strong> ${esc(m.collaboratorCargo ?? "—")}</div>
  </div>`;
}

function itemsTable(items: TermoItem[], title: string, showCondition: boolean) {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (i) => `<tr>
        <td>${esc(itemLabel(i.descricao, i.tamanho))}</td>
        <td class="right">${i.quantidade}</td>
        ${showCondition ? `<td>${esc(uniformConditionLabel(i.condicao))}</td>` : `<td>${esc(dateBr(i.proximaTroca))}</td>`}
        <td class="right">${esc(formatBRL(i.custoUnitario))}</td>
        <td class="right">${esc(formatBRL(i.custoUnitario * i.quantidade))}</td>
      </tr>`,
    )
    .join("");
  return `<h2>${esc(title)}</h2>
    <table>
      <thead><tr><th>Peça</th><th class="right">Qtd</th><th>${showCondition ? "Condição" : "Próxima troca"}</th><th class="right">Valor unit.</th><th class="right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function printUniformTermo(movement: TermoMovement, assinatura: string | null, empresa: string) {
  const saidas = movement.items.filter((i) => i.direcao === "saida");
  const entradas = movement.items.filter((i) => i.direcao === "entrada");
  const clause =
    saidas.length > 0
      ? `Declaro ter recebido de <strong>${esc(empresa)}</strong> as peças de uniforme relacionadas acima, em perfeito estado de conservação,
         comprometendo-me a utilizá-las exclusivamente durante o exercício de minhas funções, zelar por sua guarda e conservação,
         e devolvê-las quando solicitado ou no desligamento. Estou ciente de que, em caso de perda, extravio ou dano por mau uso,
         poderá ser descontado o valor correspondente, nos termos do art. 462, §1º da CLT.`
      : `Declaro ter devolvido a <strong>${esc(empresa)}</strong> as peças de uniforme relacionadas acima, na condição indicada.`;

  openPrintWindow(
    `Termo ${movement.id} — ${movement.collaboratorNome}`,
    `<h1>Termo de ${saidas.length > 0 ? "responsabilidade e entrega" : "devolução"} de uniforme</h1>
     <div class="muted">${esc(empresa)} · ${esc(movement.tipoLabel)} nº ${movement.id} · ${esc(dateBr(movement.createdAt))}</div>
     ${movement.status === "estornado" ? `<div class="stamp">ESTORNADO</div>` : ""}
     ${collaboratorBlock(movement)}
     ${itemsTable(saidas, "Peças entregues", false)}
     ${itemsTable(entradas, "Peças devolvidas", true)}
     ${movement.observacao ? `<p><strong>Observações:</strong> ${esc(movement.observacao)}</p>` : ""}
     <p class="clause">${clause}</p>
     <div class="sign">
       <div>
         ${assinatura ? `<img src="${assinatura}" alt="Assinatura"/>` : `<div style="height:90px"></div>`}
         <div class="line">${esc(movement.collaboratorNome)}</div>
       </div>
       <div>
         <div style="height:90px"></div>
         <div class="line">${esc(movement.createdByName ?? "Responsável")} (responsável)</div>
       </div>
     </div>`,
  );
}

export function printUniformFicha(input: {
  empresa: string;
  collaborator: {
    nome: string;
    matricula: string | null;
    departamento: string | null;
    cargo: string | null;
    tamanhoCamisa: string | null;
    tamanhoCalca: string | null;
    tamanhoCalcado: string | null;
  };
  holdings: Array<{ descricao: string; tamanho: string | null; quantidade: number; ultimaEntrega: string | null; proximaTroca: string | null }>;
  movements: Array<{ id: number; tipoLabel: string; createdAt: string; status: string; items: TermoItem[] }>;
}) {
  const c = input.collaborator;
  const posse = input.holdings.length
    ? `<table><thead><tr><th>Peça</th><th class="right">Qtd</th><th>Última entrega</th><th>Próxima troca</th></tr></thead><tbody>
        ${input.holdings
          .map(
            (h) => `<tr><td>${esc(itemLabel(h.descricao, h.tamanho))}</td><td class="right">${h.quantidade}</td>
              <td>${esc(dateBr(h.ultimaEntrega))}</td><td>${esc(dateBr(h.proximaTroca))}</td></tr>`,
          )
          .join("")}
      </tbody></table>`
    : `<p class="muted">Nenhuma peça em posse.</p>`;
  const historico = input.movements.length
    ? `<table><thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Peças</th></tr></thead><tbody>
        ${input.movements
          .map(
            (m) => `<tr><td>${m.id}</td><td>${esc(dateBr(m.createdAt))}</td>
              <td>${esc(m.tipoLabel)}${m.status === "estornado" ? " (estornado)" : ""}</td>
              <td>${m.items
                .map((i) => `${i.direcao === "saida" ? "↗" : "↙"} ${i.quantidade}× ${esc(itemLabel(i.descricao, i.tamanho))}`)
                .join("<br/>")}</td></tr>`,
          )
          .join("")}
      </tbody></table>`
    : `<p class="muted">Sem movimentações.</p>`;

  openPrintWindow(
    `Ficha de uniformes — ${c.nome}`,
    `<h1>Ficha de controle de uniformes</h1>
     <div class="muted">${esc(input.empresa)} · emitida em ${esc(new Date().toLocaleString("pt-BR"))}</div>
     ${collaboratorBlock({
       collaboratorNome: c.nome,
       collaboratorMatricula: c.matricula,
       collaboratorDepartamento: c.departamento,
       collaboratorCargo: c.cargo,
     })}
     <div class="box grid">
       <div><strong>Camisa:</strong> ${esc(c.tamanhoCamisa ?? "—")}</div>
       <div><strong>Calça:</strong> ${esc(c.tamanhoCalca ?? "—")}</div>
       <div><strong>Calçado:</strong> ${esc(c.tamanhoCalcado ?? "—")}</div>
     </div>
     <h2>Peças em posse</h2>${posse}
     <h2>Histórico</h2>${historico}`,
  );
}

// ---------- Excel (SpreadsheetML) ----------

function xml(value: string) {
  return esc(value);
}

function cs(value: string | null | undefined, style?: string) {
  const s = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${s}><Data ss:Type="String">${xml(value ?? "")}</Data></Cell>`;
}

function cn(value: number, style?: string) {
  const s = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${s}><Data ss:Type="Number">${Number.isFinite(value) ? value : 0}</Data></Cell>`;
}

function sheet(name: string, header: string[], rows: string[]) {
  return `<Worksheet ss:Name="${xml(name)}"><Table>
    <Row>${header.map((h) => cs(h, "H")).join("")}</Row>
    ${rows.map((r) => `<Row>${r}</Row>`).join("\n")}
  </Table></Worksheet>`;
}

export type UniformExcelInput = {
  periodo: string;
  movements: Array<TermoMovement & { collaboratorDepartamento: string | null }>;
  items: Array<{ nome: string; categoria: string | null; tamanho: string | null; quantidade: number; estoqueMinimo: number; custo: number; vidaUtilMeses: number | null; active: boolean }>;
  holdings: Array<{ collaboratorNome: string; departamento: string | null; descricao: string; tamanho: string | null; quantidade: number; ultimaEntrega: string | null; proximaTroca: string | null }>;
  stockMoves: Array<{ createdAt: string; itemNome: string; itemTamanho: string | null; tipoLabel: string; quantidade: number; saldoApos: number; custoUnitario: number | null; fornecedor: string | null; documento: string | null; motivo: string | null; createdByName: string | null }>;
};

export function downloadUniformesExcel(input: UniformExcelInput) {
  if (typeof document === "undefined") throw new Error("Exportação disponível apenas no navegador.");
  const movRows = input.movements.flatMap((m) =>
    m.items.map(
      (i) =>
        cs(dateBr(m.createdAt)) +
        cn(m.id) +
        cs(m.tipoLabel) +
        cs(m.status === "estornado" ? "Estornado" : "Ativo") +
        cs(m.collaboratorNome) +
        cs(m.collaboratorMatricula) +
        cs(m.collaboratorDepartamento) +
        cs(i.direcao === "saida" ? "Saída" : "Entrada") +
        cs(i.descricao) +
        cs(i.tamanho) +
        cn(i.quantidade) +
        cn(i.custoUnitario, "M") +
        cn(i.custoUnitario * i.quantidade, "M") +
        cs(uniformConditionLabel(i.condicao)) +
        cs(dateBr(i.proximaTroca)) +
        cs(m.createdByName) +
        cs(m.observacao),
    ),
  );
  const itemRows = input.items.map(
    (i) =>
      cs(i.nome) +
      cs(i.categoria) +
      cs(i.tamanho) +
      cn(i.quantidade) +
      cn(i.estoqueMinimo) +
      cn(i.custo, "M") +
      cn(i.custo * i.quantidade, "M") +
      cs(i.vidaUtilMeses ? `${i.vidaUtilMeses} meses` : "") +
      cs(!i.active ? "Inativa" : i.quantidade <= i.estoqueMinimo ? "Estoque baixo" : "OK"),
  );
  const holdRows = input.holdings.map(
    (h) =>
      cs(h.collaboratorNome) +
      cs(h.departamento) +
      cs(h.descricao) +
      cs(h.tamanho) +
      cn(h.quantidade) +
      cs(dateBr(h.ultimaEntrega)) +
      cs(dateBr(h.proximaTroca)),
  );
  const stockRows = input.stockMoves.map(
    (s) =>
      cs(dateBr(s.createdAt)) +
      cs(s.itemNome) +
      cs(s.itemTamanho) +
      cs(s.tipoLabel) +
      cn(s.quantidade) +
      cn(s.saldoApos) +
      cn(s.custoUnitario ?? 0, "M") +
      cs(s.fornecedor) +
      cs(s.documento) +
      cs(s.motivo) +
      cs(s.createdByName),
  );

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="H"><Font ss:Bold="1"/><Interior ss:Color="#F3F3F3" ss:Pattern="Solid"/></Style>
    <Style ss:ID="M"><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/></Style>
  </Styles>
  ${sheet(
    "Movimentacoes",
    ["Data", "Nº", "Tipo", "Status", "Colaborador", "Matrícula", "Setor", "Direção", "Peça", "Tamanho", "Qtd", "Custo unit.", "Total", "Condição", "Próxima troca", "Registrado por", "Observação"],
    movRows,
  )}
  ${sheet(
    "Estoque",
    ["Peça", "Categoria", "Tamanho", "Saldo", "Mínimo", "Custo médio", "Valor em estoque", "Vida útil", "Situação"],
    itemRows,
  )}
  ${sheet(
    "Em posse",
    ["Colaborador", "Setor", "Peça", "Tamanho", "Qtd", "Última entrega", "Próxima troca"],
    holdRows,
  )}
  ${sheet(
    "Historico estoque",
    ["Data", "Peça", "Tamanho", "Tipo", "Qtd", "Saldo após", "Custo unit.", "Fornecedor", "Documento", "Motivo", "Usuário"],
    stockRows,
  )}
</Workbook>`;

  const blob = new Blob([`\uFEFF${content}`], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Uniformes-${input.periodo.replace(/[^\w-]+/g, "_")}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
