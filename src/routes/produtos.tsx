import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { PageTitle } from "@/components/PageChrome";
import { SuggestInput } from "@/components/SuggestInput";
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
  DEFAULT_PRODUCT_MARKUP,
  effectiveCmc,
  isUnitBelowCmc,
  suggestedPriceFromCmc,
} from "@/lib/product-pricing";
import {
  getProdutosBootstrapFn,
  listFornecedoresFn,
  listProdutoFornecedorCodigosFn,
  listProdutosFn,
  saveProdutoFornecedorCodigosFn,
  syncFornecedoresFn,
  syncProdutosFn,
  updateProdutoFn,
} from "@/lib/produtos";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

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
  supplierCodes?: Array<{
    supplierId: number;
    supplierName: string;
    codigoFornecedor: string;
  }>;
};

type SupplierRow = {
  id: number;
  codigoOmie: number;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpjCpf: string | null;
};

type SupplierLinkDraft = {
  key: string;
  supplierId: string;
  codigoFornecedor: string;
};

type TabId = "produtos" | "fornecedores";

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function supplierLabel(supplier: SupplierRow) {
  return (supplier.nomeFantasia?.trim() || supplier.razaoSocial).trim();
}

function ProdutosPage() {
  const bootstrap = Route.useLoaderData();
  const router = useRouter();
  const { query } = useShellSearch();

  const [apps] = useState(bootstrap.apps);
  const [omieAppId] = useState(bootstrap.omieAppId ?? bootstrap.apps[0]?.id ?? "");
  const [tab, setTab] = useState<TabId>("produtos");
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(bootstrap.productCount);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierTotal, setSupplierTotal] = useState(bootstrap.supplierCount ?? 0);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncingSuppliers, setSyncingSuppliers] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<
    Record<number, { cmcInterno: string; markup: string; valorUnitario: string }>
  >({});
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [linksProduct, setLinksProduct] = useState<ProductRow | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<SupplierLinkDraft[]>([]);
  const [savingLinks, setSavingLinks] = useState(false);

  const supplierOptions = useMemo(
    () =>
      [...suppliers].sort((a, b) =>
        supplierLabel(a).localeCompare(supplierLabel(b), "pt-BR", { sensitivity: "base" }),
      ),
    [suppliers],
  );

  const supplierSuggestOptions = useMemo(
    () =>
      supplierOptions.map((supplier) => ({
        value: String(supplier.id),
        label: supplierLabel(supplier),
        hint: [
          supplier.cnpjCpf ? `CNPJ ${supplier.cnpjCpf}` : null,
          `#${supplier.codigoOmie}`,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [supplierOptions],
  );

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

  useEffect(() => {
    const q = supplierQuery.trim();
    const timer = setTimeout(async () => {
      const result = await listFornecedoresFn({
        data: {
          ...(q ? { query: q } : {}),
          limit: 300,
        },
      });
      setSuppliers(result.items);
      setSupplierTotal(result.total);
    }, 250);
    return () => clearTimeout(timer);
  }, [supplierQuery]);

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

  async function handleSyncSuppliers() {
    setSyncingSuppliers(true);
    setFeedback(null);
    try {
      const result = await syncFornecedoresFn();
      const errors = result.perApp.filter((entry) => entry.error);
      setFeedback({
        type: errors.length ? "error" : "ok",
        text: errors.length
          ? `Sync fornecedores parcial: ${result.total}. ${errors
              .map((e) => `${e.appId}: ${e.error}`)
              .join(" · ")}`
          : `${result.total} fornecedor(es) sincronizado(s) da Omie.`,
      });
      await router.invalidate();
      const listed = await listFornecedoresFn({
        data: {
          ...(supplierQuery.trim() ? { query: supplierQuery.trim() } : {}),
          limit: 300,
        },
      });
      setSuppliers(listed.items);
      setSupplierTotal(listed.total);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao sincronizar fornecedores.",
      });
    } finally {
      setSyncingSuppliers(false);
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
      setProducts((prev) =>
        prev.map((row) =>
          row.id === product.id
            ? { ...result.product, supplierCodes: row.supplierCodes }
            : row,
        ),
      );
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

  async function openSupplierLinks(product: ProductRow) {
    setFeedback(null);
    setLinksProduct(product);
    if (!suppliers.length) {
      const listed = await listFornecedoresFn({ data: { limit: 300 } });
      setSuppliers(listed.items);
      setSupplierTotal(listed.total);
    }
    const result = await listProdutoFornecedorCodigosFn({ data: { productId: product.id } });
    if (!result.ok) {
      setFeedback({ type: "error", text: result.error });
      setLinksProduct(null);
      return;
    }
    setLinkDrafts(
      result.items.map((item) => ({
        key: `link-${item.id}`,
        supplierId: String(item.supplierId),
        codigoFornecedor: item.codigoFornecedor,
      })),
    );
  }

  async function saveSupplierLinks() {
    if (!linksProduct) return;
    const links = linkDrafts
      .map((row) => ({
        supplierId: Number(row.supplierId),
        codigoFornecedor: row.codigoFornecedor.trim(),
      }))
      .filter((row) => row.supplierId > 0 && row.codigoFornecedor);
    setSavingLinks(true);
    setFeedback(null);
    try {
      const result = await saveProdutoFornecedorCodigosFn({
        data: { productId: linksProduct.id, links },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      const supplierCodes = result.items.map((item) => ({
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        codigoFornecedor: item.codigoFornecedor,
      }));
      setProducts((prev) =>
        prev.map((row) => (row.id === linksProduct.id ? { ...row, supplierCodes } : row)),
      );
      setLinksProduct(null);
      setFeedback({
        type: "ok",
        text:
          supplierCodes.length > 0
            ? `Fornecedores atualizados em ${linksProduct.descricao}.`
            : `Vínculos de fornecedor removidos de ${linksProduct.descricao}.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar fornecedores.",
      });
    } finally {
      setSavingLinks(false);
    }
  }

  return (
    <AppShell mobileTitle="Produtos" searchPlaceholder="Buscar produtos ou cód. fornecedor...">
      <div className="space-y-lg">
        <PageTitle
          title="Produtos"
          subtitle="CMC Omie/interno, markup e códigos de fornecedor (Route 66 e outros)."
        >
          <button
            type="button"
            disabled={syncingSuppliers || !omieAppId}
            onClick={() => void handleSyncSuppliers()}
            className="inline-flex items-center gap-xs rounded-lg border border-white/40 px-sm py-xs text-label-md text-on-primary hover:bg-white/10 disabled:opacity-50"
          >
            <Icon name={syncingSuppliers ? "hourglass_empty" : "sync"} className="text-[16px]" />
            {syncingSuppliers ? "Sincronizando..." : `Sync fornecedores (${supplierTotal})`}
          </button>
          <button
            type="button"
            disabled={syncing || !omieAppId}
            onClick={() => void handleSync()}
            className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
          >
            <Icon name={syncing ? "hourglass_empty" : "sync"} className="text-[16px]" />
            {syncing ? "Sincronizando..." : `Sync produtos (${total})`}
          </button>
        </PageTitle>

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

        <div className="flex flex-wrap gap-xs">
          {(
            [
              { id: "produtos" as const, label: "Produtos" },
              { id: "fornecedores" as const, label: "Fornecedores" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "inline-flex items-center gap-xs rounded-lg px-sm py-xs text-label-md",
                tab === entry.id
                  ? "bg-primary font-semibold text-on-primary"
                  : "border border-outline-variant text-primary hover:bg-surface-container-high",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === "produtos" ? (
          <>
            <div className="flex flex-wrap gap-sm">
              <div className="rounded-lg border border-outline-variant bg-surface-container-low px-sm py-sm text-body-md text-on-surface">
                {apps[0]?.name ?? "Belfer"}
              </div>
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Filtrar descrição, código Omie ou código fornecedor"
                className="min-w-[16rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
              />
            </div>

            {products.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
                Nenhum produto encontrado. Faça o sync da Omie.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
                <table className="min-w-full text-left text-body-md">
                  <thead className="bg-primary text-label-md font-semibold uppercase tracking-wide text-on-primary">
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
                        valorUnitario:
                          product.valorUnitario != null ? String(product.valorUnitario) : "",
                      };
                      const cmcInternoNum =
                        draft.cmcInterno.trim() === ""
                          ? null
                          : Number(draft.cmcInterno.replace(",", "."));
                      const markupNum =
                        Number(draft.markup.replace(",", ".")) || DEFAULT_PRODUCT_MARKUP;
                      const priceNum =
                        draft.valorUnitario.trim() === ""
                          ? null
                          : Number(draft.valorUnitario.replace(",", "."));
                      const cmcEfetivo = effectiveCmc(product.cmc, cmcInternoNum);
                      const sugerido = suggestedPriceFromCmc(cmcEfetivo, markupNum);
                      const belowCmc = priceNum != null && isUnitBelowCmc(priceNum, cmcEfetivo);
                      const codes = product.supplierCodes ?? [];

                      return (
                        <tr key={product.id} className="border-t border-outline-variant align-top">
                          <td className="px-sm py-xs">
                            <p className="font-medium text-on-surface">{product.descricao}</p>
                            <p className="text-label-md text-on-surface-variant">
                              #{product.codigoProduto}
                              {product.codigoInterno ? ` · ${product.codigoInterno}` : ""}
                              {product.unidade ? ` · ${product.unidade}` : ""}
                            </p>
                            {codes.length > 0 ? (
                              <p className="mt-xs text-label-md text-secondary">
                                {codes
                                  .map((c) => `${c.supplierName} #${c.codigoFornecedor}`)
                                  .join(" · ")}
                              </p>
                            ) : null}
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
                          <td className="px-sm py-xs text-on-surface-variant">
                            {formatMoney(sugerido)}
                          </td>
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
                            <div className="flex flex-col gap-xs sm:flex-row">
                              <button
                                type="button"
                                onClick={() => void openSupplierLinks(product)}
                                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary"
                              >
                                <Icon name="local_shipping" className="text-[16px]" />
                                Fornecedores
                              </button>
                              <button
                                type="button"
                                disabled={savingId === product.id}
                                onClick={() => void handleSave(product)}
                                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary disabled:opacity-50"
                              >
                                <Icon
                                  name={savingId === product.id ? "hourglass_empty" : "save"}
                                  className="text-[16px]"
                                />
                                Salvar
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
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-sm">
              <input
                value={supplierQuery}
                onChange={(event) => setSupplierQuery(event.target.value)}
                placeholder="Filtrar fornecedor por nome, CNPJ ou código Omie"
                className="min-w-[16rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
              />
            </div>
            {suppliers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
                Nenhum fornecedor sincronizado. Clique em <strong>Sync fornecedores</strong>.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
                <table className="min-w-full text-left text-body-md">
                  <thead className="bg-primary text-label-md font-semibold uppercase tracking-wide text-on-primary">
                    <tr>
                      <th className="px-sm py-xs">Fornecedor</th>
                      <th className="px-sm py-xs">CNPJ/CPF</th>
                      <th className="px-sm py-xs">Código Omie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id} className="border-t border-outline-variant">
                        <td className="px-sm py-xs">
                          <p className="font-medium text-on-surface">{supplierLabel(supplier)}</p>
                          {supplier.nomeFantasia &&
                          supplier.nomeFantasia.trim() !== supplier.razaoSocial.trim() ? (
                            <p className="text-label-md text-on-surface-variant">
                              {supplier.razaoSocial}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-sm py-xs text-on-surface-variant">
                          {supplier.cnpjCpf || "—"}
                        </td>
                        <td className="px-sm py-xs text-on-surface-variant">
                          #{supplier.codigoOmie}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={linksProduct != null}
        onOpenChange={(open) => {
          if (!open) setLinksProduct(null);
        }}
      >
        <DialogContent className="!w-[min(40rem,calc(100vw-1.5rem))] !max-w-none">
          <DialogHeader>
            <DialogTitle>Códigos de fornecedor</DialogTitle>
            <DialogDescription>
              {linksProduct
                ? `${linksProduct.descricao} · #${linksProduct.codigoProduto}`
                : "Vincule um ou mais fornecedores ao produto."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-sm">
            {supplierOptions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-outline-variant px-md py-sm text-body-md text-on-surface-variant">
                Nenhum fornecedor disponível. Faça o <strong>Sync fornecedores</strong> antes.
              </p>
            ) : null}

            {linkDrafts.map((row) => (
              <div
                key={row.key}
                className="grid gap-sm rounded-lg border border-outline-variant p-sm sm:grid-cols-[1fr_8rem_auto]"
              >
                <label className="block space-y-xs text-label-md text-on-surface-variant">
                  Fornecedor
                  <SuggestInput
                    value={row.supplierId}
                    onChange={(value) =>
                      setLinkDrafts((prev) =>
                        prev.map((item) =>
                          item.key === row.key ? { ...item, supplierId: value } : item,
                        ),
                      )
                    }
                    options={supplierSuggestOptions}
                    freeText={false}
                    placeholder="Digite para buscar fornecedor…"
                    emptyLabel="Nenhum fornecedor encontrado"
                    className="w-full"
                  />
                </label>
                <label className="block space-y-xs text-label-md text-on-surface-variant">
                  Código
                  <input
                    value={row.codigoFornecedor}
                    onChange={(event) =>
                      setLinkDrafts((prev) =>
                        prev.map((item) =>
                          item.key === row.key
                            ? { ...item, codigoFornecedor: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Ex.: 13072"
                    className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md"
                  />
                </label>
                <button
                  type="button"
                  className="self-end rounded-lg px-sm py-xs text-label-md text-error"
                  onClick={() =>
                    setLinkDrafts((prev) => prev.filter((item) => item.key !== row.key))
                  }
                >
                  Remover
                </button>
              </div>
            ))}

            <button
              type="button"
              disabled={supplierOptions.length === 0}
              onClick={() =>
                setLinkDrafts((prev) => [
                  ...prev,
                  {
                    key: `new-${Date.now()}`,
                    supplierId: "",
                    codigoFornecedor: "",
                  },
                ])
              }
              className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary disabled:opacity-50"
            >
              <Icon name="add" className="text-[16px]" />
              Adicionar fornecedor
            </button>
          </div>

          <DialogFooter>
            <button
              type="button"
              className="rounded-lg px-md py-sm text-label-md"
              onClick={() => setLinksProduct(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={savingLinks}
              onClick={() => void saveSupplierLinks()}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary disabled:opacity-50"
            >
              {savingLinks ? "Salvando..." : "Salvar vínculos"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
