import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { APP_NAME } from "@/lib/brand";
import {
  createOrcamentoFn,
  deleteOrcamentoFn,
  getOrcamentoFn,
  getOrcamentosBootstrapFn,
  saveOrcamentoFn,
  searchOmieClientsFn,
  searchOmieProductsFn,
  sendOrcamentoToOmieFn,
  syncOmieProductsFn,
} from "@/lib/orcamentos";
import { openOrcamentoPdf } from "@/lib/orcamento-pdf";
import { downloadOrcamentoExcel } from "@/lib/orcamento-excel";
import { effectiveCmc, isUnitBelowCmc, isUnitBelowSuggested, suggestedPriceFromCmc } from "@/lib/product-pricing";
import { requireModule } from "@/lib/require-auth";

export const Route = createFileRoute("/orcamentos")({
  beforeLoad: () => requireModule("orcamentos"),
  loader: async () => getOrcamentosBootstrapFn(),
  head: () => ({
    meta: [{ title: `Orçamentos — ${APP_NAME}` }],
  }),
  component: OrcamentosPage,
});

type CartItem = {
  key: string;
  codigoProduto: number;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number;
  cmc: number | null;
  cmcInterno: number | null;
  markup: number | null;
  ncm: string | null;
};

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: string, error?: string | null) {
  if (status === "sent") return "Enviado Omie";
  if (status === "draft") return "Salvo";
  if (status === "error") return `Erro: ${error ?? ""}`;
  return status;
}

