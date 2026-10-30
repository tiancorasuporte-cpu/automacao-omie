/** Motor de orçamento de postos — planilhas HBA II (Lucro Real) e Jaboti (Simples). */

export type PostoFuncao = "porteiro" | "recepcionista" | "vigilante" | "vigmoto";
export type PostoJornada = "diurno" | "noturno" | "24h" | "comercial";
export type PostoDias = "segdom" | "segsex";
export type PostoRegime = "real" | "simples";

export type FuncaoParams = {
  nome: string;
  grat: number;
  peric: number;
  cesta: number;
  saude: number;
  seguro: number;
  recic: number;
  ppr: number;
  pprPct: number;
  premio: number;
  vr: number;
  moto: number;
  margem: number;
  simpTrib: number;
  simpIss: number;
  encSimples: number;
  multHE: number;
};

export type GeraisParams = {
  diasMes: number;
  horasNoturnas: number;
  fatorNoturno: number;
  divisor: number;
  intervaloH: number;
  uniforme: number;
  fgts: number;
  inss: number;
  multaFgts: number;
  lrDI: number;
  lrDC: number;
  lrDF: number;
  lrPisCofins: number;
  lrIss: number;
  lrCbs: number;
  lrIbs: number;
  irpj: number;
  csll: number;
  sDI: number;
  sLucro: number;
  vtTarifa: number;
  vtViagens: number;
};

export const FUNCOES: Record<PostoFuncao, FuncaoParams> = {
  porteiro: {
    nome: "Porteiro",
    grat: 0.2,
    peric: 0,
    cesta: 151.91,
    saude: 40.88,
    seguro: 33.43,
    recic: 0,
    ppr: 356.39,
    pprPct: 0,
    premio: 315,
    vr: 21.8,
    moto: 0,
    margem: 0.055,
    simpTrib: 0.0671,
    simpIss: 0.03,
    encSimples: 0.764938,
    multHE: 1.6,
  },
  recepcionista: {
    nome: "Recepcionista",
    grat: 0,
    peric: 0,
    cesta: 151.91,
    saude: 40.88,
    seguro: 33.43,
    recic: 0,
    ppr: 356.39,
    pprPct: 0,
    premio: 315,
    vr: 21.8,
    moto: 0,
    margem: 0.065,
    simpTrib: 0.0671,
    simpIss: 0.03,
    encSimples: 0.764938,
    multHE: 1.6,
  },
  vigilante: {
    nome: "Vigilante",
    grat: 0.1,
    peric: 0.3,
    cesta: 208.45,
    saude: 24.27,
    seguro: 33.88,
    recic: 814,
    ppr: 0,
    pprPct: 0.25,
    premio: 0,
    vr: 42,
    moto: 0,
    margem: 0.05,
    simpTrib: 0.1003,
    simpIss: 0.066857,
    encSimples: 0.774235,
    multHE: 1.6,
  },
  vigmoto: {
    nome: "Vigilante motorizado",
    grat: 0.1,
    peric: 0.3,
    cesta: 208.45,
    saude: 24.27,
    seguro: 33.88,
    recic: 814,
    ppr: 0,
    pprPct: 0.25,
    premio: 0,
    vr: 42,
    moto: 960.51,
    margem: 0.05,
    simpTrib: 0.1003,
    simpIss: 0.066857,
    encSimples: 0.774235,
    multHE: 1.6,
  },
};

export const GERAIS: GeraisParams = {
  diasMes: 30.44,
  horasNoturnas: 213.08,
  fatorNoturno: 0.371429,
  divisor: 220,
  intervaloH: 0.5,
  uniforme: 0.03,
  fgts: 0.08,
  inss: 0.288,
  multaFgts: 0.4,
  lrDI: 0.08,
  lrDC: 0,
  lrDF: 0,
  lrPisCofins: 0.0365,
  lrIss: 0.03,
  lrCbs: 0,
  lrIbs: 0,
  irpj: 0.25,
  csll: 0.09,
  sDI: 0.1,
  sLucro: 0.08,
  vtTarifa: 3.5,
  vtViagens: 2,
};

