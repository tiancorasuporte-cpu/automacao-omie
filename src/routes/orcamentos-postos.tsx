import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import {
  FUNCOES,
  GERAIS,
  JORNADA_LABEL,
  formatMoneyBR,
  formatPctBR,
  parseMoneyBR,
  type FuncaoParams,
  type GeraisParams,
  type PostoDias,
  type PostoFuncao,
  type PostoJornada,
  type PostoRegime,
} from "@/lib/facilities-orcamento-calc";
import {
  buildCopyResumo,
  buildRelatorio,
  calcFromState,
  downloadPostoExcel,
  safeFilePart,
  type PostoQuoteState,
  type RelatorioPosto,
  type RelatorioTipo,
} from "@/lib/facilities-orcamento-report";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

async function downloadPostoPdf(rel: RelatorioPosto, filename: string) {
  const { downloadPostoPdf: run } = await import("@/lib/facilities-orcamento-pdf");
  return run(rel, filename);
}

const LS_KEY = "ancora-posto-v1";

type StoredState = {
  funcao?: PostoFuncao;
  jornada?: PostoJornada;
  dias?: PostoDias;
  regime?: PostoRegime;
  salario?: string;
  qtd?: string;
  vr?: boolean;
  vt?: boolean;
  cliente?: string;
  fo?: Partial<Record<PostoFuncao, Partial<FuncaoParams>>>;
  go?: Partial<GeraisParams>;
  gratEd?: Partial<Record<PostoFuncao, number>>;
  margEd?: Partial<Record<string, number>>;
  heH?: number;
  heOn?: boolean;
  hePctEd?: Partial<Record<PostoFuncao, number>>;
};

const PF: Array<[keyof FuncaoParams, string, boolean]> = [
  ["peric", "Periculosidade", true],
  ["multHE", "Multiplicador HE intervalo", false],
  ["cesta", "Cesta básica (R$/colab.)", false],
  ["saude", "Saúde ocupacional (R$/colab.)", false],
  ["seguro", "Seguro de vida (R$/colab.)", false],
  ["recic", "Curso reciclagem (R$ a cada 2 anos)", false],
  ["ppr", "PPR fixo (R$/ano/colab.)", false],
  ["pprPct", "PPR como % do salário/ano", true],
  ["premio", "Prêmio assiduidade (R$/colab.)", false],
  ["vr", "Vale-refeição (R$/dia)", false],
  ["moto", "Moto (R$/mês/un.)", false],
  ["encSimples", "Encargos sociais no Simples", true],
  ["simpTrib", "Simples: PIS/COFINS/IRPJ/CSLL/CPP", true],
  ["simpIss", "Simples: ISS", true],
];

const PG1: Array<[keyof GeraisParams, string, boolean]> = [
  ["diasMes", "Dias por mês", false],
  ["intervaloH", "Intervalo indenizado (h/plantão)", false],
  ["horasNoturnas", "Horas noturnas/mês", false],
  ["fatorNoturno", "Fator adicional noturno", false],
  ["divisor", "Divisor de horas", false],
  ["uniforme", "Uniformes/equip./supervisão", true],
  ["fgts", "FGTS", true],
  ["inss", "INSS + RAT + Terceiros", true],
  ["multaFgts", "Multa FGTS", true],
  ["vtTarifa", "Tarifa de ônibus (R$)", false],
  ["vtViagens", "Viagens por plantão", false],
];

const PG2: Array<[keyof GeraisParams, string, boolean]> = [
  ["lrDI", "Despesas indiretas", true],
  ["lrDC", "Despesa comercial", true],
  ["lrDF", "Despesa financeira", true],
  ["lrPisCofins", "PIS + COFINS", true],
  ["lrIss", "ISS", true],
  ["lrCbs", "CBS (reforma)", true],
  ["lrIbs", "IBS (reforma)", true],
  ["irpj", "IRPJ s/ margem", true],
  ["csll", "CSLL s/ margem", true],
];

const PG3: Array<[keyof GeraisParams, string, boolean]> = [
  ["sDI", "Despesas indiretas (X)", true],
  ["sLucro", "Lucro padrão (Y)", true],
];

export const Route = createFileRoute("/orcamentos-postos")({
  beforeLoad: () => requireModule("orcamentos"),
  head: () => ({
    meta: [{ title: `Orçamento de postos — ${APP_NAME}` }],
  }),
  component: OrcamentosPostosPage,
});

