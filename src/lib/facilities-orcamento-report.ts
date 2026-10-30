import {
  calcular,
  formatMoneyBR,
  formatPctBR,
  FUNCOES,
  GERAIS,
  JORNADA_ESCALA,
  JORNADA_LABEL,
  type CalcConfig,
  type CalcResult,
  type PostoDias,
  type PostoFuncao,
  type PostoJornada,
  type PostoRegime,
} from "@/lib/facilities-orcamento-calc";
import { XLSX_ANCORA, type XlsxReport } from "@/lib/facilities-orcamento-xlsx";

export type RelatorioTipo = "interno" | "cliente";

export type RelatorioBloco =
  | { titulo: string; lista: string[] }
  | { titulo: string; linhas: string[][]; total: string[] };

export type RelatorioPosto = {
  tipo: RelatorioTipo;
  titulo: string;
  data: string;
  info: Array<[string, string]>;
  blocos: RelatorioBloco[];
  destaque: Array<[string, string, boolean?]>;
  notas: string[];
};

export type PostoQuoteState = {
  funcao: PostoFuncao;
  jornada: PostoJornada;
  dias: PostoDias;
  regime: PostoRegime;
  salario: number;
  grat: number;
  margem: number;
  qtd: number;
  vr: boolean;
  vt: boolean;
  heOn: boolean;
  heH: number;
  hePct: number;
  cliente: string;
  f?: CalcConfig["f"];
  g?: CalcConfig["g"];
};

function cfgFromState(state: PostoQuoteState, regime?: PostoRegime): CalcConfig {
  const cfg: CalcConfig = {
    funcao: state.funcao,
    jornada: state.jornada,
    dias: state.dias,
    regime: regime ?? state.regime,
    salario: state.salario,
    grat: state.grat,
    margem: state.margem,
    vr: state.vr,
    vt: state.vt,
    heExtraH: state.heOn ? state.heH : 0,
    heExtraPct: state.hePct,
  };
  if (state.f) cfg.f = state.f;
  if (state.g) cfg.g = state.g;
  return cfg;
}

export function calcFromState(state: PostoQuoteState, regime?: PostoRegime) {
  return calcular(cfgFromState(state, regime));
}

