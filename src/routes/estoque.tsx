import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
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
  getEstoqueBootstrapFn,
  listEstoqueFn,
  listEstoqueHistoricoFn,
  moveEstoqueFn,
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

function formatQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
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

  const [items, setItems] = useState<StockRow[]>([]);
  const [total, setTotal] = useState(bootstrap.total);
  const [localQuery, setLocalQuery] = useState("");
  const [onlyDivergent, setOnlyDivergent] = useState(false);
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

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

  const stats = useMemo(() => {
    let divergent = 0;
    let belowMin = 0;
    for (const item of items) {
      if (item.diferenca !== 0) divergent += 1;
      if (item.estoqueMinimo > 0 && item.quantidadeFisica <= item.estoqueMinimo) belowMin += 1;
    }
    return { divergent, belowMin };
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
      <div className="space-y-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="text-headline-sm text-primary">Estoque</h1>
            <p className="text-body-md text-on-surface-variant">
              Fiscal Omie (somente leitura) × físico local (entrada, saída e ajuste).
            </p>
          </div>
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSync()}
            className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
          >
            <Icon name={syncing ? "hourglass_empty" : "sync"} className="text-[18px]" />
            {syncing ? "Sincronizando..." : "Sync estoque Omie"}
          </button>
        </div>

        {feedback ? (
          <div
            className={`rounded-lg border px-md py-sm text-body-md ${
              feedback.type === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            {feedback.text}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-sm">
          <div className="rounded-lg border border-outline-variant bg-surface-container-low px-sm py-sm text-body-md text-on-surface">
            {bootstrap.apps[0]?.name ?? "Belfer"} · {total} item(ns)
          </div>
          <input
            value={localQuery}
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder="Filtrar descrição ou código"
            className="min-w-[16rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
          />
          <label className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-sm py-sm text-label-md text-on-surface">
            <input
              type="checkbox"
              checked={onlyDivergent}
              onChange={(event) => setOnlyDivergent(event.target.checked)}
              className="size-4 accent-primary"
            />
            Divergentes ({stats.divergent})
          </label>
          <label className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-sm py-sm text-label-md text-on-surface">
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
          <p className="rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
            Nenhum item com fiscal &gt; 0 ou estoque físico. Faça o sync Omie ou cadastre uma
            movimentação.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
            <table className="min-w-full text-left text-body-md">
              <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                <tr>
                  <th className="px-sm py-xs">Produto</th>
                  <th className="px-sm py-xs">Fiscal Omie</th>
                  <th className="px-sm py-xs">Físico</th>
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
                      <td className="px-sm py-sm whitespace-nowrap">{formatQty(item.estoqueFiscal)}</td>
                      <td
                        className={cn(
                          "px-sm py-sm whitespace-nowrap font-semibold",
                          belowMin ? "text-red-700" : "text-on-surface",
                        )}
                      >
                        {formatQty(item.quantidadeFisica)}
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
            </table>
          </div>
        )}
      </div>

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
              className="rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
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
                <thead className="sticky top-0 bg-surface-container-low text-label-md text-on-surface-variant">
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
              className="rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
            >
              {savingMin ? "Salvando..." : "Salvar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
