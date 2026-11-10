import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { PageSection, PageTitle } from "@/components/PageChrome";
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
  concluirCompraFn,
  createCompraSolicitacaoFn,
  getComprasBootstrapFn,
  markComprasSeenFn,
  markOsItemCompradoFn,
  notifyComprasUnreadChanged,
  refreshComprasFn,
  searchComprasProductsFn,
  setCompraStatusFn,
} from "@/lib/compras";
import { downloadComprasHistoricoExcel } from "@/lib/compras-relatorio-excel";
import { downloadComprasHistoricoPdf } from "@/lib/compras-relatorio-pdf";
import {
  DATE_PRESET_OPTIONS,
  inDateRange,
  resolveDatePreset,
  type DatePreset,
} from "@/lib/date-filters";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

const TAB_IDS = ["kanban", "cotacoes", "solicitar", "historico"] as const;
const searchSchema = z.object({ tab: z.enum(TAB_IDS).catch("kanban") });

export const Route = createFileRoute("/compras")({
  validateSearch: searchSchema,
  beforeLoad: () => requireModule("compras"),
  loader: () => getComprasBootstrapFn(),
  head: () => ({ meta: [{ title: `Compras — ${APP_NAME}` }] }),
  component: ComprasPage,
});

type TabId = (typeof TAB_IDS)[number];
type Boot = Awaited<ReturnType<typeof getComprasBootstrapFn>>;
type Solicitacao = Boot["abertas"][number];
type OsItem = Boot["osQueue"][number];
type KanbanBoard = "comprar" | "comprados";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "kanban", label: "Kanban OS", icon: "view_kanban" },
  { id: "cotacoes", label: "Cotações", icon: "request_quote" },
  { id: "solicitar", label: "Solicitar", icon: "add_shopping_cart" },
  { id: "historico", label: "Histórico", icon: "history" },
];

const fieldClass =
  "rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:ring-2 focus:ring-amber-400/50";
const labelClass =
  "flex flex-col gap-xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant";

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status: string) {
  if (status === "aberta") return "Aberta";
  if (status === "em_cotacao") return "Em cotação";
  if (status === "comprada") return "Comprada";
  if (status === "cancelada") return "Cancelada";
  if (status === "comprar") return "A comprar";
  if (status === "comprado") return "Comprado";
  return status;
}