export function buildCopyResumo(state: PostoQuoteState, result: CalcResult) {
  const qtd = Math.max(1, state.qtd);
  const cli = state.cliente.trim();
  return [
    "ORÇAMENTO DE POSTO DE SERVIÇO – GRUPO ÂNCORA",
    cli ? `Cliente/local: ${cli}` : null,
    `Serviço: ${FUNCOES[state.funcao].nome} – ${JORNADA_LABEL[state.jornada]} – ${
      state.dias === "segsex" ? "segunda a sexta-feira" : "segunda a domingo"
    }`,
    `Colaboradores por posto: ${result.n}`,
    `Salário base de referência: ${formatMoneyBR(state.salario)}`,
    `Valor mensal por posto: ${formatMoneyBR(result.mensal)}`,
    qtd > 1 ? `Quantidade de postos: ${qtd} – Valor mensal total: ${formatMoneyBR(result.mensal * qtd)}` : null,
    `Valor diário de referência: ${formatMoneyBR(result.diario)}`,
    state.heOn && state.heH > 0
      ? `Inclui ${String(state.heH).replace(".", ",")} h/mês de horas extras adicionais`
      : null,
    `Regime de cálculo: ${state.regime === "real" ? "Lucro Real" : "Simples Nacional"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRelatorio(state: PostoQuoteState, tipo: RelatorioTipo): RelatorioPosto {
  const r = calcFromState(state);
  const qtd = Math.max(1, state.qtd);
  const F = FUNCOES[state.funcao];
  const cli = state.cliente.trim();
  const real = state.regime === "real";
  const diasLabel = state.dias === "segsex" ? "Segunda a sexta-feira" : "Segunda a domingo";
  const R: RelatorioPosto = {
    tipo,
    titulo: tipo === "interno" ? "Planilha de custo do posto" : "Orçamento de posto de serviço",
    data: new Date().toLocaleDateString("pt-BR"),
    info: [],
    blocos: [],
    destaque: [],
    notas: [],
  };

  R.info.push(
    ["Cliente / local", cli || "—"],
    ["Serviço", F.nome],
    ["Jornada", JORNADA_ESCALA[state.jornada]],
    ["Dias de prestação", diasLabel],
    ["Colaboradores por posto", String(r.n)],
  );
  if (qtd > 1) R.info.push(["Quantidade de postos", String(qtd)]);

  if (tipo === "interno") {
    R.info.push(
      ["Salário base", formatMoneyBR(state.salario)],
      ["Regime tributário", real ? "Lucro Real" : "Simples Nacional"],
      ["Gratificação", formatPctBR(state.grat)],
      [real ? "Margem esperada (s/ preço)" : "Lucro BDI (s/ custo)", formatPctBR(r.margem)],
    );
    const G = {
      rem: "Remuneração",
      enc: real ? "Encargos e provisões" : "Encargos sociais",
      ben: "Benefícios e insumos",
    } as const;
    (["rem", "enc", "ben"] as const).forEach((g) => {
      const ls = r.linhas.filter((l) => l.grupo === g);
      R.blocos.push({
        titulo: G[g],
        linhas: ls.map((l) => [l.nome, formatMoneyBR(l.valor)]),
        total: ["Subtotal", formatMoneyBR(ls.reduce((a, b) => a + b.valor, 0))],
      });
    });
    const pl: string[][] = [
      ["Custo total do posto", formatMoneyBR(r.custo), formatPctBR(r.custo / r.preco)],
    ];
    r.dre.forEach(([n, v]) => {
      if (Math.abs(v) >= 0.005 && v >= 0) pl.push([n, formatMoneyBR(v), formatPctBR(v / r.preco)]);
    });
    const formacao: RelatorioBloco = {
      titulo: "Formação do preço",
      linhas: pl,
      total: ["Preço mensal (segunda a domingo)", formatMoneyBR(r.preco), ""],
    };
    if (r.fatorDias < 1) {
      formacao.linhas.push(["Proporcional segunda a sexta (5/7)", formatMoneyBR(r.mensal), ""]);
    }
    R.blocos.push(formacao);
    R.destaque.push(["Valor mensal por posto", formatMoneyBR(r.mensal), true]);
    if (qtd > 1) R.destaque.push([`Valor mensal – ${qtd} postos`, formatMoneyBR(r.mensal * qtd)]);
    R.destaque.push(
      ["Valor diário", formatMoneyBR(r.diario)],
      ["Custo do posto", formatMoneyBR(r.custo * r.fatorDias)],
      [
        real ? "Margem líquida (após IRPJ e CSLL)" : "Lucro (BDI)",
        `${formatMoneyBR(r.liquido)} (${formatPctBR(r.liquido / r.mensal)})`,
      ],
    );
    const other = real ? "simples" : "real";
    const ro = calcFromState(state, other);
    R.notas.push(
      `Comparativo: no ${real ? "Simples Nacional" : "Lucro Real"} o mesmo posto sairia ${formatMoneyBR(ro.mensal)} por mês.`,
      "Documento de uso interno. Não enviar ao cliente.",
    );
  } else {
    const tem = (g: string) => r.linhas.some((l) => l.grupo === "rem" && l.nome.startsWith(g));
    const rem = ["Salários dos colaboradores do posto"];
    if (tem("Gratificação")) rem.push("Gratificação de função");
    if (tem("Periculosidade")) rem.push("Adicional de periculosidade (30%)");
    if (tem("Adicional noturno")) rem.push("Adicional noturno e hora noturna reduzida");
    if (tem("Intervalo")) rem.push("Intervalo intrajornada indenizado");
    if (tem("Horas extras")) {
      rem.push(`Horas extras adicionais (${String(state.heH).replace(".", ",")} h/mês)`);
    }
    R.blocos.push({ titulo: "Remuneração e adicionais", lista: rem });
    R.blocos.push({
      titulo: "Encargos sociais e trabalhistas",
      lista: [
        "FGTS (8%)",
        real ? "INSS patronal, RAT e contribuições a terceiros" : "INSS patronal e RAT",
        "Férias acrescidas de 1/3 constitucional",
        "13º salário",
        "Aviso prévio",
        "Multa rescisória do FGTS",
        "Reflexos dos encargos sobre férias, 13º e aviso prévio",
      ],
    });
    const nb = r.linhas.filter((l) => l.grupo === "ben").map((l) => l.nome);
    const has = (s: string) => nb.some((n) => n.startsWith(s));
    const ben: string[] = [];
    if (has("Vale-refeição")) ben.push("Vale-refeição");
    if (has("Vale-transporte")) ben.push("Vale-transporte");
    if (has("Cesta")) ben.push("Cesta básica");
    if (has("Saúde")) ben.push("Saúde ocupacional (PCMSO e exames)");
    if (has("Seguro")) ben.push("Seguro de vida e auxílio-funeral");
    if (has("Curso")) ben.push("Curso de reciclagem de vigilante");
    if (has("PPR")) ben.push("Participação nos resultados (PPR/PLR)");
    if (has("Prêmio")) ben.push("Prêmio assiduidade");
    R.blocos.push({ titulo: "Benefícios aos colaboradores", lista: ben });
    const op = ["Uniformes, equipamentos e supervisão operacional"];
    if (has("Moto")) op.push("Motocicleta para ronda");
    R.blocos.push({ titulo: "Operação", lista: op });
    R.blocos.push({
      titulo: "Tributos",
      lista: real ? ["ISS", "PIS e COFINS"] : ["ISS", "Tributos do Simples Nacional"],
    });
    R.destaque.push(["Valor mensal por posto", formatMoneyBR(r.mensal), true]);
    if (qtd > 1) R.destaque.push([`Valor mensal – ${qtd} postos`, formatMoneyBR(r.mensal * qtd)]);
    R.notas.push(
      "O valor mensal contempla todos os itens acima, conforme a convenção coletiva da categoria vigente.",
      "Atendimento: atendimento@ancoraseguranca.com.br",
    );
  }
  return R;
}

/** Relatório com números (para Excel cliente no formato Âncora). */
export function buildRelatorioXlsx(state: PostoQuoteState, tipo: RelatorioTipo): XlsxReport {
  const r = calcFromState(state);
  const qtd = Math.max(1, state.qtd);
  const F = FUNCOES[state.funcao];
  const cli = state.cliente.trim();
  const real = state.regime === "real";
  const diasLabel = state.dias === "segsex" ? "Segunda a sexta-feira" : "Segunda a domingo";
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const round4 = (v: number) => Math.round(v * 10000) / 10000;

  const R: XlsxReport = {
    tipo,
    titulo: tipo === "interno" ? "Planilha de custo do posto" : "Orçamento de posto de serviço",
    data: new Date().toLocaleDateString("pt-BR"),
    info: [
      ["Cliente / local", cli || "—"],
      ["Serviço", F.nome],
      ["Jornada", JORNADA_ESCALA[state.jornada]],
      ["Dias de prestação", diasLabel],
      ["Colaboradores por posto", r.n],
    ],
    blocos: [],
    destaque: [],
    notas: [],
  };
  if (qtd > 1) R.info.push(["Quantidade de postos", qtd]);

  if (tipo === "interno") {
    R.info.push(
      ["Salário base", round2(state.salario)],
      ["Regime tributário", real ? "Lucro Real" : "Simples Nacional"],
      ["Gratificação", round4(state.grat), "pct"],
      [real ? "Margem esperada (s/ preço)" : "Lucro BDI (s/ custo)", round4(r.margem), "pct"],
    );
    const G = {
      rem: "Remuneração",
      enc: real ? "Encargos e provisões" : "Encargos sociais",
      ben: "Benefícios e insumos",
    } as const;
    (["rem", "enc", "ben"] as const).forEach((g) => {
      const ls = r.linhas.filter((l) => l.grupo === g);
      R.blocos.push({
        titulo: G[g],
        linhas: ls.map((l) => [l.nome, round2(l.valor)]),
        total: ["Subtotal", round2(ls.reduce((a, b) => a + b.valor, 0))],
        soma: true,
      });
    });
    const pl: Array<Array<string | number>> = [
      ["Custo total do posto", round2(r.custo), round4(r.custo / r.preco)],
    ];
    r.dre.forEach(([n, v]) => {
      if (Math.abs(v) >= 0.005 && v >= 0) pl.push([n, round2(v), round4(v / r.preco)]);
    });
    const formacao = {
      titulo: "Formação do preço",
      linhas: pl,
      total: ["Preço mensal (segunda a domingo)", round2(r.preco), ""] as Array<string | number>,
    };
    if (r.fatorDias < 1) {
      formacao.linhas.push(["Proporcional segunda a sexta (5/7)", round2(r.mensal), ""]);
    }
    R.blocos.push(formacao);
    R.destaque.push(["Valor mensal por posto", round2(r.mensal)]);
    if (qtd > 1) R.destaque.push([`Valor mensal – ${qtd} postos`, round2(r.mensal * qtd)]);
    R.destaque.push(
      ["Valor diário", round2(r.diario)],
      ["Custo do posto", round2(r.custo * r.fatorDias)],
      [
        real ? "Margem líquida (após IRPJ e CSLL)" : "Lucro (BDI)",
        `${formatMoneyBR(r.liquido)} (${formatPctBR(r.liquido / r.mensal)})`,
      ],
    );
    const other = real ? "simples" : "real";
    const ro = calcFromState(state, other);
    R.notas.push(
      `Comparativo: no ${real ? "Simples Nacional" : "Lucro Real"} o mesmo posto sairia ${formatMoneyBR(ro.mensal)} por mês.`,
      "Documento de uso interno. Não enviar ao cliente.",
    );
  } else {
    const visual = buildRelatorio(state, "cliente");
    R.blocos = visual.blocos.filter((b) => "lista" in b) as XlsxReport["blocos"];
    R.destaque.push(["Valor mensal por posto", round2(r.mensal)]);
    if (qtd > 1) R.destaque.push([`Valor mensal – ${qtd} postos`, round2(r.mensal * qtd)]);
    R.notas = visual.notas;
  }
  return R;
}

export function buildModeloInput(state: PostoQuoteState) {
  const cfg = cfgFromState(state);
  const r = calcular(cfg);
  const f = { ...FUNCOES[state.funcao], ...(state.f ?? {}) };
  const g = { ...GERAIS, ...(state.g ?? {}) };
  const comercial = state.jornada === "comercial";
  const real = state.regime === "real";
  const clienteRel = buildRelatorio(state, "cliente");
  const other = calcFromState(state, real ? "simples" : "real");
  return {
    data: new Date().toLocaleDateString("pt-BR"),
    info: clienteRel.info.concat([["Regime tributário", real ? "Lucro Real" : "Simples Nacional"]]),
    regime: state.regime,
    S: state.salario,
    n: r.n,
    turnos: r.turnos,
    dias: g.diasMes,
    divisor: g.divisor,
    grat: state.grat,
    peric: f.peric,
    horasNot: state.jornada === "noturno" || state.jornada === "24h" ? g.horasNoturnas : 0,
    fatorNot: g.fatorNoturno,
    intervaloH: comercial ? 0 : g.intervaloH,
    multHE: f.multHE,
    heH: state.heOn ? state.heH : 0,
    hePct: state.hePct,
    vr: state.vr ? f.vr : 0,
    vtTarifa: state.vt ? g.vtTarifa : 0,
    vtViagens: g.vtViagens,
    cesta: f.cesta,
    saude: f.saude,
    seguro: f.seguro,
    recic: f.recic,
    ppr: f.ppr,
    pprPct: f.pprPct,
    premio: f.premio,
    moto: f.moto,
    motos: f.moto ? r.turnos : 0,
    unif: g.uniforme,
    fgts: g.fgts,
    inss: g.inss,
    multa: g.multaFgts,
    lrDI: g.lrDI,
    lrDC: g.lrDC,
    lrDF: g.lrDF,
    lrPis: g.lrPisCofins,
    lrIss: g.lrIss,
    lrCbs: g.lrCbs,
    lrIbs: g.lrIbs,
    margem: state.margem,
    irpj: g.irpj,
    csll: g.csll,
    encS: f.encSimples,
    sDI: g.sDI,
    simpTrib: f.simpTrib,
    simpIss: f.simpIss,
    fatorDias: r.fatorDias,
    divDiario: state.dias === "segsex" ? 21.75 : g.diasMes,
    qtd: Math.max(1, state.qtd),
    notas: [
      `Comparativo no momento da exportação: no ${real ? "Simples Nacional" : "Lucro Real"} o mesmo posto sairia ${formatMoneyBR(other.mensal)} por mês.`,
      "Documento de uso interno. Não enviar ao cliente.",
    ],
  };
}

async function loadPostosLogoB64() {
  try {
    const res = await fetch("/ancora-postos-logo.jpeg");
    if (!res.ok) return undefined;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin);
  } catch {
    return undefined;
  }
}

export async function downloadPostoExcel(state: PostoQuoteState, tipo: RelatorioTipo, filename: string) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const logo = await loadPostosLogoB64();
  let bytes: Uint8Array;
  if (tipo === "interno") {
    bytes = XLSX_ANCORA.buildModelo(buildModeloInput(state), logo).bytes;
  } else {
    bytes = XLSX_ANCORA.build(buildRelatorioXlsx(state, "cliente"), logo);
  }
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