function OrcamentosPage() {
  const bootstrap = Route.useLoaderData();
  const router = useRouter();
  const { query } = useShellSearch();

  const [apps] = useState(bootstrap.apps);
  const [quotes, setQuotes] = useState(bootstrap.quotes);
  const [productCount, setProductCount] = useState(bootstrap.productCount);
  const [omieAppId] = useState(bootstrap.omieAppId ?? bootstrap.apps[0]?.id ?? "");
  const canDeleteQuotes = bootstrap.canDeleteQuotes === true;
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [numeroInterno, setNumeroInterno] = useState<string | null>(null);
  const [criadoPor, setCriadoPor] = useState<string | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<
    Array<{ codigo: number; nome: string; cnpjCpf: string | null }>
  >([]);
  const [selectedClient, setSelectedClient] = useState<{
    codigo: number;
    nome: string;
    cnpjCpf: string | null;
  } | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<
    Array<{
      codigoProduto: number;
      descricao: string;
      unidade: string | null;
      valorUnitario: number | null;
      cmc: number | null;
      cmcInterno: number | null;
      cmcEfetivo: number | null;
      markup: number;
      precoSugerido: number | null;
      ncm: string | null;
      codigoInterno: string | null;
    }>
  >([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [observacao, setObservacao] = useState("");
  const [dataPrevisao, setDataPrevisao] = useState(todayIso());
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [deletingQuoteId, setDeletingQuoteId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof bootstrap.quotes)[number] | null>(null);
  const [searchingClients, setSearchingClients] = useState(false);
  const [showLineValues, setShowLineValues] = useState(true);
  const [showTotal, setShowTotal] = useState(true);
  const [quotesFilter, setQuotesFilter] = useState("");
  const [quotesStatusFilter, setQuotesStatusFilter] = useState<"all" | "draft" | "sent" | "error">("all");
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0),
    [cart],
  );

  const belowCmcCount = useMemo(
    () =>
      cart.filter((item) =>
        isUnitBelowCmc(item.valorUnitario, effectiveCmc(item.cmc, item.cmcInterno)),
      ).length,
    [cart],
  );

  const belowSuggestedCount = useMemo(
    () =>
      cart.filter((item) => {
        const cmcEfetivo = effectiveCmc(item.cmc, item.cmcInterno);
        if (isUnitBelowCmc(item.valorUnitario, cmcEfetivo)) return false;
        const sugerido = suggestedPriceFromCmc(cmcEfetivo, item.markup ?? undefined);
        return isUnitBelowSuggested(item.valorUnitario, sugerido);
      }).length,
    [cart],
  );

  const filteredQuotes = useMemo(() => {
    const q = quotesFilter.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (quotesStatusFilter !== "all" && quote.status !== quotesStatusFilter) return false;
      if (!q) return true;
      const haystack = [
        quote.numeroInterno,
        quote.clientName,
        String(quote.clientCode),
        quote.createdByName,
        quote.numeroPedido,
        quote.omiePedidoCode != null ? String(quote.omiePedidoCode) : "",
        quote.omieAppName,
        statusLabel(quote.status, quote.error),
        quote.error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [quotes, quotesFilter, quotesStatusFilter]);

  const locked = quoteStatus === "sent";

  useEffect(() => {
    if (!omieAppId) return;
    const q = productQuery.trim() || query.trim();
    const timer = setTimeout(async () => {
      const rows = await searchOmieProductsFn({
        data: { omieAppId, query: q || undefined, limit: 40 },
      });
      setProducts(rows);
    }, 250);
    return () => clearTimeout(timer);
  }, [omieAppId, productQuery, query]);

  useEffect(() => {
    if (!omieAppId || clientQuery.trim().length < 2 || selectedClient) {
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const rows = await searchOmieClientsFn({
          data: { omieAppId, query: clientQuery.trim() },
        });
        setClientResults(rows);
      } finally {
        setSearchingClients(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [omieAppId, clientQuery, selectedClient]);

  async function refreshQuotes() {
    const boot = await getOrcamentosBootstrapFn();
    setQuotes(boot.quotes);
    setProductCount(boot.productCount);
  }

  function resetForm() {
    setEditingQuoteId(null);
    setNumeroInterno(null);
    setCriadoPor(null);
    setQuoteStatus(null);
    setSelectedClient(null);
    setClientQuery("");
    setCart([]);
    setObservacao("");
    setDataPrevisao(todayIso());
  }

  async function handleSyncProducts() {
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await syncOmieProductsFn();
      setProductCount(result.total);
      const errors = result.perApp.filter((entry) => entry.error);
      setFeedback({
        type: errors.length ? "error" : "ok",
        text: errors.length
          ? `Sync parcial: ${result.total} produtos. ${errors.map((e) => `${e.appId}: ${e.error}`).join(" · ")}`
          : `${result.total} produtos sincronizados da Omie${"cmcTotal" in result && result.cmcTotal ? ` (CMC em ${result.cmcTotal})` : ""}.`,
      });
      const rows = await searchOmieProductsFn({
        data: { omieAppId, query: productQuery || undefined, limit: 40 },
      });
      setProducts(rows);
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao sincronizar produtos.",
      });
    } finally {
      setSyncing(false);
    }
  }

  function addProduct(product: (typeof products)[number]) {
    if (locked) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.codigoProduto === product.codigoProduto);
      if (existing) {
        return prev.map((item) =>
          item.codigoProduto === product.codigoProduto
            ? { ...item, quantidade: item.quantidade + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          key: `${product.codigoProduto}-${Date.now()}`,
          codigoProduto: product.codigoProduto,
          descricao: product.descricao,
          unidade: product.unidade,
          quantidade: 1,
          valorUnitario: product.valorUnitario ?? 0,
          cmc: product.cmc ?? null,
          cmcInterno: product.cmcInterno ?? null,
          markup: product.markup ?? null,
          ncm: product.ncm,
        },
      ];
    });
  }

  function buildPayload() {
    if (!omieAppId || !selectedClient || cart.length === 0) {
      throw new Error("Selecione empresa, cliente e ao menos um produto.");
    }
    return {
      quoteId: editingQuoteId,
      omieAppId,
      clientCode: selectedClient.codigo,
      clientName: selectedClient.nome,
      observacao: observacao || null,
      dataPrevisao,
      items: cart.map((item) => ({
        codigoProduto: item.codigoProduto,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        ncm: item.ncm,
      })),
    };
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await saveOrcamentoFn({ data: buildPayload() });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setEditingQuoteId(result.quoteId);
      setNumeroInterno(result.numeroInterno);
      setQuoteStatus("draft");
      setFeedback({
        type: "ok",
        text: `Orçamento ${result.numeroInterno} salvo (${selectedClient?.nome ?? "cliente"}). Total ${formatMoney(result.total)}.`,
      });
      await refreshQuotes();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar orçamento.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setFeedback(null);
    try {
      const result = await createOrcamentoFn({ data: buildPayload() });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setEditingQuoteId(result.quoteId);
      setNumeroInterno(result.numeroInterno);
      setQuoteStatus("sent");
      setFeedback({
        type: "ok",
        text: `Orçamento ${result.numeroInterno} enviado à Omie${result.numeroPedido ? ` (nº ${result.numeroPedido})` : ""}. Total ${formatMoney(result.total)}.`,
      });
      await refreshQuotes();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao enviar orçamento.",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleSendSaved(quoteId: number) {
    setSending(true);
    setFeedback(null);
    try {
      const result = await sendOrcamentoToOmieFn({ data: { quoteId } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      if (editingQuoteId === quoteId) setQuoteStatus("sent");
      setFeedback({
        type: "ok",
        text: `Orçamento ${result.numeroInterno} enviado à Omie${result.numeroPedido ? ` (nº ${result.numeroPedido})` : ""}.`,
      });
      await refreshQuotes();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao enviar orçamento.",
      });
    } finally {
      setSending(false);
    }
  }

  function handleDeleteQuote(quote: (typeof quotes)[number]) {
    if (!canDeleteQuotes) {
      setFeedback({ type: "error", text: "Seu usuário não tem permissão para excluir orçamentos." });
      return;
    }
    setDeleteTarget(quote);
  }

  async function confirmDeleteQuote(alsoDeleteOmie: boolean) {
    const quote = deleteTarget;
    if (!quote) return;
    setDeleteTarget(null);
    setDeletingQuoteId(quote.id);
    setFeedback(null);
    try {
      const result = await deleteOrcamentoFn({
        data: { quoteId: quote.id, alsoDeleteOmie },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      if (editingQuoteId === quote.id) resetForm();
      setFeedback({
        type: "ok",
        text: result.omieDeleted
          ? `Orçamento ${result.numeroInterno} excluído no sistema e na Omie.`
          : `Orçamento ${result.numeroInterno} excluído.`,
      });
      await refreshQuotes();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao excluir orçamento.",
      });
    } finally {
      setDeletingQuoteId(null);
    }
  }

  async function handleLoadQuote(quoteId: number) {
    setLoadingQuote(true);
    setFeedback(null);
    try {
      const result = await getOrcamentoFn({ data: { quoteId } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      const { quote, items } = result;
      setEditingQuoteId(quote.id);
      setNumeroInterno(quote.numeroInterno);
      setCriadoPor(quote.createdByName);
      setQuoteStatus(quote.status);
      setSelectedClient({
        codigo: quote.clientCode,
        nome: result.clienteNomeCompleto ?? quote.clientName ?? `Cliente ${quote.clientCode}`,
        cnpjCpf: result.clienteCnpj ?? null,
      });
      setClientQuery(
        result.clienteNomeCompleto ?? quote.clientName ?? "",
      );
      setObservacao(quote.observacao ?? "");
      setDataPrevisao(quote.dataPrevisao ?? todayIso());
      setCart(
        items.map((item) => ({
          key: `${item.id}-${item.codigoProduto}`,
          codigoProduto: item.codigoProduto,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          cmc: item.cmc ?? null,
          cmcInterno: item.cmcInterno ?? null,
          markup: item.markup ?? null,
          ncm: item.ncm,
        })),
      );
      setFeedback({
        type: "ok",
        text: `Editando ${quote.numeroInterno} — ${quote.clientName ?? quote.clientCode}.`,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao carregar orçamento.",
      });
    } finally {
      setLoadingQuote(false);
    }
  }

  async function ensureQuoteSavedForExport() {
    let numero = numeroInterno;
    let elaborador = criadoPor;
    if (!numero || !editingQuoteId) {
      setSaving(true);
      try {
        const result = await saveOrcamentoFn({ data: buildPayload() });
        if (!result.ok) {
          setFeedback({ type: "error", text: result.error });
          return null;
        }
        setEditingQuoteId(result.quoteId);
        setNumeroInterno(result.numeroInterno);
        setQuoteStatus("draft");
        numero = result.numeroInterno;
        await refreshQuotes();
        const loaded = await getOrcamentoFn({ data: { quoteId: result.quoteId } });
        if (loaded.ok) {
          elaborador = loaded.quote.createdByName;
          setCriadoPor(elaborador);
        }
      } finally {
        setSaving(false);
      }
    }
    return {
      numero,
      elaborador,
      clienteNome: selectedClient?.nome ?? "Cliente não informado",
      clienteCodigo: selectedClient?.codigo ?? null,
      clienteCnpj: selectedClient?.cnpjCpf ?? null,
      empresaNome: bootstrap.empresaRazaoSocial || apps.find((app) => app.id === omieAppId)?.name || APP_NAME,
      empresaCnpj: bootstrap.empresaCnpj ?? null,
    };
  }

  async function handleGeneratePdf() {
    if (cart.length === 0) {
      setFeedback({ type: "error", text: "Adicione produtos antes de gerar o PDF." });
      return;
    }
    if (!selectedClient) {
      setFeedback({ type: "error", text: "Selecione o cliente antes de gerar o PDF." });
      return;
    }
    setFeedback(null);
    try {
      const saved = await ensureQuoteSavedForExport();
      if (!saved) return;

      openOrcamentoPdf({
        empresaNome: saved.empresaNome,
        empresaCnpj: saved.empresaCnpj,
        clienteNome: saved.clienteNome,
        clienteCnpj: saved.clienteCnpj,
        clienteCodigo: saved.clienteCodigo,
        numeroInterno: saved.numero,
        criadoPor: saved.elaborador,
        dataPrevisao,
        observacao,
        showLineValues,
        showTotal,
        items: cart.map((item) => ({
          descricao: item.descricao,
          codigoProduto: item.codigoProduto,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
        })),
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível gerar o PDF.",
      });
    }
  }

  async function handleExportExcel() {
    if (cart.length === 0) {
      setFeedback({ type: "error", text: "Adicione produtos antes de exportar o Excel." });
      return;
    }
    if (!selectedClient) {
      setFeedback({ type: "error", text: "Selecione o cliente antes de exportar o Excel." });
      return;
    }
    setFeedback(null);
    try {
      const saved = await ensureQuoteSavedForExport();
      if (!saved) return;

      downloadOrcamentoExcel({
        empresaNome: saved.empresaNome,
        empresaCnpj: saved.empresaCnpj,
        clienteNome: saved.clienteNome,
        clienteCnpj: saved.clienteCnpj,
        clienteCodigo: saved.clienteCodigo,
        numeroInterno: saved.numero,
        criadoPor: saved.elaborador,
        dataPrevisao,
        observacao,
        showLineValues,
        showTotal,
        items: cart.map((item) => ({
          descricao: item.descricao,
          codigoProduto: item.codigoProduto,
          unidade: item.unidade,
          quantidade: item.quantidade,
          cmc: effectiveCmc(item.cmc, item.cmcInterno),
          valorUnitario: item.valorUnitario,
        })),
      });
      setFeedback({
        type: "ok",
        text: `Excel exportado: ${saved.numero} — ${saved.clienteNome}.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível exportar o Excel.",
      });
    }
  }

  return (
    <AppShell mobileTitle="Orçamentos" searchPlaceholder="Buscar produtos...">
      <div className="space-y-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="text-headline-sm text-primary">Orçamentos</h1>
            <p className="text-body-md text-on-surface-variant">
              Salve com número interno, imprima PDF, edite e envie à Omie (etapa 00).
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            {editingQuoteId ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary"
              >
                <Icon name="add" className="text-[18px]" />
                Novo orçamento
              </button>
            ) : null}
            <button
              type="button"
              disabled={syncing || apps.length === 0}
              onClick={handleSyncProducts}
              className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
            >
              <Icon name={syncing ? "hourglass_empty" : "sync"} className="text-[18px]" />
              {syncing ? "Sincronizando..." : `Sync produtos (${productCount})`}
            </button>
          </div>
        </div>

        {numeroInterno ? (
          <div className="rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm text-body-md text-on-surface">
            Editando <strong>{numeroInterno}</strong>
            {selectedClient ? ` — ${selectedClient.nome}` : ""}
            {criadoPor ? ` · por ${criadoPor}` : ""}
            {quoteStatus ? ` · ${statusLabel(quoteStatus)}` : ""}
            {locked ? " · somente leitura (já enviado)" : ""}
          </div>
        ) : null}

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

        <div className="grid gap-lg xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <div className="grid gap-md sm:grid-cols-2">
              <label className="block text-label-md text-on-surface-variant">
                Empresa Omie
                <div className="mt-xs w-full rounded-lg border border-outline-variant bg-surface-container-low px-sm py-sm text-body-md text-on-surface">
                  {bootstrap.empresaRazaoSocial ||
                    apps.find((app) => app.id === omieAppId)?.name ||
                    "Belfer"}
                  {bootstrap.empresaCnpj ? (
                    <span className="mt-xs block text-label-md text-on-surface-variant">
                      CNPJ {bootstrap.empresaCnpj}
                    </span>
                  ) : null}
                </div>
              </label>
              <label className="block text-label-md text-on-surface-variant">
                Previsão
                <input
                  type="date"
                  value={dataPrevisao}
                  disabled={locked}
                  onChange={(event) => setDataPrevisao(event.target.value)}
                  className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md disabled:opacity-60"
                />
              </label>
            </div>

            <div>
              <label className="block text-label-md text-on-surface-variant">Cliente</label>
              {selectedClient ? (
                <div className="mt-xs flex items-center justify-between gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-sm">
                  <div>
                    <p className="text-body-md text-on-surface">{selectedClient.nome}</p>
                    <p className="text-label-md text-on-surface-variant">Código {selectedClient.codigo}</p>
                  </div>
                  {!locked ? (
                    <button
                      type="button"
                      className="text-label-md text-primary"
                      onClick={() => {
                        setSelectedClient(null);
                        setClientQuery("");
                      }}
                    >
                      Trocar
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="relative mt-xs">
                  <input
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder="Buscar razão social (mín. 2 letras)"
                    className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                  />
                  {searchingClients ? (
                    <p className="mt-xs text-label-md text-on-surface-variant">Buscando...</p>
                  ) : null}
                  {clientResults.length > 0 ? (
                    <ul className="absolute z-10 mt-xs max-h-56 w-full overflow-auto rounded-lg border border-outline-variant bg-surface shadow-lg">
                      {clientResults.map((client) => (
                        <li key={client.codigo}>
                          <button
                            type="button"
                            className="block w-full px-sm py-sm text-left text-body-md hover:bg-surface-container-high"
                            onClick={() => {
                              setSelectedClient(client);
                              setClientQuery(client.nome);
                              setClientResults([]);
                            }}
                          >
                            {client.nome}
                            <span className="ml-xs text-label-md text-on-surface-variant">
                              #{client.codigo}
                              {client.cnpjCpf ? ` · ${client.cnpjCpf}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>

            <label className="block text-label-md text-on-surface-variant">
              Observação
              <textarea
                value={observacao}
                disabled={locked}
                onChange={(event) => setObservacao(event.target.value)}
                rows={2}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md disabled:opacity-60"
                placeholder="Opcional"
              />
            </label>

            <div>
              <div className="mb-xs flex items-center justify-between gap-sm">
                <p className="text-title-md text-on-surface">Itens do orçamento</p>
                <p className="text-label-md text-on-surface-variant">Total {formatMoney(total)}</p>
              </div>
              {cart.length > 0 && (belowCmcCount > 0 || belowSuggestedCount > 0) ? (
                <div
                  className={`mb-sm rounded-lg border px-md py-sm text-body-md ${
                    belowCmcCount > 0
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-amber-300 bg-amber-50 text-amber-950"
                  }`}
                >
                  {belowCmcCount > 0
                    ? `Atenção: ${belowCmcCount} item(ns) com valor unitário abaixo do CMC.`
                    : null}
                  {belowCmcCount > 0 && belowSuggestedCount > 0 ? " " : null}
                  {belowSuggestedCount > 0
                    ? `${belowCmcCount > 0 ? "Também " : ""}${belowSuggestedCount} item(ns) abaixo do preço sugerido.`
                    : null}
                </div>
              ) : null}
              {cart.length === 0 ? (
                <p className="rounded-lg border border-dashed border-outline-variant px-md py-lg text-center text-body-md text-on-surface-variant">
                  Adicione produtos na lista ao lado.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-outline-variant">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        <th className="px-sm py-xs">Produto</th>
                        <th className="px-sm py-xs">Qtd</th>
                        <th className="px-sm py-xs">Unitário</th>
                        <th className="px-sm py-xs">CMC</th>
                        <th className="px-sm py-xs">Subtotal</th>
                        <th className="px-sm py-xs" />
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item) => {
                        const cmcEfetivo = effectiveCmc(item.cmc, item.cmcInterno);
                        const sugerido = suggestedPriceFromCmc(cmcEfetivo, item.markup ?? undefined);
                        const belowCmc = isUnitBelowCmc(item.valorUnitario, cmcEfetivo);
                        const belowSuggested =
                          !belowCmc && isUnitBelowSuggested(item.valorUnitario, sugerido);
                        return (
                        <tr key={item.key} className="border-t border-outline-variant">
                          <td className="px-sm py-xs">
                            <p>{item.descricao}</p>
                            <p className="text-label-md text-on-surface-variant">
                              #{item.codigoProduto}
                              {item.unidade ? ` · ${item.unidade}` : ""}
                            </p>
                          </td>
                          <td className="px-sm py-xs">
                            <input
                              type="number"
                              min={0.001}
                              step="any"
                              disabled={locked}
                              value={item.quantidade}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                setCart((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key
                                      ? { ...row, quantidade: Number.isFinite(value) && value > 0 ? value : 1 }
                                      : row,
                                  ),
                                );
                              }}
                              className="w-20 rounded border border-outline-variant bg-surface px-xs py-xs disabled:opacity-60"
                            />
                          </td>
                          <td className="px-sm py-xs">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              disabled={locked}
                              value={item.valorUnitario}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                setCart((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key
                                      ? {
                                          ...row,
                                          valorUnitario: Number.isFinite(value) && value >= 0 ? value : 0,
                                        }
                                      : row,
                                  ),
                                );
                              }}
                              className={`w-28 rounded border bg-surface px-xs py-xs disabled:opacity-60 ${
                                belowCmc
                                  ? "border-red-400 text-red-700 font-semibold"
                                  : belowSuggested
                                    ? "border-amber-400 text-amber-800 font-semibold"
                                    : "border-outline-variant"
                              }`}
                            />
                            {belowCmc ? (
                              <p className="mt-xs text-label-md text-red-700">Abaixo do CMC</p>
                            ) : belowSuggested ? (
                              <p className="mt-xs text-label-md text-amber-800">Abaixo do sugerido</p>
                            ) : null}
                          </td>
                          <td className="px-sm py-xs text-label-md text-on-surface-variant">
                            <div>{cmcEfetivo != null ? formatMoney(cmcEfetivo) : "—"}</div>
                            {sugerido != null ? (
                              <div className="text-on-surface-variant/80">Sug. {formatMoney(sugerido)}</div>
                            ) : null}
                          </td>
                          <td className="px-sm py-xs">{formatMoney(item.quantidade * item.valorUnitario)}</td>
                          <td className="px-sm py-xs">
                            {!locked ? (
                              <button
                                type="button"
                                className="text-label-md text-red-700"
                                onClick={() => setCart((prev) => prev.filter((row) => row.key !== item.key))}
                              >
                                Remover
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-sm rounded-lg border border-outline-variant bg-surface px-md py-sm">
              <p className="text-label-md text-on-surface-variant">Opções do PDF</p>
              <label className="flex items-center gap-sm text-body-md text-on-surface">
                <input
                  type="checkbox"
                  checked={showLineValues}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setShowLineValues(checked);
                    if (checked && !showTotal) setShowTotal(true);
                  }}
                />
                Mostrar valores unitários e subtotais
              </label>
              <label className="flex items-center gap-sm text-body-md text-on-surface">
                <input
                  type="checkbox"
                  checked={showTotal}
                  onChange={(event) => setShowTotal(event.target.checked)}
                />
                Mostrar valor total
              </label>
            </div>

            <div className="flex flex-wrap gap-sm">
              <button
                type="button"
                disabled={saving || locked || !selectedClient || cart.length === 0}
                onClick={handleSave}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
              >
                <Icon name={saving ? "hourglass_empty" : "save"} className="text-[18px]" />
                {saving ? "Salvando..." : editingQuoteId ? "Atualizar" : "Salvar"}
              </button>
              <button
                type="button"
                disabled={cart.length === 0 || saving || !selectedClient}
                onClick={handleGeneratePdf}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
              >
                <Icon name="picture_as_pdf" className="text-[18px]" />
                Gerar PDF
              </button>
              <button
                type="button"
                disabled={cart.length === 0 || saving || !selectedClient}
                onClick={handleExportExcel}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
              >
                <Icon name="table_view" className="text-[18px]" />
                Exportar Excel
              </button>
              <button
                type="button"
                disabled={sending || locked || !selectedClient || cart.length === 0}
                onClick={handleSend}
                className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md text-on-secondary-container disabled:opacity-50"
              >
                <Icon name={sending ? "hourglass_empty" : "send"} className="text-[18px]" />
                {sending ? "Enviando..." : "Enviar para Omie"}
              </button>
            </div>
          </section>

          <section className="space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <div>
              <p className="text-title-md text-on-surface">Produtos</p>
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Filtrar por descrição ou código"
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
              />
            </div>
            {productCount === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                Nenhum produto sincronizado ainda. Clique em <strong>Sync produtos</strong>.
              </p>
            ) : products.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">Nenhum produto encontrado com esse filtro.</p>
            ) : (
              <ul className="max-h-[34rem] space-y-xs overflow-auto">
                {products.map((product) => (
                  <li
                    key={`${product.codigoProduto}`}
                    className="flex items-start justify-between gap-sm rounded-lg border border-outline-variant px-sm py-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-md text-on-surface">{product.descricao}</p>
                      <p className="text-label-md text-on-surface-variant">
                        #{product.codigoProduto}
                        {product.codigoInterno ? ` · ${product.codigoInterno}` : ""}
                        {product.unidade ? ` · ${product.unidade}` : ""}
                        {" · "}
                        {product.valorUnitario != null ? formatMoney(product.valorUnitario) : "sem preço"}
                        {product.cmcEfetivo != null ? ` · CMC ${formatMoney(product.cmcEfetivo)}` : ""}
                      </p>
                      {product.valorUnitario != null &&
                      isUnitBelowCmc(product.valorUnitario, product.cmcEfetivo) ? (
                        <p className="text-label-md font-semibold text-red-700">
                          Unitário abaixo do CMC
                          {product.precoSugerido != null
                            ? ` · sug. ${formatMoney(product.precoSugerido)}`
                            : ""}
                        </p>
                      ) : product.valorUnitario != null &&
                        isUnitBelowSuggested(product.valorUnitario, product.precoSugerido) ? (
                        <p className="text-label-md font-semibold text-amber-800">
                          Abaixo do sugerido ({formatMoney(product.precoSugerido!)})
                        </p>
                      ) : product.precoSugerido != null ? (
                        <p className="text-label-md text-on-surface-variant">
                          sug. {formatMoney(product.precoSugerido)}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => addProduct(product)}
                      className="shrink-0 rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          <div className="mb-sm flex flex-wrap items-end justify-between gap-md">
            <div>
              <p className="text-title-md text-on-surface">Orçamentos salvos</p>
              <p className="text-label-md text-on-surface-variant">
                {filteredQuotes.length === quotes.length
                  ? `${quotes.length} registro(s)`
                  : `${filteredQuotes.length} de ${quotes.length} registro(s)`}
              </p>
            </div>
            {quotes.length > 0 ? (
              <div className="flex w-full flex-wrap gap-sm sm:w-auto">
                <input
                  value={quotesFilter}
                  onChange={(event) => setQuotesFilter(event.target.value)}
                  placeholder="Buscar nº, cliente, usuário..."
                  className="min-w-[16rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:flex-none"
                />
                <select
                  value={quotesStatusFilter}
                  onChange={(event) =>
                    setQuotesStatusFilter(event.target.value as "all" | "draft" | "sent" | "error")
                  }
                  className="rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                >
                  <option value="all">Todos os status</option>
                  <option value="draft">Salvos</option>
                  <option value="sent">Enviados Omie</option>
                  <option value="error">Com erro</option>
                </select>
              </div>
            ) : null}
          </div>
          {quotes.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Nenhum orçamento salvo ainda.</p>
          ) : filteredQuotes.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Nenhum orçamento encontrado com esse filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-body-md">
                <thead className="text-label-md text-on-surface-variant">
                  <tr>
                    <th className="px-sm py-xs">Nº</th>
                    <th className="px-sm py-xs">Cliente</th>
                    <th className="px-sm py-xs">Usuário</th>
                    <th className="px-sm py-xs">Total</th>
                    <th className="px-sm py-xs">Status</th>
                    <th className="px-sm py-xs">Quando</th>
                    <th className="px-sm py-xs">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => (
                    <tr key={quote.id} className="border-t border-outline-variant">
                      <td className="px-sm py-xs font-medium">{quote.numeroInterno || "—"}</td>
                      <td className="px-sm py-xs">{quote.clientName ?? quote.clientCode}</td>
                      <td className="px-sm py-xs">{quote.createdByName ?? "—"}</td>
                      <td className="px-sm py-xs">
                        {quote.total != null ? formatMoney(quote.total) : "—"}
                      </td>
                      <td className="px-sm py-xs">{statusLabel(quote.status, quote.error)}</td>
                      <td className="px-sm py-xs">
                        {quote.createdAt ? new Date(quote.createdAt).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="px-sm py-xs">
                        <div className="flex flex-wrap items-center gap-xs">
                          <button
                            type="button"
                            disabled={loadingQuote}
                            onClick={() => handleLoadQuote(quote.id)}
                            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
                          >
                            <Icon
                              name={quote.status === "sent" ? "visibility" : "edit"}
                              className="text-[16px]"
                            />
                            {quote.status === "sent" ? "Ver" : "Editar"}
                          </button>
                          {quote.status !== "sent" ? (
                            <button
                              type="button"
                              disabled={sending}
                              onClick={() => handleSendSaved(quote.id)}
                              className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md text-on-secondary-container disabled:opacity-50"
                            >
                              <Icon name={sending ? "hourglass_empty" : "send"} className="text-[16px]" />
                              Omie
                            </button>
                          ) : quote.numeroPedido ? (
                            <span className="rounded-lg border border-outline-variant px-sm py-xs text-label-md text-on-surface-variant">
                              Omie {quote.numeroPedido}
                            </span>
                          ) : null}
                          {canDeleteQuotes ? (
                            <button
                              type="button"
                              disabled={deletingQuoteId === quote.id}
                              onClick={() => handleDeleteQuote(quote)}
                              className="inline-flex items-center gap-xs rounded-lg border border-red-200 bg-red-50 px-sm py-xs text-label-md text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <Icon
                                name={deletingQuoteId === quote.id ? "hourglass_empty" : "delete"}
                                className="text-[16px]"
                              />
                              {deletingQuoteId === quote.id ? "..." : "Excluir"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-sm text-sm text-muted-foreground">
                <p>
                  Confirma a exclusão de{" "}
                  <span className="font-semibold text-foreground">
                    {deleteTarget?.numeroInterno || (deleteTarget ? `#${deleteTarget.id}` : "")}
                  </span>
                  {deleteTarget?.clientName ? ` — ${deleteTarget.clientName}` : ""}?
                </p>
                {deleteTarget && (deleteTarget.omiePedidoCode || deleteTarget.integrationCode) ? (
                  <p>
                    Este orçamento foi enviado à Omie
                    {deleteTarget.numeroPedido
                      ? ` (pedido ${deleteTarget.numeroPedido})`
                      : deleteTarget.omiePedidoCode
                        ? ` (código ${deleteTarget.omiePedidoCode})`
                        : ""}
                    . Escolha se deseja remover também lá.
                  </p>
                ) : (
                  <p>Esta ação remove o registro apenas deste sistema.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-col-reverse sm:space-x-0">
            <AlertDialogCancel className="sm:mt-0">Cancelar</AlertDialogCancel>
            {deleteTarget && (deleteTarget.omiePedidoCode || deleteTarget.integrationCode) ? (
              <>
                <button
                  type="button"
                  onClick={() => confirmDeleteQuote(false)}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-outline-variant bg-background px-4 text-sm font-medium hover:bg-surface-container-high"
                >
                  Só no sistema
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteQuote(true)}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
                >
                  Sistema + Omie
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => confirmDeleteQuote(false)}
                className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
              >
                Excluir
              </button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
