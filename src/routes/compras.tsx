import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { PageSection, PageTitle } from "@/components/PageChrome";
import {
  SoftDialogBody,
  SoftDialogContent,
  SoftDialogFooter,
  SoftDialogHeader,
  softCancelBtnClass,
  softInputClass,
  softPrimaryBtnClass,
} from "@/components/SoftOsDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { osKanbanColumnStyle } from "@/lib/assistencia-domain";
import { APP_NAME } from "@/lib/brand";
import {
  concluirCompraFn,
  createCompraSolicitacaoFn,
  deleteCotacaoPropostaFn,
  getComprasBootstrapFn,
  markComprasSeenFn,
  notifyComprasUnreadChanged,
  refreshComprasFn,
  saveCotacaoPropostaFn,
  searchComprasProductsFn,
  searchComprasSuppliersFn,
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

const TAB_IDS = ["kanban", "solicitar", "historico"] as const;
const searchSchema = z.object({
  tab: z
    .union([z.enum(TAB_IDS), z.literal("cotacoes")])
    .catch("kanban")
    .transform((t): (typeof TAB_IDS)[number] => (t === "cotacoes" ? "kanban" : t)),
});

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
type CotacaoProposta = Boot["propostas"][number];
type CotacaoColId = "aberta" | "em_cotacao" | "comprada" | "finalizado";

const COTACAO_COLS: Array<{ id: CotacaoColId; label: string }> = [
  { id: "aberta", label: "A cotar" },
  { id: "em_cotacao", label: "Em cotação" },
  { id: "comprada", label: "Aguardando entrega" },
  { id: "finalizado", label: "Finalizado" },
];

const COMPRA_DRAG_MIME = "application/x-compra-id";

type CotacaoColFilter = { name: string; dateFrom: string; dateTo: string };

function emptyCotacaoColFilters(): Record<CotacaoColId, CotacaoColFilter> {
  return {
    aberta: { name: "", dateFrom: "", dateTo: "" },
    em_cotacao: { name: "", dateFrom: "", dateTo: "" },
    comprada: { name: "", dateFrom: "", dateTo: "" },
    finalizado: { name: "", dateFrom: "", dateTo: "" },
  };
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "kanban", label: "Quadro", icon: "view_kanban" },
  { id: "solicitar", label: "Solicitar", icon: "add_shopping_cart" },
  { id: "historico", label: "Histórico", icon: "history" },
];

function origemLabel(origem: string) {
  if (origem === "os") return "O.S";
  if (origem === "orcamento") return "Orçamento";
  if (origem === "manual") return "Solicitação";
  return origem;
}

const fieldClass =
  "rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:ring-2 focus:ring-amber-400/50";
