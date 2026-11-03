/** Tipos de relatório (client-safe — não importa db server-only). */

export type TerceiroReportDetailInput = {
  nome: string;
  documento: string | null;
  contato: string | null;
  observacao: string;
  active: boolean;
  monitoramento: {
    qtdContas: number;
    precoUnitario: number;
    observacao: string;
  };
  contasExcecao: Array<{
    identificador: string;
    valor: number;
    observacao: string;
    active: boolean;
  }>;
  contasProporcionais?: Array<{
    identificador: string;
    valorBaseTipo: "padrao" | "particularidade";
    valorMensal: number;
    dataInicio: string;
    dataFim: string;
    dias: number;
    valorProporcional: number;
    observacao: string;
    status: "aberta" | "lancada";
  }>;
  servicos: Array<{
    nome: string;
    quantidade: number;
    valor: number;
    observacao: string;
    active: boolean;
    subtotal: number;
  }>;
  totais: {
    monitoramentoPadrao: number;
    contasExcecao: number;
    outrosServicos: number;
    contasProporcionais?: number;
    totalMensal: number;
    qtdContasPadrao: number;
    qtdContasExcecao: number;
    qtdContasProporcionais?: number;
    qtdContasTotal: number;
  };
};

export type TerceiroReportListItem = {
  nome: string;
  documento: string | null;
  contato: string | null;
  active: boolean;
  totais: TerceiroReportDetailInput["totais"];
};

export type TerceiroReportLine = {
  grupo: string;
  item: string;
  detalhe: string;
  quantidade: number | null;
  valorUnitario: number | null;
  subtotal: number;
};

export type TerceiroReport = {
  titulo: string;
  emitidoEm: string;
  empresaNome: string;
  documento: string | null;
  contato: string | null;
  observacao: string;
  active: boolean;
  qtdContasTotal: number;
  qtdContasPadrao: number;
  qtdContasExcecao: number;
  linhas: TerceiroReportLine[];
  monitoramentoPadrao: number;
  contasExcecao: number;
  outrosServicos: number;
  contasProporcionais: number;
  totalMensal: number;
};

export type TerceiroConsolidadoReport = {
  titulo: string;
  emitidoEm: string;
  itens: Array<{
    nome: string;
    documento: string | null;
    contato: string | null;
    qtdContasTotal: number;
    qtdContasPadrao: number;
    qtdContasExcecao: number;
    monitoramentoPadrao: number;
    contasExcecao: number;
    outrosServicos: number;
    contasProporcionais: number;
    totalMensal: number;
    active: boolean;
  }>;
  totalGeral: number;
  totalContas: number;
};

function todayBr() {
  return new Date().toLocaleDateString("pt-BR");
}

export function formatTerceiroMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function buildTerceiroReport(detail: TerceiroReportDetailInput): TerceiroReport {
  const linhas: TerceiroReportLine[] = [];
  const mon = detail.monitoramento;
  const totais = detail.totais;

  if (totais.qtdContasPadrao > 0 || mon.precoUnitario > 0) {
    linhas.push({
      grupo: "Preço comum",
      item: "Contas no preço unitário padrão",
      detalhe: mon.observacao || "Cobrança padrão (sem particularidades)",
      quantidade: totais.qtdContasPadrao,
      valorUnitario: mon.precoUnitario,
      subtotal: totais.monitoramentoPadrao,
    });
  }

  for (const conta of detail.contasExcecao.filter((c) => c.active)) {
    linhas.push({
      grupo: "Particularidades",
      item: conta.identificador,
      detalhe: conta.observacao || "Cobrada à parte",
      quantidade: 1,
      valorUnitario: conta.valor,
      subtotal: conta.valor,
    });
  }

  for (const prop of (detail.contasProporcionais ?? []).filter((c) => c.status === "aberta")) {
    linhas.push({
      grupo: "Proporcional",
      item: prop.identificador,
      detalhe: `${prop.dataInicio} a ${prop.dataFim} (${prop.dias} dia(s)) · base ${
        prop.valorBaseTipo === "padrao" ? "preço comum" : "particularidade"
      }${prop.observacao ? ` — ${prop.observacao}` : ""}`,
      quantidade: prop.dias,
      valorUnitario: prop.valorMensal,
      subtotal: prop.valorProporcional,
    });
  }

  for (const svc of detail.servicos.filter((s) => s.active)) {
    linhas.push({
      grupo: "Outros serviços",
      item: svc.nome,
      detalhe: svc.observacao || "",
      quantidade: svc.quantidade,
      valorUnitario: svc.valor,
      subtotal: svc.subtotal,
    });
  }

  return {
    titulo: `Cobrança mensal — ${detail.nome}`,
    emitidoEm: todayBr(),
    empresaNome: detail.nome,
    documento: detail.documento,
    contato: detail.contato,
    observacao: detail.observacao,
    active: detail.active,
    qtdContasTotal: totais.qtdContasTotal,
    qtdContasPadrao: totais.qtdContasPadrao,
    qtdContasExcecao: totais.qtdContasExcecao,
    linhas,
    monitoramentoPadrao: totais.monitoramentoPadrao,
    contasExcecao: totais.contasExcecao,
    outrosServicos: totais.outrosServicos,
    contasProporcionais: totais.contasProporcionais ?? 0,
    totalMensal: totais.totalMensal,
  };
}

export function buildTerceirosConsolidadoReport(
  items: TerceiroReportListItem[],
  opts?: { onlyActive?: boolean },
): TerceiroConsolidadoReport {
  const onlyActive = opts?.onlyActive !== false;
  const filtered = items.filter((item) => (onlyActive ? item.active : true));
  return {
    titulo: "Relatório consolidado — Terceiros",
    emitidoEm: todayBr(),
    itens: filtered.map((item) => ({
      nome: item.nome,
      documento: item.documento,
      contato: item.contato,
      qtdContasTotal: item.totais.qtdContasTotal,
      qtdContasPadrao: item.totais.qtdContasPadrao,
      qtdContasExcecao: item.totais.qtdContasExcecao,
      monitoramentoPadrao: item.totais.monitoramentoPadrao,
      contasExcecao: item.totais.contasExcecao,
      outrosServicos: item.totais.outrosServicos,
      contasProporcionais: item.totais.contasProporcionais ?? 0,
      totalMensal: item.totais.totalMensal,
      active: item.active,
    })),
    totalGeral: filtered.reduce((sum, item) => sum + item.totais.totalMensal, 0),
    totalContas: filtered.reduce((sum, item) => sum + item.totais.qtdContasTotal, 0),
  };
}

export function safeTerceiroFileName(nome: string, suffix: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .trim()
    .slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base || "terceiro"}-${suffix}-${stamp}`;
}