function ymdFromIso(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function DateFilterBar(props: {
  preset: DatePreset;
  from: string;
  to: string;
  onPreset: (v: DatePreset) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  query?: string;
  onQuery?: (v: string) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="grid gap-md md:grid-cols-2 xl:grid-cols-4">
      {props.onQuery ? (
        <label className={labelClass}>
          Busca
          <input
            type="search"
            value={props.query ?? ""}
            onChange={(e) => props.onQuery?.(e.target.value)}
            placeholder="Produto, OS, cliente…"
            className={fieldClass}
          />
        </label>
      ) : null}
      <label className={labelClass}>
        Período
        <select
          value={props.preset}
          onChange={(e) => props.onPreset(e.target.value as DatePreset)}
          className={fieldClass}
        >
          {DATE_PRESET_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {props.preset === "personalizado" ? (
        <>
          <label className={labelClass}>
            De
            <input
              type="date"
              value={props.from}
              onChange={(e) => props.onFrom(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Até
            <input
              type="date"
              value={props.to}
              onChange={(e) => props.onTo(e.target.value)}
              className={fieldClass}
            />
          </label>
        </>
      ) : (
        <div className="flex flex-col justify-end text-label-md text-on-surface-variant xl:col-span-2">
          {props.from || props.to
            ? `${formatDateBr(props.from || null)} → ${formatDateBr(props.to || null)}`
            : "Sem recorte de data"}
        </div>
      )}
      {props.extra}
    </div>
  );
}

function ComprasPage() {
  const boot = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { query: shellQuery } = useShellSearch();

  const [abertas, setAbertas] = useState(boot.abertas);
  const [historico, setHistorico] = useState(boot.historico);
  const [osQueue, setOsQueue] = useState(boot.osQueue);
  const [unread, setUnread] = useState(
    boot.unread ?? { cotacoes: 0, kanban: 0, total: 0 },
  );
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [kanbanBoard, setKanbanBoard] = useState<KanbanBoard>("comprar");
  const [kanbanQuery, setKanbanQuery] = useState("");
  const [kanbanDatePreset, setKanbanDatePreset] = useState<DatePreset>("todos");
  const [kanbanDateFrom, setKanbanDateFrom] = useState("");
  const [kanbanDateTo, setKanbanDateTo] = useState("");
  const [kanbanClient, setKanbanClient] = useState("");

  const [cotQuery, setCotQuery] = useState("");
  const [cotDatePreset, setCotDatePreset] = useState<DatePreset>("todos");
  const [cotDateFrom, setCotDateFrom] = useState("");
  const [cotDateTo, setCotDateTo] = useState("");
  const [cotOrigem, setCotOrigem] = useState("");

  const [histQuery, setHistQuery] = useState("");
  const [histDatePreset, setHistDatePreset] = useState<DatePreset>("mes");
  const [histDateFrom, setHistDateFrom] = useState("");
  const [histDateTo, setHistDateTo] = useState("");
  const [histStatus, setHistStatus] = useState<"todos" | "comprada" | "cancelada">("todos");

  const [manualDesc, setManualDesc] = useState("");
  const [manualQtd, setManualQtd] = useState("1");
  const [manualMotivo, setManualMotivo] = useState("");
  const [manualLinks, setManualLinks] = useState("");
  const [manualObs, setManualObs] = useState("");
  const [manualProductId, setManualProductId] = useState<number | null>(null);
  const [manualProductCode, setManualProductCode] = useState<number | null>(null);
  const [manualUnidade, setManualUnidade] = useState<string | null>(null);
  const [productHits, setProductHits] = useState<
    Array<{
      id: number;
      codigoProduto: number;
      descricao: string;
      unidade: string | null;
      cmcEfetivo: number | null;
    }>
  >([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  useEffect(() => {
    if (tab !== "solicitar") return;
    const q = manualDesc.trim();
    if (q.length < 2 || manualProductId != null) {
      setProductHits([]);
      setSearchingProducts(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const rows = await searchComprasProductsFn({
          data: { query: q, limit: 40 },
        });
        setProductHits(
          rows.map((r) => ({
            id: r.id,
            codigoProduto: r.codigoProduto,
            descricao: r.descricao,
            unidade: r.unidade,
            cmcEfetivo: r.cmcEfetivo,
          })),
        );
      } catch {
        setProductHits([]);
      } finally {
        setSearchingProducts(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [tab, manualDesc, manualProductId]);

  const [concluirOpen, setConcluirOpen] = useState(false);
  const [selected, setSelected] = useState<Solicitacao | null>(null);
  const [fornecedorId, setFornecedorId] = useState<number | "">("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [valorCompra, setValorCompra] = useState("");
  const [cmcNovo, setCmcNovo] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [notas, setNotas] = useState("");
  const [updateCmc, setUpdateCmc] = useState(true);

  const canComprar = boot.user.canComprar;

  const kanbanRange = useMemo(
    () => resolveDatePreset(kanbanDatePreset, kanbanDateFrom, kanbanDateTo),
    [kanbanDatePreset, kanbanDateFrom, kanbanDateTo],
  );
  const cotRange = useMemo(
    () => resolveDatePreset(cotDatePreset, cotDateFrom, cotDateTo),
    [cotDatePreset, cotDateFrom, cotDateTo],
  );
  const histRange = useMemo(
    () => resolveDatePreset(histDatePreset, histDateFrom, histDateTo),
    [histDatePreset, histDateFrom, histDateTo],
  );

  const filteredOs = useMemo(() => {
    const q = (kanbanQuery || shellQuery).trim().toLowerCase();
    const clientQ = kanbanClient.trim().toLowerCase();
    const wanted = kanbanBoard === "comprar" ? "comprar" : "comprado";
    return osQueue.filter((item) => {
      if (item.status !== wanted) return false;
      if (q) {
        const hay = `${item.nome} ${item.osNum} ${item.clientName} ${item.quoteNumero ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (clientQ && !item.clientName.toLowerCase().includes(clientQ)) return false;
      const dateValue = ymdFromIso(item.previsao) || ymdFromIso(item.updatedAt);
      if (!inDateRange(dateValue, kanbanRange.from, kanbanRange.to)) return false;
      return true;
    });
  }, [osQueue, kanbanBoard, kanbanQuery, shellQuery, kanbanClient, kanbanRange]);

  const osByProduct = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        nome: string;
        productId: number | null;
        totalQtd: number;
        cmcEfetivo: number | null;
        fornecedores: OsItem["fornecedores"];
        items: OsItem[];
      }
    >();
    for (const item of filteredOs) {
      const key = item.productId != null ? `p:${item.productId}` : `n:${item.nome.trim().toLowerCase()}`;
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          key,
          nome: item.nome,
          productId: item.productId,
          totalQtd: item.qtd,
          cmcEfetivo: item.cmcEfetivo,
          fornecedores: item.fornecedores,
          items: [item],
        });
      } else {
        cur.totalQtd += item.qtd;
        cur.items.push(item);
        if (cur.cmcEfetivo == null && item.cmcEfetivo != null) cur.cmcEfetivo = item.cmcEfetivo;
        if (!cur.fornecedores.length && item.fornecedores.length) cur.fornecedores = item.fornecedores;
      }
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [filteredOs]);

  const filteredCotacoes = useMemo(() => {
    const q = (cotQuery || shellQuery).trim().toLowerCase();
    return abertas.filter((row) => {
      if (cotOrigem && row.origem !== cotOrigem) return false;
      if (q) {
        const hay =
          `${row.descricao} ${row.solicitadoPorNome} ${row.quoteNumero ?? ""} ${row.motivo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!inDateRange(ymdFromIso(row.createdAt), cotRange.from, cotRange.to)) return false;
      return true;
    });
  }, [abertas, cotQuery, shellQuery, cotOrigem, cotRange]);

  const filteredHistorico = useMemo(() => {
    const q = (histQuery || shellQuery).trim().toLowerCase();
    return historico.filter((row) => {
      if (histStatus !== "todos" && row.status !== histStatus) return false;
      if (q) {
        const hay =
          `${row.descricao} ${row.solicitadoPorNome} ${row.compradoPorNome ?? ""} ${row.fornecedorNome ?? ""} ${row.motivo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const dateValue = ymdFromIso(row.compradoEm) || ymdFromIso(row.updatedAt);
      if (!inDateRange(dateValue, histRange.from, histRange.to)) return false;
      return true;
    });
  }, [historico, histQuery, shellQuery, histStatus, histRange]);

  const stats = useMemo(
    () => ({
      osPendentes: osQueue.filter((i) => i.status === "comprar").length,
      osComprados: osQueue.filter((i) => i.status === "comprado").length,
      cotacoes: abertas.length,
      historico: filteredHistorico.length,
      novosKanban: osQueue.filter((i) => i.naoVisto).length,
      novosCotacoes: abertas.filter((i) => i.naoVisto).length,
    }),
    [osQueue, abertas, filteredHistorico],
  );

  function goTab(next: TabId) {
    void navigate({
      to: "/compras",
      search: (prev) => ({ ...prev, tab: next }),
      replace: true,
    });
  }

  async function markTabSeen(nextTab: TabId) {
    if (nextTab !== "kanban" && nextTab !== "cotacoes") return;
    const hasUnread =
      nextTab === "kanban" ? unread.kanban > 0 || stats.novosKanban > 0 : unread.cotacoes > 0 || stats.novosCotacoes > 0;
    if (!hasUnread) return;
    try {
      const next = await markComprasSeenFn({
        data: {
          kanban: nextTab === "kanban",
          cotacoes: nextTab === "cotacoes",
        },
      });
      setUnread(next);
      if (nextTab === "kanban") {
        setOsQueue((prev) =>
          prev.map((item) =>
            item.naoVisto
              ? {
                  ...item,
                  naoVisto: false,
                  compraVistoEm: new Date().toISOString(),
                }
              : item,
          ),
        );
      } else {
        setAbertas((prev) =>
          prev.map((item) =>
            item.naoVisto
              ? { ...item, naoVisto: false, vistoEm: new Date().toISOString() }
              : item,
          ),
        );
      }
      notifyComprasUnreadChanged();
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void markTabSeen(tab);
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function reload() {
    const next = await refreshComprasFn();
    setAbertas(next.abertas);
    setHistorico(next.historico);
    setOsQueue(next.osQueue);
    if (next.unread) setUnread(next.unread);
    notifyComprasUnreadChanged();
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  function openConcluir(row: Solicitacao) {
    setSelected(row);
    const first = row.fornecedores[0];
    setFornecedorId(first?.supplierId ?? "");
    setFornecedorNome(first?.supplierName ?? "");
    setValorCompra(row.cmcEfetivo != null ? String(row.cmcEfetivo) : "");
    setCmcNovo(row.cmcEfetivo != null ? String(row.cmcEfetivo) : "");
    setPrevisao("");
    setNotas("");
    setUpdateCmc(Boolean(row.productId));
    setConcluirOpen(true);
  }

  function parseLinksInput(raw: string) {
    return raw
      .split(/[\n,;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  async function handleSolicitarManual() {
    const qtd = Number(manualQtd.replace(",", "."));
    const motivo = manualMotivo.trim();
    if (!motivo) {
      setFeedback("Informe o motivo da solicitação.");
      return;
    }
    await run(async () => {
      const result = await createCompraSolicitacaoFn({
        data: {
          origem: "manual",
          descricao: manualDesc.trim(),
          unidade: manualUnidade,
          qtd,
          productId: manualProductId,
          codigoProduto: manualProductCode,
          motivo,
          links: parseLinksInput(manualLinks),
          observacao: manualObs.trim() || null,
        },
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setManualDesc("");
      setManualQtd("1");
      setManualMotivo("");
      setManualLinks("");
      setManualObs("");
      setManualProductId(null);
      setManualProductCode(null);
      setManualUnidade(null);
      setProductHits([]);
      setFeedback("Solicitação enviada ao comprador.");
      await reload();
      goTab("cotacoes");
    });
  }

  async function handleMarkOsComprado(item: OsItem) {
    await run(async () => {
      const result = await markOsItemCompradoFn({
        data: { itemId: item.itemId, previsao: new Date().toISOString().slice(0, 10) },
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setOsQueue(result.osQueue);
      setKanbanBoard("comprados");
      setFeedback(`${item.nome} marcado como comprado e movido para Comprados.`);
    });
  }

  async function handleConcluir() {
    if (!selected) return;
    const valor = valorCompra.trim() ? Number(valorCompra.replace(",", ".")) : null;
    const cmc = cmcNovo.trim() ? Number(cmcNovo.replace(",", ".")) : valor;
    await run(async () => {
      const result = await concluirCompraFn({
        data: {
          id: selected.id,
          fornecedorId: fornecedorId === "" ? null : fornecedorId,
          fornecedorNome: fornecedorNome.trim() || null,
          valorCompra: valor != null && Number.isFinite(valor) ? valor : null,
          cmcNovo: cmc != null && Number.isFinite(cmc) ? cmc : null,
          previsao: previsao || null,
          notasCompra: notas.trim() || null,
          updateCmcInterno: updateCmc,
        },
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setConcluirOpen(false);
      setSelected(null);
      setFeedback(
        updateCmc && selected.productId
          ? "Compra concluída e CMC interno atualizado."
          : "Compra concluída.",
      );
      await reload();
    });
  }

  function histFiltersLabel() {
    const bits = [
      histStatus === "todos" ? "Todos os status" : statusLabel(histStatus),
      histRange.from || histRange.to
        ? `${formatDateBr(histRange.from || null)} → ${formatDateBr(histRange.to || null)}`
        : "Todas as datas",
      histQuery.trim() ? `Busca: ${histQuery.trim()}` : null,
    ];
    return bits.filter(Boolean).join(" · ");
  }

  function toExportRows() {
    return filteredHistorico.map((row) => ({
      quando: row.compradoEm
        ? new Date(row.compradoEm).toLocaleString("pt-BR")
        : new Date(row.updatedAt).toLocaleString("pt-BR"),
      produto: row.descricao,
      qtd: row.qtd,
      origem: row.origem,
      status: statusLabel(row.status),
      solicitante: row.solicitadoPorNome,
      motivo: row.motivo,
      fornecedor: row.fornecedorNome,
      valorCompra: row.valorCompra,
      cmcNovo: row.cmcNovo,
      comprador: row.compradoPorNome,
      quoteNumero: row.quoteNumero,
      links: row.links,
    }));
  }

  async function exportHistorico(kind: "pdf" | "excel") {
    if (!filteredHistorico.length) {
      setFeedback("Nenhum registro no filtro para exportar.");
      return;
    }
    setExportBusy(true);
    setFeedback(null);
    try {
      const payload = {
        title: "Histórico de compras",
        generatedAt: new Date().toLocaleString("pt-BR"),
        filtersLabel: histFiltersLabel(),
        rows: toExportRows(),
      };
      if (kind === "pdf") await downloadComprasHistoricoPdf(payload);
      else downloadComprasHistoricoExcel(payload);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao exportar.");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <AppShell mobileTitle="Compras" searchPlaceholder="Buscar produto, OS, solicitante…">
      <main className="flex-1 px-margin-mobile py-md md:px-margin-desktop md:py-lg">
        <div className="@container mx-auto max-w-6xl space-y-md">
          <PageTitle
            title="Compras"
            subtitle="Kanban por produto, cotações, solicitações e histórico com relatório."
          >
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-white px-sm py-xs text-label-md font-semibold text-on-surface disabled:opacity-50"
              onClick={() => void run(reload)}
            >
              <Icon name="refresh" className="text-[16px]" />
              Atualizar
            </button>
          </PageTitle>

          {feedback ? (
            <p className="rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface">
              {feedback}
            </p>
          ) : null}

          {!boot.user.isComprador && !canComprar ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-label-md text-amber-900">
              Você pode solicitar compras. Para cotar e atualizar CMC, o admin precisa marcar o
              usuário como comprador.
            </p>
          ) : null}

          {unread.total > 0 || stats.novosKanban > 0 || stats.novosCotacoes > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-md py-sm text-label-md text-amber-950">
              <p className="font-semibold">Há novidades para comprar/cotar</p>
              <p className="mt-2xs">
                {[
                  stats.novosKanban > 0 || unread.kanban > 0
                    ? `${Math.max(stats.novosKanban, unread.kanban)} item(ns) novo(s) no Kanban OS`
                    : null,
                  stats.novosCotacoes > 0 || unread.cotacoes > 0
                    ? `${Math.max(stats.novosCotacoes, unread.cotacoes)} cotação(ões) nova(s)`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                . Abra a aba correspondente para marcar como visto.
              </p>
            </div>
          ) : null}

          <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                A comprar
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.osPendentes}</div>
              {stats.novosKanban > 0 ? (
                <div className="mt-2xs text-label-sm font-semibold text-amber-800">
                  {stats.novosKanban} novo(s)
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Comprados
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.osComprados}</div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Cotações
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.cotacoes}</div>
              {stats.novosCotacoes > 0 ? (
                <div className="mt-2xs text-label-sm font-semibold text-amber-800">
                  {stats.novosCotacoes} nova(s)
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Histórico filtrado
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.historico}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-xs border-b border-outline-variant pb-sm">
            {TABS.map((t) => {
              const badge =
                t.id === "kanban"
                  ? stats.novosKanban
                  : t.id === "cotacoes"
                    ? stats.novosCotacoes
                    : 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => goTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-xs rounded-lg px-sm py-xs text-label-md font-semibold",
                    tab === t.id
                      ? "bg-neutral-900 text-white"
                      : "bg-surface text-on-surface-variant hover:bg-surface-container",
                  )}
                >
                  <Icon name={t.icon} className="text-[16px]" />
                  {t.label}
                  {badge > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.65rem] font-bold",
                        tab === t.id
                          ? "bg-amber-400 text-amber-950"
                          : "bg-amber-100 text-amber-950",
                      )}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {tab === "kanban" ? (
            <PageSection className="space-y-md">
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <h2 className="text-title-md font-semibold text-on-surface">Kanban por produto</h2>
                  <p className="text-label-md text-on-surface-variant">
                    Itens da Assistência agrupados por produto. Ao comprar, vão para Comprados.
                  </p>
                </div>
                <div className="flex flex-wrap gap-xs">
                  {(
                    [
                      { id: "comprar" as const, label: `A comprar (${stats.osPendentes})` },
                      { id: "comprados" as const, label: `Comprados (${stats.osComprados})` },
                    ] as const
                  ).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setKanbanBoard(b.id)}
                      className={cn(
                        "rounded-lg px-sm py-xs text-label-md font-semibold",
                        kanbanBoard === b.id
                          ? "bg-secondary-container text-on-secondary-container"
                          : "border border-outline-variant text-on-surface-variant",
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <DateFilterBar
                preset={kanbanDatePreset}
                from={kanbanDateFrom}
                to={kanbanDateTo}
                onPreset={setKanbanDatePreset}
                onFrom={setKanbanDateFrom}
                onTo={setKanbanDateTo}
                query={kanbanQuery}
                onQuery={setKanbanQuery}
                extra={
                  <label className={labelClass}>
                    Cliente
                    <input
                      value={kanbanClient}
                      onChange={(e) => setKanbanClient(e.target.value)}
                      placeholder="Filtrar cliente"
                      className={fieldClass}
                    />
                  </label>
                }
              />

              <div className="grid gap-md">
                {osByProduct.map((group) => {
                  const novosNoGrupo = group.items.filter((i) => i.naoVisto).length;
                  return (
                  <article
                    key={group.key}
                    className={cn(
                      "rounded-xl border bg-surface-container-lowest p-md",
                      novosNoGrupo > 0
                        ? "border-amber-300 ring-1 ring-amber-200"
                        : "border-outline-variant",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-xs">
                          <h3 className="text-title-md font-semibold text-on-surface">{group.nome}</h3>
                          {novosNoGrupo > 0 ? (
                            <span className="rounded-full bg-amber-400 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-amber-950">
                              Novo
                            </span>
                          ) : null}
                        </div>
                        <p className="text-label-md text-on-surface-variant">
                          Total {group.totalQtd} · {group.items.length} OS
                          {group.cmcEfetivo != null ? ` · CMC ${formatMoney(group.cmcEfetivo)}` : ""}
                        </p>
                        {group.fornecedores.length ? (
                          <p className="mt-2xs text-label-sm text-on-surface-variant">
                            {group.fornecedores
                              .map(
                                (f) =>
                                  `${f.supplierName}${f.codigoFornecedor ? ` (${f.codigoFornecedor})` : ""}`,
                              )
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <ul className="mt-sm space-y-sm border-t border-outline-variant pt-sm">
                      {group.items.map((item) => (
                        <li
                          key={item.itemId}
                          className={cn(
                            "flex flex-wrap items-center justify-between gap-sm rounded-lg px-sm py-xs",
                            item.naoVisto
                              ? "bg-amber-50 ring-1 ring-amber-200"
                              : "bg-surface",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-xs font-medium text-on-surface">
                              <span>
                                {item.qtd}× · {item.osNum} · {item.clientName}
                              </span>
                              {item.naoVisto ? (
                                <span className="rounded-full bg-amber-400 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-amber-950">
                                  Novo
                                </span>
                              ) : null}
                            </div>
                            <div className="text-label-sm text-on-surface-variant">
                              {item.quoteNumero ? `${item.quoteNumero} · ` : ""}
                              {item.previsao
                                ? `Previsão ${formatDateBr(item.previsao)}`
                                : statusLabel(item.status)}
                            </div>
                          </div>
                          {canComprar && item.status === "comprar" ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
                              onClick={() => void handleMarkOsComprado(item)}
                            >
                              Comprado
                            </button>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                              {statusLabel(item.status)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </article>
                  );
                })}
              </div>
              {!osByProduct.length ? (
                <p className="text-body-md text-on-surface-variant">
                  Nenhum produto nesta aba com os filtros atuais.
                </p>
              ) : null}
            </PageSection>
          ) : null}

          {tab === "cotacoes" ? (
            <PageSection className="space-y-md">
              <div>
                <h2 className="text-title-md font-semibold text-on-surface">Cotações abertas</h2>
                <p className="text-label-md text-on-surface-variant">
                  Solicitações de colaboradores e produtos enviados dos orçamentos.
                </p>
              </div>
              <DateFilterBar
                preset={cotDatePreset}
                from={cotDateFrom}
                to={cotDateTo}
                onPreset={setCotDatePreset}
                onFrom={setCotDateFrom}
                onTo={setCotDateTo}
                query={cotQuery}
                onQuery={setCotQuery}
                extra={
                  <label className={labelClass}>
                    Origem
                    <select
                      value={cotOrigem}
                      onChange={(e) => setCotOrigem(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Todas</option>
                      <option value="manual">Manual</option>
                      <option value="orcamento">Orçamento</option>
                      <option value="os">OS</option>
                    </select>
                  </label>
                }
              />
              <div className="grid gap-md lg:grid-cols-2">
                {filteredCotacoes.map((row) => (
                  <article
                    key={row.id}
                    className={cn(
                      "rounded-xl border bg-surface-container-lowest p-md",
                      row.naoVisto
                        ? "border-amber-300 ring-1 ring-amber-200"
                        : "border-outline-variant",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-xs">
                      {row.naoVisto ? (
                        <span className="rounded-full bg-amber-400 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-amber-950">
                          Novo
                        </span>
                      ) : null}
                      <span className="rounded-full bg-amber-100 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-amber-900">
                        {row.origem}
                      </span>
                      <span className="rounded-full bg-neutral-900 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-white">
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <h3 className="mt-xs text-title-md font-semibold text-on-surface">
                      {row.descricao}
                    </h3>
                    <p className="text-label-md text-on-surface-variant">
                      {row.qtd}
                      {row.unidade ? ` ${row.unidade}` : " un"} · solicitado por{" "}
                      <span className="font-semibold text-on-surface">{row.solicitadoPorNome}</span>
                      {row.quoteNumero ? ` · ${row.quoteNumero}` : ""}
                    </p>
                    {row.motivo ? (
                      <p className="mt-sm rounded-lg bg-surface px-sm py-xs text-body-md text-on-surface">
                        <span className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                          Motivo ·{" "}
                        </span>
                        {row.motivo}
                      </p>
                    ) : null}
                    <dl className="mt-sm grid gap-xs text-label-md sm:grid-cols-2">
                      <div>
                        <dt className="text-on-surface-variant">CMC atual</dt>
                        <dd className="font-medium">{formatMoney(row.cmcEfetivo)}</dd>
                      </div>
                      <div>
                        <dt className="text-on-surface-variant">Fornecedores</dt>
                        <dd>
                          {row.fornecedores.length
                            ? row.fornecedores.map((f) => f.supplierName).join(" · ")
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    {row.links.length ? (
                      <ul className="mt-sm space-y-2xs text-label-md">
                        {row.links.map((link) => (
                          <li key={link}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all font-medium text-primary underline"
                            >
                              {link}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {row.observacao ? (
                      <p className="mt-sm text-label-md text-on-surface-variant">{row.observacao}</p>
                    ) : null}
                    {canComprar ? (
                      <div className="mt-sm flex flex-wrap gap-xs">
                        {row.status === "aberta" ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-lg border border-outline-variant px-sm py-xs text-label-md font-semibold disabled:opacity-50"
                            onClick={() =>
                              void run(async () => {
                                const result = await setCompraStatusFn({
                                  data: { id: row.id, status: "em_cotacao" },
                                });
                                if (!result.ok) setFeedback(result.error);
                                else await reload();
                              })
                            }
                          >
                            Em cotação
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
                          onClick={() => openConcluir(row)}
                        >
                          Registrar compra
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg px-sm py-xs text-label-md text-red-700 disabled:opacity-50"
                          onClick={() =>
                            void run(async () => {
                              const result = await setCompraStatusFn({
                                data: { id: row.id, status: "cancelada" },
                              });
                              if (!result.ok) setFeedback(result.error);
                              else await reload();
                            })
                          }
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {!filteredCotacoes.length ? (
                <p className="text-body-md text-on-surface-variant">
                  Nenhuma cotação com esses filtros.
                </p>
              ) : null}
            </PageSection>
          ) : null}

          {tab === "solicitar" ? (
            <PageSection className="space-y-md">
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <h2 className="text-title-md font-semibold text-on-surface">
                    Solicitar compra
                  </h2>
                  <p className="text-label-md text-on-surface-variant">
                    Solicitante:{" "}
                    <span className="font-semibold text-on-surface">{boot.user.name}</span>
                    . O comprador vê em Cotações.
                  </p>
                </div>
              </div>

              <div className="grid gap-md lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
                  <div className="grid gap-md sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                    <label className={labelClass}>
                      Qtd
                      <input
                        value={manualQtd}
                        onChange={(e) => setManualQtd(e.target.value)}
                        className={fieldClass}
                      />
                    </label>
                    <label className={cn(labelClass, "relative")}>
                      O que comprar
                      <input
                        value={manualDesc}
                        onChange={(e) => {
                          setManualDesc(e.target.value);
                          setManualProductId(null);
                          setManualProductCode(null);
                          setManualUnidade(null);
                        }}
                        placeholder="Digite para buscar no catálogo Omie…"
                        className={fieldClass}
                        autoComplete="off"
                      />
                      {searchingProducts ? (
                        <span className="mt-2xs text-label-sm font-normal normal-case tracking-normal text-on-surface-variant">
                          Buscando…
                        </span>
                      ) : null}
                      {productHits.length && manualProductId == null ? (
                        <ul className="absolute left-0 right-0 top-[calc(100%-0.15rem)] z-20 max-h-56 overflow-auto rounded-lg border border-outline-variant bg-white shadow-lg">
                          {productHits.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="flex w-full flex-col gap-2xs px-sm py-xs text-left font-normal normal-case tracking-normal hover:bg-surface-container"
                                onClick={() => {
                                  setManualDesc(p.descricao);
                                  setManualProductId(p.id);
                                  setManualProductCode(p.codigoProduto);
                                  setManualUnidade(p.unidade);
                                  setProductHits([]);
                                }}
                              >
                                <span className="text-body-md font-medium text-on-surface">
                                  {p.descricao}
                                </span>
                                <span className="text-label-sm text-on-surface-variant">
                                  #{p.codigoProduto}
                                  {p.unidade ? ` · ${p.unidade}` : ""}
                                  {p.cmcEfetivo != null
                                    ? ` · CMC ${formatMoney(p.cmcEfetivo)}`
                                    : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {manualProductId != null ? (
                        <span className="mt-2xs text-label-sm font-normal normal-case tracking-normal text-emerald-800">
                          Omie #{manualProductCode}
                          {manualUnidade ? ` · ${manualUnidade}` : ""}
                        </span>
                      ) : manualDesc.trim().length >= 2 &&
                        !searchingProducts &&
                        !productHits.length ? (
                        <span className="mt-2xs text-label-sm font-normal normal-case tracking-normal text-on-surface-variant">
                          Sem match no Omie — pode enviar como texto livre.
                        </span>
                      ) : null}
                    </label>
                  </div>

                  <label className={cn(labelClass, "mt-md")}>
                    Motivo da solicitação
                    <textarea
                      value={manualMotivo}
                      onChange={(e) => setManualMotivo(e.target.value)}
                      rows={3}
                      placeholder="Por que precisa comprar?"
                      className={fieldClass}
                      required
                    />
                  </label>

                  <div className="mt-md grid gap-md sm:grid-cols-2">
                    <label className={labelClass}>
                      Links (opcional)
                      <textarea
                        value={manualLinks}
                        onChange={(e) => setManualLinks(e.target.value)}
                        rows={3}
                        placeholder={"Um link por linha\nhttps://..."}
                        className={fieldClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Observação extra
                      <textarea
                        value={manualObs}
                        onChange={(e) => setManualObs(e.target.value)}
                        rows={3}
                        className={fieldClass}
                      />
                    </label>
                  </div>

                  <div className="mt-md flex flex-wrap items-center gap-sm">
                    <button
                      type="button"
                      disabled={busy || !manualDesc.trim() || !manualMotivo.trim()}
                      className="inline-flex items-center gap-xs rounded-lg bg-neutral-900 px-md py-sm text-label-md font-semibold text-white disabled:opacity-50"
                      onClick={() => void handleSolicitarManual()}
                    >
                      <Icon name="send" className="text-[16px]" />
                      Enviar ao comprador
                    </button>
                    <span className="text-label-sm text-on-surface-variant">
                      Motivo é obrigatório
                    </span>
                  </div>
                </div>

                <aside className="rounded-xl border border-outline-variant bg-surface px-md py-md text-body-md text-on-surface-variant">
                  <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface">
                    Como funciona
                  </h3>
                  <ul className="mt-sm list-disc space-y-xs pl-md">
                    <li>Busque o produto no catálogo Omie ou digite o nome.</li>
                    <li>Informe o motivo para o comprador priorizar.</li>
                    <li>Links de referência (loja, foto, PDF) são opcionais.</li>
                    <li>A solicitação aparece em Cotações para quem é comprador.</li>
                  </ul>
                </aside>
              </div>
            </PageSection>
          ) : null}

          {tab === "historico" ? (
            <PageSection className="space-y-md">
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <h2 className="text-title-md font-semibold text-on-surface">Histórico</h2>
                  <p className="text-label-md text-on-surface-variant">
                    Filtre por data e exporte PDF ou Excel.
                  </p>
                </div>
                <div className="flex flex-wrap gap-xs">
                  <button
                    type="button"
                    disabled={exportBusy || !filteredHistorico.length}
                    className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-white px-sm py-xs text-label-md font-semibold disabled:opacity-50"
                    onClick={() => void exportHistorico("excel")}
                  >
                    <Icon name="table_view" className="text-[16px]" />
                    Excel
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy || !filteredHistorico.length}
                    className="inline-flex items-center gap-xs rounded-lg bg-neutral-900 px-sm py-xs text-label-md font-semibold text-white disabled:opacity-50"
                    onClick={() => void exportHistorico("pdf")}
                  >
                    <Icon name="picture_as_pdf" className="text-[16px]" />
                    {exportBusy ? "Gerando…" : "PDF"}
                  </button>
                </div>
              </div>

              <DateFilterBar
                preset={histDatePreset}
                from={histDateFrom}
                to={histDateTo}
                onPreset={setHistDatePreset}
                onFrom={setHistDateFrom}
                onTo={setHistDateTo}
                query={histQuery}
                onQuery={setHistQuery}
                extra={
                  <label className={labelClass}>
                    Status
                    <select
                      value={histStatus}
                      onChange={(e) =>
                        setHistStatus(e.target.value as "todos" | "comprada" | "cancelada")
                      }
                      className={fieldClass}
                    >
                      <option value="todos">Todos</option>
                      <option value="comprada">Comprada</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </label>
                }
              />

              <div className="overflow-x-auto rounded-xl border border-outline-variant">
                <table className="min-w-full text-left text-body-md">
                  <thead className="bg-neutral-900 text-label-sm uppercase tracking-wide text-white">
                    <tr>
                      <th className="px-sm py-xs">Quando</th>
                      <th className="px-sm py-xs">Produto</th>
                      <th className="px-sm py-xs">Status</th>
                      <th className="px-sm py-xs">Solicitante</th>
                      <th className="px-sm py-xs">Fornecedor</th>
                      <th className="px-sm py-xs">Valor / CMC</th>
                      <th className="px-sm py-xs">Comprador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistorico.map((row) => (
                      <tr key={row.id} className="border-t border-outline-variant">
                        <td className="px-sm py-xs text-label-md">
                          {row.compradoEm
                            ? new Date(row.compradoEm).toLocaleString("pt-BR")
                            : new Date(row.updatedAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-sm py-xs">
                          <div className="font-medium">{row.descricao}</div>
                          <div className="text-label-sm text-on-surface-variant">
                            {row.qtd}× · {row.origem}
                            {row.quoteNumero ? ` · ${row.quoteNumero}` : ""}
                          </div>
                          {row.motivo ? (
                            <div className="mt-2xs text-label-sm text-on-surface-variant">
                              Motivo: {row.motivo}
                            </div>
                          ) : null}
                          {row.links.length ? (
                            <div className="mt-2xs space-y-2xs">
                              {row.links.map((link) => (
                                <a
                                  key={link}
                                  href={link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-label-sm text-primary underline"
                                >
                                  {link}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-sm py-xs">{statusLabel(row.status)}</td>
                        <td className="px-sm py-xs">{row.solicitadoPorNome}</td>
                        <td className="px-sm py-xs">{row.fornecedorNome || "—"}</td>
                        <td className="px-sm py-xs">
                          {formatMoney(row.valorCompra)}
                          {row.cmcNovo != null ? (
                            <div className="text-label-sm text-on-surface-variant">
                              CMC {formatMoney(row.cmcNovo)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-sm py-xs">{row.compradoPorNome || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredHistorico.length ? (
                <p className="text-body-md text-on-surface-variant">
                  Nenhum registro no período/filtro.
                </p>
              ) : null}
            </PageSection>
          ) : null}
        </div>
      </main>

      <Dialog open={concluirOpen} onOpenChange={setConcluirOpen}>
        <DialogContent className="max-w-[32rem]">
          <DialogHeader>
            <DialogTitle>Registrar compra</DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.descricao} · informe fornecedor, valor e CMC para atualizar o cadastro.`
                : "Concluir cotação"}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-md grid gap-md">
            {selected?.motivo ? (
              <p className="rounded-lg bg-surface px-sm py-xs text-body-md">
                <span className="text-label-sm font-semibold uppercase text-on-surface-variant">
                  Motivo ·{" "}
                </span>
                {selected.motivo}
              </p>
            ) : null}
            <label className={labelClass}>
              Fornecedor cadastrado
              <select
                value={fornecedorId}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : "";
                  setFornecedorId(next);
                  const found = boot.suppliers.find((s) => s.id === next);
                  if (found) setFornecedorNome(found.name);
                }}
                className={fieldClass}
              >
                <option value="">Outro / digitar</option>
                {(selected?.fornecedores.length
                  ? selected.fornecedores.map((f) => ({
                      id: f.supplierId,
                      name: f.supplierName,
                    }))
                  : boot.suppliers
                ).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Nome do fornecedor
              <input
                value={fornecedorNome}
                onChange={(e) => setFornecedorNome(e.target.value)}
                className={fieldClass}
              />
            </label>
            <div className="grid gap-md sm:grid-cols-2">
              <label className={labelClass}>
                Valor unitário compra
                <input
                  value={valorCompra}
                  onChange={(e) => {
                    setValorCompra(e.target.value);
                    if (!cmcNovo || cmcNovo === valorCompra) setCmcNovo(e.target.value);
                  }}
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                Novo CMC interno
                <input
                  value={cmcNovo}
                  onChange={(e) => setCmcNovo(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <label className={labelClass}>
              Previsão de entrega
              <input
                type="date"
                value={previsao}
                onChange={(e) => setPrevisao(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Notas
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                className={fieldClass}
              />
            </label>
            {selected?.productId ? (
              <label className="inline-flex items-center gap-sm text-body-md text-on-surface">
                <input
                  type="checkbox"
                  checked={updateCmc}
                  onChange={(e) => setUpdateCmc(e.target.checked)}
                />
                Atualizar CMC interno do produto
              </label>
            ) : null}
          </div>
          <DialogFooter className="mt-md gap-sm">
            <button
              type="button"
              className="rounded-lg px-md py-sm text-label-md"
              onClick={() => setConcluirOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
              onClick={() => void handleConcluir()}
            >
              Confirmar compra
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