export const JORNADA_LABEL: Record<PostoJornada, string> = {
  diurno: "Diurno 12x36",
  noturno: "Noturno 12x36",
  "24h": "24 horas (12x36)",
  comercial: "Comercial 44h semanais",
};

export const JORNADA_ESCALA: Record<PostoJornada, string> = {
  diurno: "Diurno – 12 horas (escala 12x36)",
  noturno: "Noturno – 12 horas (escala 12x36)",
  "24h": "24 horas ininterruptas (escala 12x36)",
  comercial: "Horário comercial – 44 horas semanais",
};

export type CalcConfig = {
  funcao: PostoFuncao;
  jornada: PostoJornada;
  dias: PostoDias;
  salario: number;
  regime: PostoRegime;
  grat?: number;
  margem?: number;
  vr?: boolean;
  vt?: boolean;
  motos?: number;
  heExtraH?: number;
  heExtraPct?: number;
  f?: Partial<FuncaoParams>;
  g?: Partial<GeraisParams>;
};

export type CalcLinha = { grupo: "rem" | "enc" | "ben"; nome: string; valor: number };

export type CalcResult = {
  n: number;
  turnos: number;
  R: number;
  ben: number;
  encargos: number;
  unif: number;
  custo: number;
  preco: number;
  mensal: number;
  diario: number;
  liquido: number;
  linhas: CalcLinha[];
  dre: Array<[string, number]>;
  margem: number;
  fatorDias: number;
};