const labelClass =
  "flex flex-col gap-xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant";

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status: string) {
  if (status === "aberta") return "A cotar";
  if (status === "em_cotacao") return "Em cotação";
  if (status === "comprada") return "Aguardando entrega";
  if (status === "finalizado") return "Finalizado";
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
  const [propostas, setPropostas] = useState<CotacaoProposta[]>(boot.propostas ?? []);
  const [unread, setUnread] = useState(
    boot.unread ?? { cotacoes: 0, kanban: 0, total: 0 },
  );
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setAbertas(boot.abertas);
    setHistorico(boot.historico);
    setPropostas(boot.propostas ?? []);
    setUnread(boot.unread ?? { cotacoes: 0, kanban: 0, total: 0 });
  }, [boot]);

  const [cotQuery, setCotQuery] = useState("");
  const [cotDatePreset, setCotDatePreset] = useState<DatePreset>("todos");
  const [cotDateFrom, setCotDateFrom] = useState("");
  const [cotDateTo, setCotDateTo] = useState("");
  const [cotOrigem, setCotOrigem] = useState("");
  const [cotFiltersOpen, setCotFiltersOpen] = useState(false);
  const [colFilters, setColFilters] = useState(emptyCotacaoColFilters);
  const [openColFilter, setOpenColFilter] = useState<CotacaoColId | null>(null);
  const [dragSolicitacaoId, setDragSolicitacaoId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<CotacaoColId | null>(null);

  const [histQuery, setHistQuery] = useState("");
  const [histDatePreset, setHistDatePreset] = useState<DatePreset>("mes");
  const [histDateFrom, setHistDateFrom] = useState("");
  const [histDateTo, setHistDateTo] = useState("");
  const [histStatus, setHistStatus] = useState<"todos" | "finalizado" | "cancelada">(
    "todos",
  );

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
  const [propostaId, setPropostaId] = useState<number | "">("");
  const [fornecedorId, setFornecedorId] = useState<number | "">("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [valorCompra, setValorCompra] = useState("");
  const [cmcNovo, setCmcNovo] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [notas, setNotas] = useState("");
  const [updateCmc, setUpdateCmc] = useState(true);

  const [boardOpen, setBoardOpen] = useState(false);
  const [boardRow, setBoardRow] = useState<Solicitacao | null>(null);
  const [propSupplierId, setPropSupplierId] = useState<number | "">("");
  const [propSupplierName, setPropSupplierName] = useState("");
  const [propSupplierQuery, setPropSupplierQuery] = useState("");
  const [propSupplierHits, setPropSupplierHits] = useState<
    Array<{ id: number; name: string; cnpjCpf: string | null; codigoOmie: number }>
  >([]);
  const [searchingSuppliers, setSearchingSuppliers] = useState(false);
  const [propValor, setPropValor] = useState("");
  const [propPrevisao, setPropPrevisao] = useState("");
  const [propObs, setPropObs] = useState("");
  const [editingPropId, setEditingPropId] = useState<number | null>(null);

  const canComprar = boot.user.canComprar;

  const cotRange = useMemo(
    () => resolveDatePreset(cotDatePreset, cotDateFrom, cotDateTo),
    [cotDatePreset, cotDateFrom, cotDateTo],
  );
  const histRange = useMemo(
    () => resolveDatePreset(histDatePreset, histDateFrom, histDateTo),
    [histDatePreset, histDateFrom, histDateTo],
  );

  const cotacoesBoardRows = useMemo(() => {
    const finalizados = historico.filter((r) => r.status === "finalizado");
    return [...abertas, ...finalizados];
  }, [abertas, historico]);

  const cotFiltersActive = Boolean(
    cotQuery.trim() ||
      cotOrigem ||
      cotDatePreset !== "todos" ||
      cotDateFrom ||
      cotDateTo,
  );

  const filteredCotacoes = useMemo(() => {
    const q = (cotQuery || shellQuery).trim().toLowerCase();
    return cotacoesBoardRows.filter((row) => {
      if (cotOrigem && row.origem !== cotOrigem) return false;
      if (q) {
        const hay =
          `${row.descricao} ${row.solicitadoPorNome} ${row.quoteNumero ?? ""} ${row.motivo ?? ""} ${origemLabel(row.origem)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!inDateRange(ymdFromIso(row.createdAt), cotRange.from, cotRange.to)) return false;
      return true;
    });
  }, [cotacoesBoardRows, cotQuery, shellQuery, cotOrigem, cotRange]);

  const minhasSolicitacoes = useMemo(() => {
    const rows = [...abertas, ...historico].filter(
      (r) => r.solicitadoPor === boot.user.id,
    );
    return rows.sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt) || 0;
      const tb = Date.parse(b.updatedAt || b.createdAt) || 0;
      return tb - ta;
    });
  }, [abertas, historico, boot.user.id]);

  const propostasBySolicitacao = useMemo(() => {
    const map = new Map<number, CotacaoProposta[]>();
    for (const p of propostas) {
      const list = map.get(p.solicitacaoId) ?? [];
      list.push(p);
      map.set(p.solicitacaoId, list);
    }
    return map;
  }, [propostas]);

  const selectedPropostas = useMemo(() => {
    if (!selected) return [] as CotacaoProposta[];
    return propostasBySolicitacao.get(selected.id) ?? [];
  }, [selected, propostasBySolicitacao]);

  const boardPropostas = useMemo(() => {
    if (!boardRow) return [] as CotacaoProposta[];
    return propostasBySolicitacao.get(boardRow.id) ?? [];
  }, [boardRow, propostasBySolicitacao]);

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

  const stats = useMemo(() => {
    const aCotar = abertas.filter((r) => r.status === "aberta").length;
    const emCotacao = abertas.filter((r) => r.status === "em_cotacao").length;
    const aguardando = abertas.filter((r) => r.status === "comprada").length;
    const finalizados = historico.filter((r) => r.status === "finalizado").length;
    return {
      aCotar,
      emCotacao,
      aguardando,
      finalizados,
      historico: filteredHistorico.length,
      novosQuadro: abertas.filter((i) => i.naoVisto).length,
    };
  }, [abertas, historico, filteredHistorico]);

  function goTab(next: TabId) {
    void navigate({
      to: "/compras",
      search: (prev) => ({ ...prev, tab: next }),
      replace: true,
    });
  }

  async function markTabSeen(nextTab: TabId) {
    if (nextTab !== "kanban") return;
    const hasUnread = unread.total > 0 || stats.novosQuadro > 0;
    if (!hasUnread) return;
    try {
      const next = await markComprasSeenFn({
        data: { kanban: true, cotacoes: true },
      });
      setUnread(next);
      setAbertas((prev) =>
        prev.map((item) =>
          item.naoVisto
            ? { ...item, naoVisto: false, vistoEm: new Date().toISOString() }
            : item,
        ),
      );
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

  async function reload(opts?: { notify?: boolean }) {
    const next = await refreshComprasFn();
    setAbertas(next.abertas);
    setHistorico(next.historico);
    setPropostas(next.propostas ?? []);
    if (next.unread) setUnread(next.unread);
    if (opts?.notify !== false) notifyComprasUnreadChanged();
  }

  useEffect(() => {
    const softReload = () => {
      if (document.visibilityState !== "visible") return;
      void reload({ notify: false }).catch(() => undefined);
    };
    softReload();
    document.addEventListener("visibilitychange", softReload);
    window.addEventListener("focus", softReload);
    window.addEventListener("compras-unread-changed", softReload);
    const timer = window.setInterval(softReload, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", softReload);
      window.removeEventListener("focus", softReload);
      window.removeEventListener("compras-unread-changed", softReload);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function applyPropostaToForm(p: CotacaoProposta | null) {
    if (!p) {
      setPropostaId("");
      return;
    }
    setPropostaId(p.id);
    setFornecedorId(p.supplierId ?? "");
    setFornecedorNome(p.supplierName);
    setValorCompra(String(p.valorUnitario));
    setCmcNovo(String(p.valorUnitario));
    setPrevisao(p.previsao ?? "");
    setNotas(p.observacao ?? "");
  }

  function openConcluir(row: Solicitacao) {
    setSelected(row);
    const props = propostasBySolicitacao.get(row.id) ?? [];
    if (props.length) {
      applyPropostaToForm(props[0]!);
    } else {
      setPropostaId("");
      const first = row.fornecedores[0];
      setFornecedorId(first?.supplierId ?? "");
      setFornecedorNome(first?.supplierName ?? "");
      setValorCompra(row.cmcEfetivo != null ? String(row.cmcEfetivo) : "");
      setCmcNovo(row.cmcEfetivo != null ? String(row.cmcEfetivo) : "");
      setPrevisao("");
      setNotas("");
    }
    setUpdateCmc(Boolean(row.productId));
    setConcluirOpen(true);
  }

  function resetPropostaForm() {
    setEditingPropId(null);
    setPropSupplierId("");
    setPropSupplierName("");
    setPropSupplierQuery("");
    setPropSupplierHits([]);
    setPropValor("");
    setPropPrevisao("");
    setPropObs("");
  }

  function pickPropSupplier(s: { id: number; name: string }) {
    setPropSupplierId(s.id);
    setPropSupplierName(s.name);
    setPropSupplierQuery(s.name);
    setPropSupplierHits([]);
  }

  function openCotacaoBoard(row: Solicitacao) {
    setBoardRow(row);
    resetPropostaForm();
    setBoardOpen(true);
    if (row.status === "aberta" && canComprar) {
      void run(async () => {
        const result = await setCompraStatusFn({
          data: { id: row.id, status: "em_cotacao" },
        });
        if (!result.ok) {
          setFeedback(result.error);
          return;
        }
        setAbertas((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: "em_cotacao" as const } : r)),
        );
        setBoardRow((prev) =>
          prev && prev.id === row.id ? { ...prev, status: "em_cotacao" } : prev,
        );
      });
    }
  }

  async function moveSolicitacaoToCol(row: Solicitacao, target: CotacaoColId) {
    if (row.status === target) return;
    if (!canComprar) {
      setFeedback("Somente compradores podem mover cards no quadro.");
      return;
    }
    if (
      target === "comprada" &&
      row.status !== "comprada" &&
      row.status !== "finalizado"
    ) {
      openConcluir(row);
      return;
    }
    await run(async () => {
      const result = await setCompraStatusFn({
        data: { id: row.id, status: target },
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      await reload();
    });
  }

  function onKanbanDrop(target: CotacaoColId, rawId: number | null) {
    setDragOverCol(null);
    const id = rawId ?? dragSolicitacaoId;
    if (id == null) return;
    const row = cotacoesBoardRows.find((r) => r.id === id);
    if (!row) return;
    void moveSolicitacaoToCol(row, target);
  }

  function loadPropostaIntoForm(p: CotacaoProposta) {
    setEditingPropId(p.id);
    setPropSupplierId(p.supplierId ?? "");
    setPropSupplierName(p.supplierName);
    setPropSupplierQuery(p.supplierName);
    setPropSupplierHits([]);
    setPropValor(String(p.valorUnitario));
    setPropPrevisao(p.previsao ?? "");
    setPropObs(p.observacao ?? "");
  }

  useEffect(() => {
    if (!boardOpen) return;
    const q = propSupplierQuery.trim();
    if (q.length < 2 || (propSupplierId !== "" && q === propSupplierName.trim())) {
      setPropSupplierHits([]);
      setSearchingSuppliers(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingSuppliers(true);
      try {
        const rows = await searchComprasSuppliersFn({
          data: { query: q, limit: 40 },
        });
        setPropSupplierHits(rows);
      } catch {
        setPropSupplierHits([]);
      } finally {
        setSearchingSuppliers(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [boardOpen, propSupplierQuery, propSupplierId, propSupplierName]);

  async function handleSaveProposta() {
    if (!boardRow) return;
    const valor = Number(propValor.replace(",", "."));
    if (!propSupplierName.trim()) {
      setFeedback("Informe o fornecedor da cotação.");
      return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
      setFeedback("Informe um valor unitário válido.");
      return;
    }
    await run(async () => {
      const result = await saveCotacaoPropostaFn({
        data: {
          id: editingPropId,
          solicitacaoId: boardRow.id,
          supplierId: propSupplierId === "" ? null : propSupplierId,
          supplierName: propSupplierName.trim(),
          valorUnitario: valor,
          previsao: propPrevisao || null,
          observacao: propObs.trim() || null,
        },
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setPropostas((prev) => {
        const others = prev.filter((p) => p.solicitacaoId !== boardRow.id);
        return [...others, ...result.propostas];
      });
      if (result.solicitacao) {
        setAbertas((prev) => {
          const without = prev.filter((r) => r.id !== result.solicitacao!.id);
          if (result.solicitacao!.status === "aberta" || result.solicitacao!.status === "em_cotacao") {
            return [result.solicitacao!, ...without];
          }
          return without;
        });
        setBoardRow(result.solicitacao);
      }
      resetPropostaForm();
      setFeedback("Cotação salva.");
    });
  }

  async function handleDeleteProposta(id: number) {
    if (!boardRow) return;
    await run(async () => {
      const result = await deleteCotacaoPropostaFn({
        data: { id, solicitacaoId: boardRow.id },
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setPropostas((prev) => {
        const others = prev.filter((p) => p.solicitacaoId !== boardRow.id);
        return [...others, ...result.propostas];
      });
      if (editingPropId === id) resetPropostaForm();
    });
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
      setFeedback("Solicitação enviada. Acompanhe em Minhas solicitações.");
      await reload();
    });
  }

  async function handleConcluir() {
    if (!selected) return;
    if (selectedPropostas.length && propostaId === "") {
      setFeedback("Selecione qual cotação foi escolhida para registrar a compra.");
      return;
    }
    const valor = valorCompra.trim() ? Number(valorCompra.replace(",", ".")) : null;
    const cmc = cmcNovo.trim() ? Number(cmcNovo.replace(",", ".")) : valor;
    await run(async () => {
      const result = await concluirCompraFn({
        data: {
          id: selected.id,
          propostaId: propostaId === "" ? null : propostaId,
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
      setBoardOpen(false);
      setSelected(null);
      setBoardRow(null);
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
    <AppShell
      mobileTitle="Compras"
      searchPlaceholder="Buscar produto, OS, solicitante…"
      fullHeight={tab === "kanban"}
    >
      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col px-margin-mobile py-md md:px-margin-desktop md:py-lg",
          tab === "kanban" && "overflow-hidden",
        )}
      >
        <div
          className={cn(
            "@container flex min-h-0 flex-1 flex-col gap-md",
            tab === "kanban" && "overflow-hidden",
          )}
        >
          <PageTitle
            title="Compras"
            subtitle="Quadro geral de cotações (O.S, solicitação e orçamento), solicitações e histórico."
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

          {unread.total > 0 || stats.novosQuadro > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-md py-sm text-label-md text-amber-950">
              <p className="font-semibold">Há novidades no Quadro</p>
              <p className="mt-2xs">
                {Math.max(stats.novosQuadro, unread.total)} item(ns) novo(s) para cotar/comprar.
                Abra o Quadro para marcar como visto.
              </p>
            </div>
          ) : null}

          <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                A cotar
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.aCotar}</div>
              {stats.novosQuadro > 0 ? (
                <div className="mt-2xs text-label-sm font-semibold text-amber-800">
                  {stats.novosQuadro} novo(s)
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Em cotação
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.emCotacao}</div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Aguardando
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.aguardando}</div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
              <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Finalizado
              </div>
              <div className="text-title-lg font-bold text-on-surface">{stats.finalizados}</div>
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
              const badge = t.id === "kanban" ? stats.novosQuadro : 0;
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
            <div className="flex min-h-0 flex-1 flex-col gap-md">
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <h2 className="text-title-md font-semibold text-on-surface">
                    Quadro de compras
                  </h2>
                  <p className="text-label-md text-on-surface-variant">
                    Arraste os cards entre as fases. Comprado fica em Aguardando entrega até
                    chegar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCotFiltersOpen((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-xs rounded-lg border px-sm py-xs text-label-md font-semibold",
                    cotFiltersOpen || cotFiltersActive
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-outline-variant bg-white text-on-surface",
                  )}
                >
                  <Icon name="filter_list" className="text-[16px]" />
                  Filtros
                  {cotFiltersActive ? (
                    <span
                      className={cn(
                        "rounded-full px-xs py-2xs text-[10px] font-bold uppercase",
                        cotFiltersOpen || cotFiltersActive
                          ? "bg-white/20 text-white"
                          : "bg-amber-100 text-amber-950",
                      )}
                    >
                      on
                    </span>
                  ) : null}
                </button>
              </div>
              {cotFiltersOpen ? (
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
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
                          <option value="os">O.S</option>
                          <option value="manual">Solicitação</option>
                          <option value="orcamento">Orçamento</option>
                        </select>
                      </label>
                    }
                  />
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1 gap-md overflow-x-auto pb-sm">
                {COTACAO_COLS.map((col) => {
                  const style = osKanbanColumnStyle(
                    col.id !== "comprada" && col.id !== "finalizado",
                  );
                  const colFilter = colFilters[col.id];
                  const nameQ = colFilter.name.trim().toLowerCase();
                  const dateFrom = colFilter.dateFrom.trim();
                  const dateTo = colFilter.dateTo.trim();
                  const stageRows = filteredCotacoes.filter((r) => r.status === col.id);
                  const rows = stageRows.filter((row) => {
                    if (nameQ) {
                      const hay =
                        `${row.descricao} ${row.solicitadoPorNome} ${row.quoteNumero ?? ""} ${row.motivo ?? ""} ${origemLabel(row.origem)} ${row.fornecedorNome ?? ""}`.toLowerCase();
                      if (!hay.includes(nameQ)) return false;
                    }
                    const dateValue =
                      col.id === "comprada" || col.id === "finalizado"
                        ? ymdFromIso(row.compradoEm) ||
                          ymdFromIso(row.previsao) ||
                          ymdFromIso(row.updatedAt)
                        : ymdFromIso(row.createdAt);
                    if (!inDateRange(dateValue, dateFrom, dateTo)) return false;
                    return true;
                  });
                  const filteredCol = Boolean(nameQ || dateFrom || dateTo);
                  return (
                    <section
                      key={col.id}
                      className={cn(
                        "flex h-full min-h-0 min-w-[16rem] flex-1 flex-col overflow-hidden rounded-xl border transition",
                        style.column,
                        dragOverCol === col.id && "ring-2 ring-amber-400",
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverCol(col.id);
                      }}
                      onDragLeave={() => {
                        setDragOverCol((cur) => (cur === col.id ? null : cur));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const raw = Number(
                          e.dataTransfer.getData(COMPRA_DRAG_MIME) ||
                            e.dataTransfer.getData("text/plain"),
                        );
                        onKanbanDrop(col.id, Number.isFinite(raw) && raw > 0 ? raw : null);
                      }}
                    >
                      <header className={cn("px-sm py-sm", style.header)}>
                        <div className="flex items-center justify-between gap-sm">
                          <h3 className={cn("text-label-md font-bold uppercase", style.header)}>
                            {col.label}
                          </h3>
                          <div className="flex shrink-0 items-center gap-2xs">
                            <button
                              type="button"
                              className={cn(
                                "rounded-lg p-2xs hover:bg-black/5",
                                (openColFilter === col.id || filteredCol) && "bg-black/10",
                              )}
                              title="Filtros da coluna"
                              onClick={() =>
                                setOpenColFilter((cur) => (cur === col.id ? null : col.id))
                              }
                            >
                              <Icon name="filter_list" className="text-[16px]" />
                            </button>
                            <span
                              className={cn(
                                "rounded-full px-xs py-2xs text-label-sm font-semibold",
                                style.count,
                              )}
                            >
                              {filteredCol ? rows.length : stageRows.length}
                            </span>
                          </div>
                        </div>
                        {openColFilter === col.id ? (
                          <div className="mt-sm flex flex-col gap-xs">
                            <input
                              type="search"
                              value={colFilter.name}
                              onChange={(e) =>
                                setColFilters((prev) => ({
                                  ...prev,
                                  [col.id]: { ...prev[col.id], name: e.target.value },
                                }))
                              }
                              placeholder="Produto, solicitante…"
                              className="w-full rounded-lg border border-black/10 bg-white px-sm py-xs text-label-md text-on-surface outline-none focus:ring-2 focus:ring-amber-400/50"
                            />
                            <div className="grid grid-cols-2 gap-xs">
                              <label className="flex min-w-0 flex-col gap-2xs">
                                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                                  De
                                </span>
                                <input
                                  type="date"
                                  value={colFilter.dateFrom}
                                  onChange={(e) =>
                                    setColFilters((prev) => ({
                                      ...prev,
                                      [col.id]: {
                                        ...prev[col.id],
                                        dateFrom: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full rounded-lg border border-black/10 bg-white px-xs py-xs text-label-md text-on-surface outline-none focus:ring-2 focus:ring-amber-400/50"
                                  title="Data inicial"
                                />
                              </label>
                              <label className="flex min-w-0 flex-col gap-2xs">
                                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                                  Até
                                </span>
                                <input
                                  type="date"
                                  value={colFilter.dateTo}
                                  onChange={(e) =>
                                    setColFilters((prev) => ({
                                      ...prev,
                                      [col.id]: {
                                        ...prev[col.id],
                                        dateTo: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full rounded-lg border border-black/10 bg-white px-xs py-xs text-label-md text-on-surface outline-none focus:ring-2 focus:ring-amber-400/50"
                                  title="Data final"
                                />
                              </label>
                            </div>
                            {filteredCol ? (
                              <button
                                type="button"
                                className="w-full rounded-lg bg-black/5 px-sm py-xs text-label-sm font-semibold hover:bg-black/10"
                                onClick={() =>
                                  setColFilters((prev) => ({
                                    ...prev,
                                    [col.id]: { name: "", dateFrom: "", dateTo: "" },
                                  }))
                                }
                                title="Limpar filtros"
                              >
                                Limpar
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </header>
                      <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto p-sm">
                        {rows.map((row) => {
                          const props = propostasBySolicitacao.get(row.id) ?? [];
                          const best = props.length
                            ? Math.min(...props.map((p) => p.valorUnitario))
                            : null;
                          return (
                            <article
                              key={row.id}
                              draggable={canComprar}
                              onDragStart={(e) => {
                                if (
                                  (e.target as HTMLElement | null)?.closest?.("[data-no-drag]")
                                ) {
                                  e.preventDefault();
                                  return;
                                }
                                setDragSolicitacaoId(row.id);
                                e.dataTransfer.setData(COMPRA_DRAG_MIME, String(row.id));
                                e.dataTransfer.setData("text/plain", String(row.id));
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDragSolicitacaoId(null);
                                setDragOverCol(null);
                              }}
                              className={cn(
                                "rounded-lg border p-sm",
                                style.card,
                                canComprar && "cursor-grab active:cursor-grabbing",
                                dragSolicitacaoId === row.id && "opacity-60",
                                row.naoVisto && "ring-1 ring-amber-300",
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-xs">
                                {row.naoVisto ? (
                                  <span className="rounded-full bg-amber-400 px-xs py-2xs text-[10px] font-bold uppercase text-amber-950">
                                    Novo
                                  </span>
                                ) : null}
                                <span
                                  className={cn(
                                    "rounded-full px-xs py-2xs text-[10px] font-bold uppercase tracking-wide",
                                    style.pill,
                                  )}
                                >
                                  {origemLabel(row.origem)}
                                </span>
                              </div>
                              <p className="mt-xs line-clamp-2 text-body-md font-semibold text-on-surface">
                                {row.descricao}
                              </p>
                              <p className="text-label-sm text-on-surface-variant">
                                {row.qtd}
                                {row.unidade ? ` ${row.unidade}` : " un"} ·{" "}
                                {row.solicitadoPorNome}
                                {row.quoteNumero ? ` · ${row.quoteNumero}` : ""}
                              </p>
                              {row.motivo ? (
                                <p className="mt-xs line-clamp-2 text-label-sm text-on-surface-variant">
                                  {row.motivo}
                                </p>
                              ) : null}
                              {row.status === "aberta" || row.status === "em_cotacao" ? (
                                <p className="mt-xs text-label-sm text-on-surface-variant">
                                  {props.length
                                    ? `${props.length} cotação(ões)${best != null ? ` · menor ${formatMoney(best)}` : ""}`
                                    : "Sem cotações ainda"}
                                </p>
                              ) : null}
                              {row.status === "comprada" ? (
                                <div className="mt-sm space-y-2xs">
                                  <p className="text-label-sm font-semibold text-on-surface">
                                    {row.fornecedorNome || "—"} · {formatMoney(row.valorCompra)}
                                  </p>
                                  <p className="text-label-sm text-amber-900">
                                    Previsto chegar:{" "}
                                    <span className="font-semibold">
                                      {formatDateBr(row.previsao)}
                                    </span>
                                  </p>
                                </div>
                              ) : null}
                              {row.status === "finalizado" ? (
                                <p className="mt-sm text-label-sm font-semibold text-on-surface">
                                  {row.fornecedorNome || "—"} · {formatMoney(row.valorCompra)}
                                  {row.previsao ? ` · chegou ${formatDateBr(row.previsao)}` : ""}
                                </p>
                              ) : null}
                              {row.status !== "comprada" &&
                              row.status !== "finalizado" &&
                              canComprar ? (
                                <div className="mt-sm flex flex-wrap gap-xs" data-no-drag>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg border border-outline-variant bg-white px-sm py-xs text-label-md font-semibold disabled:opacity-50"
                                    onClick={() => openCotacaoBoard(row)}
                                  >
                                    Cotar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
                                    onClick={() => openConcluir(row)}
                                  >
                                    Registrar
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
                              ) : row.status === "comprada" && canComprar ? (
                                <div className="mt-sm flex flex-wrap gap-xs" data-no-drag>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg bg-neutral-900 px-sm py-xs text-label-md font-semibold text-white disabled:opacity-50"
                                    onClick={() =>
                                      void moveSolicitacaoToCol(row, "finalizado")
                                    }
                                  >
                                    Marcar chegou
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-outline-variant bg-white px-sm py-xs text-label-md font-semibold"
                                    onClick={() => openCotacaoBoard(row)}
                                  >
                                    Ver
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  data-no-drag
                                  className="mt-sm rounded-lg border border-outline-variant bg-white px-sm py-xs text-label-md font-semibold"
                                  onClick={() => openCotacaoBoard(row)}
                                >
                                  Ver cotações
                                </button>
                              )}
                            </article>
                          );
                        })}
                        {!rows.length ? (
                          <p
                            className={cn(
                              "rounded-lg border border-dashed p-md text-center text-label-md",
                              style.empty,
                            )}
                          >
                            Vazio
                          </p>
                        ) : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
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
                    . Acompanhe a fase em Minhas solicitações.
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
                    <li>A solicitação entra no Quadro e aparece abaixo com a fase atual.</li>
                  </ul>
                </aside>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
                <div className="mb-md flex flex-wrap items-end justify-between gap-sm">
                  <div>
                    <h3 className="text-title-sm font-semibold text-on-surface">
                      Minhas solicitações
                    </h3>
                    <p className="text-label-md text-on-surface-variant">
                      Fase atual de cada item que você pediu.
                    </p>
                  </div>
                  <span className="text-label-sm font-semibold text-on-surface-variant">
                    {minhasSolicitacoes.length} item(ns)
                  </span>
                </div>
                {minhasSolicitacoes.length ? (
                  <ul className="divide-y divide-outline-variant">
                    {minhasSolicitacoes.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-start justify-between gap-sm py-sm first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-body-md font-semibold text-on-surface">
                            {row.descricao}
                          </p>
                          <p className="text-label-sm text-on-surface-variant">
                            {row.qtd}
                            {row.unidade ? ` ${row.unidade}` : " un"}
                            {row.motivo ? ` · ${row.motivo}` : ""}
                            {" · "}
                            {formatDateBr(ymdFromIso(row.createdAt))}
                          </p>
                          {row.status === "comprada" && row.previsao ? (
                            <p className="mt-2xs text-label-sm text-amber-900">
                              Previsto chegar: {formatDateBr(row.previsao)}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-sm py-2xs text-label-sm font-semibold",
                            row.status === "aberta" && "bg-amber-100 text-amber-950",
                            row.status === "em_cotacao" && "bg-sky-100 text-sky-950",
                            row.status === "comprada" && "bg-orange-100 text-orange-950",
                            row.status === "finalizado" && "bg-emerald-100 text-emerald-950",
                            row.status === "cancelada" && "bg-red-100 text-red-900",
                          )}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-md text-on-surface-variant">
                    Você ainda não tem solicitações nesta conta.
                  </p>
                )}
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
                        setHistStatus(
                          e.target.value as "todos" | "finalizado" | "cancelada",
                        )
                      }
                      className={fieldClass}
                    >
                      <option value="todos">Todos</option>
                      <option value="finalizado">Finalizado</option>
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
                ? `${selected.descricao} · escolha a cotação e confirme fornecedor/valor.`
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
            {selectedPropostas.length ? (
              <label className={labelClass}>
                Qual cotação foi escolhida?
                <select
                  value={propostaId}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : "";
                    if (id === "") {
                      setPropostaId("");
                      return;
                    }
                    const found = selectedPropostas.find((p) => p.id === id) ?? null;
                    applyPropostaToForm(found);
                  }}
                  className={fieldClass}
                >
                  <option value="">Selecione…</option>
                  {selectedPropostas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.supplierName} · {formatMoney(p.valorUnitario)}
                      {p.previsao ? ` · prev. ${formatDateBr(p.previsao)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
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
              disabled={busy || (selectedPropostas.length > 0 && propostaId === "")}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
              onClick={() => void handleConcluir()}
            >
              Confirmar compra
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={boardOpen}
        onOpenChange={(open) => {
          setBoardOpen(open);
          if (!open) {
            setBoardRow(null);
            resetPropostaForm();
          }
        }}
      >
        <SoftDialogContent size="lg">
          <SoftDialogHeader
            eyebrow="COMPRAS"
            title={boardRow ? `COTAÇÕES · ${boardRow.descricao}` : "QUADRO DE COTAÇÕES"}
          />
          <SoftDialogBody>
            {boardRow ? (
              <div className="space-y-md">
                <p className="text-label-md text-on-surface-variant">
                  {boardRow.qtd}
                  {boardRow.unidade ? ` ${boardRow.unidade}` : " un"} · origem {boardRow.origem}
                  {boardRow.quoteNumero ? ` · ${boardRow.quoteNumero}` : ""}
                  {boardRow.motivo ? ` · ${boardRow.motivo}` : ""}
                </p>

                <div className="space-y-xs">
                  <p className="text-label-md font-semibold text-on-surface">Propostas</p>
                  {boardPropostas.length ? (
                    <ul className="divide-y divide-outline-variant rounded-lg border border-outline-variant">
                      {boardPropostas.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-start justify-between gap-sm px-sm py-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-body-md font-semibold text-on-surface">
                              {p.supplierName}
                            </p>
                            <p className="text-label-sm text-on-surface-variant">
                              {formatMoney(p.valorUnitario)}
                              {p.previsao ? ` · prev. ${formatDateBr(p.previsao)}` : ""}
                              {p.observacao ? ` · ${p.observacao}` : ""}
                            </p>
                          </div>
                          {canComprar &&
                          boardRow.status !== "comprada" &&
                          boardRow.status !== "finalizado" ? (
                            <div className="flex shrink-0 gap-xs">
                              <button
                                type="button"
                                className="rounded-lg border border-outline-variant px-sm py-xs text-label-md"
                                onClick={() => loadPropostaIntoForm(p)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="rounded-lg px-sm py-xs text-label-md text-red-700"
                                disabled={busy}
                                onClick={() => void handleDeleteProposta(p.id)}
                              >
                                Excluir
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-md text-on-surface-variant">
                      Nenhuma cotação ainda. Adicione a primeira abaixo.
                    </p>
                  )}
                </div>

                {canComprar &&
                boardRow.status !== "comprada" &&
                boardRow.status !== "finalizado" ? (
                  <div className="space-y-sm rounded-xl border border-outline-variant bg-surface-container-low p-md">
                    <p className="text-label-md font-semibold text-on-surface">
                      {editingPropId ? "Editar cotação" : "Nova cotação"}
                    </p>
                    {boardRow.fornecedores.length ? (
                      <div className="space-y-xs">
                        <p className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                          Fornecedores do produto
                        </p>
                        <div className="flex flex-wrap gap-xs">
                          {boardRow.fornecedores.map((f) => (
                            <button
                              key={f.supplierId}
                              type="button"
                              onClick={() =>
                                pickPropSupplier({ id: f.supplierId, name: f.supplierName })
                              }
                              className={cn(
                                "rounded-full px-sm py-1 text-label-md font-semibold",
                                propSupplierId === f.supplierId
                                  ? "bg-secondary-container text-on-secondary-container"
                                  : "border border-outline-variant bg-surface text-on-surface",
                              )}
                            >
                              {f.supplierName}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="relative space-y-xs">
                      <label className="flex flex-col gap-xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                        Buscar fornecedor Omie
                        <span className="flex items-center gap-sm rounded-md border border-neutral-300 bg-white px-md py-sm">
                          <Icon
                            name="search"
                            className="shrink-0 text-[20px] text-on-surface-variant"
                          />
                          <input
                            value={propSupplierQuery}
                            onChange={(e) => {
                              setPropSupplierQuery(e.target.value);
                              setPropSupplierId("");
                              setPropSupplierName(e.target.value);
                            }}
                            placeholder="Nome, fantasia ou CNPJ…"
                            className="min-w-0 flex-1 bg-transparent text-body-md font-normal normal-case tracking-normal text-on-surface outline-none"
                            autoComplete="off"
                          />
                        </span>
                      </label>
                      {searchingSuppliers ? (
                        <p className="text-label-sm text-on-surface-variant">Buscando…</p>
                      ) : null}
                      {propSupplierHits.length ? (
                        <ul className="absolute z-20 max-h-48 w-full overflow-auto rounded-lg border border-outline-variant bg-surface shadow-lg">
                          {propSupplierHits.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                className="block w-full px-md py-sm text-left text-body-md hover:bg-surface-container-high"
                                onClick={() => pickPropSupplier(s)}
                              >
                                <span className="font-semibold text-on-surface">{s.name}</span>
                                <span className="mt-2xs block text-label-sm text-on-surface-variant">
                                  #{s.codigoOmie}
                                  {s.cnpjCpf ? ` · ${s.cnpjCpf}` : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {propSupplierId !== "" ? (
                        <p className="text-label-sm text-on-surface-variant">
                          Selecionado:{" "}
                          <span className="font-semibold text-on-surface">{propSupplierName}</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-sm sm:grid-cols-2">
                      <label className="flex flex-col gap-xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                        Valor unitário
                        <input
                          value={propValor}
                          onChange={(e) => setPropValor(e.target.value)}
                          className={softInputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                        Previsão
                        <input
                          type="date"
                          value={propPrevisao}
                          onChange={(e) => setPropPrevisao(e.target.value)}
                          className={softInputClass}
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                      Observações
                      <textarea
                        value={propObs}
                        onChange={(e) => setPropObs(e.target.value)}
                        rows={2}
                        className={softInputClass}
                      />
                    </label>
                    <div className="flex flex-wrap gap-sm">
                      <button
                        type="button"
                        disabled={busy}
                        className={softPrimaryBtnClass}
                        onClick={() => void handleSaveProposta()}
                      >
                        {editingPropId ? "Atualizar cotação" : "Adicionar cotação"}
                      </button>
                      {editingPropId ? (
                        <button
                          type="button"
                          className={softCancelBtnClass}
                          onClick={resetPropostaForm}
                        >
                          Nova
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </SoftDialogBody>
          <SoftDialogFooter>
            <button
              type="button"
              className={softCancelBtnClass}
              onClick={() => setBoardOpen(false)}
            >
              Fechar
            </button>
            {boardRow &&
            canComprar &&
            boardRow.status !== "comprada" &&
            boardRow.status !== "finalizado" ? (
              <button
                type="button"
                className={softPrimaryBtnClass}
                disabled={busy}
                onClick={() => {
                  setBoardOpen(false);
                  openConcluir(boardRow);
                }}
              >
                Registrar compra
              </button>
            ) : null}
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>
    </AppShell>
  );
}
