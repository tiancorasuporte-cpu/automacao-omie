import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  btnMuted,
  btnOutline,
  btnPrimary,
  fieldClass,
  PageTitle,
} from "@/components/PageChrome";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import { osStageName, osTipoLabel } from "@/lib/assistencia-domain";
import {
  emitMatSaidaFn,
  getEstoqueBootstrapFn,
  getEstoquePdvBootstrapFn,
  listEstoqueFn,
  listEstoqueHistoricoFn,
  listTeamStockFn,
  listTeamStockMovesFn,
  moveEstoqueFn,
  returnTeamProductFn,
  searchEstoqueProductsFn,
  syncEstoqueFiscalFn,
  updateEstoqueMinimoFn,
} from "@/lib/estoque";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/estoque")({
  beforeLoad: () => requireModule("estoque"),
  loader: async () => getEstoqueBootstrapFn(),
  head: () => ({
    meta: [{ title: `Estoque — ${APP_NAME}` }],
  }),
  component: EstoquePage,
});

type StockRow = {
  productId: number;
  codigoProduto: number;
  codigoInterno: string | null;
  descricao: string;
  unidade: string | null;
  estoqueFiscal: number;
  estoqueFiscalSyncedAt: string | null;
  quantidadeFisica: number;
  estoqueMinimo: number;
  diferenca: number;
  cmc: number | null;
  cmcInterno: number | null;
  cmcEfetivo: number | null;
  custoTotal: number;
};

type MoveRow = {
  id: number;
  tipo: "entrada" | "saida" | "ajuste";
  quantidade: number;
  saldoApos: number;
  motivo: string | null;
  observacao: string | null;
  userName: string | null;
  createdAt: string;
};

type MoveTipo = "entrada" | "saida" | "ajuste";
type EstoqueTab = "empresa" | "pdv" | "equipes";

type PdvProduct = {
  productId: number;
  descricao: string;
  codigoInterno: string | null;
  codigoProduto: number;
  unidade: string | null;
  quantidadeFisica: number;
};

type PdvCartLine = {
  productId: number;
  nome: string;
  qtd: number;
  unidade: string | null;
};

function formatQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function tipoLabel(tipo: MoveTipo) {
  if (tipo === "entrada") return "Entrada";
  if (tipo === "saida") return "Saída";
  return "Ajuste";
}

