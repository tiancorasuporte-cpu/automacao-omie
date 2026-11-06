import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { TablePager } from "@/components/TablePager";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  createMonthlyServiceFn,
  createOrcamentoFn,
  deactivateMonthlyServiceFn,
  deleteOrcamentoFn,
  getOmieClientDetailsFn,
  getOrcamentoEmpresaFn,
  getOrcamentoFn,
  getOrcamentosBootstrapFn,
  getProductsPricingFn,
  listOrcamentosFn,
  saveOrcamentoFn,
  searchOmieClientsFn,
  searchOmieProductsFn,
  sendOrcamentoToOmieFn,
  syncOmieClientsFn,
  syncOmieProductsFn,
} from "@/lib/orcamentos";
import { openOrcamentoPdf } from "@/lib/orcamento-pdf";
import { downloadOrcamentoExcel } from "@/lib/orcamento-excel";
import { effectiveCmc, isUnitBelowCmc, isUnitBelowSuggested, suggestedPriceFromCmc } from "@/lib/product-pricing";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

type MobileOrcamentoTab = "montar" | "salvos";
type QuotesPageSize = 10 | 20 | 50 | 100 | "all";

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

type QuoteServicoMensal = {
  key: string;
  monthlyServiceId: number | null;
  nome: string;
  valor: number;
  quantidade: number;
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

function parseNumberInput(raw: string, fallback: number, opts?: { min?: number; allowZero?: boolean }) {
  const value = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(value)) return fallback;
  if (opts?.allowZero ? value < 0 : value <= 0) return fallback;
  if (opts?.min != null && value < opts.min) return fallback;
  return value;
}

/** Permite apagar/redigitar; seleciona o valor ao focar. */
function EditableNumberInput({
  value,
  onCommit,
  disabled,
  className,
  min = 0,
  allowZero = false,
  fallback = 0,
}: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  className?: string;
  min?: number;
  allowZero?: boolean;
  fallback?: number;
}) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={min}
      step="any"
      disabled={disabled}
      value={text}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (next.trim() === "") return;
        const parsed = Number(String(next).replace(",", "."));
        if (!Number.isFinite(parsed)) return;
        if (allowZero ? parsed < 0 : parsed <= 0) return;
        if (parsed < min) return;
        onCommit(parsed);
      }}
      onBlur={() => {
        const next = parseNumberInput(text, fallback, { min, allowZero });
        setText(String(next));
        if (next !== value) onCommit(next);
      }}
      className={className}
    />
  );
}

function QuantityInput({
  value,
  onCommit,
  disabled,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <EditableNumberInput
      value={value}
      onCommit={onCommit}
      disabled={disabled}
      className={className}
      min={0.001}
      allowZero={false}
      fallback={1}
    />
  );
}

function UnitPriceInput({
  value,
  onCommit,
  disabled,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <EditableNumberInput
      value={value}
      onCommit={onCommit}
      disabled={disabled}
      className={className}
      min={0}
      allowZero
      fallback={0}
    />
  );
}