function SegButtons<T extends string>({
  value,
  options,
  onChange,
  disabledValue,
}: {
  value: T;
  options: Array<{ v: T; label: string }>;
  onChange: (v: T) => void;
  disabledValue?: (v: T) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const disabled = disabledValue?.(opt.v) ?? false;
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.v)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function OrcamentosPostosPage() {
  const [funcao, setFuncao] = useState<PostoFuncao>("porteiro");
  const [jornada, setJornada] = useState<PostoJornada>("diurno");
  const [dias, setDias] = useState<PostoDias>("segdom");
  const [regime, setRegime] = useState<PostoRegime>("real");
  const [salarioText, setSalarioText] = useState("2.162,60");
  const [qtd, setQtd] = useState(1);
  const [vr, setVr] = useState(false);
  const [vt, setVt] = useState(false);
  const [cliente, setCliente] = useState("");
  const [heOn, setHeOn] = useState(false);
  const [heH, setHeH] = useState(0);
  const [fo, setFo] = useState<Partial<Record<PostoFuncao, Partial<FuncaoParams>>>>({});
  const [go, setGo] = useState<Partial<GeraisParams>>({});
  const [gratEd, setGratEd] = useState<Partial<Record<PostoFuncao, number>>>({});
  const [margEd, setMargEd] = useState<Partial<Record<string, number>>>({});
  const [hePctEd, setHePctEd] = useState<Partial<Record<PostoFuncao, number>>>({});
  const [toast, setToast] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [printRel, setPrintRel] = useState<RelatorioPosto | null>(null);
  const [menuImp, setMenuImp] = useState(false);
  const [menuExcel, setMenuExcel] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as StoredState;
      if (s.funcao) setFuncao(s.funcao);
      if (s.jornada) setJornada(s.jornada);
      if (s.dias) setDias(s.dias);
      if (s.regime) setRegime(s.regime);
      if (s.salario) setSalarioText(String(s.salario).replace(/^R\$\s?/i, ""));
      if (s.qtd) setQtd(Math.max(1, Number.parseInt(s.qtd, 10) || 1));
      if (s.vr != null) setVr(!!s.vr);
      if (s.vt != null) setVt(!!s.vt);
      if (s.cliente) setCliente(s.cliente);
      if (s.fo) setFo(s.fo);
      if (s.go) setGo(s.go);
      if (s.gratEd) setGratEd(s.gratEd);
      if (s.margEd) setMargEd(s.margEd);
      if (s.hePctEd) setHePctEd(s.hePctEd);
      if (s.heH != null) setHeH(s.heH);
      if (s.heOn != null) setHeOn(!!s.heOn);
    } catch {
      /* ignore */
    }
  }, []);

  const fn = useMemo(() => ({ ...FUNCOES[funcao], ...(fo[funcao] ?? {}) }), [funcao, fo]);
  const gg = useMemo(() => ({ ...GERAIS, ...go }), [go]);

  const grat = gratEd[funcao] ?? fn.grat;
  const hePct = hePctEd[funcao] ?? fn.multHE - 1;
  const margem = margEd[`${funcao}${regime}`] ?? (regime === "real" ? fn.margem : gg.sLucro);
  const salario = parseMoneyBR(salarioText);

  const state: PostoQuoteState = useMemo(
    () => ({
      funcao,
      jornada,
      dias,
      regime,
      salario,
      grat,
      margem,
      qtd: Math.max(1, qtd),
      vr,
      vt,
      heOn,
      heH,
      hePct,
      cliente,
      f: fo[funcao] ?? {},
      g: go,
    }),
    [funcao, jornada, dias, regime, salario, grat, margem, qtd, vr, vt, heOn, heH, hePct, cliente, fo, go],
  );

  const result = useMemo(() => calcFromState(state), [state]);
  const otherRegime: PostoRegime = regime === "real" ? "simples" : "real";
  const otherResult = useMemo(() => calcFromState(state, otherRegime), [state, otherRegime]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          funcao,
          jornada,
          dias,
          regime,
          salario: salarioText,
          qtd: String(qtd),
          vr,
          vt,
          cliente,
          fo,
          go,
          gratEd,
          margEd,
          heH,
          heOn,
          hePctEd,
        } satisfies StoredState),
      );
    } catch {
      /* ignore */
    }
  }, [funcao, jornada, dias, regime, salarioText, qtd, vr, vt, cliente, fo, go, gratEd, margEd, heH, heOn, hePctEd]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  function changeFuncao(v: PostoFuncao) {
    setFuncao(v);
    if (v === "recepcionista" && jornada !== "comercial") setJornada("comercial");
  }

  async function copyResumo() {
    const txt = buildCopyResumo(state, result);
    try {
      await navigator.clipboard.writeText(txt);
      setToast("Resumo copiado.");
    } catch {
      setToast("Não foi possível copiar.");
    }
  }

  function reportBaseName(tipo: RelatorioTipo) {
    return (
      (tipo === "interno" ? "Custo interno" : "Orcamento") +
      " - " +
      FUNCOES[funcao].nome +
      (cliente.trim() ? ` - ${safeFilePart(cliente.trim())}` : "")
    );
  }

  async function exportPdf(tipo: RelatorioTipo) {
    setMenuImp(false);
    const rel = buildRelatorio(state, tipo);
    setPrintRel(rel);
    setPrintOpen(true);
    try {
      await downloadPostoPdf(rel, reportBaseName(tipo));
      setToast("PDF gerado.");
    } catch (err) {
      console.error(err);
      setToast(err instanceof Error ? err.message : "Não foi possível gerar o PDF.");
    }
  }

  async function downloadCurrentPdf() {
    if (!printRel) return;
    try {
      await downloadPostoPdf(printRel, reportBaseName(printRel.tipo));
      setToast("PDF gerado.");
    } catch (err) {
      console.error(err);
      setToast(err instanceof Error ? err.message : "Não foi possível gerar o PDF.");
    }
  }

  async function exportExcel(tipo: RelatorioTipo) {
    setMenuExcel(false);
    try {
      await downloadPostoExcel(state, tipo, reportBaseName(tipo));
      setToast("Planilha gerada.");
    } catch {
      setToast("Não foi possível gerar a planilha.");
    }
  }

  function resetParams() {
    setFo({});
    setGo({});
    setGratEd({});
    setMargEd({});
    setHePctEd({});
    setToast("Padrões restaurados.");
  }

  const sumG = (g: "rem" | "enc" | "ben") =>
    result.linhas.filter((l) => l.grupo === g).reduce((a, b) => a + b.valor, 0);
  const di = result.dre[0]?.[1] ?? 0;
  const mar = regime === "real" ? (result.dre[4]?.[1] ?? 0) : (result.dre[3]?.[1] ?? 0);
  const imp = result.preco - result.custo - di - mar;
  const barParts = [
    { key: "rem", label: "Remuneração", value: sumG("rem"), className: "bg-sky-600" },
    { key: "enc", label: "Encargos", value: sumG("enc"), className: "bg-indigo-500" },
    { key: "ben", label: "Benefícios", value: sumG("ben"), className: "bg-emerald-600" },
    { key: "di", label: "Despesas indiretas", value: di, className: "bg-amber-500" },
    { key: "imp", label: "Impostos", value: imp, className: "bg-rose-500" },
    { key: "mar", label: "Margem", value: mar, className: "bg-primary" },
  ];

  const grupoLabel = {
    rem: "Remuneração",
    enc: regime === "real" ? "Encargos e provisões" : "Encargos sociais",
    ben: "Benefícios e insumos",
  } as const;

  return (
    <AppShell mobileTitle="Orçamento Postos" searchPlaceholder="Buscar...">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Grupo Âncora · Postos de Serviço
              </p>
              <h2 className="mt-1 text-headline-lg tracking-tight text-primary">Orçamento rápido de posto</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Base: planilhas HBA II (Lucro Real) e Jaboti 2026 (Simples)
              </p>
            </div>
            {toast ? (
              <span className="rounded-md bg-surface-container-high px-3 py-1.5 text-sm text-primary">{toast}</span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
            <div className="space-y-4">
              <Field label="Função">
                <SegButtons
                  value={funcao}
                  onChange={changeFuncao}
                  options={[
                    { v: "porteiro", label: "Porteiro" },
                    { v: "recepcionista", label: "Recepcionista" },
                    { v: "vigilante", label: "Vigilante" },
                    { v: "vigmoto", label: "Vigilante motorizado" },
                  ]}
                />
              </Field>

              <Field label="Jornada">
                <SegButtons
                  value={jornada}
                  onChange={setJornada}
                  disabledValue={(v) => funcao === "recepcionista" && v !== "comercial"}
                  options={[
                    { v: "diurno", label: "Diurno 12x36" },
                    { v: "noturno", label: "Noturno 12x36" },
                    { v: "24h", label: "24 horas" },
                    { v: "comercial", label: "Comercial 44h" },
                  ]}
                />
              </Field>

              <Field label="Dias de prestação">
                <SegButtons
                  value={dias}
                  onChange={setDias}
                  options={[
                    { v: "segdom", label: "Segunda a domingo" },
                    { v: "segsex", label: "Segunda a sexta (5/7)" },
                  ]}
                />
              </Field>

              <Field label="Salário base do colaborador (piso)">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 40,
                    width: 280,
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #d4d0c8",
                    borderRadius: 8,
                    background: "#fff",
                    padding: "0 12px",
                  }}
                >
                  <span style={{ flex: "0 0 auto", fontSize: 14, color: "#66615a" }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={salarioText}
                    onChange={(e) => setSalarioText(e.target.value.replace(/^R\$\s?/i, ""))}
                    onBlur={() =>
                      setSalarioText(
                        parseMoneyBR(salarioText).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                      )
                    }
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                      width: "100%",
                      height: 38,
                      border: 0,
                      outline: "none",
                      background: "transparent",
                      textAlign: "left",
                      fontSize: 14,
                      color: "#1d1813",
                    }}
                  />
                </div>
              </Field>

              <Field label="Regime tributário">
                <SegButtons
                  value={regime}
                  onChange={setRegime}
                  options={[
                    { v: "real", label: "Lucro Real (atual)" },
                    { v: "simples", label: "Simples Nacional" },
                  ]}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-on-surface">Gratificação %</span>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3"
                    value={+(grat * 100).toFixed(2)}
                    onChange={(e) =>
                      setGratEd((prev) => ({
                        ...prev,
                        [funcao]: (Number.parseFloat(e.target.value) || 0) / 100,
                      }))
                    }
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-on-surface">
                    {regime === "real" ? "Margem s/ preço %" : "Lucro BDI %"}
                  </span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3"
                    value={+(margem * 100).toFixed(2)}
                    onChange={(e) =>
                      setMargEd((prev) => ({
                        ...prev,
                        [`${funcao}${regime}`]: (Number.parseFloat(e.target.value) || 0) / 100,
                      }))
                    }
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-on-surface">Qtd. postos</span>
                  <input
                    type="number"
                    step={1}
                    min={1}
                    className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3"
                    value={qtd}
                    onChange={(e) => setQtd(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                  />
                </label>
              </div>

              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={heOn} onChange={(e) => setHeOn(e.target.checked)} />
                  Horas extras adicionais
                </label>
                <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                  <b>Atenção:</b> as horas trabalhadas das 22h às 5h já estão incluídas no orçamento como
                  adicional noturno, com a hora noturna reduzida. Não lance essas horas aqui. Use este
                  campo só para horas além da escala.
                </p>
                {heOn ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">HE extras h/mês</span>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3"
                        value={heH}
                        onChange={(e) => setHeH(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                      />
                    </label>
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">Adicional da HE %</span>
                      <input
                        type="number"
                        step={5}
                        min={0}
                        className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3"
                        value={+(hePct * 100).toFixed(2)}
                        onChange={(e) =>
                          setHePctEd((prev) => ({
                            ...prev,
                            [funcao]: (Number.parseFloat(e.target.value) || 0) / 100,
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <Field label="Benefícios opcionais do contrato">
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={vr} onChange={(e) => setVr(e.target.checked)} />
                    Vale-refeição
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={vt} onChange={(e) => setVt(e.target.checked)} />
                    Vale-transporte
                  </label>
                </div>
              </Field>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-on-surface">Cliente / local (para o resumo)</span>
                <input
                  className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3"
                  placeholder="Ex.: Condomínio Residencial Jardim"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
            <div
              className="rounded-lg p-4"
              style={{ background: "#1d1813", color: "#fff" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                Valor mensal do posto
              </p>
              <p
                className="mt-1 text-3xl font-semibold tabular-nums"
                style={{ color: "#fed706" }}
              >
                {formatMoneyBR(result.mensal)}
              </p>
              <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                {FUNCOES[funcao].nome} · {JORNADA_LABEL[jornada]} ·{" "}
                {dias === "segsex" ? "seg. a sex." : "seg. a dom."}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Kpi label="Valor diário" value={formatMoneyBR(result.diario)} />
              <Kpi label="Custo do posto" value={formatMoneyBR(result.custo * result.fatorDias)} />
              <Kpi
                label={regime === "real" ? "Margem líq. (após IR/CS)" : "Lucro (BDI)"}
                value={formatMoneyBR(result.liquido)}
              />
              <Kpi label="Colaboradores" value={String(result.n)} />
            </div>

            {qtd > 1 ? (
              <p className="mt-3 rounded-md bg-surface-container-high px-3 py-2 text-sm">
                {qtd} postos: <b>{formatMoneyBR(result.mensal * qtd)}</b> por mês
              </p>
            ) : null}

            <p className="mt-3 text-sm text-on-surface-variant">
              No {otherRegime === "real" ? "Lucro Real" : "Simples"} este posto sairia{" "}
              <b className="text-on-surface">{formatMoneyBR(otherResult.mensal)}</b> (
              {otherResult.mensal - result.mensal >= 0 ? "+" : "−"}
              {formatMoneyBR(Math.abs(otherResult.mensal - result.mensal))}).
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-on-primary"
                  onClick={() => {
                    setMenuImp((v) => !v);
                    setMenuExcel(false);
                  }}
                >
                  <Icon name="picture_as_pdf" className="size-4" />
                  Baixar PDF
                </button>
                {menuImp ? (
                  <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-outline-variant bg-surface-container-lowest p-1 shadow-md">
                    <MenuItem
                      title="PDF interno"
                      desc="Custos, encargos, margem e lucro líquido"
                      onClick={() => void exportPdf("interno")}
                    />
                    <MenuItem
                      title="PDF cliente"
                      desc="Itens contemplados e valor de venda do posto"
                      onClick={() => void exportPdf("cliente")}
                    />
                  </div>
                ) : null}
              </div>

              <div className="relative">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm font-medium"
                  onClick={() => {
                    setMenuExcel((v) => !v);
                    setMenuImp(false);
                  }}
                >
                  <Icon name="download" className="size-4" />
                  Exportar Excel
                </button>
                {menuExcel ? (
                  <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-outline-variant bg-surface-container-lowest p-1 shadow-md">
                    <MenuItem
                      title="Excel interno"
                      desc="Planilha completa de custo, margem e lucro líquido"
                      onClick={() => void exportExcel("interno")}
                    />
                    <MenuItem
                      title="Excel cliente"
                      desc="Itens contemplados e valor de venda do posto"
                      onClick={() => void exportExcel("cliente")}
                    />
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm font-medium"
                onClick={() => void copyResumo()}
              >
                <Icon name="content_copy" className="size-4" />
                Copiar resumo
              </button>
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
          <h3 className="text-base font-semibold">Composição do preço</h3>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-on-surface-variant">
            {barParts.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5">
                <i className={cn("inline-block size-2.5 rounded-sm", p.className)} />
                {p.label}
              </span>
            ))}
          </div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-container-high">
            {barParts.map((p) => (
              <i
                key={p.key}
                className={cn("block h-full", p.className)}
                style={{ width: `${Math.max(0, (p.value / result.preco) * 100)}%` }}
                title={formatMoneyBR(p.value)}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {(["rem", "enc", "ben"] as const).map((gk) => {
                    const ls = result.linhas.filter((l) => l.grupo === gk);
                    const s = ls.reduce((a, b) => a + b.valor, 0);
                    return (
                      <FragmentGroup key={gk}>
                        <tr className="border-b border-outline-variant bg-surface-container-low">
                          <td className="px-2 py-2 font-semibold">{grupoLabel[gk]}</td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">
                            {formatMoneyBR(s)}
                          </td>
                        </tr>
                        {ls.map((l) => (
                          <tr key={l.nome} className="border-b border-outline-variant/60">
                            <td className="px-2 py-1.5 text-on-surface-variant">{l.nome}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatMoneyBR(l.valor)}
                            </td>
                          </tr>
                        ))}
                      </FragmentGroup>
                    );
                  })}
                  <tr className="bg-primary/15">
                    <td className="px-2 py-2 font-semibold">Custo total do posto</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {formatMoneyBR(result.custo)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-outline-variant bg-surface-container-low">
                    <td className="px-2 py-2 font-semibold">Do custo ao preço</td>
                    <td className="px-2 py-2 text-right font-semibold">Valor</td>
                    <td className="px-2 py-2 text-right font-semibold">% preço</td>
                  </tr>
                  <tr className="border-b border-outline-variant/60">
                    <td className="px-2 py-1.5">Custo do posto</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatMoneyBR(result.custo)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-on-surface-variant">
                      {formatPctBR(result.custo / result.preco)}
                    </td>
                  </tr>
                  {result.dre.map(([n, v]) => {
                    if (Math.abs(v) < 0.005 || v < 0) return null;
                    return (
                      <tr key={n} className="border-b border-outline-variant/60">
                        <td className="px-2 py-1.5">{n}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMoneyBR(v)}</td>
                        <td className="px-2 py-1.5 text-right text-on-surface-variant">
                          {formatPctBR(v / result.preco)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-primary/15">
                    <td className="px-2 py-2 font-semibold">Preço mensal (seg. a dom.)</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {formatMoneyBR(result.preco)}
                    </td>
                    <td />
                  </tr>
                  {result.dre.map(([n, v]) => {
                    if (v >= 0) return null;
                    return (
                      <FragmentGroup key={`neg-${n}`}>
                        <tr className="border-b border-outline-variant/60 text-rose-700 dark:text-rose-400">
                          <td className="px-2 py-1.5">{n}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatMoneyBR(v)}</td>
                          <td className="px-2 py-1.5 text-right">{formatPctBR(v / result.preco)}</td>
                        </tr>
                        <tr className="border-b border-outline-variant/60">
                          <td className="px-2 py-1.5">Margem líquida</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatMoneyBR(result.liquido / result.fatorDias)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-on-surface-variant">
                            {formatPctBR(result.liquido / result.fatorDias / result.preco)}
                          </td>
                        </tr>
                      </FragmentGroup>
                    );
                  })}
                  {result.fatorDias < 1 ? (
                    <tr className="border-b border-outline-variant/60">
                      <td className="px-2 py-1.5">Proporcional seg. a sex. (5/7)</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatMoneyBR(result.mensal)}
                      </td>
                      <td />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <details className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-semibold">Parâmetros da planilha</summary>
          <p className="mt-2 text-sm text-on-surface-variant">
            Valores padrão tirados das planilhas enviadas. Alterações ficam salvas neste navegador. Os
            parâmetros da função valem para a função selecionada acima.
          </p>

          <ParamGrid
            title={`Função: ${FUNCOES[funcao].nome}`}
            fields={PF}
            get={(key) => fn[key] as number}
            set={(key, value) =>
              setFo((prev) => ({
                ...prev,
                [funcao]: { ...(prev[funcao] ?? {}), [key]: value },
              }))
            }
          />
          <ParamGrid
            title="Jornada e encargos"
            fields={PG1}
            get={(key) => gg[key]}
            set={(key, value) => setGo((prev) => ({ ...prev, [key]: value }))}
          />
          <ParamGrid
            title="Lucro Real"
            fields={PG2}
            get={(key) => gg[key]}
            set={(key, value) => setGo((prev) => ({ ...prev, [key]: value }))}
          />
          <ParamGrid
            title="Simples Nacional"
            fields={PG3}
            get={(key) => gg[key]}
            set={(key, value) => setGo((prev) => ({ ...prev, [key]: value }))}
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm font-medium"
              onClick={resetParams}
            >
              Restaurar padrões das planilhas
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
            No Lucro Real o custo segue a planilha HBA II e o preço é custo ÷ (1 − despesas − PIS/COFINS −
            ISS − margem). No Simples segue a planilha Jaboti e o preço é custo × (1 + BDI). Uniformes
            entram como percentual do custo total. Na jornada 24 horas o intervalo intrajornada é
            contado nos dois plantões.
          </p>
        </details>
      </div>
      </main>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {printRel?.tipo === "interno" ? "Versão interna" : "Versão cliente"}
            </DialogTitle>
            <DialogDescription>
              Prévia do relatório. Use Baixar PDF para gerar o arquivo no formato Âncora.
            </DialogDescription>
          </DialogHeader>
          {printRel ? <PrintDoc rel={printRel} /> : null}
          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-md border border-outline-variant px-3 text-sm"
              onClick={() => setPrintOpen(false)}
            >
              Fechar
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-md bg-primary px-3 text-sm font-medium text-on-primary"
              onClick={() => void downloadCurrentPdf()}
            >
              Baixar PDF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function FragmentGroup({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-on-surface">{label}</span>
      {children}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
      <b className="block text-sm tabular-nums text-on-surface">{value}</b>
      <span className="text-xs text-on-surface-variant">{label}</span>
    </div>
  );
}

function MenuItem({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-surface-container-high"
      onClick={onClick}
    >
      <b className="text-sm">{title}</b>
      <span className="text-xs text-on-surface-variant">{desc}</span>
    </button>
  );
}

function ParamGrid<K extends string>({
  title,
  fields,
  get,
  set,
}: {
  title: string;
  fields: Array<[K, string, boolean]>;
  get: (key: K) => number;
  set: (key: K, value: number) => void;
}) {
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([key, label, isPct]) => (
          <label key={key} className="space-y-1 text-sm">
            <span className="text-on-surface-variant">
              {label}
              {isPct ? " (%)" : ""}
            </span>
            <input
              type="number"
              step="any"
              className="h-9 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2"
              value={+(isPct ? get(key) * 100 : get(key)).toFixed(6)}
              onChange={(e) => {
                const n = Number.parseFloat(e.target.value);
                if (Number.isNaN(n)) return;
                set(key, isPct ? n / 100 : n);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function PrintDoc({ rel }: { rel: RelatorioPosto }) {
  return (
    <div className="space-y-4 text-sm print:text-black">
      <div className="flex items-start justify-between gap-3 border-b border-outline-variant pb-3">
        <div className="flex items-start gap-3">
          <img
            src="/ancora-postos-logo.jpeg"
            alt="Âncora"
            className="h-14 w-14 rounded object-contain"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7d6300]">
              Grupo Âncora · Postos de Serviço
            </p>
            <h3 className="text-lg font-semibold text-[#1d1813]">
              {rel.titulo}
              {rel.tipo === "interno" ? " (uso interno)" : ""}
            </h3>
            {rel.tipo === "interno" ? (
              <span className="mt-1 inline-block rounded bg-[#1d1813] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#fed706]">
                Uso interno
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-on-surface-variant">Emitido em {rel.data}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {rel.info.map(([k, v]) => (
          <div key={k}>
            <span className="text-xs text-on-surface-variant">{k}</span>
            <p className="font-medium">{v}</p>
          </div>
        ))}
      </div>

      {rel.tipo === "cliente" ? (
        <p className="font-semibold">Itens contemplados no valor do posto</p>
      ) : null}

      {rel.blocos.map((b) => (
        <div key={b.titulo}>
          {"lista" in b ? (
            <>
              <h4 className="mb-1 font-semibold text-[#1d1813]">{b.titulo}</h4>
              <ul className="list-disc space-y-0.5 pl-5 text-on-surface-variant">
                {b.lista.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ background: "#1d1813", color: "#fed706" }}>
                  <th className="px-2 py-1.5 text-left font-semibold">{b.titulo}</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Valor</th>
                  {(b.linhas[0]?.length ?? 0) > 2 ? (
                    <th className="px-2 py-1.5 text-right font-semibold">% preço</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {b.linhas.map((l) => (
                  <tr key={l[0]} className="border-b border-outline-variant/50">
                    <td className="py-1">{l[0]}</td>
                    <td className="py-1 text-right tabular-nums">{l[1]}</td>
                    {l[2] !== undefined ? (
                      <td className="py-1 text-right text-on-surface-variant">{l[2]}</td>
                    ) : null}
                  </tr>
                ))}
                <tr className="font-semibold" style={{ background: "#fdf3c4" }}>
                  <td className="py-1.5">{b.total[0]}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.total[1]}</td>
                  {b.total.length > 2 ? <td /> : null}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      ))}

      <div
        className="rounded-lg p-4 print:bg-[#1d1813]"
        style={{ background: "#1d1813", color: "#fff" }}
      >
        {rel.destaque.map(([k, v, main]) => (
          <div key={k} className={cn("flex justify-between gap-3 py-1", main && "text-base font-semibold")}>
            <span style={{ color: "#fff" }}>{k}</span>
            <span className="tabular-nums font-semibold" style={{ color: "#fed706" }}>
              {v}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-1 text-xs text-on-surface-variant">
        {rel.notas.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </div>
      <div className="flex justify-between border-t border-outline-variant pt-2 text-xs text-on-surface-variant">
        <span>Grupo Âncora</span>
        <span>atendimento@ancoraseguranca.com.br</span>
      </div>
    </div>
  );
}