export function calcular(cfg: CalcConfig): CalcResult {
  const f = { ...FUNCOES[cfg.funcao], ...(cfg.f ?? {}) };
  const g = { ...GERAIS, ...(cfg.g ?? {}) };
  const S = Number(cfg.salario) || 0;
  const comercial = cfg.jornada === "comercial";
  const turnos = cfg.jornada === "24h" ? 2 : 1;
  const n = comercial ? 1 : 2 * turnos;
  const dias = g.diasMes;
  const grat = cfg.grat != null ? cfg.grat : f.grat;
  const linhas: CalcLinha[] = [];
  const add = (grupo: CalcLinha["grupo"], nome: string, valor: number) => {
    if (Math.abs(valor) > 0.004) linhas.push({ grupo, nome, valor });
    return valor;
  };

  const sal = add("rem", `Salários (${n} × base)`, S * n);
  const gr = add("rem", "Gratificação", sal * grat);
  const pe = add("rem", "Periculosidade", sal * f.peric);
  const baseHora = (sal + gr + pe) / n / g.divisor;
  const notH = cfg.jornada === "noturno" || cfg.jornada === "24h" ? g.horasNoturnas : 0;
  const an = add("rem", "Adicional noturno", notH * baseHora * g.fatorNoturno);
  const hInt = comercial ? 0 : g.intervaloH * dias * turnos;
  const he = add("rem", "Intervalo intrajornada (HE)", baseHora * f.multHE * hInt);
  const heH = Number(cfg.heExtraH) || 0;
  const hePct = cfg.heExtraPct != null ? Number(cfg.heExtraPct) : f.multHE - 1;
  const hex = add(
    "rem",
    `Horas extras adicionais (${String(heH).replace(".", ",")} h a ${Math.round(hePct * 100)}%)`,
    baseHora * (1 + hePct) * heH,
  );
  const R = sal + gr + pe + an + he + hex;

  let ben = 0;
  if (cfg.vr) ben += add("ben", "Vale-refeição", f.vr * dias * turnos);
  if (cfg.vt) {
    ben += add(
      "ben",
      "Vale-transporte (líq. 6%)",
      Math.max(0, g.vtTarifa * g.vtViagens * dias * turnos - 0.06 * sal),
    );
  }
  ben += add("ben", "Cesta básica", f.cesta * n);
  ben += add("ben", "Saúde ocupacional", f.saude * n);
  ben += add("ben", "Seguro de vida", f.seguro * n);
  ben += add("ben", "Curso de reciclagem", (f.recic * n) / 24);
  ben += add("ben", "PPR / PLR", ((f.pprPct ? S * f.pprPct : f.ppr) * n) / 12);
  ben += add("ben", "Prêmio assiduidade", f.premio * n);
  const motos = f.moto ? (cfg.motos != null ? cfg.motos : turnos) : 0;
  ben += add("ben", `Moto (${motos} un.)`, f.moto * motos);

  let encargos = 0;
  if (cfg.regime === "real") {
    encargos += add("enc", "FGTS (8%)", R * g.fgts);
    encargos += add("enc", "INSS + RAT + Terceiros", R * g.inss);
    const fer = R / 12;
    const terco = fer / 3;
    const dec = R / 12;
    const av = R / 12;
    encargos += add("enc", "Férias 1/12", fer);
    encargos += add("enc", "1/3 de férias", terco);
    encargos += add("enc", "13º salário 1/12", dec);
    encargos += add("enc", "Aviso prévio 1/12", av);
    const fgtsProv = (fer + terco + dec + av) * g.fgts;
    encargos += add("enc", "FGTS sobre provisões", fgtsProv);
    encargos += add("enc", "Multa FGTS 40%", (R * g.fgts + fgtsProv) * g.multaFgts);
    encargos += add("enc", "INSS + RAT + Terceiros s/ provisões", (fer + terco + dec + av) * g.inss);
  } else {
    encargos += add(
      "enc",
      `Encargos sociais (${(f.encSimples * 100).toFixed(2).replace(".", ",")}%)`,
      R * f.encSimples,
    );
  }

  const semUnif = R + ben + encargos;
  const unif = add("ben", "Uniformes / equip. / supervisão", (semUnif * g.uniforme) / (1 - g.uniforme));
  const custo = semUnif + unif;

  const margem = cfg.margem != null ? cfg.margem : f.margem;
  let preco: number;
  let dre: Array<[string, number]>;
  let liquido: number;

  if (cfg.regime === "real") {
    const soma = g.lrDI + g.lrDC + g.lrDF + g.lrPisCofins + g.lrIss + margem;
    const p = custo / (1 - soma);
    const cbs = p * g.lrCbs;
    const ibs = p * g.lrIbs;
    preco = p + cbs + ibs;
    const lucro = p * margem;
    const ir = lucro * g.irpj;
    const cs = lucro * g.csll;
    dre = [
      ["Despesas indiretas", p * (g.lrDI + g.lrDC + g.lrDF)],
      ["PIS / COFINS", p * g.lrPisCofins],
      ["ISS", p * g.lrIss],
      ["CBS / IBS", cbs + ibs],
      ["Margem bruta", lucro],
      ["IRPJ + CSLL s/ margem", -(ir + cs)],
    ];
    liquido = lucro - ir - cs;
  } else {
    const T = f.simpTrib + f.simpIss;
    const bdi = ((1 + g.sDI) * (1 + margem)) / (1 - T) - 1;
    preco = custo * (1 + bdi);
    const di = custo * g.sDI;
    const lucro = custo * (1 + g.sDI) * margem;
    dre = [
      ["Despesas indiretas", di],
      ["Simples (DAS s/ ISS)", preco * f.simpTrib],
      ["ISS", preco * f.simpIss],
      ["Lucro", lucro],
    ];
    liquido = lucro;
  }

  const fatorDias = cfg.dias === "segsex" ? 5 / 7 : 1;
  const mensal = preco * fatorDias;
  const diario = mensal / (cfg.dias === "segsex" ? 21.75 : dias);

  return {
    n,
    turnos,
    R,
    ben,
    encargos,
    unif,
    custo,
    preco,
    mensal,
    diario,
    liquido: liquido * fatorDias,
    linhas,
    dre,
    margem,
    fatorDias,
  };
}

export function parseMoneyBR(value: string) {
  let s = String(value).trim().replace(/[^\d,.-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(s) || 0;
}

export function formatMoneyBR(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPctBR(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