function EstoquePage() {
  const bootstrap = Route.useLoaderData();
  const { query } = useShellSearch();
  const [tab, setTab] = useState<EstoqueTab>("empresa");

  const [items, setItems] = useState<StockRow[]>([]);
  const [total, setTotal] = useState(bootstrap.total);
  const [localQuery, setLocalQuery] = useState("");
  const [onlyDivergent, setOnlyDivergent] = useState(false);
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [pdvBoot, setPdvBoot] = useState<Awaited<
    ReturnType<typeof getEstoquePdvBootstrapFn>
  > | null>(null);
  const [pdvSearch, setPdvSearch] = useState("");
  const [pdvHits, setPdvHits] = useState<PdvProduct[]>([]);
  const [pdvSearching, setPdvSearching] = useState(false);
  const [cart, setCart] = useState<PdvCartLine[]>([]);
  const [destino, setDestino] = useState<"os" | "equipe">("equipe");
  const [teamId, setTeamId] = useState<number | "">("");
  const [tecnicoNome, setTecnicoNome] = useState("");
  const [osId, setOsId] = useState<number | "">("");
  const [emitting, setEmitting] = useState(false);
  const [equipeQuery, setEquipeQuery] = useState("");
  const [teamStock, setTeamStock] = useState<
    Awaited<ReturnType<typeof listTeamStockFn>>
  >([]);
  const [teamMoves, setTeamMoves] = useState<
    Awaited<ReturnType<typeof listTeamStockMovesFn>>
  >([]);
  const [teamPanelId, setTeamPanelId] = useState<number | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returningKey, setReturningKey] = useState<string | null>(null);

  const [moveProduct, setMoveProduct] = useState<StockRow | null>(null);
  const [moveTipo, setMoveTipo] = useState<MoveTipo>("entrada");
  const [moveQty, setMoveQty] = useState("1");
  const [moveMotivo, setMoveMotivo] = useState("");
  const [moveObs, setMoveObs] = useState("");
  const [moving, setMoving] = useState(false);

  const [historyProduct, setHistoryProduct] = useState<StockRow | null>(null);
  const [history, setHistory] = useState<MoveRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [minProduct, setMinProduct] = useState<StockRow | null>(null);
  const [minValue, setMinValue] = useState("0");
  const [savingMin, setSavingMin] = useState(false);

  const effectiveQuery = (localQuery || query).trim();

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const result = await listEstoqueFn({
        data: {
          query: effectiveQuery || undefined,
          onlyDivergent,
          onlyBelowMin,
          limit: 200,
          offset: 0,
        },
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao carregar estoque.",
      });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveQuery, onlyDivergent, onlyBelowMin]);

  async function reloadPdv() {
    const boot = await getEstoquePdvBootstrapFn();
    setPdvBoot(boot);
    setTeamStock(boot.teamStock);
    setTeamMoves(boot.teamMoves);
    if (!teamId && boot.teams[0]) setTeamId(boot.teams[0].id);
  }

  useEffect(() => {
    if (tab === "pdv" || tab === "equipes") {
      void reloadPdv().catch((error) => {
        setFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Falha ao carregar PDV.",
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "pdv") return;
    const q = pdvSearch.trim();
    if (q.length < 2) {
      setPdvHits([]);
      return;
    }
    const timer = setTimeout(() => {
      setPdvSearching(true);
      void searchEstoqueProductsFn({ data: { query: q, limit: 20 } })
        .then(setPdvHits)
        .catch(() => setPdvHits([]))
        .finally(() => setPdvSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [pdvSearch, tab]);

  useEffect(() => {
    if (tab !== "equipes") return;
    void listTeamStockFn({
      data: {
        query: equipeQuery.trim() || undefined,
      },
    })
      .then(setTeamStock)
      .catch(() => undefined);
    void listTeamStockMovesFn({
      data: { limit: 80 },
    })
      .then(setTeamMoves)
      .catch(() => undefined);
  }, [tab, equipeQuery]);

  const selectedTeam = useMemo(() => {
    if (!pdvBoot || teamId === "") return null;
    return pdvBoot.teams.find((t) => t.id === teamId) ?? null;
  }, [pdvBoot, teamId]);

  const teamCards = useMemo(() => {
    const teams = pdvBoot?.teams ?? [];
    return teams.map((t) => {
      const rows = teamStock.filter((r) => r.teamId === t.id);
      const q = equipeQuery.trim().toLowerCase();
      const filtered = q
        ? rows.filter((r) => r.nome.toLowerCase().includes(q))
        : rows;
      const totalQty = filtered.reduce((s, r) => s + r.quantidade, 0);
      return {
        id: t.id,
        name: t.name,
        members: t.members.filter((m) => m.active).length,
        skuCount: filtered.length,
        totalQty,
        rows: filtered,
      };
    });
  }, [pdvBoot?.teams, teamStock, equipeQuery]);

  const openTeamPanel = teamCards.find((t) => t.id === teamPanelId) ?? null;

  async function returnProduct(row: {
    teamId: number;
    productId: number;
    nome: string;
    quantidade: number;
  }) {
    const key = `${row.teamId}-${row.productId}`;
    const raw = returnQty[key] ?? String(row.quantidade);
    const quantidade = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setFeedback({ type: "error", text: "Informe uma quantidade válida para devolver." });
      return;
    }
    if (quantidade > row.quantidade) {
      setFeedback({
        type: "error",
        text: `Saldo na equipe é ${formatQty(row.quantidade)}.`,
      });
      return;
    }
    setReturningKey(key);
    setFeedback(null);
    try {
      await returnTeamProductFn({
        data: {
          teamId: row.teamId,
          productId: row.productId,
          quantidade,
          motivo: `Devolução · ${row.nome}`,
        },
      });
      setFeedback({
        type: "ok",
        text: `Devolvido ${formatQty(quantidade)}× ${row.nome} ao estoque da empresa.`,
      });
      await reloadPdv();
      const refreshed = await listTeamStockFn({ data: {} });
      setTeamStock(refreshed);
      setTeamMoves(await listTeamStockMovesFn({ data: { limit: 80 } }));
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao devolver.",
      });
    } finally {
      setReturningKey(null);
    }
  }

  const cartTotalQty = useMemo(
    () => cart.reduce((sum, line) => sum + line.qtd, 0),
    [cart],
  );

  function addToCart(product: PdvProduct) {
    setCart((prev) => {
      const found = prev.find((l) => l.productId === product.productId);
      if (found) {
        return prev.map((l) =>
          l.productId === product.productId ? { ...l, qtd: l.qtd + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.productId,
          nome: product.descricao,
          qtd: 1,
          unidade: product.unidade,
        },
      ];
    });
    setPdvSearch("");
    setPdvHits([]);
  }

  async function emitSaida() {
    if (!teamId || !cart.length) return;
    if (destino === "os" && !osId) {
      setFeedback({ type: "error", text: "Selecione a OS de destino." });
      return;
    }
    setEmitting(true);
    setFeedback(null);
    try {
      const saida = await emitMatSaidaFn({
        data: {
          destino,
          teamId: Number(teamId),
          tecnicoNome: tecnicoNome.trim() || null,
          osId: destino === "os" ? Number(osId) : null,
          itens: cart.map((l) => ({
            productId: l.productId,
            nome: l.nome,
            qtd: l.qtd,
          })),
        },
      });
      setCart([]);
      setOsId("");
      setFeedback({
        type: "ok",
        text: `Saída ${saida.num} emitida · ${saida.itens.length} item(ns) na ${saida.teamName}.`,
      });
      await reloadPdv();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao emitir saída.",
      });
    } finally {
      setEmitting(false);
    }
  }

  const stats = useMemo(() => {
    let divergent = 0;
    let belowMin = 0;
    let custoFisico = 0;
    let custoFiscal = 0;
    let comCmc = 0;
    for (const item of items) {
      if (item.diferenca !== 0) divergent += 1;
      if (item.estoqueMinimo > 0 && item.quantidadeFisica <= item.estoqueMinimo) belowMin += 1;
      if (item.cmcEfetivo != null && Number.isFinite(item.cmcEfetivo)) {
        comCmc += 1;
        custoFisico += item.custoTotal ?? item.quantidadeFisica * item.cmcEfetivo;
        custoFiscal += item.estoqueFiscal * item.cmcEfetivo;
      }
    }
    return {
      divergent,
      belowMin,
      comCmc,
      custoFisico: Math.round(custoFisico * 100) / 100,
      custoFiscal: Math.round(custoFiscal * 100) / 100,
    };
  }, [items]);

  async function handleSync() {
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await syncEstoqueFiscalFn();
      const errors = result.perApp.filter((row) => row.error);
      setFeedback({
        type: errors.length ? "error" : "ok",
        text: errors.length
          ? `Sync parcial: fiscal ${result.fiscalTotal}, CMC ${result.cmcTotal}. ${errors
              .map((row) => row.error)
              .join(" · ")}`
          : `Estoque fiscal atualizado em ${result.fiscalTotal} produto(s). CMC em ${result.cmcTotal}.`,
      });
      await load({ silent: true });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha no sync de estoque fiscal.",
      });
    } finally {
      setSyncing(false);
    }
  }

  function openMove(product: StockRow, tipo: MoveTipo = "entrada") {
    setMoveProduct(product);
    setMoveTipo(tipo);
    setMoveQty(tipo === "ajuste" ? String(product.quantidadeFisica) : "1");
    setMoveMotivo("");
    setMoveObs("");
  }

  async function confirmMove() {
    if (!moveProduct) return;
    const quantidade = Number(String(moveQty).replace(",", "."));
    setMoving(true);
    setFeedback(null);
    try {
      const result = await moveEstoqueFn({
        data: {
          productId: moveProduct.productId,
          tipo: moveTipo,
          quantidade,
          motivo: moveMotivo.trim() || null,
          observacao: moveObs.trim() || null,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setMoveProduct(null);
      setFeedback({
        type: "ok",
        text: `${tipoLabel(moveTipo)} em ${moveProduct.descricao}. Saldo físico: ${formatQty(result.saldo)}.`,
      });
      await load({ silent: true });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao movimentar.",
      });
    } finally {
      setMoving(false);
    }
  }

  async function openHistory(product: StockRow) {
    setHistoryProduct(product);
    setHistory([]);
    setLoadingHistory(true);
    try {
      const result = await listEstoqueHistoricoFn({
        data: { productId: product.productId, limit: 100 },
      });
      setHistory(result.items);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao carregar histórico.",
      });
    } finally {
      setLoadingHistory(false);
    }
  }

  function openMinimo(product: StockRow) {
    setMinProduct(product);
    setMinValue(String(product.estoqueMinimo));
  }

  async function saveMinimo() {
    if (!minProduct) return;
    const estoqueMinimo = Number(String(minValue).replace(",", "."));
    setSavingMin(true);
    try {
      const result = await updateEstoqueMinimoFn({
        data: { productId: minProduct.productId, estoqueMinimo },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setMinProduct(null);
      setFeedback({ type: "ok", text: `Mínimo atualizado para ${formatQty(result.estoqueMinimo)}.` });
      await load({ silent: true });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar mínimo.",
      });
    } finally {
      setSavingMin(false);
    }
  }

  return (
    <AppShell mobileTitle="Estoque" searchPlaceholder="Buscar produto, código...">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-md px-margin-mobile py-md md:px-margin-desktop md:py-lg">
        <PageTitle
          title="Estoque"
          subtitle="Saldo da empresa, saída PDV e estoque em campo por equipe."
        >
          {tab === "empresa" ? (
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSync()}
              className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              <Icon name={syncing ? "hourglass_empty" : "sync"} className="text-[16px]" />
              {syncing ? "Sincronizando..." : "Sync estoque Omie"}
            </button>
          ) : null}
        </PageTitle>

        <div className="flex flex-wrap gap-xs">
          {(
            [
              ["empresa", "Saldo empresa"],
              ["pdv", "Saída PDV"],
              ["equipes", "Estoque equipes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(tab === id ? btnPrimary : btnOutline)}
            >
              {label}
            </button>
          ))}
        </div>

        {feedback ? (
          <div
            className={`rounded-xl border px-md py-sm text-body-md ${
              feedback.type === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            {feedback.text}
          </div>
        ) : null}

        {tab === "pdv" ? (
          <div className="grid gap-lg xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,22rem)]">
            <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <div className="border-b border-outline-variant bg-surface-container-low px-md py-md md:px-lg">
                <p className="text-title-md font-semibold text-on-surface">
                  Caixa · saída de materiais
                </p>
                <p className="mt-2xs text-label-md text-on-surface-variant">
                  A baixa no estoque da empresa só acontece depois do uso confirmado na OS.
                </p>
              </div>
              <div className="space-y-md p-md md:p-lg">
                <label className="block text-label-md text-on-surface-variant">
                  Buscar produto
                  <input
                    value={pdvSearch}
                    onChange={(e) => setPdvSearch(e.target.value)}
                    placeholder="Código, descrição..."
                    className={cn(fieldClass, "mt-2xs text-title-md")}
                    autoFocus
                  />
                </label>
                {pdvSearching ? (
                  <p className="text-label-md text-on-surface-variant">Buscando…</p>
                ) : null}
                {pdvHits.length ? (
                  <ul className="max-h-56 space-y-xs overflow-auto rounded-xl border border-outline-variant/70 p-xs">
                    {pdvHits.map((p) => (
                      <li key={p.productId}>
                        <button
                          type="button"
                          onClick={() => addToCart(p)}
                          className="flex w-full items-start justify-between gap-md rounded-xl px-sm py-sm text-left hover:bg-surface-container-high"
                        >
                          <span>
                            <span className="block font-semibold text-on-surface">
                              {p.descricao}
                            </span>
                            <span className="text-label-sm text-on-surface-variant">
                              {p.codigoInterno || p.codigoProduto}
                              {p.unidade ? ` · ${p.unidade}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-lg bg-surface-container px-sm py-2xs text-label-sm text-on-surface-variant">
                            Fís. {formatQty(p.quantidadeFisica)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="grid gap-md sm:grid-cols-2">
                  <label className="text-label-md text-on-surface-variant">
                    Destino
                    <select
                      value={destino}
                      onChange={(e) => setDestino(e.target.value as "os" | "equipe")}
                      className={fieldClass}
                    >
                      <option value="equipe">Estoque da equipe</option>
                      <option value="os">OS (sem pedido / aberta)</option>
                    </select>
                  </label>
                  <label className="text-label-md text-on-surface-variant">
                    Equipe
                    <select
                      value={teamId}
                      onChange={(e) =>
                        setTeamId(e.target.value ? Number(e.target.value) : "")
                      }
                      className={fieldClass}
                    >
                      <option value="">Selecione</option>
                      {(pdvBoot?.teams ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-label-md text-on-surface-variant sm:col-span-2">
                    Técnico na equipe
                    <input
                      value={tecnicoNome}
                      onChange={(e) => setTecnicoNome(e.target.value)}
                      list="pdv-tecnicos"
                      placeholder="Nome do técnico"
                      className={fieldClass}
                    />
                    <datalist id="pdv-tecnicos">
                      {(selectedTeam?.members ?? [])
                        .filter((m) => m.active)
                        .map((m) => (
                          <option key={m.id} value={m.name} />
                        ))}
                    </datalist>
                  </label>
                  {destino === "os" ? (
                    <label className="text-label-md text-on-surface-variant sm:col-span-2">
                      OS
                      <select
                        value={osId}
                        onChange={(e) =>
                          setOsId(e.target.value ? Number(e.target.value) : "")
                        }
                        className={fieldClass}
                      >
                        <option value="">Selecione a OS</option>
                        {(pdvBoot?.osOptions ?? []).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.num} · {o.clientName} · {osTipoLabel(o.tipo)} ·{" "}
                            {osStageName(o.stage)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            </section>

            <aside className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <div className="border-b border-outline-variant px-md py-md">
                <p className="text-title-md font-semibold text-on-surface">Carrinho</p>
                <p className="text-label-md text-on-surface-variant">
                  {cart.length
                    ? `${cart.length} produto(s) · ${formatQty(cartTotalQty)} un.`
                    : "Nenhum item"}
                </p>
              </div>
              <ul className="min-h-0 flex-1 space-y-xs overflow-auto p-md">
                {cart.map((line) => (
                  <li
                    key={line.productId}
                    className="rounded-xl border border-outline-variant/80 bg-surface px-sm py-sm"
                  >
                    <div className="flex items-start justify-between gap-xs">
                      <span className="font-medium text-on-surface">{line.nome}</span>
                      <button
                        type="button"
                        className={btnMuted}
                        onClick={() =>
                          setCart((prev) => prev.filter((l) => l.productId !== line.productId))
                        }
                      >
                        Remover
                      </button>
                    </div>
                    <div className="mt-xs flex items-center gap-xs">
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() =>
                          setCart((prev) =>
                            prev
                              .map((l) =>
                                l.productId === line.productId
                                  ? { ...l, qtd: Math.max(0.01, l.qtd - 1) }
                                  : l,
                              )
                              .filter((l) => l.qtd > 0),
                          )
                        }
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        value={line.qtd}
                        onChange={(e) => {
                          const qtd = Number(String(e.target.value).replace(",", "."));
                          if (!Number.isFinite(qtd) || qtd <= 0) return;
                          setCart((prev) =>
                            prev.map((l) =>
                              l.productId === line.productId ? { ...l, qtd } : l,
                            ),
                          );
                        }}
                        className={cn(fieldClass, "mt-0 w-24 text-center")}
                      />
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() =>
                          setCart((prev) =>
                            prev.map((l) =>
                              l.productId === line.productId ? { ...l, qtd: l.qtd + 1 } : l,
                            ),
                          )
                        }
                      >
                        +
                      </button>
                      {line.unidade ? (
                        <span className="text-label-sm text-on-surface-variant">
                          {line.unidade}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-outline-variant p-md">
                <button
                  type="button"
                  disabled={emitting || !cart.length || !teamId}
                  onClick={() => void emitSaida()}
                  className={cn(
                    btnPrimary,
                    "w-full justify-center py-md disabled:opacity-50",
                  )}
                >
                  {emitting ? "Emitindo…" : "Confirmar saída"}
                </button>
              </div>
            </aside>

            {pdvBoot?.saidas?.length ? (
              <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest xl:col-span-2">
                <div className="border-b border-outline-variant px-md py-md">
                  <p className="text-title-md font-semibold">Últimas saídas</p>
                </div>
                <div className="overflow-x-auto p-sm md:p-md">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="text-label-md uppercase text-on-surface-variant">
                      <tr>
                        <th className="px-sm py-xs">Nº</th>
                        <th className="px-sm py-xs">Destino</th>
                        <th className="px-sm py-xs">Equipe</th>
                        <th className="px-sm py-xs">Técnico</th>
                        <th className="px-sm py-xs">Itens</th>
                        <th className="px-sm py-xs">Quando</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pdvBoot.saidas.map((s) => (
                        <tr key={s.id} className="border-t border-outline-variant/70">
                          <td className="px-sm py-xs font-medium">{s.num}</td>
                          <td className="px-sm py-xs">
                            {s.destino === "os" ? s.osNum ?? "OS" : "Estoque equipe"}
                          </td>
                          <td className="px-sm py-xs">{s.teamName}</td>
                          <td className="px-sm py-xs">{s.tecnicoNome ?? "—"}</td>
                          <td className="px-sm py-xs">{s.itens.length}</td>
                          <td className="px-sm py-xs">{formatDateTime(s.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "equipes" ? (
          <div className="flex flex-col gap-lg">
            <div className="flex flex-wrap items-end gap-md">
              <label className="min-w-[14rem] flex-1 text-label-md text-on-surface-variant">
                Filtrar produtos nas equipes
                <input
                  value={equipeQuery}
                  onChange={(e) => setEquipeQuery(e.target.value)}
                  placeholder="Nome do produto…"
                  className={fieldClass}
                />
              </label>
            </div>

            <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
              {teamCards.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setTeamPanelId(team.id)}
                  className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-md text-left shadow-sm transition hover:border-primary/40 hover:bg-surface"
                >
                  <div className="flex items-start justify-between gap-sm">
                    <div>
                      <p className="text-title-md font-semibold text-on-surface">{team.name}</p>
                      <p className="mt-2xs text-label-md text-on-surface-variant">
                        {team.members} técnico(s) · {team.skuCount} produto(s)
                      </p>
                    </div>
                    <Icon name="chevron_right" className="text-[20px] text-on-surface-variant" />
                  </div>
                  <p className="mt-md text-label-sm uppercase tracking-wide text-on-surface-variant">
                    Saldo total
                  </p>
                  <p className="text-headline-sm font-semibold text-on-surface">
                    {formatQty(team.totalQty)}
                  </p>
                </button>
              ))}
            </div>

            {!teamCards.length ? (
              <p className="rounded-2xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
                Nenhuma equipe cadastrada.
              </p>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
              <div className="border-b border-outline-variant px-md py-md">
                <p className="text-title-md font-semibold">Movimentos recentes</p>
              </div>
              <div className="overflow-x-auto p-sm md:p-md">
                <table className="min-w-full text-left text-body-md">
                  <thead className="text-label-md uppercase text-on-surface-variant">
                    <tr>
                      <th className="px-sm py-xs">Quando</th>
                      <th className="px-sm py-xs">Equipe</th>
                      <th className="px-sm py-xs">Produto</th>
                      <th className="px-sm py-xs">Tipo</th>
                      <th className="px-sm py-xs">Qtd</th>
                      <th className="px-sm py-xs">Técnico</th>
                      <th className="px-sm py-xs">OS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMoves.slice(0, 30).map((m) => (
                      <tr key={m.id} className="border-t border-outline-variant/70">
                        <td className="px-sm py-xs">{formatDateTime(m.createdAt)}</td>
                        <td className="px-sm py-xs">{m.teamName}</td>
                        <td className="px-sm py-xs">{m.productName || "—"}</td>
                        <td className="px-sm py-xs">{m.tipo}</td>
                        <td className="px-sm py-xs">{formatQty(m.quantidade)}</td>
                        <td className="px-sm py-xs">{m.tecnicoNome ?? "—"}</td>
                        <td className="px-sm py-xs">{m.osNum ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!teamMoves.length ? (
                  <p className="px-sm py-md text-body-md text-on-surface-variant">
                    Sem movimentos ainda.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "empresa" ? (
          <>
        <div className="grid gap-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Itens listados
            </div>
            <div className="text-title-md font-bold text-on-surface">
              {bootstrap.apps[0]?.name ?? "Belfer"} · {total}
            </div>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-amber-900/70">
              Custo total (físico)
            </div>
            <div className="text-title-md font-bold text-amber-950">
              {formatMoney(stats.custoFisico)}
            </div>
            <div className="text-label-sm text-amber-900/70">
              qtd física × CMC Omie · {stats.comCmc} com CMC
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Custo fiscal Omie
            </div>
            <div className="text-title-md font-bold text-on-surface">
              {formatMoney(stats.custoFiscal)}
            </div>
            <div className="text-label-sm text-on-surface-variant">
              saldo fiscal × CMC
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Alertas
            </div>
            <div className="mt-2xs font-semibold">
              {stats.divergent} divergente(s) · {stats.belowMin} abaixo do mín.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-sm">
          <input
            value={localQuery}
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder="Filtrar descrição ou código"
            className={cn(fieldClass, "min-w-[16rem] flex-1")}
          />
          <label className="inline-flex items-center gap-xs rounded-xl border border-outline-variant bg-surface px-md py-sm text-label-md text-on-surface">
            <input
              type="checkbox"
              checked={onlyDivergent}
              onChange={(event) => setOnlyDivergent(event.target.checked)}
              className="size-4 accent-primary"
            />
            Divergentes ({stats.divergent})
          </label>
          <label className="inline-flex items-center gap-xs rounded-xl border border-outline-variant bg-surface px-md py-sm text-label-md text-on-surface">
            <input
              type="checkbox"
              checked={onlyBelowMin}
              onChange={(event) => setOnlyBelowMin(event.target.checked)}
              className="size-4 accent-primary"
            />
            Abaixo do mín. ({stats.belowMin})
          </label>
        </div>

        {loading ? (
          <p className="text-body-md text-on-surface-variant">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
            Nenhum item com fiscal &gt; 0 ou estoque físico. Faça o sync Omie ou cadastre uma
            movimentação.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest p-sm md:p-md">
            <table className="min-w-full text-left text-body-md">
              <thead className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-sm py-xs">Produto</th>
                  <th className="px-sm py-xs">CMC Omie</th>
                  <th className="px-sm py-xs">Fiscal Omie</th>
                  <th className="px-sm py-xs">Físico</th>
                  <th className="px-sm py-xs">Custo (físico)</th>
                  <th className="px-sm py-xs">Diferença</th>
                  <th className="px-sm py-xs">Mínimo</th>
                  <th className="px-sm py-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const belowMin =
                    item.estoqueMinimo > 0 && item.quantidadeFisica <= item.estoqueMinimo;
                  const divergent = item.diferenca !== 0;
                  return (
                    <tr key={item.productId} className="border-t border-outline-variant align-top">
                      <td className="px-sm py-sm">
                        <p className="font-medium text-on-surface">{item.descricao}</p>
                        <p className="text-label-md text-on-surface-variant">
                          #{item.codigoProduto}
                          {item.codigoInterno ? ` · ${item.codigoInterno}` : ""}
                          {item.unidade ? ` · ${item.unidade}` : ""}
                        </p>
                      </td>
                      <td className="px-sm py-sm whitespace-nowrap">
                        <div className="font-medium text-on-surface">
                          {formatMoney(item.cmcEfetivo)}
                        </div>
                        {item.cmcInterno != null ? (
                          <div className="text-label-sm text-on-surface-variant">
                            Omie {formatMoney(item.cmc)} · interno
                          </div>
                        ) : item.cmc != null ? (
                          <div className="text-label-sm text-on-surface-variant">Omie</div>
                        ) : (
                          <div className="text-label-sm text-on-surface-variant">
                            Sem CMC — sync Omie
                          </div>
                        )}
                      </td>
                      <td className="px-sm py-sm whitespace-nowrap">{formatQty(item.estoqueFiscal)}</td>
                      <td
                        className={cn(
                          "px-sm py-sm whitespace-nowrap font-semibold",
                          belowMin ? "text-red-700" : "text-on-surface",
                        )}
                      >
                        {formatQty(item.quantidadeFisica)}
                      </td>
                      <td className="px-sm py-sm whitespace-nowrap font-semibold text-on-surface">
                        {item.cmcEfetivo != null ? formatMoney(item.custoTotal) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-sm py-sm whitespace-nowrap font-semibold",
                          divergent
                            ? item.diferenca < 0
                              ? "text-red-700"
                              : "text-amber-800"
                            : "text-on-surface-variant",
                        )}
                      >
                        {item.diferenca > 0 ? "+" : ""}
                        {formatQty(item.diferenca)}
                      </td>
                      <td className="px-sm py-sm whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openMinimo(item)}
                          className="text-label-md text-primary underline-offset-2 hover:underline"
                        >
                          {formatQty(item.estoqueMinimo)}
                        </button>
                      </td>
                      <td className="px-sm py-sm">
                        <div className="flex flex-wrap gap-xs">
                          <button
                            type="button"
                            onClick={() => openMove(item, "entrada")}
                            className="rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary"
                          >
                            Entrada
                          </button>
                          <button
                            type="button"
                            onClick={() => openMove(item, "saida")}
                            className="rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary"
                          >
                            Saída
                          </button>
                          <button
                            type="button"
                            onClick={() => openMove(item, "ajuste")}
                            className="rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary"
                          >
                            Ajuste
                          </button>
                          <button
                            type="button"
                            onClick={() => void openHistory(item)}
                            className="rounded-lg border border-outline-variant px-sm py-xs text-label-md text-on-surface-variant"
                          >
                            Histórico
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-outline-variant bg-surface-container-low">
                  <td className="px-sm py-sm text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                    Total (lista filtrada)
                  </td>
                  <td className="px-sm py-sm" />
                  <td className="px-sm py-sm" />
                  <td className="px-sm py-sm" />
                  <td className="px-sm py-sm whitespace-nowrap text-title-md font-bold text-on-surface">
                    {formatMoney(stats.custoFisico)}
                  </td>
                  <td className="px-sm py-sm" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
          </>
        ) : null}
      </div>

      <Dialog
        open={teamPanelId != null}
        onOpenChange={(open) => {
          if (!open) setTeamPanelId(null);
        }}
      >
        <DialogContent className="!w-[min(42rem,calc(100vw-1.5rem))] !max-w-none">
          <DialogHeader>
            <DialogTitle>{openTeamPanel?.name ?? "Equipe"}</DialogTitle>
            <DialogDescription>
              Produtos no estoque da equipe. Devolva ao estoque da empresa quando sobrar.
            </DialogDescription>
          </DialogHeader>
          {!openTeamPanel?.rows.length ? (
            <p className="text-body-md text-on-surface-variant">
              Nenhum produto nesta equipe
              {equipeQuery.trim() ? " com o filtro atual" : ""}.
            </p>
          ) : (
            <ul className="max-h-[min(28rem,60vh)] space-y-sm overflow-auto pr-xs">
              {openTeamPanel.rows.map((row) => {
                const key = `${row.teamId}-${row.productId}`;
                return (
                  <li
                    key={key}
                    className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface">{row.nome}</p>
                        <p className="text-label-md text-on-surface-variant">
                          Saldo {formatQty(row.quantidade)} · atualizado{" "}
                          {formatDateTime(row.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-sm flex flex-wrap items-end gap-xs">
                      <label className="text-label-md text-on-surface-variant">
                        Qtd a devolver
                        <input
                          value={returnQty[key] ?? String(row.quantidade)}
                          onChange={(e) =>
                            setReturnQty((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          className={cn(fieldClass, "mt-2xs w-28")}
                          inputMode="decimal"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={returningKey === key}
                        className={btnPrimary}
                        onClick={() => void returnProduct(row)}
                      >
                        <Icon name="undo" className="text-[16px]" />
                        {returningKey === key ? "Devolvendo…" : "Retornar ao estoque"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter>
            <button
              type="button"
              className={btnOutline}
              onClick={() => setTeamPanelId(null)}
            >
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moveProduct != null}
        onOpenChange={(open) => {
          if (!open) setMoveProduct(null);
        }}
      >
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>{moveTipo ? tipoLabel(moveTipo) : "Movimentar"}</DialogTitle>
            <DialogDescription>
              {moveProduct
                ? `${moveProduct.descricao} · físico atual ${formatQty(moveProduct.quantidadeFisica)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-sm">
            <label className="block text-label-md text-on-surface-variant">
              Tipo
              <select
                value={moveTipo}
                onChange={(event) => {
                  const next = event.target.value as MoveTipo;
                  setMoveTipo(next);
                  if (next === "ajuste" && moveProduct) {
                    setMoveQty(String(moveProduct.quantidadeFisica));
                  }
                }}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
              >
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="ajuste">Ajuste (nova quantidade)</option>
              </select>
            </label>
            <label className="block text-label-md text-on-surface-variant">
              {moveTipo === "ajuste" ? "Nova quantidade física" : "Quantidade"}
              <input
                value={moveQty}
                onChange={(event) => setMoveQty(event.target.value)}
                inputMode="decimal"
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Motivo{moveTipo === "entrada" ? " (opcional)" : ""}
              <input
                value={moveMotivo}
                onChange={(event) => setMoveMotivo(event.target.value)}
                maxLength={2000}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Observação (opcional)
              <textarea
                value={moveObs}
                onChange={(event) => setMoveObs(event.target.value)}
                rows={2}
                maxLength={2000}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
              />
            </label>
          </div>
          <DialogFooter className="gap-sm">
            <button
              type="button"
              onClick={() => setMoveProduct(null)}
              className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-on-surface"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={moving}
              onClick={() => void confirmMove()}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              {moving ? "Salvando..." : "Confirmar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyProduct != null}
        onOpenChange={(open) => {
          if (!open) setHistoryProduct(null);
        }}
      >
        <DialogContent className="!w-[min(40rem,calc(100vw-1.5rem))] !max-w-none">
          <DialogHeader>
            <DialogTitle>Histórico físico</DialogTitle>
            <DialogDescription>
              {historyProduct
                ? `${historyProduct.descricao} · fiscal ${formatQty(historyProduct.estoqueFiscal)} / físico ${formatQty(historyProduct.quantidadeFisica)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {loadingHistory ? (
            <p className="text-body-md text-on-surface-variant">Carregando...</p>
          ) : history.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Nenhuma movimentação ainda.</p>
          ) : (
            <div className="max-h-[24rem] overflow-auto rounded-lg border border-outline-variant">
              <table className="min-w-full text-left text-body-md">
                <thead className="sticky top-0 bg-primary text-label-md font-semibold uppercase tracking-wide text-on-primary">
                  <tr>
                    <th className="px-sm py-xs">Quando</th>
                    <th className="px-sm py-xs">Tipo</th>
                    <th className="px-sm py-xs">Qtd</th>
                    <th className="px-sm py-xs">Saldo</th>
                    <th className="px-sm py-xs">Motivo / usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-t border-outline-variant">
                      <td className="px-sm py-xs whitespace-nowrap text-label-md">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-sm py-xs">{tipoLabel(row.tipo)}</td>
                      <td className="px-sm py-xs">{formatQty(row.quantidade)}</td>
                      <td className="px-sm py-xs">{formatQty(row.saldoApos)}</td>
                      <td className="px-sm py-xs">
                        <p className="text-on-surface">{row.motivo || "—"}</p>
                        <p className="text-label-md text-on-surface-variant">
                          {row.userName || "—"}
                          {row.observacao ? ` · ${row.observacao}` : ""}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setHistoryProduct(null)}
              className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-on-surface"
            >
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={minProduct != null}
        onOpenChange={(open) => {
          if (!open) setMinProduct(null);
        }}
      >
        <DialogContent className="max-w-[24rem]">
          <DialogHeader>
            <DialogTitle>Estoque mínimo</DialogTitle>
            <DialogDescription>{minProduct?.descricao}</DialogDescription>
          </DialogHeader>
          <label className="block text-label-md text-on-surface-variant">
            Quantidade mínima
            <input
              value={minValue}
              onChange={(event) => setMinValue(event.target.value)}
              inputMode="decimal"
              className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
            />
          </label>
          <DialogFooter className="gap-sm">
            <button
              type="button"
              onClick={() => setMinProduct(null)}
              className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-on-surface"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={savingMin}
              onClick={() => void saveMinimo()}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              {savingMin ? "Salvando..." : "Salvar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
