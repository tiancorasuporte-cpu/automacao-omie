import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { APP_NAME } from "@/lib/brand";
import {
  DEFAULT_PRODUCT_MARKUP,
  effectiveCmc,
  isUnitBelowCmc,
  suggestedPriceFromCmc,
} from "@/lib/product-pricing";
import {
  getProdutosBootstrapFn,
  listProdutosFn,
  syncProdutosFn,
  updateProdutoFn,
} from "@/lib/produtos";
import { requireModule } from "@/lib/require-auth";

export const Route = createFileRoute("/produtos")({
  beforeLoad: () => requireModule("produtos"),
  loader: async () => getProdutosBootstrapFn(),
  head: () => ({
    meta: [{ title: `Produtos — ${APP_NAME}` }],
  }),
  component: ProdutosPage,
});

type ProductRow = {
  id: number;
  omieAppId: string;
  omieAppName: string;
  codigoProduto: number;
  codigoInterno: string | null;
  descricao: string;
  unidade: string | null;
  valorUnitario: number | null;
  cmc: number | null;
  cmcInterno: number | null;
  markup: number;
  precoSugerido: number | null;
  ncm: string | null;
};

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ProdutosPage() {
  const bootstrap = Route.useLoaderData();
  const router = useRouter();
  const { query } = useShellSearch();

  const [apps] = useState(bootstrap.apps);
  const [omieAppId] = useState(bootstrap.omieAppId ?? bootstrap.apps[0]?.id ?? "");
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(bootstrap.productCount);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<
    Record<number, { cmcInterno: string; markup: string; valorUnitario: string }>
  >({});
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const q = productQuery.trim() || query.trim();
    const timer = setTimeout(async () => {
      const result = await listProdutosFn({
        data: {
          ...(q ? { query: q } : {}),
          limit: 120,
        },
      });
      setProducts(result.items);
      setTotal(result.total);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of result.items) {
          if (!next[item.id]) {
            next[item.id] = {
              cmcInterno: item.cmcInterno != null ? String(item.cmcInterno) : "",
              markup: String(item.markup ?? DEFAULT_PRODUCT_MARKUP),
              valorUnitario: item.valorUnitario != null ? String(item.valorUnitario) : "",
            };
          }
        }
        return next;
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [productQuery, query]);

  async function handleSync() {
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await syncProdutosFn();
      const errors = result.perApp.filter((entry) => entry.error || entry.cmcError);
      setFeedback({
        type: errors.length && result.cmcTotal === 0 ? "error" : errors.length ? "error" : "ok",
        text: errors.length
          ? `Sync: ${result.total} produtos / CMC Omie ${result.cmcTotal}. ${errors
              .map((e) => `${e.appId}: ${e.error || e.cmcError}`)
              .join(" · ")}`
          : `${result.total} produtos sincronizados. CMC Omie atualizado em ${result.cmcTotal} itens.`,
      });
      setDrafts({});
      await router.invalidate();
      const listed = await listProdutosFn({
        data: {
          ...(productQuery.trim() ? { query: productQuery.trim() } : {}),
          limit: 120,
        },
      });
      setProducts(listed.items);
      setTotal(listed.total);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao sincronizar produtos.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave(product: ProductRow) {
    const draft = drafts[product.id];
    if (!draft) return;
    const cmcInternoRaw = draft.cmcInterno.trim();
    const markupRaw = draft.markup.trim();
    const priceRaw = draft.valorUnitario.trim();
    const cmcInterno = cmcInternoRaw === "" ? null : Number(cmcInternoRaw.replace(",", "."));
    const markup = Number(markupRaw.replace(",", "."));
    const valorUnitario = priceRaw === "" ? null : Number(priceRaw.replace(",", "."));
    if (cmcInterno != null && (!Number.isFinite(cmcInterno) || cmcInterno < 0)) {
      setFeedback({ type: "error", text: "CMC interno inválido." });
      return;
    }
    if (!Number.isFinite(markup) || markup <= 0) {
      setFeedback({ type: "error", text: "Markup inválido." });
      return;
    }
    if (valorUnitario != null && (!Number.isFinite(valorUnitario) || valorUnitario < 0)) {
      setFeedback({ type: "error", text: "Preço Omie/local inválido." });
      return;
    }

    setSavingId(product.id);
    setFeedback(null);
    try {
      const result = await updateProdutoFn({
        data: { id: product.id, cmcInterno, markup, valorUnitario },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setProducts((prev) => prev.map((row) => (row.id === product.id ? result.product : row)));
      setDrafts((prev) => ({
        ...prev,
        [product.id]: {
          cmcInterno: result.product.cmcInterno != null ? String(result.product.cmcInterno) : "",
          markup: String(result.product.markup),
          valorUnitario:
            result.product.valorUnitario != null ? String(result.product.valorUnitario) : "",
        },
      }));
      setFeedback({ type: "ok", text: `${result.product.descricao} atualizado.` });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AppShell mobileTitle="Produtos" searchPlaceholder="Buscar produtos...">
      <div className="space-y-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="text-headline-sm text-primary">Produtos</h1>
            <p className="text-body-md text-on-surface-variant">
              Empresa Belfer — CMC Omie (sync), CMC interno e markup sugerido (
              {DEFAULT_PRODUCT_MARKUP}×). No orçamento vale o CMC maior.
            </p>
          </div>
          <button
            type="button"
            disabled={syncing || !omieAppId}
            onClick={handleSync}
            className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
          >
            <Icon name={syncing ? "hourglass_empty" : "sync"} className="text-[18px]" />
            {syncing ? "Sincronizando..." : `Sync Omie (${total})`}
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

        <div className="flex flex-wrap gap-sm">
          <div className="rounded-lg border border-outline-variant bg-surface-container-low px-sm py-sm text-body-md text-on-surface">
            {apps[0]?.name ?? "Belfer"}
          </div>
          <input
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            placeholder="Filtrar descrição ou código"
            className="min-w-[16rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
          />
        </div>

        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
            Nenhum produto encontrado. Faça o sync da Omie.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
            <table className="min-w-full text-left text-body-md">
              <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                <tr>
                  <th className="px-sm py-xs">Produto</th>
                  <th className="px-sm py-xs">CMC Omie</th>
                  <th className="px-sm py-xs">CMC interno</th>
                  <th className="px-sm py-xs">Markup</th>
                  <th className="px-sm py-xs">Sugerido</th>
                  <th className="px-sm py-xs">Preço (Omie/local)</th>
                  <th className="px-sm py-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const draft = drafts[product.id] ?? {
                    cmcInterno: product.cmcInterno != null ? String(product.cmcInterno) : "",
                    markup: String(product.markup),
                    valorUnitario: product.valorUnitario != null ? String(product.valorUnitario) : "",
                  };
                  const cmcInternoNum =
                    draft.cmcInterno.trim() === ""
                      ? null
                      : Number(draft.cmcInterno.replace(",", "."));
                  const markupNum = Number(draft.markup.replace(",", ".")) || DEFAULT_PRODUCT_MARKUP;
                  const priceNum =
                    draft.valorUnitario.trim() === ""
                      ? null
                      : Number(draft.valorUnitario.replace(",", "."));
                  const cmcEfetivo = effectiveCmc(product.cmc, cmcInternoNum);
                  const sugerido = suggestedPriceFromCmc(cmcEfetivo, markupNum);
                  const belowCmc = priceNum != null && isUnitBelowCmc(priceNum, cmcEfetivo);

                  return (
                    <tr key={product.id} className="border-t border-outline-variant align-top">
                      <td className="px-sm py-xs">
                        <p className="font-medium text-on-surface">{product.descricao}</p>
                        <p className="text-label-md text-on-surface-variant">
                          #{product.codigoProduto}
                          {product.codigoInterno ? ` · ${product.codigoInterno}` : ""}
                          {product.unidade ? ` · ${product.unidade}` : ""}
                          {" · "}
                          {product.omieAppName}
                        </p>
                      </td>
                      <td className="px-sm py-xs text-on-surface-variant">
                        {formatMoney(product.cmc)}
                      </td>
                      <td className="px-sm py-xs">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={draft.cmcInterno}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, cmcInterno: event.target.value },
                            }))
                          }
                          className="w-28 rounded border border-outline-variant bg-surface px-xs py-xs"
                        />
                      </td>
                      <td className="px-sm py-xs">
                        <input
                          type="number"
                          min={0.01}
                          step="any"
                          value={draft.markup}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, markup: event.target.value },
                            }))
                          }
                          className="w-20 rounded border border-outline-variant bg-surface px-xs py-xs"
                        />
                      </td>
                      <td className="px-sm py-xs text-on-surface-variant">{formatMoney(sugerido)}</td>
                      <td className="px-sm py-xs">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={draft.valorUnitario}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, valorUnitario: event.target.value },
                            }))
                          }
                          className={`w-28 rounded border bg-surface px-xs py-xs ${
                            belowCmc
                              ? "border-red-400 text-red-700 font-semibold"
                              : "border-outline-variant"
                          }`}
                        />
                        {belowCmc ? (
                          <p className="mt-xs text-label-md text-red-700">Abaixo do CMC</p>
                        ) : null}
                      </td>
                      <td className="px-sm py-xs">
                        <button
                          type="button"
                          disabled={savingId === product.id}
                          onClick={() => handleSave(product)}
                          className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary disabled:opacity-50"
                        >
                          <Icon
                            name={savingId === product.id ? "hourglass_empty" : "save"}
                            className="text-[16px]"
                          />
                          Salvar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