function OrcamentosPage() {
  const bootstrap = Route.useLoaderData();
  const router = useRouter();
  const { query } = useShellSearch();

  const [apps] = useState(bootstrap.apps);
  const [quotes, setQuotes] = useState(bootstrap.quotes);
  const [quotesTotal, setQuotesTotal] = useState(bootstrap.quotesTotal ?? bootstrap.quotes.length);
  const [searchingQuotes, setSearchingQuotes] = useState(false);
  const [productCount, setProductCount] = useState(bootstrap.productCount);
  const [clientCount, setClientCount] = useState(bootstrap.clientCount ?? 0);
  const [omieAppId] = useState(bootstrap.omieAppId ?? bootstrap.apps[0]?.id ?? "");
  const canDeleteQuotes = bootstrap.canDeleteQuotes === true;
  const canManageMonthlyServices = bootstrap.canManageMonthlyServices === true;
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [numeroInterno, setNumeroInterno] = useState<string | null>(null);
  const [criadoPor, setCriadoPor] = useState<string | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [omiePedidoCode, setOmiePedidoCode] = useState<number | null>(null);
  const [numeroPedidoOmie, setNumeroPedidoOmie] = useState<string | null>(null);
  const [copiedOmieCode, setCopiedOmieCode] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<
    Array<{
      codigo: number;
      nome: string;
      cnpjCpf: string | null;
      endereco?: string | null;
      contato?: string | null;
    }>
  >([]);
  const [selectedClient, setSelectedClient] = useState<{
    codigo: number;
    nome: string;
    cnpjCpf: string | null;
  } | null>(null);
  const [contato, setContato] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [loadingClientAddress, setLoadingClientAddress] = useState(false);
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
  const [monthlyServices, setMonthlyServices] = useState(bootstrap.monthlyServices ?? []);
  const [comServicoMensal, setComServicoMensal] = useState(false);
  const [quoteServicosMensais, setQuoteServicosMensais] = useState<QuoteServicoMensal[]>([]);
  const [addServicoId, setAddServicoId] = useState("");
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [novoServicoNome, setNovoServicoNome] = useState("");
  const [novoServicoValor, setNovoServicoValor] = useState("");
  const [novoServicoCusto, setNovoServicoCusto] = useState("");
  const [savingServico, setSavingServico] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingClients, setSyncingClients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [duplicatingQuoteId, setDuplicatingQuoteId] = useState<number | null>(null);
  const [deletingQuoteId, setDeletingQuoteId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof bootstrap.quotes)[number] | null>(null);
  const [searchingClients, setSearchingClients] = useState(false);
  const [showLineValues, setShowLineValues] = useState(true);
  const [showTotal, setShowTotal] = useState(true);
  const [quotesFilter, setQuotesFilter] = useState("");
  const [quotesStatusFilter, setQuotesStatusFilter] = useState<"all" | "draft" | "sent" | "error">("all");
  const [quotesPage, setQuotesPage] = useState(1);
  const [quotesPageSize, setQuotesPageSize] = useState<QuotesPageSize>("all");
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileOrcamentoTab>("montar");
  const [lastAddedLabel, setLastAddedLabel] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [qtyDialogProduct, setQtyDialogProduct] = useState<(typeof products)[number] | null>(null);
  const [qtyDialogValue, setQtyDialogValue] = useState("1");
  const qtyDialogInputRef = useRef<HTMLInputElement>(null);
  const [productsDialogOpen, setProductsDialogOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const clientSearchInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0),
    [cart],
  );

  const totalServicosMensais = useMemo(
    () =>
      quoteServicosMensais.reduce(
        (sum, service) => sum + service.quantidade * service.valor,
        0,
      ),
    [quoteServicosMensais],
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

  const quotesLimit = quotesPageSize === "all" ? null : quotesPageSize;

  const pagedQuotes = useMemo(() => {
    const pageSize = quotesPageSize === "all" ? Math.max(quotesTotal, 1) : quotesPageSize;
    const totalPages =
      quotesPageSize === "all" ? 1 : Math.max(1, Math.ceil(quotesTotal / quotesPageSize) || 1);
    const page = Math.min(Math.max(1, quotesPage), totalPages);
    return {
      items: quotes,
      page,
      totalPages,
      totalItems: quotesTotal,
      pageSize,
    };
  }, [quotes, quotesPage, quotesPageSize, quotesTotal]);

  useEffect(() => {
    setQuotesPage(1);
  }, [quotesFilter, quotesStatusFilter, quotesPageSize]);

  useEffect(() => {
    if (quotesPageSize === "all") return;
    const totalPages = Math.max(1, Math.ceil(quotesTotal / quotesPageSize) || 1);
    if (quotesPage > totalPages) setQuotesPage(totalPages);
  }, [quotesTotal, quotesPageSize, quotesPage]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingQuotes(true);
      try {
        const result = await listOrcamentosFn({
          data: {
            ...(quotesFilter.trim() ? { query: quotesFilter.trim() } : {}),
            ...(quotesStatusFilter !== "all" ? { status: quotesStatusFilter } : {}),
            limit: quotesLimit,
            offset:
              quotesLimit == null ? 0 : (Math.max(1, quotesPage) - 1) * quotesLimit,
          },
        });
        if (cancelled) return;
        setQuotes(result.quotes);
        setQuotesTotal(result.total);
      } catch {
        if (!cancelled) {
          setFeedback({
            type: "error",
            text: "Não foi possível carregar a lista de orçamentos.",
          });
        }
      } finally {
        if (!cancelled) setSearchingQuotes(false);
      }
    }, quotesFilter.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quotesFilter, quotesStatusFilter, quotesPage, quotesLimit]);

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

  async function selectClient(client: (typeof clientResults)[number]) {
    setSelectedClient({ codigo: client.codigo, nome: client.nome, cnpjCpf: client.cnpjCpf });
    setClientQuery(client.nome);
    setClientResults([]);
    setClientAddress(client.endereco ?? "");
    if (!contato.trim() && client.contato) setContato(client.contato);
    if (client.endereco) return;
    setLoadingClientAddress(true);
    try {
      const details = await getOmieClientDetailsFn({ data: { clientCode: client.codigo } });
      if (details.endereco) setClientAddress((current) => current || details.endereco || "");
      if (details.contato) setContato((current) => current || details.contato || "");
    } catch {
      // endereço pode ser digitado manualmente
    } finally {
      setLoadingClientAddress(false);
    }
  }

  async function reloadQuotesList() {
    const result = await listOrcamentosFn({
      data: {
        ...(quotesFilter.trim() ? { query: quotesFilter.trim() } : {}),
        ...(quotesStatusFilter !== "all" ? { status: quotesStatusFilter } : {}),
        limit: quotesLimit,
        offset: quotesLimit == null ? 0 : (Math.max(1, quotesPage) - 1) * quotesLimit,
      },
    });
    setQuotes(result.quotes);
    setQuotesTotal(result.total);
  }

  async function refreshQuotes() {
    const boot = await getOrcamentosBootstrapFn();
    setProductCount(boot.productCount);
    setClientCount(boot.clientCount ?? 0);
    setMonthlyServices(boot.monthlyServices ?? []);
    await reloadQuotesList();
  }

  function resetServicoMensal() {
    setComServicoMensal(false);
    setQuoteServicosMensais([]);
    setAddServicoId("");
  }

  function addServicoFromCatalog(id: number, catalog = monthlyServices) {
    const service = catalog.find((entry) => entry.id === id);
    if (!service) return;
    setQuoteServicosMensais((prev) => {
      if (prev.some((entry) => entry.monthlyServiceId === service.id)) return prev;
      return [
        ...prev,
        {
          key: `ms-${service.id}-${Date.now()}`,
          monthlyServiceId: service.id,
          nome: service.nome,
          valor: service.valor,
          quantidade: 1,
        },
      ];
    });
    setComServicoMensal(true);
    setAddServicoId("");
  }

  function resetForm() {
    setEditingQuoteId(null);
    setNumeroInterno(null);
    setCriadoPor(null);
    setQuoteStatus(null);
    setOmiePedidoCode(null);
    setNumeroPedidoOmie(null);
    setCopiedOmieCode(false);
    setSelectedClient(null);
    setClientQuery("");
    setContato("");
    setClientAddress("");
    setCart([]);
    setObservacao("");
    setDataPrevisao(todayIso());
    resetServicoMensal();
  }

  async function copyOmieCodigo(value: string) {
    const text = value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOmieCode(true);
      setFeedback({ type: "ok", text: `Código Omie ${text} copiado.` });
      window.setTimeout(() => setCopiedOmieCode(false), 2000);
    } catch {
      setFeedback({ type: "error", text: "Não foi possível copiar o código Omie." });
    }
  }

  function omieCodigoLabel(quote: { numeroPedido?: string | null; omiePedidoCode?: number | null }) {
    const numero = quote.numeroPedido?.trim();
    if (numero) return numero;
    if (quote.omiePedidoCode != null && quote.omiePedidoCode > 0) {
      return String(quote.omiePedidoCode);
    }
    return null;
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

  async function handleSyncClients() {
    setSyncingClients(true);
    setFeedback(null);
    try {
      const result = await syncOmieClientsFn();
      setClientCount(result.total);
      const errors = result.perApp.filter((entry) => entry.error);
      setFeedback({
        type: errors.length ? "error" : "ok",
        text: errors.length
          ? `Sync parcial: ${result.total} clientes. ${errors.map((e) => `${e.appId}: ${e.error}`).join(" · ")}`
          : `${result.total} clientes sincronizados da Omie.`,
      });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao sincronizar clientes.",
      });
    } finally {
      setSyncingClients(false);
    }
  }

  function requestAddProduct(product: (typeof products)[number]) {
    if (locked) return;
    setQtyDialogProduct(product);
    setQtyDialogValue("1");
  }

  function addProduct(product: (typeof products)[number], quantidade: number) {
    if (locked) return;
    const qty = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1;
    setCart((prev) => {
      const existing = prev.find((item) => item.codigoProduto === product.codigoProduto);
      if (existing) {
        return prev.map((item) =>
          item.codigoProduto === product.codigoProduto
            ? { ...item, quantidade: item.quantidade + qty }
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
          quantidade: qty,
          valorUnitario: product.valorUnitario ?? 0,
          cmc: product.cmc ?? null,
          cmcInterno: product.cmcInterno ?? null,
          markup: product.markup ?? null,
          ncm: product.ncm,
        },
      ];
    });
    setLastAddedLabel(product.descricao);
    window.setTimeout(() => setLastAddedLabel(null), 1800);
  }

  function confirmQtyDialog(event?: FormEvent) {
    event?.preventDefault();
    if (!qtyDialogProduct) return;
    const qty = parseNumberInput(qtyDialogValue, 1, { min: 0.001 });
    addProduct(qtyDialogProduct, qty);
    setQtyDialogProduct(null);
  }

  useEffect(() => {
    if (!qtyDialogProduct) return;
    const timer = window.setTimeout(() => {
      const input = qtyDialogInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [qtyDialogProduct]);

  useEffect(() => {
    if (!productsDialogOpen || qtyDialogProduct) return;
    const timer = window.setTimeout(() => {
      const input = productSearchInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [productsDialogOpen, qtyDialogProduct]);

  function openProductsDialog() {
    if (locked) return;
    setMobileTab("montar");
    setProductsDialogOpen(true);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key;
      if (!["F1", "F2", "F3", "F4", "F8"].includes(key)) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? "";
      const isTypingField =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;

      // F1/F2 sempre; demais só fora de campos de digitação
      if (isTypingField && key !== "F1" && key !== "F2") return;

      event.preventDefault();

      if (key === "F1") {
        setShortcutsHelpOpen((open) => !open);
        return;
      }
      if (key === "F2") {
        openProductsDialog();
        return;
      }
      if (key === "F3") {
        setMobileTab("montar");
        if (selectedClient) {
          setSelectedClient(null);
          setClientQuery("");
          setClientAddress("");
        }
        window.setTimeout(() => clientSearchInputRef.current?.focus(), 40);
        return;
      }
      if (key === "F4") {
        if (saving || locked || !selectedClient || cart.length === 0) return;
        void handleSave();
        return;
      }
      if (key === "F8") {
        if (sending || locked || !selectedClient || cart.length === 0) return;
        void handleSend();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // handleSave/handleSend are stable enough via closure; deps cover guards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, saving, sending, selectedClient, cart.length]);

  function reorderCart(fromKey: string, toKey: string) {
    if (locked || fromKey === toKey) return;
    setCart((prev) => {
      const from = prev.findIndex((item) => item.key === fromKey);
      const to = prev.findIndex((item) => item.key === toKey);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function cartDragProps(itemKey: string) {
    if (locked) return {};
    return {
      draggable: true as const,
      onDragStart: (event: DragEvent) => {
        setDragKey(itemKey);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", itemKey);
      },
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dragOverKey !== itemKey) setDragOverKey(itemKey);
      },
      onDragLeave: () => {
        if (dragOverKey === itemKey) setDragOverKey(null);
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const fromKey = event.dataTransfer.getData("text/plain") || dragKey;
        if (fromKey) reorderCart(fromKey, itemKey);
        setDragKey(null);
        setDragOverKey(null);
      },
      onDragEnd: () => {
        setDragKey(null);
        setDragOverKey(null);
      },
    };
  }

  function buildPayload() {
    if (!omieAppId || !selectedClient || cart.length === 0) {
      throw new Error("Selecione empresa, cliente e ao menos um produto.");
    }
    if (comServicoMensal && quoteServicosMensais.length === 0) {
      throw new Error("Adicione ao menos um serviço mensal ou desmarque a opção.");
    }
    return {
      quoteId: editingQuoteId,
      omieAppId,
      clientCode: selectedClient.codigo,
      clientName: selectedClient.nome,
      contato: contato.trim() || null,
      clientAddress: clientAddress.trim() || null,
      observacao: observacao || null,
      dataPrevisao,
      comServicoMensal,
      servicosMensais: comServicoMensal
        ? quoteServicosMensais.map((service) => ({
            monthlyServiceId: service.monthlyServiceId,
            nome: service.nome.trim(),
            valor: service.valor,
            quantidade: service.quantidade,
          }))
        : [],
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

  async function handleCreateMonthlyService() {
    const nome = novoServicoNome.trim();
    const valor = Number(String(novoServicoValor).replace(",", "."));
    const custoRaw = String(novoServicoCusto).trim();
    const custo = custoRaw === "" ? 0 : Number(custoRaw.replace(",", "."));
    if (!nome) {
      setFeedback({ type: "error", text: "Informe o nome do serviço mensal." });
      return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
      setFeedback({ type: "error", text: "Informe um valor válido para o serviço mensal." });
      return;
    }
    if (!Number.isFinite(custo) || custo < 0) {
      setFeedback({ type: "error", text: "Informe um custo válido para o serviço mensal." });
      return;
    }
    setSavingServico(true);
    setFeedback(null);
    try {
      const result = await createMonthlyServiceFn({ data: { nome, valor, custo } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setMonthlyServices((prev) =>
        [...prev.filter((entry) => entry.id !== result.service.id), result.service].sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR"),
        ),
      );
      setNovoServicoNome("");
      setNovoServicoValor("");
      setNovoServicoCusto("");
      setQuoteServicosMensais((prev) => {
        if (prev.some((entry) => entry.monthlyServiceId === result.service.id)) return prev;
        return [
          ...prev,
          {
            key: `ms-${result.service.id}-${Date.now()}`,
            monthlyServiceId: result.service.id,
            nome: result.service.nome,
            valor: result.service.valor,
            quantidade: 1,
          },
        ];
      });
      setComServicoMensal(true);
      setFeedback({ type: "ok", text: `Serviço mensal "${result.service.nome}" cadastrado.` });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao cadastrar serviço mensal.",
      });
    } finally {
      setSavingServico(false);
    }
  }

  async function handleDeactivateMonthlyService(id: number) {
    if (locked) return;
    setSavingServico(true);
    setFeedback(null);
    try {
      const result = await deactivateMonthlyServiceFn({ data: { id } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setMonthlyServices((prev) => prev.filter((entry) => entry.id !== id));
      setQuoteServicosMensais((prev) => prev.filter((entry) => entry.monthlyServiceId !== id));
      setFeedback({ type: "ok", text: "Serviço mensal removido do catálogo." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao remover serviço mensal.",
      });
    } finally {
      setSavingServico(false);
    }
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
      setOmiePedidoCode(result.omiePedidoCode ?? null);
      setNumeroPedidoOmie(result.numeroPedido ?? null);
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
      if (editingQuoteId === quoteId) {
        setQuoteStatus("sent");
        setOmiePedidoCode(result.omiePedidoCode ?? null);
        setNumeroPedidoOmie(result.numeroPedido ?? null);
      }
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
      setOmiePedidoCode(quote.omiePedidoCode);
      setNumeroPedidoOmie(quote.numeroPedido);
      setCopiedOmieCode(false);
      setSelectedClient({
        codigo: quote.clientCode,
        nome: result.clienteNomeCompleto ?? quote.clientName ?? `Cliente ${quote.clientCode}`,
        cnpjCpf: result.clienteCnpj ?? null,
      });
      setClientQuery(
        result.clienteNomeCompleto ?? quote.clientName ?? "",
      );
      setContato(result.clienteContato ?? "");
      setClientAddress(result.clienteEndereco ?? "");
      setObservacao(quote.observacao ?? "");
      setDataPrevisao(quote.dataPrevisao ?? todayIso());
      const loadedServicos =
        result.servicosMensais?.length > 0
          ? result.servicosMensais.map((service) => ({
              key: `ms-${service.id}`,
              monthlyServiceId: service.monthlyServiceId,
              nome: service.nome,
              valor: service.valor,
              quantidade: service.quantidade > 0 ? service.quantidade : 1,
            }))
          : quote.servicoMensalNome
            ? [
                {
                  key: `legacy-${quote.id}`,
                  monthlyServiceId: quote.servicoMensalId,
                  nome: quote.servicoMensalNome,
                  valor: quote.servicoMensalValor ?? 0,
                  quantidade: 1,
                },
              ]
            : [];
      setQuoteServicosMensais(loadedServicos);
      setComServicoMensal(loadedServicos.length > 0);
      setAddServicoId("");
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
      setMobileTab("montar");
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

  async function handleDuplicateQuote(quoteId: number) {
    setDuplicatingQuoteId(quoteId);
    setFeedback(null);
    try {
      const result = await getOrcamentoFn({ data: { quoteId } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      const { quote, items } = result;
      if (!items.length) {
        setFeedback({ type: "error", text: "Orçamento sem itens para duplicar." });
        return;
      }

      const loadedServicos =
        result.servicosMensais?.length > 0
          ? result.servicosMensais.map((service) => ({
              monthlyServiceId: service.monthlyServiceId,
              nome: service.nome,
              valor: service.valor,
              quantidade: service.quantidade > 0 ? service.quantidade : 1,
            }))
          : quote.servicoMensalNome
            ? [
                {
                  monthlyServiceId: quote.servicoMensalId,
                  nome: quote.servicoMensalNome,
                  valor: quote.servicoMensalValor ?? 0,
                  quantidade: 1,
                },
              ]
            : [];

      const saved = await saveOrcamentoFn({
        data: {
          quoteId: null,
          omieAppId: quote.omieAppId || omieAppId,
          clientCode: quote.clientCode,
          clientName: result.clienteNomeCompleto ?? quote.clientName,
          contato: quote.contato,
          clientAddress: result.clienteEndereco,
          observacao: quote.observacao,
          dataPrevisao: todayIso(),
          comServicoMensal: loadedServicos.length > 0,
          servicosMensais: loadedServicos,
          items: items.map((item) => ({
            codigoProduto: item.codigoProduto,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            ncm: item.ncm,
          })),
        },
      });
      if (!saved.ok) {
        setFeedback({ type: "error", text: saved.error });
        return;
      }

      await refreshQuotes();
      await handleLoadQuote(saved.quoteId);
      setFeedback({
        type: "ok",
        text: `Orçamento duplicado como ${saved.numeroInterno} (rascunho).`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao duplicar orçamento.",
      });
    } finally {
      setDuplicatingQuoteId(null);
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

    let empresaNome =
      bootstrap.empresaRazaoSocial || apps.find((app) => app.id === omieAppId)?.name || APP_NAME;
    let empresaCnpj = bootstrap.empresaCnpj ?? null;
    try {
      const empresa = await getOrcamentoEmpresaFn();
      if (empresa.razaoSocial?.trim()) empresaNome = empresa.razaoSocial.trim();
      if (empresa.cnpj?.trim()) empresaCnpj = empresa.cnpj.trim();
    } catch {
      // mantém bootstrap
    }

    return {
      numero,
      elaborador,
      clienteNome: selectedClient?.nome ?? "Cliente não informado",
      clienteCodigo: selectedClient?.codigo ?? null,
      clienteCnpj: selectedClient?.cnpjCpf ?? null,
      clienteEndereco: clientAddress.trim() || null,
      contato: contato.trim() || null,
      empresaNome,
      empresaCnpj,
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
        clienteEndereco: saved.clienteEndereco,
        contato: saved.contato,
        clienteCodigo: saved.clienteCodigo,
        numeroInterno: saved.numero,
        criadoPor: saved.elaborador,
        dataPrevisao,
        observacao,
        showLineValues,
        showTotal,
        servicosMensais: comServicoMensal
          ? quoteServicosMensais.map((s) => ({
              nome: s.nome,
              valor: s.valor,
              quantidade: s.quantidade,
            }))
          : [],
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

  async function resolveCartPricing() {
    const codes = cart.map((item) => item.codigoProduto);
    if (!codes.length) return cart;
    try {
      const pricing = await getProductsPricingFn({ data: { codes } });
      const byCode = new Map(pricing.map((row) => [row.codigoProduto, row]));
      const next = cart.map((item) => {
        const product = byCode.get(item.codigoProduto);
        if (!product) return item;
        return {
          ...item,
          cmc: product.cmc ?? item.cmc,
          cmcInterno: product.cmcInterno ?? item.cmcInterno,
          markup: product.markup ?? item.markup,
        };
      });
      setCart(next);
      return next;
    } catch {
      return cart;
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
      const pricedCart = await resolveCartPricing();

      downloadOrcamentoExcel({
        empresaNome: saved.empresaNome,
        empresaCnpj: saved.empresaCnpj,
        clienteNome: saved.clienteNome,
        clienteCnpj: saved.clienteCnpj,
        clienteEndereco: saved.clienteEndereco,
        contato: saved.contato,
        clienteCodigo: saved.clienteCodigo,
        numeroInterno: saved.numero,
        criadoPor: saved.elaborador,
        dataPrevisao,
        observacao,
        showLineValues,
        showTotal,
        servicosMensais: comServicoMensal
          ? quoteServicosMensais.map((s) => ({
              nome: s.nome,
              valor: s.valor,
              quantidade: s.quantidade,
            }))
          : [],
        items: pricedCart.map((item) => ({
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
      <div className="space-y-md p-margin-mobile pb-32 md:px-md md:py-md md:pb-md xl:px-lg">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <div>
            <h1 className="text-title-lg text-primary">Orçamentos</h1>
            <p className="hidden text-label-md text-on-surface-variant @[56rem]:block">
              Salve, imprima PDF e envie à Omie · F1 atalhos
            </p>
            <p className="text-label-md text-on-surface-variant @[56rem]:hidden">
              Monte, adicione produtos e envie à Omie.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-sm sm:w-auto">
            {editingQuoteId ? (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMobileTab("montar");
                }}
                className="inline-flex flex-1 items-center justify-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary sm:flex-none"
              >
                <Icon name="add" className="text-[18px]" />
                Novo orçamento
              </button>
            ) : null}
            <button
              type="button"
              disabled={syncingClients || apps.length === 0}
              onClick={handleSyncClients}
              className="inline-flex flex-1 items-center justify-center gap-xs rounded-lg border border-outline-variant bg-surface px-sm py-xs text-label-md text-primary disabled:opacity-50 sm:flex-none"
            >
              <Icon name={syncingClients ? "hourglass_empty" : "sync"} className="text-[16px]" />
              {syncingClients ? "Sincronizando..." : `Sync clientes (${clientCount})`}
            </button>
            <button
              type="button"
              disabled={syncing || apps.length === 0}
              onClick={handleSyncProducts}
              className="inline-flex flex-1 items-center justify-center gap-xs rounded-lg bg-primary px-sm py-xs text-label-md text-on-primary disabled:opacity-50 sm:flex-none"
            >
              <Icon name={syncing ? "hourglass_empty" : "sync"} className="text-[16px]" />
              {syncing ? "Sincronizando..." : `Sync produtos (${productCount})`}
            </button>
          </div>
        </div>

        <div className="sticky top-0 z-20 -mx-margin-mobile border-b border-outline-variant bg-background/95 px-margin-mobile py-sm backdrop-blur-md @[56rem]:hidden">
          <div className="grid grid-cols-2 gap-xs rounded-xl bg-surface-container-low p-xs">
            {(
              [
                { id: "montar" as const, label: "Montar", icon: "edit_note", badge: cart.length },
                {
                  id: "salvos" as const,
                  label: "Salvos",
                  icon: "folder_open",
                  badge: quotesTotal,
                },
              ] as const
            ).map((tab) => {
              const active = mobileTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileTab(tab.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 rounded-lg px-xs py-sm text-label-md transition-colors",
                    active
                      ? "bg-surface font-semibold text-primary shadow-sm"
                      : "text-on-surface-variant",
                  )}
                >
                  <Icon name={tab.icon} filled={active} className="text-[20px]" />
                  <span>{tab.label}</span>
                  {tab.badge > 0 ? (
                    <span className="absolute right-1 top-1 min-w-5 rounded-full bg-secondary-container px-1 text-center text-[0.65rem] font-bold text-on-secondary-container">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {numeroInterno ? (
          <div className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm text-body-md text-on-surface">
            <div>
              Editando <strong>{numeroInterno}</strong>
              {selectedClient ? ` — ${selectedClient.nome}` : ""}
              {criadoPor ? ` · por ${criadoPor}` : ""}
              {quoteStatus ? ` · ${statusLabel(quoteStatus)}` : ""}
              {locked ? " · somente leitura (já enviado)" : ""}
              {omieCodigoLabel({ numeroPedido: numeroPedidoOmie, omiePedidoCode })
                ? ` · Omie ${omieCodigoLabel({ numeroPedido: numeroPedidoOmie, omiePedidoCode })}`
                : ""}
            </div>
            {omieCodigoLabel({ numeroPedido: numeroPedidoOmie, omiePedidoCode }) ? (
              <button
                type="button"
                onClick={() =>
                  copyOmieCodigo(
                    omieCodigoLabel({ numeroPedido: numeroPedidoOmie, omiePedidoCode })!,
                  )
                }
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-sm py-xs text-label-md text-primary"
              >
                <Icon name={copiedOmieCode ? "check" : "content_copy"} className="text-[16px]" />
                {copiedOmieCode ? "Copiado" : "Copiar cód. Omie"}
              </button>
            ) : null}
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

        <div className={cn(mobileTab === "salvos" && "hidden @[56rem]:block")}>
          <section className="space-y-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-sm md:p-md">
            <div className="grid gap-md @[56rem]:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)] @[56rem]:items-start">
              <div className="space-y-sm">
            <div className="grid gap-sm sm:grid-cols-2">
              <label className="block text-label-md text-on-surface-variant">
                Empresa Omie
                <div className="mt-xs w-full rounded-lg border border-outline-variant bg-surface-container-low px-sm py-xs text-label-md text-on-surface">
                  <span className="line-clamp-2">
                    {bootstrap.empresaRazaoSocial ||
                      apps.find((app) => app.id === omieAppId)?.name ||
                      "Belfer"}
                  </span>
                  {bootstrap.empresaCnpj ? (
                    <span className="mt-0.5 block text-on-surface-variant">
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
                  className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md disabled:opacity-60"
                />
              </label>
            </div>

            <div>
              <label className="block text-label-md text-on-surface-variant">Cliente</label>
              {selectedClient ? (
                <div className="mt-xs flex items-center justify-between gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-xs">
                  <div className="min-w-0">
                    <p className="truncate text-body-md text-on-surface">{selectedClient.nome}</p>
                    <p className="text-label-md text-on-surface-variant">Código {selectedClient.codigo}</p>
                  </div>
                  {!locked ? (
                    <button
                      type="button"
                      className="text-label-md text-primary"
                      onClick={() => {
                        setSelectedClient(null);
                        setClientQuery("");
                        setClientAddress("");
                      }}
                    >
                      Trocar
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="relative mt-xs">
                  <input
                    ref={clientSearchInputRef}
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder={
                      clientCount > 0
                        ? "Buscar cliente sincronizado (mín. 2 letras) · F3"
                        : "Buscar razão social (mín. 2 letras) ou sync clientes · F3"
                    }
                    className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md"
                  />
                  {searchingClients ? (
                    <p className="mt-xs text-label-md text-on-surface-variant">Buscando...</p>
                  ) : null}
                  {clientResults.length > 0 ? (
                    <ul className="absolute z-10 mt-xs max-h-48 w-full overflow-auto rounded-lg border border-outline-variant bg-surface shadow-lg">
                      {clientResults.map((client) => (
                        <li key={client.codigo}>
                          <button
                            type="button"
                            className="block w-full px-sm py-xs text-left text-body-md hover:bg-surface-container-high"
                            onClick={() => void selectClient(client)}
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

            <div className="grid gap-sm sm:grid-cols-2">
              <label className="block text-label-md text-on-surface-variant">
                A/C (pessoa de contato)
                <input
                  value={contato}
                  disabled={locked}
                  onChange={(event) => setContato(event.target.value)}
                  maxLength={160}
                  placeholder="Ex.: João Silva — Compras"
                  className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md disabled:opacity-60"
                />
              </label>
              <label className="block text-label-md text-on-surface-variant">
                Endereço do cliente
                <input
                  value={clientAddress}
                  disabled={locked || !selectedClient}
                  onChange={(event) => setClientAddress(event.target.value)}
                  maxLength={500}
                  placeholder={
                    loadingClientAddress
                      ? "Buscando endereço no Omie..."
                      : selectedClient
                        ? "Rua, número - bairro - cidade/UF - CEP"
                        : "Selecione o cliente"
                  }
                  className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md disabled:opacity-60"
                />
              </label>
            </div>

            <label className="block text-label-md text-on-surface-variant">
              Observação
              <textarea
                value={observacao}
                disabled={locked}
                onChange={(event) => setObservacao(event.target.value)}
                rows={2}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md disabled:opacity-60"
                placeholder="Opcional"
              />
            </label>

            <div className="space-y-sm rounded-lg border border-outline-variant bg-surface-container-low p-sm">
              <div className="flex flex-col gap-sm sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-body-md font-semibold text-on-surface">Serviços mensais</p>
                  <p className="text-label-md text-on-surface-variant">
                    Opcional · PDF/Excel e Omie
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-sm">
                  {!locked && canManageMonthlyServices ? (
                    <button
                      type="button"
                      onClick={() => setCatalogDialogOpen(true)}
                      className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md text-primary"
                    >
                      <Icon name="add" className="text-[18px]" />
                      Cadastrar
                    </button>
                  ) : null}
                  <label className="inline-flex items-center gap-xs text-label-md text-on-surface">
                    <input
                      type="checkbox"
                      checked={comServicoMensal}
                      disabled={locked}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setComServicoMensal(checked);
                        if (!checked) {
                          setQuoteServicosMensais([]);
                          setAddServicoId("");
                        }
                      }}
                      className="size-4 accent-primary"
                    />
                    Incluir no orçamento
                  </label>
                </div>
              </div>

              {comServicoMensal ? (
                <div className="space-y-sm">
                  {quoteServicosMensais.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-outline-variant px-md py-sm text-body-md text-on-surface-variant">
                      Nenhum serviço adicionado. Escolha abaixo ou cadastre um novo.
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface">
                        <table className="min-w-full text-left text-body-md">
                          <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                            <tr>
                              <th className="px-sm py-xs">Serviço</th>
                              <th className="px-sm py-xs w-20">Qtd</th>
                              <th className="px-sm py-xs w-32">Unitário</th>
                              <th className="px-sm py-xs w-32">Subtotal</th>
                              <th className="px-sm py-xs w-20" />
                            </tr>
                          </thead>
                          <tbody>
                            {quoteServicosMensais.map((service) => (
                              <tr key={service.key} className="border-t border-outline-variant">
                                <td className="px-sm py-xs">
                                  <p className="text-on-surface">{service.nome}</p>
                                  <p className="text-label-md text-on-surface-variant">R$/mês</p>
                                </td>
                                <td className="px-sm py-xs">
                                  <QuantityInput
                                    disabled={locked}
                                    value={service.quantidade}
                                    onCommit={(quantidade) => {
                                      setQuoteServicosMensais((prev) =>
                                        prev.map((row) =>
                                          row.key === service.key ? { ...row, quantidade } : row,
                                        ),
                                      );
                                    }}
                                    className="w-16 rounded border border-outline-variant bg-surface px-xs py-xs disabled:opacity-60"
                                  />
                                </td>
                                <td className="px-sm py-xs">
                                  <UnitPriceInput
                                    disabled={locked}
                                    value={service.valor}
                                    onCommit={(valor) => {
                                      setQuoteServicosMensais((prev) =>
                                        prev.map((row) =>
                                          row.key === service.key ? { ...row, valor } : row,
                                        ),
                                      );
                                    }}
                                    className="w-28 rounded border border-outline-variant bg-surface px-xs py-xs disabled:opacity-60"
                                  />
                                </td>
                                <td className="px-sm py-xs whitespace-nowrap">
                                  {formatMoney(service.quantidade * service.valor)}
                                </td>
                                <td className="px-sm py-xs">
                                  {!locked ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setQuoteServicosMensais((prev) =>
                                          prev.filter((row) => row.key !== service.key),
                                        )
                                      }
                                      className="text-label-md text-red-700"
                                    >
                                      Remover
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end px-sm text-body-md font-semibold text-on-surface">
                        Total serviços mensais: {formatMoney(totalServicosMensais)}/mês
                      </div>
                    </>
                  )}

                  {!locked ? (
                    <label className="block text-label-md text-on-surface-variant">
                      Adicionar serviço
                      <select
                        value={addServicoId}
                        onChange={(event) => {
                          const id = Number(event.target.value);
                          if (Number.isFinite(id) && id > 0) addServicoFromCatalog(id);
                        }}
                        className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                      >
                        <option value="">
                          {monthlyServices.length === 0
                            ? canManageMonthlyServices
                              ? "Cadastre um serviço primeiro"
                              : "Nenhum serviço cadastrado"
                            : "Selecione para adicionar..."}
                        </option>
                        {monthlyServices
                          .filter(
                            (service) =>
                              !quoteServicosMensais.some(
                                (entry) => entry.monthlyServiceId === service.id,
                              ),
                          )
                          .map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.nome}
                              {service.descricao ? ` — ${service.descricao.slice(0, 60)}` : ""} (
                              {formatMoney(service.valor)}/mês)
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>

            <Dialog open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
              <DialogContent className="overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Serviços mensais</DialogTitle>
                  <DialogDescription>
                    Cadastre o catálogo. O custo fica só aqui; no orçamento entra o valor de venda.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-sm">
                  <div className="flex flex-col gap-sm">
                    <input
                      value={novoServicoNome}
                      onChange={(event) => setNovoServicoNome(event.target.value)}
                      placeholder="Nome (ex.: Monitoramento)"
                      className="w-full min-w-0 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={novoServicoValor}
                      onChange={(event) => setNovoServicoValor(event.target.value)}
                      placeholder="Valor de venda (R$/mês)"
                      className="w-full min-w-0 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={novoServicoCusto}
                      onChange={(event) => setNovoServicoCusto(event.target.value)}
                      placeholder="Preço de custo (R$/mês)"
                      className="w-full min-w-0 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                    />
                  </div>
                  {monthlyServices.length > 0 ? (
                    <ul className="max-h-56 space-y-xs overflow-auto">
                      {monthlyServices.map((service) => (
                        <li
                          key={service.id}
                          className="flex min-w-0 items-center justify-between gap-sm rounded-lg border border-outline-variant px-sm py-xs text-body-md"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{service.nome}</span>
                            <span className="text-label-md text-on-surface-variant">
                              Venda {formatMoney(service.valor)}/mês
                              {" · "}
                              Custo {formatMoney(service.custo ?? 0)}/mês
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={savingServico}
                            onClick={() => handleDeactivateMonthlyService(service.id)}
                            className="shrink-0 text-label-md text-red-700 disabled:opacity-50"
                          >
                            Remover
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-md text-on-surface-variant">
                      Nenhum serviço cadastrado ainda.
                    </p>
                  )}
                </div>
                <DialogFooter className="gap-sm">
                  <button
                    type="button"
                    onClick={() => setCatalogDialogOpen(false)}
                    className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-on-surface"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    disabled={savingServico}
                    onClick={handleCreateMonthlyService}
                    className="inline-flex items-center justify-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
                  >
                    <Icon name="add" className="text-[18px]" />
                    {savingServico ? "Salvando..." : "Cadastrar"}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
              </div>

              <div className="min-w-0 space-y-sm @[56rem]:sticky @[56rem]:top-sm">
            <div>
              <div className="mb-xs flex flex-wrap items-center justify-between gap-sm">
                <div>
                  <p className="text-body-md font-semibold text-on-surface">Itens do orçamento</p>
                  {!locked && cart.length > 1 ? (
                    <p className="text-label-md text-on-surface-variant">
                      Arraste para reordenar
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-sm">
                  <p className="text-body-md font-semibold text-primary">{formatMoney(total)}</p>
                  {!locked ? (
                    <button
                      type="button"
                      onClick={openProductsDialog}
                      className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-primary"
                    >
                      <Icon name="add" className="text-[16px]" />
                      Adicionar
                      <span className="hidden text-on-surface-variant sm:inline">· F2</span>
                    </button>
                  ) : null}
                </div>
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
                <div className="rounded-lg border border-dashed border-outline-variant px-md py-lg text-center">
                  <p className="text-body-md text-on-surface-variant">
                    Nenhum produto no orçamento ainda.
                  </p>
                  {!locked ? (
                    <button
                      type="button"
                      onClick={openProductsDialog}
                      className="mt-sm inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
                    >
                      <Icon name="add" className="text-[18px]" />
                      Adicionar produtos · F2
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="space-y-sm @[56rem]:hidden">
                    {cart.map((item) => {
                      const cmcEfetivo = effectiveCmc(item.cmc, item.cmcInterno);
                      const sugerido = suggestedPriceFromCmc(cmcEfetivo, item.markup ?? undefined);
                      const belowCmc = isUnitBelowCmc(item.valorUnitario, cmcEfetivo);
                      const belowSuggested =
                        !belowCmc && isUnitBelowSuggested(item.valorUnitario, sugerido);
                      return (
                        <article
                          key={item.key}
                          {...cartDragProps(item.key)}
                          className={cn(
                            "rounded-xl border bg-surface p-md",
                            dragOverKey === item.key && dragKey !== item.key
                              ? "border-secondary border-dashed"
                              : "border-outline-variant",
                            dragKey === item.key && "opacity-60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-sm">
                            <div className="flex min-w-0 items-start gap-sm">
                              {!locked ? (
                                <span
                                  className="mt-xs shrink-0 cursor-grab touch-none text-on-surface-variant active:cursor-grabbing"
                                  title="Arrastar para reordenar"
                                  aria-hidden
                                >
                                  <Icon name="drag_indicator" className="text-[20px]" />
                                </span>
                              ) : null}
                              <div className="min-w-0">
                                <p className="text-title-md text-primary">{item.descricao}</p>
                                {item.unidade ? (
                                  <p className="text-label-md text-on-surface-variant">{item.unidade}</p>
                                ) : null}
                              </div>
                            </div>
                            {!locked ? (
                              <button
                                type="button"
                                className="shrink-0 text-label-md text-red-700"
                                onClick={() =>
                                  setCart((prev) => prev.filter((row) => row.key !== item.key))
                                }
                              >
                                Remover
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-sm grid grid-cols-2 gap-sm">
                            <label className="block text-label-md text-on-surface-variant">
                              Qtd
                              <QuantityInput
                                disabled={locked}
                                value={item.quantidade}
                                onCommit={(quantidade) => {
                                  setCart((prev) =>
                                    prev.map((row) =>
                                      row.key === item.key ? { ...row, quantidade } : row,
                                    ),
                                  );
                                }}
                                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm disabled:opacity-60"
                              />
                            </label>
                            <label className="block text-label-md text-on-surface-variant">
                              Unitário
                              <UnitPriceInput
                                disabled={locked}
                                value={item.valorUnitario}
                                onCommit={(valorUnitario) => {
                                  setCart((prev) =>
                                    prev.map((row) =>
                                      row.key === item.key ? { ...row, valorUnitario } : row,
                                    ),
                                  );
                                }}
                                className={cn(
                                  "mt-xs w-full rounded-lg border bg-surface px-sm py-sm disabled:opacity-60",
                                  belowCmc
                                    ? "border-red-400 font-semibold text-red-700"
                                    : belowSuggested
                                      ? "border-amber-400 font-semibold text-amber-800"
                                      : "border-outline-variant",
                                )}
                              />
                            </label>
                          </div>
                          <div className="mt-sm flex items-center justify-between gap-sm text-label-md">
                            <span className="text-on-surface-variant">
                              {cmcEfetivo != null ? `CMC ${formatMoney(cmcEfetivo)}` : "CMC —"}
                              {sugerido != null ? ` · sug. ${formatMoney(sugerido)}` : ""}
                            </span>
                            <span className="font-semibold text-primary">
                              {formatMoney(item.quantidade * item.valorUnitario)}
                            </span>
                          </div>
                          {belowCmc ? (
                            <p className="mt-xs text-label-md text-red-700">Abaixo do CMC</p>
                          ) : belowSuggested ? (
                            <p className="mt-xs text-label-md text-amber-800">Abaixo do sugerido</p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  <div className="hidden max-h-[min(70vh,42rem)] overflow-auto rounded-lg border border-outline-variant @[56rem]:block">
                  <table className="min-w-full text-left text-label-md">
                    <thead className="sticky top-0 z-10 bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        {!locked ? <th className="w-8 px-xs py-xs" aria-label="Reordenar" /> : null}
                        <th className="px-xs py-xs">Produto</th>
                        <th className="px-xs py-xs">Qtd</th>
                        <th className="px-xs py-xs">Unitário</th>
                        <th className="px-xs py-xs">CMC</th>
                        <th className="px-xs py-xs">Subtotal</th>
                        <th className="px-xs py-xs" />
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
                        <tr
                          key={item.key}
                          {...cartDragProps(item.key)}
                          className={cn(
                            "border-t border-outline-variant",
                            dragOverKey === item.key && dragKey !== item.key && "bg-secondary-container/30",
                            dragKey === item.key && "opacity-60",
                          )}
                        >
                          {!locked ? (
                            <td className="px-xs py-1 align-middle">
                              <span
                                className="inline-flex cursor-grab touch-none text-on-surface-variant active:cursor-grabbing"
                                title="Arrastar para reordenar"
                                aria-label="Arrastar para reordenar"
                              >
                                <Icon name="drag_indicator" className="text-[16px]" />
                              </span>
                            </td>
                          ) : null}
                          <td className="max-w-[14rem] px-xs py-1">
                            <p className="line-clamp-2 text-body-md leading-snug">{item.descricao}</p>
                            {item.unidade ? (
                              <p className="text-label-md text-on-surface-variant">{item.unidade}</p>
                            ) : null}
                          </td>
                          <td className="px-xs py-1">
                            <QuantityInput
                              disabled={locked}
                              value={item.quantidade}
                              onCommit={(quantidade) => {
                                setCart((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key ? { ...row, quantidade } : row,
                                  ),
                                );
                              }}
                              className="w-14 rounded border border-outline-variant bg-surface px-xs py-0.5 disabled:opacity-60"
                            />
                          </td>
                          <td className="px-xs py-1">
                            <UnitPriceInput
                              disabled={locked}
                              value={item.valorUnitario}
                              onCommit={(valorUnitario) => {
                                setCart((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key ? { ...row, valorUnitario } : row,
                                  ),
                                );
                              }}
                              className={`w-24 rounded border bg-surface px-xs py-0.5 disabled:opacity-50 ${
                                belowCmc
                                  ? "border-red-400 text-red-700 font-semibold"
                                  : belowSuggested
                                    ? "border-amber-400 text-amber-800 font-semibold"
                                    : "border-outline-variant"
                              }`}
                            />
                            {belowCmc ? (
                              <p className="text-[0.65rem] leading-tight text-red-700">Abaixo CMC</p>
                            ) : belowSuggested ? (
                              <p className="text-[0.65rem] leading-tight text-amber-800">Abaixo sug.</p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-xs py-1 text-on-surface-variant">
                            <div>{cmcEfetivo != null ? formatMoney(cmcEfetivo) : "—"}</div>
                            {sugerido != null ? (
                              <div className="text-on-surface-variant/80">Sug. {formatMoney(sugerido)}</div>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-xs py-1 font-semibold">
                            {formatMoney(item.quantidade * item.valorUnitario)}
                          </td>
                          <td className="px-xs py-1">
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
                </>
              )}
            </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-md rounded-lg border border-outline-variant bg-surface px-sm py-xs">
              <p className="text-label-md text-on-surface-variant">PDF</p>
              <label className="inline-flex items-center gap-xs text-label-md text-on-surface">
                <input
                  type="checkbox"
                  checked={showLineValues}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setShowLineValues(checked);
                    if (checked && !showTotal) setShowTotal(true);
                  }}
                />
                Valores por linha
              </label>
              <label className="inline-flex items-center gap-xs text-label-md text-on-surface">
                <input
                  type="checkbox"
                  checked={showTotal}
                  onChange={(event) => setShowTotal(event.target.checked)}
                />
                Total
              </label>
            </div>

            <div className="flex flex-wrap gap-xs">
              <button
                type="button"
                disabled={saving || locked || !selectedClient || cart.length === 0}
                onClick={handleSave}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
              >
                <Icon name={saving ? "hourglass_empty" : "save"} className="text-[16px]" />
                {saving ? "Salvando..." : editingQuoteId ? "Atualizar · F4" : "Salvar · F4"}
              </button>
              <button
                type="button"
                disabled={cart.length === 0 || saving || !selectedClient}
                onClick={handleGeneratePdf}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
              >
                <Icon name="picture_as_pdf" className="text-[16px]" />
                PDF
              </button>
              <button
                type="button"
                disabled={cart.length === 0 || saving || !selectedClient}
                onClick={handleExportExcel}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
              >
                <Icon name="table_view" className="text-[16px]" />
                Excel
              </button>
              <button
                type="button"
                disabled={sending || locked || !selectedClient || cart.length === 0}
                onClick={handleSend}
                className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md text-on-secondary-container disabled:opacity-50"
              >
                <Icon name={sending ? "hourglass_empty" : "send"} className="text-[16px]" />
                {sending ? "Enviando..." : "Omie · F8"}
              </button>
              <button
                type="button"
                onClick={() => setShortcutsHelpOpen(true)}
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-on-surface-variant hover:bg-surface-container-high"
                title="Atalhos de teclado"
              >
                <Icon name="keyboard" className="text-[16px]" />
                F1
              </button>
            </div>
          </section>
        </div>

        <section
          className={cn(
            "rounded-xl border border-outline-variant bg-surface-container-lowest p-md",
            mobileTab !== "salvos" && "hidden @[56rem]:block",
          )}
        >
          <div className="mb-sm flex flex-wrap items-end justify-between gap-md">
            <div>
              <p className="text-title-md text-on-surface">Orçamentos salvos</p>
              <p className="text-label-md text-on-surface-variant">
                {searchingQuotes
                  ? "Buscando..."
                  : quotesFilter.trim() || quotesStatusFilter !== "all"
                    ? `${quotesTotal} encontrado(s)`
                    : `${quotesTotal} registro(s)`}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-end gap-sm sm:w-auto">
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
              <label className="block space-y-xs">
                <span className="text-label-md text-on-surface-variant">Por página</span>
                  <select
                    value={quotesPageSize}
                    onChange={(event) => {
                      const value = event.target.value;
                      setQuotesPageSize(
                        value === "all" ? "all" : (Number(value) as QuotesPageSize),
                      );
                    }}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:w-28"
                  >
                    <option value="all">Todos</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
              </label>
            </div>
          </div>
          {quotesTotal === 0 && !searchingQuotes ? (
            <p className="text-body-md text-on-surface-variant">
              {quotesFilter.trim() || quotesStatusFilter !== "all"
                ? "Nenhum orçamento encontrado com esse filtro."
                : "Nenhum orçamento salvo ainda."}
            </p>
          ) : (
            <>
              <div className="space-y-sm @[56rem]:hidden">
                {pagedQuotes.items.map((quote) => (
                  <article
                    key={quote.id}
                    className="rounded-xl border border-outline-variant bg-surface p-md"
                  >
                    <div className="flex items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-title-md text-primary">
                          {quote.numeroInterno || `#${quote.id}`}
                        </p>
                        <p className="truncate text-body-md text-on-surface">
                          {quote.clientName ?? quote.clientCode}
                        </p>
                        <p className="text-label-md text-on-surface-variant">
                          {statusLabel(quote.status, quote.error)}
                          {quote.createdByName ? ` · ${quote.createdByName}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-title-md font-semibold text-primary">
                        {quote.total != null ? formatMoney(quote.total) : "—"}
                      </p>
                    </div>
                    <p className="mt-xs text-label-md text-on-surface-variant">
                      {quote.createdAt ? new Date(quote.createdAt).toLocaleString("pt-BR") : "—"}
                    </p>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      <button
                        type="button"
                        disabled={loadingQuote}
                        onClick={() => void handleLoadQuote(quote.id)}
                        className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary disabled:opacity-50"
                      >
                        <Icon
                          name={quote.status === "sent" ? "visibility" : "edit"}
                          className="text-[16px]"
                        />
                        {quote.status === "sent" ? "Ver" : "Editar"}
                      </button>
                      <button
                        type="button"
                        disabled={duplicatingQuoteId === quote.id || loadingQuote}
                        onClick={() => void handleDuplicateQuote(quote.id)}
                        className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary disabled:opacity-50"
                      >
                        <Icon
                          name={duplicatingQuoteId === quote.id ? "hourglass_empty" : "file_copy"}
                          className="text-[16px]"
                        />
                        Duplicar
                      </button>
                      {quote.status !== "sent" ? (
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => void handleSendSaved(quote.id)}
                          className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md text-on-secondary-container disabled:opacity-50"
                        >
                          <Icon name={sending ? "hourglass_empty" : "send"} className="text-[16px]" />
                          Omie
                        </button>
                      ) : omieCodigoLabel(quote) ? (
                        <button
                          type="button"
                          onClick={() => copyOmieCodigo(omieCodigoLabel(quote)!)}
                          className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary"
                        >
                          <Icon name="content_copy" className="text-[16px]" />
                          Omie {omieCodigoLabel(quote)}
                        </button>
                      ) : null}
                      {canDeleteQuotes ? (
                        <button
                          type="button"
                          disabled={deletingQuoteId === quote.id}
                          onClick={() => handleDeleteQuote(quote)}
                          className="inline-flex items-center gap-xs rounded-lg border border-red-200 bg-red-50 px-sm py-xs text-label-md text-red-700 disabled:opacity-50"
                        >
                          <Icon
                            name={deletingQuoteId === quote.id ? "hourglass_empty" : "delete"}
                            className="text-[16px]"
                          />
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto @[56rem]:block">
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
                  {pagedQuotes.items.map((quote) => (
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
                          <button
                            type="button"
                            disabled={duplicatingQuoteId === quote.id || loadingQuote}
                            onClick={() => handleDuplicateQuote(quote.id)}
                            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
                            title="Duplicar orçamento"
                          >
                            <Icon
                              name={duplicatingQuoteId === quote.id ? "hourglass_empty" : "file_copy"}
                              className="text-[16px]"
                            />
                            {duplicatingQuoteId === quote.id ? "..." : "Duplicar"}
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
                          ) : omieCodigoLabel(quote) ? (
                            <button
                              type="button"
                              onClick={() => copyOmieCodigo(omieCodigoLabel(quote)!)}
                              className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high"
                              title="Copiar código Omie"
                            >
                              <Icon name="content_copy" className="text-[16px]" />
                              Omie {omieCodigoLabel(quote)}
                            </button>
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
              {quotesPageSize !== "all" && pagedQuotes.totalPages > 1 ? (
                <TablePager
                  page={pagedQuotes.page}
                  totalPages={pagedQuotes.totalPages}
                  totalItems={pagedQuotes.totalItems}
                  pageSize={pagedQuotes.pageSize}
                  onPageChange={setQuotesPage}
                  className="-mx-md mt-sm border-outline-variant/60"
                />
              ) : quotesTotal > 0 ? (
                <p className="-mx-md mt-sm border-t border-outline-variant/60 px-md py-sm text-label-md text-on-surface-variant">
                  Exibindo todos os {quotesTotal} orçamento(s)
                </p>
              ) : null}
            </>
          )}
        </section>

        {mobileTab === "montar" ? (
          <div
            className="fixed inset-x-0 z-30 border-t border-outline-variant bg-surface/95 px-margin-mobile py-sm backdrop-blur-md @[56rem]:hidden"
            style={{
              bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex items-center gap-sm">
              <div className="min-w-0 flex-1">
                <p className="text-label-md text-on-surface-variant">
                  {cart.length} item(ns)
                  {selectedClient ? ` · ${selectedClient.nome}` : " · sem cliente"}
                </p>
                <p className="truncate text-title-md font-semibold text-primary">
                  {formatMoney(total)}
                </p>
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={openProductsDialog}
                className="rounded-lg border border-outline-variant px-sm py-sm text-label-md text-primary disabled:opacity-50"
              >
                + Produtos
              </button>
              <button
                type="button"
                disabled={saving || locked || !selectedClient || cart.length === 0}
                onClick={() => void handleSave()}
                className="rounded-lg bg-primary px-md py-sm text-label-md font-semibold text-on-primary disabled:opacity-50"
              >
                {saving ? "..." : editingQuoteId ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={productsDialogOpen} onOpenChange={setProductsDialogOpen}>
        <DialogContent className="!w-[min(56rem,calc(100vw-1.5rem))] !max-w-none">
          <DialogHeader>
            <DialogTitle>Adicionar produtos</DialogTitle>
            <DialogDescription>
              Busque e adicione itens ao orçamento. O modal permanece aberto para incluir vários · F2
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-md">
            <input
              ref={productSearchInputRef}
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Filtrar por descrição ou código"
              className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
            />
            {lastAddedLabel ? (
              <p className="truncate rounded-lg bg-emerald-50 px-sm py-xs text-label-md text-emerald-900">
                + {lastAddedLabel}
                {cart.length > 0 ? ` · ${cart.length} no orçamento · ${formatMoney(total)}` : ""}
              </p>
            ) : cart.length > 0 ? (
              <p className="text-label-md text-on-surface-variant">
                {cart.length} item(ns) no orçamento · {formatMoney(total)}
              </p>
            ) : null}
            {productCount === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                Nenhum produto sincronizado ainda. Clique em <strong>Sync produtos</strong>.
              </p>
            ) : products.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                Nenhum produto encontrado com esse filtro.
              </p>
            ) : (
              <ul className="max-h-[min(28rem,55vh)] space-y-xs overflow-auto">
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
                        {product.valorUnitario != null
                          ? formatMoney(product.valorUnitario)
                          : "sem preço"}
                        {product.cmcEfetivo != null
                          ? ` · CMC ${formatMoney(product.cmcEfetivo)}`
                          : ""}
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
                      onClick={() => requestAddProduct(product)}
                      className="shrink-0 rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-primary hover:brightness-95 disabled:opacity-50"
                    >
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg bg-primary px-md py-sm text-label-md font-semibold text-on-primary"
              onClick={() => setProductsDialogOpen(false)}
            >
              Concluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen}>
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>Atalhos de teclado</DialogTitle>
            <DialogDescription>Atalhos da tela de orçamentos.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-sm text-body-md text-on-surface">
            <li>
              <strong>F1</strong> — abrir/fechar esta ajuda
            </li>
            <li>
              <strong>F2</strong> — adicionar produtos
            </li>
            <li>
              <strong>F3</strong> — focar busca de cliente
            </li>
            <li>
              <strong>F4</strong> — salvar / atualizar
            </li>
            <li>
              <strong>F8</strong> — enviar para Omie
            </li>
            <li>
              <strong>Esc</strong> — fechar modal aberto
            </li>
          </ul>
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
              onClick={() => setShortcutsHelpOpen(false)}
            >
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={qtyDialogProduct != null}
        onOpenChange={(open) => {
          if (!open) setQtyDialogProduct(null);
        }}
      >
        <DialogContent className="max-w-[24rem]">
          <form onSubmit={(event) => confirmQtyDialog(event)}>
            <DialogHeader>
              <DialogTitle>Quantidade</DialogTitle>
              <DialogDescription>
                {qtyDialogProduct
                  ? `${qtyDialogProduct.descricao}${
                      qtyDialogProduct.unidade ? ` · ${qtyDialogProduct.unidade}` : ""
                    }`
                  : "Informe a quantidade do item."}
              </DialogDescription>
            </DialogHeader>
            <label className="mt-md block space-y-xs">
              <span className="text-label-md text-primary">Qtd</span>
              <input
                ref={qtyDialogInputRef}
                type="number"
                min={0.001}
                step="any"
                required
                value={qtyDialogValue}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setQtyDialogValue(event.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <DialogFooter className="mt-md">
              <button
                type="button"
                className="rounded-lg px-md py-sm text-label-md"
                onClick={() => setQtyDialogProduct(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
              >
                Adicionar
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
