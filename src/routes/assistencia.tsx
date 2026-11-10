import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  ActivitiesCalendar,
  OS_ACTIVITY_LEGEND,
  activityInitial,
  osActivityStatus,
} from "@/components/ActivitiesCalendar";
import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { PhotoCapture, type CapturedPhoto } from "@/components/PhotoCapture";
import {
  btnMuted,
  btnOutline,
  btnPrimary,
  feedbackErrClass,
  fieldClass,
  PageSection,
  PageTitle,
} from "@/components/PageChrome";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  acceptConferenceFn,
  addOsItemFn,
  advanceOsFn,
  checkInOsFn,
  checkOutOsFn,
  createOsFn,
  finishVisitaFn,
  getAssistenciaBootstrapFn,
  getOsFn,
  listOsFn,
  markExecutedFn,
  moveOsKanbanFn,
  receivePurchaseFn,
  requestReturnFn,
  resolveOsMaterialBaixaFn,
  resolveReturnFn,
  saveOsLevFn,
  saveOsMaterialDispositionFn,
  saveOsResolucaoFn,
  scheduleOsFn,
  searchAssistClientsFn,
  searchQuotesFn,
  startExecOsFn,
  submitConferenceFn,
  updateOsItemFn,
} from "@/lib/assistencia";
import {
  OS_ITEM_STATUS_CLASS,
  OS_ITEM_STATUS_LABEL,
  OS_STAGES,
  OS_SUBTIPOS_MANUT,
  OS_SUBTIPOS_MONIT,
  OS_TIPOS,
  osKanbanColumnStyle,
  osStageMoverLabel,
  osStageName,
  osTipoBadgeLabel,
  osTipoLabel,
  type OsItemStatus,
} from "@/lib/assistencia-domain";
import {
  downloadAssistOsPdf,
  downloadAssistRelatorioPdf,
  type AssistRelatorioPdfRow,
} from "@/lib/assistencia-relatorio-pdf";
import { APP_NAME } from "@/lib/brand";
import {
  DATE_PRESET_OPTIONS,
  inDateRange,
  resolveDatePreset,
  type DatePreset,
} from "@/lib/date-filters";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

type TabId = "kanban" | "agenda" | "conf" | "rel";

function parseAssistView(raw: unknown): TabId {
  if (raw === "agenda" || raw === "conf" || raw === "rel" || raw === "kanban") {
    return raw;
  }
  return "kanban";
}

export const Route = createFileRoute("/assistencia")({
  beforeLoad: () => requireModule("assistencia"),
  validateSearch: (search: Record<string, unknown>) => ({
    view: parseAssistView(search.view),
  }),
  loader: async () => getAssistenciaBootstrapFn(),
  head: () => ({
    meta: [{ title: `Assistência — ${APP_NAME}` }],
  }),
  component: AssistenciaPage,
});

type OsRow = Awaited<ReturnType<typeof listOsFn>>[number];

type AgendaView = "lista" | "calendario";
type KanbanColFilter = { name: string; dateFrom: string; dateTo: string };

function emptyKanbanFilters(): Record<number, KanbanColFilter> {
  const map: Record<number, KanbanColFilter> = {};
  for (const s of OS_STAGES) map[s.idx] = { name: "", dateFrom: "", dateTo: "" };
  return map;
}

function osKanbanDate(os: OsRow): string {
  if (os.agDate) return os.agDate;
  return (os.createdAt || "").slice(0, 10);
}

function formatOsDateBr(iso: string | null | undefined) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function osMaterialHint(os: OsRow) {
  if (!os.items.length) {
    return os.tipo === "visita" ? "Sem material (orçamento)" : "Sem material";
  }
  return `${os.items.length} produto${os.items.length === 1 ? "" : "s"}`;
}

function osAgendaHint(os: OsRow) {
  if (os.agDate) {
    let base = formatOsDateBr(os.agDate);
    if (os.periodo) base += ` · ${os.periodo}`;
    if (os.hora) base += ` · ${os.hora}`;
    return base;
  }
  if (os.stage === 3 || os.stage === 4) return "A reagendar";
  return null;
}

/** Equipe primeiro; depois técnico. */
function osResponsavelLabel(os: OsRow) {
  const team = (os.teamName ?? "").trim();
  const tec = (os.tecnicoNome ?? "").trim();
  if (team && tec && team.toLowerCase() !== tec.toLowerCase()) {
    return `${team} · ${tec}`;
  }
  return team || tec || null;
}

/** Inicial da equipe responsável (fallback: técnico). */
function osResponsavelInitial(os: OsRow) {
  return activityInitial(os.teamName || os.tecnicoNome);
}

type OsCardCta = { label: string; kind: "schedule" | "advance" | "start" | "open" };

function osCardPrimaryCta(os: OsRow): OsCardCta {
  if (os.stage === 3) return { label: "Agendar", kind: "schedule" };
  if (os.stage === 4 && !os.agDate) return { label: "Agendar", kind: "schedule" };
  if (os.stage === 4) return { label: "Iniciar", kind: "start" };
  if (os.stage === 0 || os.stage === 1 || os.stage === 6) {
    return { label: "Avançar", kind: "advance" };
  }
  if (os.stage === 5 && !os.ciAt) return { label: "Check-in", kind: "open" };
  return { label: "Abrir", kind: "open" };
}

function osScheduleTitle(tipo: string) {
  if (tipo === "pedido") return "AGENDAR INSTALAÇÃO";
  if (tipo === "manut") return "AGENDAR MANUTENÇÃO";
  if (tipo === "monit") return "AGENDAR MONITORAMENTO";
  if (tipo === "visita") return "AGENDAR ORÇAMENTO";
  return "AGENDAR OS";
}

function osReportDate(os: OsRow) {
  if (os.finDate) return os.finDate;
  if (os.coAt) return os.coAt.slice(0, 10);
  if (os.agDate) return os.agDate;
  return (os.createdAt || "").slice(0, 10);
}

function toAssistRelatorioPdfRow(os: OsRow): AssistRelatorioPdfRow {
  return {
    num: os.num,
    clientName: os.clientName,
    clientCity: os.clientCity,
    tipo: os.tipo,
    subtipo: os.subtipo,
    stage: os.stage,
    servico: os.servico,
    quoteNumero: os.quoteNumero,
    agDate: os.agDate,
    periodo: os.periodo,
    hora: os.hora,
    teamName: os.teamName,
    tecnicoNome: os.tecnicoNome,
    reportDate: osReportDate(os),
    ciAt: os.ciAt,
    coAt: os.coAt,
    resolucao: os.resolucao || os.rel?.texto || null,
    items: os.items.map((it) => ({
      qtd: it.qtd,
      nome: it.nome,
      usado: it.usado,
      devolvido: it.devolvido,
    })),
    fotos: (os.rel?.fotos ?? []).filter((f) => typeof f === "string" && f.startsWith("data:image/")),
  };
}

function AssistenciaPage() {
  const boot = Route.useLoaderData();
  const { view: viewFromUrl } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { query } = useShellSearch();
  const [tab, setTab] = useState<TabId>(viewFromUrl);
  const [agendaView, setAgendaView] = useState<AgendaView>("lista");

  useEffect(() => {
    setTab(viewFromUrl);
  }, [viewFromUrl]);

  function goTab(next: TabId) {
    setTab(next);
    void navigate({
      to: "/assistencia",
      search: (prev) => ({ ...prev, view: next }),
      replace: true,
    });
  }
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [calSheetOpen, setCalSheetOpen] = useState(false);
  const [osList, setOsList] = useState<OsRow[]>(boot.osList);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [kanbanFilters, setKanbanFilters] = useState(emptyKanbanFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openColFilter, setOpenColFilter] = useState<number | null>(null);
  const [globalTipo, setGlobalTipo] = useState("");
  const [globalName, setGlobalName] = useState("");
  const [globalDatePreset, setGlobalDatePreset] = useState<DatePreset>("todos");
  const [globalDateFrom, setGlobalDateFrom] = useState("");
  const [globalDateTo, setGlobalDateTo] = useState("");
  const [relClient, setRelClient] = useState("");
  const [relDatePreset, setRelDatePreset] = useState<DatePreset>("mes");
  const [relDateFrom, setRelDateFrom] = useState("");
  const [relDateTo, setRelDateTo] = useState("");
  const [relPdfBusy, setRelPdfBusy] = useState(false);
  const [dragOsId, setDragOsId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);

  useEffect(() => {
    setOsList(boot.osList);
  }, [boot.osList]);

  useEffect(() => {
    void listOsFn({ data: {} }).then(setOsList).catch(() => undefined);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void listOsFn({ data: {} }).then(setOsList).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const [newOpen, setNewOpen] = useState(false);
  const [tipo, setTipo] = useState<"pedido" | "manut" | "monit" | "visita">("manut");
  const [subtipo, setSubtipo] = useState("");
  const [omieAppId, setOmieAppId] = useState(boot.omieAppId);
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<{
    codigo: number;
    nome: string;
    cnpjCpf: string | null;
  } | null>(null);
  const [clientResults, setClientResults] = useState<
    Array<{
      codigo: number;
      nome: string;
      cnpjCpf: string | null;
      endereco: string | null;
      contato: string | null;
    }>
  >([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [clientCity, setClientCity] = useState("");
  const [servico, setServico] = useState("");
  const [quoteNumero, setQuoteNumero] = useState("");
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [quoteHits, setQuoteHits] = useState<
    Array<{ id: number; numero: string; clientName: string | null }>
  >([]);
  const [itemDraft, setItemDraft] = useState("");
  const [items, setItems] = useState<Array<{ qtd: number; nome: string }>>([]);

  useEffect(() => {
    if (!newOpen || selectedClient || clientQuery.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const rows = await searchAssistClientsFn({
          data: { omieAppId: omieAppId || undefined, query: clientQuery.trim() },
        });
        setClientResults(rows);
      } catch {
        setClientResults([]);
      } finally {
        setSearchingClients(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [newOpen, clientQuery, selectedClient, omieAppId]);

  const [schedOpen, setSchedOpen] = useState(false);
  const [agDate, setAgDate] = useState("");
  const [periodo, setPeriodo] = useState("Manhã");
  const [horaEspecifica, setHoraEspecifica] = useState(false);
  const [hora, setHora] = useState("");
  const [teamId, setTeamId] = useState<number | "">("");
  const [tecnicoNome, setTecnicoNome] = useState("");

  const [checkoutText, setCheckoutText] = useState("");
  const [checkoutFotos, setCheckoutFotos] = useState<CapturedPhoto[]>([]);
  const [checkoutAnexos, setCheckoutAnexos] = useState<
    Array<{ name: string; mime: string; data: string }>
  >([]);
  const [returnTo, setReturnTo] = useState(0);
  const [returnMotivo, setReturnMotivo] = useState("");
  const [confQty, setConfQty] = useState<Record<number, string>>({});
  const [levNome, setLevNome] = useState("");
  const [levQtd, setLevQtd] = useState("1");
  const [levItens, setLevItens] = useState<Array<{ qtd: number; nome: string }>>([]);
  const [extraNome, setExtraNome] = useState("");
  const [matDisp, setMatDisp] = useState<
    Record<number, { usado: string; sobraDestino: "" | "devolver" | "equipe" }>
  >({});

  const selected = useMemo(
    () => osList.find((o) => o.id === selectedId) ?? null,
    [osList, selectedId],
  );

  const globalDateRange = useMemo(
    () => resolveDatePreset(globalDatePreset, globalDateFrom, globalDateTo),
    [globalDatePreset, globalDateFrom, globalDateTo],
  );

  const globalFiltersActive = Boolean(
    globalTipo ||
      globalName.trim() ||
      globalDatePreset !== "todos" ||
      globalDateFrom ||
      globalDateTo,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameQ = globalName.trim().toLowerCase();
    return osList.filter((o) => {
      if (q) {
        const hay = `${o.num} ${o.clientName} ${o.quoteNumero ?? ""} ${o.servico}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (globalTipo && o.tipo !== globalTipo) return false;
      if (nameQ) {
        const hay = `${o.clientName} ${o.num} ${o.servico} ${o.tecnicoNome ?? ""} ${o.teamName ?? ""}`.toLowerCase();
        if (!hay.includes(nameQ)) return false;
      }
      if (!inDateRange(osKanbanDate(o), globalDateRange.from, globalDateRange.to)) {
        return false;
      }
      return true;
    });
  }, [osList, query, globalTipo, globalName, globalDateRange]);

  const byStage = useMemo(() => {
    const map = new Map<number, OsRow[]>();
    for (const s of OS_STAGES) map.set(s.idx, []);
    for (const o of filtered) {
      const list = map.get(o.stage) ?? [];
      list.push(o);
      map.set(o.stage, list);
    }
    return map;
  }, [filtered]);

  /** Agenda: só OS já agendadas (etapa Agendado+ com data). */
  const agendaOs = useMemo(
    () =>
      filtered
        .filter((o) => Boolean(o.agDate) && o.stage >= 4)
        .sort((a, b) => (a.agDate ?? "").localeCompare(b.agDate ?? "")),
    [filtered],
  );

  const agendaCalendarItems = useMemo(
    () =>
      agendaOs.map((os) => {
        const st = osActivityStatus(os.stage, Boolean(os.agDate));
        const resp = osResponsavelLabel(os);
        return {
          id: os.id,
          date: os.agDate!,
          title: os.clientName,
          subtitle: [os.num, resp].filter(Boolean).join(" · "),
          statusKey: st.key,
          statusLabel: st.label,
          barClass: st.barClass,
          meta: os.periodo || os.hora || null,
          initial: osResponsavelInitial(os),
        };
      }),
    [agendaOs],
  );

  /** Sem pendentes na agenda — só entram OS agendadas. */
  const agendaPendingItems = useMemo(() => [], []);

  function isMySectorStage(stageIdx: number) {
    if (boot.user.isAdmin) return true;
    const mover = OS_STAGES.find((s) => s.idx === stageIdx)?.mover;
    if (!mover) return false;
    if (mover === "estoque") return boot.user.canEstoque;
    if (mover === "compras") return boot.user.canCompras;
    if (mover === "assistencia") return boot.user.canAssistencia;
    return false;
  }

  const myPendingOs = useMemo(() => {
    return filtered.filter((o) => {
      if (o.stage >= 7) return false;
      return isMySectorStage(o.stage);
    });
  }, [filtered, boot.user]);

  async function onKanbanDrop(toStage: number) {
    const osId = dragOsId;
    setDragOverStage(null);
    setDragOsId(null);
    if (osId == null) return;
    const os = osList.find((o) => o.id === osId);
    if (!os || os.stage === toStage) return;
    await run(() => moveOsKanbanFn({ data: { osId, toStage } }));
  }

  function osNeedsDisposition(os: OsRow) {
    if (os.stage !== 5 || !os.coAt) return false;
    const items = os.items.filter((i) =>
      ["campo", "extra", "aplicado", "separado", "recebido"].includes(i.status),
    );
    if (!items.length) return false;
    return items.some(
      (i) => i.usado == null || (i.qtd - (i.usado ?? 0) > 0 && !i.sobraDestino),
    );
  }

  function osPendingBaixaItems(os: OsRow) {
    return os.items.filter(
      (i) => i.productId != null && (i.usado ?? 0) > 0 && i.baixaStatus === "pendente",
    );
  }

  const dispositionPendingOs = useMemo(
    () => filtered.filter((o) => osNeedsDisposition(o)),
    [filtered],
  );

  const baixaPendingOs = useMemo(
    () =>
      filtered.filter(
        (o) =>
          osPendingBaixaItems(o).length > 0 &&
          (boot.user.isAdmin || boot.user.canEstoque),
      ),
    [filtered, boot.user],
  );

  useEffect(() => {
    if (!selected) {
      setMatDisp({});
      return;
    }
    const next: Record<number, { usado: string; sobraDestino: "" | "devolver" | "equipe" }> =
      {};
    for (const it of selected.items) {
      if (!["campo", "extra", "aplicado", "separado", "recebido"].includes(it.status)) {
        continue;
      }
      next[it.id] = {
        usado: it.usado != null ? String(it.usado) : String(it.qtd),
        sobraDestino: it.sobraDestino ?? "",
      };
    }
    setMatDisp(next);
  }, [selected?.id, selected?.items]);

  function openNewOs() {
    setTipo("manut");
    setSubtipo("");
    setOmieAppId(boot.omieAppId);
    setClientQuery("");
    setSelectedClient(null);
    setClientResults([]);
    setClientCity("");
    setServico("");
    setQuoteNumero("");
    setQuoteId(null);
    setItems([]);
    setItemDraft("");
    setNewOpen(true);
  }

  const confOs = useMemo(
    () =>
      filtered.filter(
        (o) =>
          o.stage === 5 &&
          o.coAt &&
          o.items.some((i) => i.status === "campo" || i.status === "extra" || i.status === "aplicado"),
      ),
    [filtered],
  );

  const relBase = useMemo(() => osList.filter((o) => o.stage >= 6), [osList]);

  const relClientOptions = useMemo(() => {
    const names = new Set<string>();
    for (const o of relBase) {
      const n = o.clientName.trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [relBase]);

  const relDateRange = useMemo(
    () => resolveDatePreset(relDatePreset, relDateFrom, relDateTo),
    [relDatePreset, relDateFrom, relDateTo],
  );

  const relOs = useMemo(() => {
    return relBase
      .filter((o) => {
        if (relClient.trim()) {
          const q = relClient.trim().toLowerCase();
          if (!o.clientName.toLowerCase().includes(q)) return false;
        }
        if (!inDateRange(osReportDate(o), relDateRange.from, relDateRange.to)) return false;
        return true;
      })
      .sort((a, b) => osReportDate(b).localeCompare(osReportDate(a)));
  }, [relBase, relClient, relDateRange.from, relDateRange.to]);

  const relStats = useMemo(() => {
    const clients = new Set(relOs.map((o) => o.clientName));
    const withMaterial = relOs.filter((o) => o.items.length > 0).length;
    return {
      total: relOs.length,
      clients: clients.size,
      withMaterial,
    };
  }, [relOs]);

  function relFiltersLabel() {
    const parts: string[] = [];
    if (relClient) parts.push(`Cliente: ${relClient}`);
    else parts.push("Cliente: todos");
    if (relDateRange.from || relDateRange.to) {
      parts.push(
        `Período: ${formatOsDateBr(relDateRange.from) || "…"} a ${formatOsDateBr(relDateRange.to) || "…"}`,
      );
    } else {
      parts.push("Período: todas as datas");
    }
    return parts.join(" · ");
  }

  async function exportRelatorioPdf() {
    setRelPdfBusy(true);
    setFeedback(null);
    try {
      await downloadAssistRelatorioPdf({
        generatedAt: new Date().toLocaleString("pt-BR"),
        filtersLabel: relFiltersLabel(),
        rows: relOs.map(toAssistRelatorioPdfRow),
      });
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Falha ao exportar PDF.");
    } finally {
      setRelPdfBusy(false);
    }
  }

  async function exportOsPdf(os: OsRow) {
    setRelPdfBusy(true);
    setFeedback(null);
    try {
      await downloadAssistOsPdf(toAssistRelatorioPdfRow(os));
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Falha ao exportar PDF.");
    } finally {
      setRelPdfBusy(false);
    }
  }

  async function reload() {
    const list = await listOsFn({ data: {} });
    setOsList(list);
  }

  async function run(action: () => Promise<OsRow | null | undefined>) {
    setBusy(true);
    setFeedback(null);
    try {
      const updated = await action();
      if (updated) {
        setOsList((prev) => {
          const idx = prev.findIndex((o) => o.id === updated.id);
          if (idx < 0) return [updated, ...prev];
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        });
        setSelectedId(updated.id);
        if (updated.stage === 5) {
          setCheckoutText(updated.resolucao ?? updated.rel?.texto ?? "");
          setCheckoutFotos(
            (updated.rel?.fotos ?? []).map((foto) => ({ foto, thumb: foto })),
          );
          setCheckoutAnexos(updated.rel?.anexos ?? []);
        }
      } else {
        await reload();
      }
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Falha na ação");
    } finally {
      setBusy(false);
    }
  }

  function applyOsDetailState(os: OsRow) {
    setSelectedId(os.id);
    setCheckoutText(os.resolucao ?? os.rel?.texto ?? "");
    setCheckoutFotos((os.rel?.fotos ?? []).map((foto) => ({ foto, thumb: foto })));
    setCheckoutAnexos(os.rel?.anexos ?? []);
    setConfQty(Object.fromEntries(os.items.map((i) => [i.id, String(i.usado ?? i.qtd)])));
    setLevItens(os.lev?.itens ?? []);
  }

  async function openDetail(os: OsRow, opts?: { fromCalendar?: boolean }) {
    if (!opts?.fromCalendar) setCalSheetOpen(false);
    applyOsDetailState(os);
    try {
      const full = await getOsFn({ data: { id: os.id } });
      if (full) {
        setOsList((prev) => {
          const idx = prev.findIndex((o) => o.id === full.id);
          if (idx < 0) return [full, ...prev];
          const copy = [...prev];
          copy[idx] = full;
          return copy;
        });
        applyOsDetailState(full);
      }
    } catch {
      // lista parcial já cobre
    }
  }

  async function openHistory(os: OsRow) {
    await openDetail(os, { fromCalendar: calSheetOpen });
    setHistOpen(true);
  }

  function openSchedule(os: OsRow) {
    applyOsDetailState(os);
    setAgDate(os.agDate ?? "");
    setPeriodo(os.periodo ?? "Manhã");
    setHora(os.hora ?? "");
    setHoraEspecifica(Boolean(os.hora));
    setTeamId(os.teamId ?? "");
    setTecnicoNome(os.tecnicoNome ?? "");
    setSchedOpen(true);
  }

  async function onOsCardCta(os: OsRow, cta: OsCardCta) {
    if (cta.kind === "schedule") {
      openSchedule(os);
      return;
    }
    if (cta.kind === "advance") {
      await run(() => advanceOsFn({ data: { osId: os.id } }));
      return;
    }
    if (cta.kind === "start") {
      await run(() => startExecOsFn({ data: { osId: os.id, materialOk: true } }));
      return;
    }
    await openDetail(os);
  }

  async function onCheckoutFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    const next: Array<{ name: string; mime: string; data: string }> = [];
    for (const file of Array.from(files)) {
      if (file.size > 4_000_000) {
        setFeedback(`Arquivo muito grande: ${file.name} (máx. 4 MB).`);
        continue;
      }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      if (data) next.push({ name: file.name, mime: file.type || "application/octet-stream", data });
    }
    if (next.length) setCheckoutAnexos((prev) => [...prev, ...next].slice(0, 10));
  }


  // Função de render (não componente): evita remount a cada tecla no textarea.
  function renderOsDetail(variant: "dialog" | "panel" = "dialog") {
    if (!selected) return null;
    return (
      <>
        {variant === "dialog" ? (
          <DialogHeader>
            <DialogTitle>
              OS {selected.num} · {osStageName(selected.stage)}
            </DialogTitle>
          </DialogHeader>
        ) : null}
        <div className="flex flex-col gap-md">

                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <div className="text-body-md font-medium">{selected.clientName}</div>
                    <div className="text-label-md text-on-surface-variant">
                      {osTipoLabel(selected.tipo)}
                      {selected.subtipo ? ` · ${selected.subtipo}` : ""}
                      {selected.quoteNumero ? ` · ${selected.quoteNumero}` : ""}
                    </div>
                    <p className="mt-xs whitespace-pre-wrap text-body-md">{selected.servico}</p>
                    <div className="mt-sm flex items-center gap-xs text-label-md text-on-surface">
                      {osResponsavelInitial(selected) ? (
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white">
                          {osResponsavelInitial(selected)}
                        </span>
                      ) : (
                        <Icon name="group" className="text-[16px] text-on-surface-variant" />
                      )}
                      <span>
                        <span className="text-on-surface-variant">Responsável: </span>
                        {osResponsavelLabel(selected) ?? "Sem responsável"}
                      </span>
                    </div>
                    {selected.agDate ? (
                      <div className="mt-2xs flex items-center gap-xs text-label-sm text-on-surface-variant">
                        <Icon name="calendar_month" className="text-[15px]" />
                        <span>{osAgendaHint(selected)}</span>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => setHistOpen(true)}
                  >
                    <Icon name="history" className="text-[16px]" />
                    Histórico
                  </button>
                </div>

                {selected.pending ? (
                  <div className="rounded-lg border border-error/40 bg-error-container/20 p-sm">
                    <div className="text-label-md font-semibold">
                      Retorno pendente → etapa {selected.pending.to}
                    </div>
                    <div className="text-body-md">
                      {selected.pending.motivo} · {selected.pending.by}
                    </div>
                    {boot.user.isAdmin ? (
                      <div className="mt-sm flex gap-sm">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              resolveReturnFn({ data: { osId: selected.id, approve: true } }),
                            )
                          }
                          className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              resolveReturnFn({ data: { osId: selected.id, approve: false } }),
                            )
                          }
                          className="rounded-lg border border-outline-variant px-md py-sm text-label-md"
                        >
                          Rejeitar
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selected.items.length ? (
                  <div>
                    <h3 className="mb-xs text-label-md font-semibold text-on-surface-variant">
                      Material
                    </h3>
                    <ul className="space-y-xs">
                      {selected.items.map((it) => {
                        const status = it.status as OsItemStatus;
                        const statusClass =
                          OS_ITEM_STATUS_CLASS[status] ??
                          "bg-surface-container text-on-surface-variant";
                        return (
                        <li
                          key={it.id}
                          className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-outline-variant/50 px-md py-sm"
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-sm">
                            <span className="text-body-md text-on-surface">
                              {it.qtd}× {it.nome}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-sm py-2xs text-label-sm font-semibold",
                                statusClass,
                              )}
                            >
                              {OS_ITEM_STATUS_LABEL[status] ?? it.status}
                            </span>
                          </span>
                          <div className="flex flex-wrap gap-xs">
                            {selected.stage === 1 && (boot.user.canEstoque || boot.user.isAdmin) ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy || it.status === "separado"}
                                  onClick={() =>
                                    run(() =>
                                      updateOsItemFn({
                                        data: { itemId: it.id, status: "separado" },
                                      }),
                                    )
                                  }
                                  className={cn(
                                    "rounded-full px-sm py-2xs text-label-sm font-semibold disabled:opacity-60",
                                    it.status === "separado"
                                      ? "bg-emerald-600 text-white"
                                      : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
                                  )}
                                >
                                  Separado
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || it.status === "comprar"}
                                  onClick={() =>
                                    run(() =>
                                      updateOsItemFn({
                                        data: { itemId: it.id, status: "comprar" },
                                      }),
                                    )
                                  }
                                  className={cn(
                                    "rounded-full px-sm py-2xs text-label-sm font-semibold disabled:opacity-60",
                                    it.status === "comprar"
                                      ? "bg-amber-600 text-white"
                                      : "bg-amber-100 text-amber-900 hover:bg-amber-200",
                                  )}
                                >
                                  Comprar
                                </button>
                              </>
                            ) : null}
                            {selected.stage === 2 &&
                            it.status === "comprar" &&
                            (boot.user.canCompras || boot.user.isAdmin) ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  run(() =>
                                    updateOsItemFn({
                                      data: {
                                        itemId: it.id,
                                        status: "comprado",
                                        previsao: new Date().toISOString().slice(0, 10),
                                      },
                                    }),
                                  )
                                }
                                className="rounded border border-outline-variant px-sm py-2xs text-label-sm"
                              >
                                Comprado
                              </button>
                            ) : null}
                            {it.status === "comprado" &&
                            (boot.user.canEstoque || boot.user.isAdmin) ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  run(() => receivePurchaseFn({ data: { itemId: it.id } }))
                                }
                                className="rounded-full bg-teal-100 px-sm py-2xs text-label-sm font-semibold text-teal-900"
                              >
                                Recebido
                              </button>
                            ) : null}
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                    {(selected.stage === 1 || selected.stage === 5) &&
                    (boot.user.canEstoque || boot.user.canAssistencia || boot.user.isAdmin) ? (
                      <div className="mt-sm flex gap-sm">
                        <input
                          value={extraNome}
                          onChange={(e) => setExtraNome(e.target.value)}
                          placeholder="Item extra"
                          className="min-w-0 flex-1 rounded-lg border border-outline-variant px-sm py-xs text-body-md"
                        />
                        <button
                          type="button"
                          disabled={busy || !extraNome.trim()}
                          onClick={() =>
                            run(() =>
                              addOsItemFn({
                                data: {
                                  osId: selected.id,
                                  qtd: 1,
                                  nome: extraNome,
                                  status: selected.stage === 5 ? "extra" : "pendente",
                                },
                              }),
                            ).then(() => setExtraNome(""))
                          }
                          className="rounded-lg bg-secondary-container px-md py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-sm">
                  {selected.stage === 0 || selected.stage === 1 || selected.stage === 6 ? (
                    <button
                      type="button"
                      disabled={busy || Boolean(selected.pending)}
                      onClick={() => run(() => advanceOsFn({ data: { osId: selected.id } }))}
                      className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
                    >
                      Avançar
                    </button>
                  ) : null}
                  {(selected.stage === 3 || selected.stage === 4) &&
                  (boot.user.canAssistencia || boot.user.isAdmin) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openSchedule(selected)}
                      className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                    >
                      Agendar
                    </button>
                  ) : null}
                  {selected.stage === 4 && (boot.user.canAssistencia || boot.user.isAdmin) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          startExecOsFn({ data: { osId: selected.id, materialOk: true } }),
                        )
                      }
                      className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                    >
                      Iniciar execução (OK material)
                    </button>
                  ) : null}
                  {selected.stage === 5 &&
                  !selected.ciAt &&
                  (boot.user.canAssistencia || boot.user.isAdmin) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => checkInOsFn({ data: { osId: selected.id } }))}
                      className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                    >
                      Check-in
                    </button>
                  ) : null}
                </div>

                {selected.stage === 5 ? (
                  <div
                    className="flex flex-col gap-sm rounded-lg border border-outline-variant bg-surface p-sm"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-label-md font-semibold text-on-surface">
                      Resolução / relatório
                    </h3>
                    {!selected.ciAt ? (
                      <p className="text-label-md text-on-surface-variant">
                        Você pode digitar a resolução agora. O check-out exige check-in antes.
                      </p>
                    ) : null}
                    <textarea
                      value={checkoutText}
                      onChange={(e) => setCheckoutText(e.target.value)}
                      rows={5}
                      readOnly={Boolean(selected.coAt)}
                      placeholder="Descreva o serviço realizado, peças trocadas, pendências..."
                      className={cn(
                        fieldClass,
                        "mt-0 min-h-[7rem]",
                        selected.coAt && "bg-surface-container opacity-90",
                      )}
                    />

                    {!selected.coAt ? (
                      <>
                        <PhotoCapture
                          photos={checkoutFotos}
                          onChange={setCheckoutFotos}
                          max={8}
                          label="Fotos do serviço"
                        />
                        <div>
                          <label className="block text-label-md text-on-surface-variant">
                            Anexos (PDF, imagens, etc. · máx. 4 MB cada)
                            <input
                              type="file"
                              multiple
                              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                              className={cn(fieldClass, "cursor-pointer")}
                              onChange={(e) => {
                                void onCheckoutFilesSelected(e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {checkoutAnexos.length ? (
                            <ul className="mt-xs space-y-xs">
                              {checkoutAnexos.map((a, idx) => (
                                <li
                                  key={`${a.name}-${idx}`}
                                  className="flex items-center justify-between gap-sm rounded border border-outline-variant px-sm py-xs text-label-md"
                                >
                                  <span className="min-w-0 truncate">{a.name}</span>
                                  <button
                                    type="button"
                                    className={btnMuted}
                                    onClick={() =>
                                      setCheckoutAnexos((prev) =>
                                        prev.filter((_, i) => i !== idx),
                                      )
                                    }
                                  >
                                    Remover
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-sm">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(() =>
                                saveOsResolucaoFn({
                                  data: {
                                    osId: selected.id,
                                    resolucao: checkoutText,
                                    fotos: checkoutFotos.map((f) => f.foto),
                                    anexos: checkoutAnexos,
                                  },
                                }),
                              )
                            }
                            className={btnOutline}
                          >
                            Salvar rascunho
                          </button>
                          {selected.ciAt ? (
                            <button
                              type="button"
                              disabled={busy || !checkoutText.trim()}
                              onClick={() =>
                                run(() =>
                                  checkOutOsFn({
                                    data: {
                                      osId: selected.id,
                                      resolucao: checkoutText,
                                      fotos: checkoutFotos.map((f) => f.foto),
                                      anexos: checkoutAnexos,
                                    },
                                  }),
                                )
                              }
                              className={btnPrimary}
                            >
                              Check-out
                            </button>
                          ) : (
                            <span className="self-center text-label-md text-on-surface-variant">
                              Faça check-in para liberar o check-out.
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-sm">
                        {checkoutFotos.length ? (
                          <div className="flex flex-wrap gap-xs">
                            {checkoutFotos.map((f, i) => (
                              <img
                                key={i}
                                src={f.thumb || f.foto}
                                alt={`Foto ${i + 1}`}
                                className="size-16 rounded object-cover"
                              />
                            ))}
                          </div>
                        ) : null}
                        {checkoutAnexos.length ? (
                          <ul className="space-y-2xs text-label-md text-on-surface-variant">
                            {checkoutAnexos.map((a, i) => (
                              <li key={`${a.name}-${i}`}>
                                <a
                                  href={a.data}
                                  download={a.name}
                                  className="text-primary underline"
                                >
                                  {a.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="text-label-md text-on-surface-variant">
                          Check-out registrado
                          {selected.coAt
                            ? ` · ${new Date(selected.coAt).toLocaleString("pt-BR")}`
                            : ""}
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                {selected.tipo === "visita" && selected.stage === 5 ? (
                  <div className="rounded-lg border border-outline-variant/60 p-sm">
                    <h3 className="text-label-md font-semibold">Levantamento (visita)</h3>
                    <ul className="mt-xs space-y-2xs text-body-md">
                      {levItens.map((it, idx) => (
                        <li key={`${it.nome}-${idx}`}>
                          {it.qtd}× {it.nome}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-sm flex gap-sm">
                      <input
                        value={levQtd}
                        onChange={(e) => setLevQtd(e.target.value)}
                        className="w-16 rounded border border-outline-variant px-sm py-xs"
                      />
                      <input
                        value={levNome}
                        onChange={(e) => setLevNome(e.target.value)}
                        placeholder="Item"
                        className="min-w-0 flex-1 rounded border border-outline-variant px-sm py-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!levNome.trim()) return;
                          setLevItens((prev) => [
                            ...prev,
                            { qtd: Number(levQtd) || 1, nome: levNome.trim() },
                          ]);
                          setLevNome("");
                        }}
                        className="rounded border border-outline-variant px-sm py-xs text-label-sm"
                      >
                        +
                      </button>
                    </div>
                    <div className="mt-sm flex flex-wrap gap-sm">
                      <button
                        type="button"
                        disabled={busy || !levItens.length}
                        onClick={() =>
                          run(() =>
                            saveOsLevFn({
                              data: { osId: selected.id, itens: levItens },
                            }),
                          )
                        }
                        className="rounded-lg border border-outline-variant px-md py-sm text-label-md"
                      >
                        Salvar levantamento
                      </button>
                      {selected.coAt && selected.lev ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(() => finishVisitaFn({ data: { osId: selected.id } }))
                          }
                          className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                        >
                          Concluir visita
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {selected.stage === 5 &&
                selected.coAt &&
                selected.items.some((i) =>
                  ["campo", "extra", "aplicado", "separado", "recebido"].includes(i.status),
                ) ? (
                  <div className="rounded-lg border border-violet-300 bg-violet-50 p-sm">
                    <h3 className="text-label-md font-semibold text-violet-950">
                      Materiais usados / sobra
                    </h3>
                    <p className="mt-2xs text-label-md text-violet-900/80">
                      Informe quanto foi usado. Se sobrar, diga se devolve ou fica no estoque da
                      equipe.
                    </p>
                    <div className="mt-sm space-y-sm">
                      {selected.items
                        .filter((i) =>
                          ["campo", "extra", "aplicado", "separado", "recebido"].includes(
                            i.status,
                          ),
                        )
                        .map((it) => {
                          const draft = matDisp[it.id] ?? {
                            usado: String(it.qtd),
                            sobraDestino: "" as const,
                          };
                          const usadoN = Number(String(draft.usado).replace(",", ".")) || 0;
                          const sobra = Math.max(0, it.qtd - usadoN);
                          return (
                            <div
                              key={it.id}
                              className="rounded-lg border border-violet-200 bg-white p-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-sm">
                                <span className="text-body-md font-medium">
                                  {it.qtd}× {it.nome}
                                  {it.productId ? (
                                    <span className="ml-xs text-label-sm text-on-surface-variant">
                                      · catálogo
                                    </span>
                                  ) : null}
                                </span>
                                <label className="flex items-center gap-xs text-label-md">
                                  Usou
                                  <input
                                    value={draft.usado}
                                    onChange={(e) =>
                                      setMatDisp((prev) => ({
                                        ...prev,
                                        [it.id]: {
                                          ...draft,
                                          usado: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-20 rounded border border-outline-variant px-sm py-xs"
                                  />
                                </label>
                              </div>
                              {sobra > 0 ? (
                                <div className="mt-xs flex flex-wrap gap-xs">
                                  <button
                                    type="button"
                                    className={cn(
                                      draft.sobraDestino === "devolver"
                                        ? btnPrimary
                                        : btnOutline,
                                    )}
                                    onClick={() =>
                                      setMatDisp((prev) => ({
                                        ...prev,
                                        [it.id]: { ...draft, sobraDestino: "devolver" },
                                      }))
                                    }
                                  >
                                    Devolver sobra ({sobra})
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      draft.sobraDestino === "equipe" ? btnPrimary : btnOutline,
                                    )}
                                    onClick={() =>
                                      setMatDisp((prev) => ({
                                        ...prev,
                                        [it.id]: { ...draft, sobraDestino: "equipe" },
                                      }))
                                    }
                                  >
                                    Ficar na equipe ({sobra})
                                  </button>
                                </div>
                              ) : (
                                <p className="mt-xs text-label-sm text-on-surface-variant">
                                  Usou tudo — sem sobra.
                                </p>
                              )}
                              {it.baixaStatus === "pendente" ? (
                                <p className="mt-xs text-label-sm font-medium text-amber-800">
                                  Baixa no estoque da empresa pendente
                                </p>
                              ) : null}
                              {it.baixaStatus === "feita" ? (
                                <p className="mt-xs text-label-sm text-emerald-700">
                                  Baixa confirmada
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      className={cn(btnPrimary, "mt-sm")}
                      onClick={() => {
                        const rows = selected.items
                          .filter((i) =>
                            ["campo", "extra", "aplicado", "separado", "recebido"].includes(
                              i.status,
                            ),
                          )
                          .map((i) => {
                            const draft = matDisp[i.id];
                            const usado =
                              Number(String(draft?.usado ?? i.qtd).replace(",", ".")) || 0;
                            const sobra = Math.max(0, i.qtd - usado);
                            return {
                              id: i.id,
                              usado,
                              sobraDestino:
                                sobra > 0
                                  ? draft?.sobraDestino === "devolver" ||
                                    draft?.sobraDestino === "equipe"
                                    ? draft.sobraDestino
                                    : null
                                  : null,
                            };
                          });
                        void run(() =>
                          saveOsMaterialDispositionFn({
                            data: { osId: selected.id, rows },
                          }),
                        );
                      }}
                    >
                      Salvar uso / sobra
                    </button>
                  </div>
                ) : null}

                {selected.stage === 5 &&
                selected.coAt &&
                !osNeedsDisposition(selected) &&
                selected.items.some((i) =>
                  ["campo", "extra", "aplicado"].includes(i.status),
                ) ? (
                  <div className="rounded-lg border border-outline-variant/60 p-sm">
                    <h3 className="text-label-md font-semibold">Conferência de estoque</h3>
                    {selected.conf ? (
                      <div className="mt-sm space-y-sm">
                        <p className="text-body-md">
                          Conferido por {selected.conf.estoque}. Aceitar ou contestar:
                        </p>
                        <div className="flex gap-sm">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(() => acceptConferenceFn({ data: { osId: selected.id } }))
                            }
                            className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                          >
                            Aceitar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const contest = window.prompt("Motivo da contestação");
                              if (!contest?.trim()) return;
                              void run(() =>
                                acceptConferenceFn({
                                  data: { osId: selected.id, contest },
                                }),
                              );
                            }}
                            className="rounded-lg border border-outline-variant px-md py-sm text-label-md"
                          >
                            Contestar
                          </button>
                        </div>
                      </div>
                    ) : boot.user.canEstoque || boot.user.isAdmin ? (
                      <div className="mt-sm space-y-sm">
                        {selected.items
                          .filter((i) => ["campo", "extra", "aplicado"].includes(i.status))
                          .map((it) => (
                            <label
                              key={it.id}
                              className="flex items-center justify-between gap-sm text-body-md"
                            >
                              <span>
                                {it.qtd}× {it.nome} (usou)
                              </span>
                              <input
                                value={confQty[it.id] ?? String(it.usado ?? it.qtd)}
                                onChange={(e) =>
                                  setConfQty((prev) => ({ ...prev, [it.id]: e.target.value }))
                                }
                                className="w-20 rounded border border-outline-variant px-sm py-xs"
                              />
                            </label>
                          ))}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              submitConferenceFn({
                                data: {
                                  osId: selected.id,
                                  rows: selected.items
                                    .filter((i) =>
                                      ["campo", "extra", "aplicado"].includes(i.status),
                                    )
                                    .map((i) => ({
                                      id: i.id,
                                      usou: Number(confQty[i.id] ?? i.usado ?? i.qtd) || 0,
                                    })),
                                },
                              }),
                            )
                          }
                          className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                        >
                          Enviar conferência
                        </button>
                      </div>
                    ) : (
                      <p className="mt-xs text-body-md text-on-surface-variant">
                        Aguardando Estoque conferir.
                      </p>
                    )}
                  </div>
                ) : null}

                {selected.stage === 5 &&
                selected.coAt &&
                osPendingBaixaItems(selected).length > 0 &&
                (boot.user.canEstoque || boot.user.isAdmin) ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-sm">
                    <h3 className="text-label-md font-semibold text-amber-950">
                      Baixa no estoque da empresa
                    </h3>
                    <p className="mt-2xs text-label-md text-amber-900/80">
                      Materiais usados com produto do catálogo. Deseja dar baixa no estoque físico?
                    </p>
                    <ul className="mt-sm space-y-2xs text-body-md">
                      {osPendingBaixaItems(selected).map((it) => (
                        <li key={it.id}>
                          {it.baixaQtd ?? it.usado}× {it.nome}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      <button
                        type="button"
                        disabled={busy}
                        className={btnPrimary}
                        onClick={() =>
                          run(() =>
                            resolveOsMaterialBaixaFn({
                              data: {
                                osId: selected.id,
                                itemIds: osPendingBaixaItems(selected).map((i) => i.id),
                                action: "baixar",
                              },
                            }),
                          )
                        }
                      >
                        Dar baixa
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={btnOutline}
                        onClick={() =>
                          run(() =>
                            resolveOsMaterialBaixaFn({
                              data: {
                                osId: selected.id,
                                itemIds: osPendingBaixaItems(selected).map((i) => i.id),
                                action: "ignorar",
                              },
                            }),
                          )
                        }
                      >
                        Não baixar
                      </button>
                    </div>
                  </div>
                ) : null}

                {selected.stage === 5 &&
                selected.coAt &&
                !osNeedsDisposition(selected) &&
                !selected.items.some((i) =>
                  ["campo", "extra", "aplicado"].includes(i.status),
                ) &&
                selected.tipo !== "visita" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => markExecutedFn({ data: { osId: selected.id } }))}
                    className="self-start rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                  >
                    Marcar executado
                  </button>
                ) : null}

                {selected.stage > 0 && selected.stage < 7 && !selected.pending ? (
                  <div className="rounded-lg border border-dashed border-outline-variant p-sm">
                    <h3 className="text-label-md font-semibold">Retornar etapa</h3>
                    <div className="mt-sm flex flex-wrap gap-sm">
                      <select
                        value={returnTo}
                        onChange={(e) => setReturnTo(Number(e.target.value))}
                        className="rounded-lg border border-outline-variant px-sm py-xs"
                      >
                        {OS_STAGES.filter((s) => s.idx < selected.stage).map((s) => (
                          <option key={s.idx} value={s.idx}>
                            {s.idx} · {s.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={returnMotivo}
                        onChange={(e) => setReturnMotivo(e.target.value)}
                        placeholder="Motivo"
                        className="min-w-0 flex-1 rounded-lg border border-outline-variant px-sm py-xs"
                      />
                      <button
                        type="button"
                        disabled={busy || !returnMotivo.trim()}
                        onClick={() =>
                          run(() =>
                            requestReturnFn({
                              data: {
                                osId: selected.id,
                                toStage: returnTo,
                                motivo: returnMotivo,
                              },
                            }),
                          ).then(() => setReturnMotivo(""))
                        }
                        className="rounded-lg border border-outline-variant px-md py-xs text-label-md"
                      >
                        Solicitar
                      </button>
                    </div>
                  </div>
                ) : null}

        </div>
      </>
    );
  }

  return (
    <AppShell mobileTitle="Assistência" searchPlaceholder="Buscar OS, cliente, orçamento...">
      <div className="flex flex-col gap-md px-margin-mobile py-md md:px-margin-desktop md:py-lg">
        <PageTitle
          title="Assistência"
          subtitle="Kanban de OS, agenda, conferência e relatório."
        >
          {boot.user.canAssistencia || boot.user.isAdmin ? (
            <button type="button" onClick={openNewOs} className={btnPrimary}>
              <Icon name="add" className="text-[16px]" />
              Nova OS
            </button>
          ) : null}
        </PageTitle>

        <div className="flex flex-wrap items-center gap-xs">
          {(
            [
              ["kanban", "Kanban"],
              ["agenda", "Agenda"],
              ["conf", "Conferência"],
              ["rel", "Relatório"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => goTab(id)}
              className={cn(
                tab === id ? btnPrimary : btnOutline,
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(filtersOpen || globalFiltersActive ? btnPrimary : btnOutline)}
          >
            <Icon name="filter_list" className="text-[16px]" />
            Filtros
            {globalFiltersActive ? (
              <span className="rounded-full bg-white/25 px-xs text-label-sm">ativos</span>
            ) : null}
          </button>
        </div>

        {filtersOpen ? (
          <PageSection className="border-outline-variant/80 bg-surface-container-low">
            <div className="flex flex-wrap items-end gap-md">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-2xs text-label-md text-on-surface-variant">
                Nome / OS
                <input
                  type="search"
                  value={globalName}
                  onChange={(e) => setGlobalName(e.target.value)}
                  placeholder="Cliente, OS, técnico…"
                  className={fieldClass}
                />
              </label>
              <label className="flex min-w-[10rem] flex-col gap-2xs text-label-md text-on-surface-variant">
                Tipo
                <select
                  value={globalTipo}
                  onChange={(e) => setGlobalTipo(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Todos</option>
                  {OS_TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[10rem] flex-col gap-2xs text-label-md text-on-surface-variant">
                Data
                <select
                  value={globalDatePreset}
                  onChange={(e) => setGlobalDatePreset(e.target.value as DatePreset)}
                  className={fieldClass}
                >
                  {DATE_PRESET_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {globalDatePreset === "personalizado" ? (
                <>
                  <label className="flex flex-col gap-2xs text-label-md text-on-surface-variant">
                    De
                    <input
                      type="date"
                      value={globalDateFrom}
                      onChange={(e) => setGlobalDateFrom(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="flex flex-col gap-2xs text-label-md text-on-surface-variant">
                    Até
                    <input
                      type="date"
                      value={globalDateTo}
                      onChange={(e) => setGlobalDateTo(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                </>
              ) : null}
              {globalFiltersActive ? (
                <button
                  type="button"
                  className={btnMuted}
                  onClick={() => {
                    setGlobalTipo("");
                    setGlobalName("");
                    setGlobalDatePreset("todos");
                    setGlobalDateFrom("");
                    setGlobalDateTo("");
                  }}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </PageSection>
        ) : null}

        {feedback ? <div className={feedbackErrClass}>{feedback}</div> : null}

        {dispositionPendingOs.length > 0 ? (
          <PageSection className="border-violet-300 bg-violet-50">
            <p className="text-title-md font-semibold text-violet-950">
              Pendente: uso / sobra de materiais ({dispositionPendingOs.length})
            </p>
            <p className="text-label-md text-violet-900/80">
              Após o check-out, informe o que foi usado e o destino da sobra.
            </p>
            <div className="mt-sm flex flex-wrap gap-xs">
              {dispositionPendingOs.slice(0, 12).map((os) => (
                <button
                  key={os.id}
                  type="button"
                  onClick={() => void openDetail(os)}
                  className="rounded-lg border border-violet-200 bg-white px-sm py-xs text-left text-label-md shadow-sm"
                >
                  <span className="font-semibold">{os.num}</span>
                  <span className="mx-xs text-on-surface-variant">·</span>
                  <span className="truncate">{os.clientName}</span>
                </button>
              ))}
            </div>
          </PageSection>
        ) : null}

        {baixaPendingOs.length > 0 ? (
          <PageSection className="border-amber-400 bg-amber-50">
            <p className="text-title-md font-semibold text-amber-950">
              Pendente: baixa no estoque da empresa ({baixaPendingOs.length})
            </p>
            <p className="text-label-md text-amber-900/80">
              Materiais usados — confirmar se dá baixa no estoque físico ou não.
            </p>
            <div className="mt-sm space-y-sm">
              {baixaPendingOs.slice(0, 8).map((os) => {
                const itens = osPendingBaixaItems(os);
                return (
                  <div
                    key={os.id}
                    className="rounded-lg border border-amber-200 bg-white p-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-sm">
                      <button
                        type="button"
                        className="text-left text-label-md font-semibold"
                        onClick={() => void openDetail(os)}
                      >
                        {os.num} · {os.clientName}
                      </button>
                      <div className="flex flex-wrap gap-xs">
                        <button
                          type="button"
                          disabled={busy}
                          className={btnPrimary}
                          onClick={() =>
                            run(() =>
                              resolveOsMaterialBaixaFn({
                                data: {
                                  osId: os.id,
                                  itemIds: itens.map((i) => i.id),
                                  action: "baixar",
                                },
                              }),
                            )
                          }
                        >
                          Dar baixa
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={btnOutline}
                          onClick={() =>
                            run(() =>
                              resolveOsMaterialBaixaFn({
                                data: {
                                  osId: os.id,
                                  itemIds: itens.map((i) => i.id),
                                  action: "ignorar",
                                },
                              }),
                            )
                          }
                        >
                          Não baixar
                        </button>
                      </div>
                    </div>
                    <p className="mt-2xs text-label-sm text-on-surface-variant">
                      {itens.map((i) => `${i.baixaQtd ?? i.usado}× ${i.nome}`).join(" · ")}
                    </p>
                  </div>
                );
              })}
            </div>
          </PageSection>
        ) : null}

        {myPendingOs.length > 0 ? (
          <PageSection className="border-amber-300 bg-amber-50">
            <div className="flex flex-wrap items-start justify-between gap-md">
              <div>
                <p className="text-title-md font-semibold text-amber-950">
                  Suas pendências ({myPendingOs.length})
                </p>
                <p className="text-label-md text-amber-900/80">
                  OS na etapa sob sua responsabilidade — clique para abrir.
                </p>
              </div>
              <button
                type="button"
                className={btnOutline}
                onClick={() => goTab("kanban")}
              >
                Ver no Kanban
              </button>
            </div>
            <div className="mt-sm flex flex-wrap gap-xs">
              {myPendingOs.slice(0, 12).map((os) => {
                const style = osKanbanColumnStyle(true);
                return (
                  <button
                    key={os.id}
                    type="button"
                    onClick={() => void openDetail(os)}
                    className={cn(
                      "rounded-lg border px-sm py-xs text-left text-label-md shadow-sm",
                      style.card,
                    )}
                  >
                    <span className="font-semibold">{os.num}</span>
                    <span className="mx-xs text-on-surface-variant">·</span>
                    <span className="truncate">{os.clientName}</span>
                    <span className={cn("ml-xs rounded px-xs py-2xs text-[10px] font-bold", style.pill)}>
                      {osStageName(os.stage)}
                    </span>
                  </button>
                );
              })}
            </div>
          </PageSection>
        ) : null}

        {tab === "kanban" ? (
          <div className="flex gap-md overflow-x-auto pb-md">
            {OS_STAGES.map((stage) => {
              const mine = isMySectorStage(stage.idx);
              const style = osKanbanColumnStyle(mine);
              const colFilter = kanbanFilters[stage.idx] ?? {
                name: "",
                dateFrom: "",
                dateTo: "",
              };
              const nameQ = colFilter.name.trim().toLowerCase();
              const dateFrom = colFilter.dateFrom.trim();
              const dateTo = colFilter.dateTo.trim();
              const stageRows = byStage.get(stage.idx) ?? [];
              const visibleRows = stageRows.filter((os) => {
                if (nameQ) {
                  const hay = `${os.clientName} ${os.num} ${os.servico} ${os.tecnicoNome ?? ""} ${os.teamName ?? ""}`.toLowerCase();
                  if (!hay.includes(nameQ)) return false;
                }
                if (!inDateRange(osKanbanDate(os), dateFrom, dateTo)) return false;
                return true;
              });
              const totalCount = stageRows.length;
              const count = visibleRows.length;
              const filteredCol = Boolean(nameQ || dateFrom || dateTo);
              const dropActive = dragOverStage === stage.idx && dragOsId != null;
              return (
                <div
                  key={stage.idx}
                  className={cn(
                    "flex w-[17.5rem] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm transition",
                    style.column,
                    dropActive && "ring-2 ring-amber-500 ring-offset-2",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStage(stage.idx);
                  }}
                  onDragLeave={() => {
                    setDragOverStage((cur) => (cur === stage.idx ? null : cur));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void onKanbanDrop(stage.idx);
                  }}
                >
                  <div className={cn("px-md py-sm", style.header)}>
                    <div className="flex items-start justify-between gap-xs">
                      <div className="min-w-0">
                        <div className="text-label-md font-bold uppercase leading-snug tracking-wide">
                          {stage.idx + 1}. {stage.name}
                        </div>
                        <div className="mt-2xs text-label-sm opacity-80">
                          {osStageMoverLabel(stage.mover)}
                          {mine ? " · seu setor" : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2xs">
                        <button
                          type="button"
                          className={cn(
                            "rounded-lg p-2xs hover:bg-black/5",
                            (openColFilter === stage.idx || filteredCol) && "bg-black/10",
                          )}
                          title="Filtros da coluna"
                          onClick={() =>
                            setOpenColFilter((cur) => (cur === stage.idx ? null : stage.idx))
                          }
                        >
                          <Icon name="filter_list" className="text-[16px]" />
                        </button>
                        <span
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-full text-label-sm font-bold",
                            style.count,
                          )}
                        >
                          {filteredCol ? count : totalCount}
                        </span>
                      </div>
                    </div>
                    {openColFilter === stage.idx ? (
                      <div className="mt-sm flex flex-col gap-xs">
                        <input
                          type="search"
                          value={colFilter.name}
                          onChange={(e) =>
                            setKanbanFilters((prev) => ({
                              ...prev,
                              [stage.idx]: { ...prev[stage.idx], name: e.target.value },
                            }))
                          }
                          placeholder="Filtrar nome / OS"
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
                                setKanbanFilters((prev) => ({
                                  ...prev,
                                  [stage.idx]: {
                                    ...prev[stage.idx],
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
                                setKanbanFilters((prev) => ({
                                  ...prev,
                                  [stage.idx]: {
                                    ...prev[stage.idx],
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
                              setKanbanFilters((prev) => ({
                                ...prev,
                                [stage.idx]: { name: "", dateFrom: "", dateTo: "" },
                              }))
                            }
                            title="Limpar filtros"
                          >
                            Limpar
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex max-h-[65vh] flex-col gap-sm overflow-auto p-sm">
                    {visibleRows.map((os) => {
                      const mineCard = isMySectorStage(os.stage);
                      const cta = osCardPrimaryCta(os);
                      const agendaHint = osAgendaHint(os);
                      return (
                        <div
                          key={os.id}
                          draggable={!busy}
                          onDragStart={(e) => {
                            setDragOsId(os.id);
                            e.dataTransfer.setData("text/plain", String(os.id));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragOsId(null);
                            setDragOverStage(null);
                          }}
                          className={cn(
                            "cursor-grab rounded-xl border p-sm transition active:cursor-grabbing",
                            style.card,
                            selectedId === os.id && "ring-2 ring-amber-600",
                            dragOsId === os.id && "opacity-60",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => void openDetail(os)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-xs">
                              <span className="text-label-md font-bold tracking-wide text-on-surface">
                                {os.num}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-xs py-2xs text-[10px] font-bold uppercase tracking-wide",
                                  style.pill,
                                )}
                              >
                                {osTipoBadgeLabel(os.tipo)}
                              </span>
                            </div>
                            <div className="mt-xs text-body-md font-bold text-on-surface">
                              {os.clientName}
                            </div>
                            {os.servico ? (
                              <div className="mt-2xs line-clamp-2 text-label-sm text-on-surface-variant">
                                — {os.servico}
                              </div>
                            ) : null}
                            <div className="mt-sm flex flex-col gap-2xs text-label-sm text-on-surface-variant">
                              <div className="flex items-center gap-xs">
                                <Icon
                                  name={os.items.length ? "inventory_2" : "public"}
                                  className="text-[15px]"
                                />
                                <span>{osMaterialHint(os)}</span>
                              </div>
                              {agendaHint ? (
                                <div className="flex items-center gap-xs">
                                  <Icon name="calendar_month" className="text-[15px]" />
                                  <span>{agendaHint}</span>
                                </div>
                              ) : null}
                              <div className="flex items-center gap-xs">
                                {osResponsavelInitial(os) ? (
                                  <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-bold text-white">
                                    {osResponsavelInitial(os)}
                                  </span>
                                ) : (
                                  <Icon name="group" className="text-[15px]" />
                                )}
                                <span className="truncate">
                                  {osResponsavelLabel(os) ?? "Sem responsável"}
                                </span>
                              </div>
                            </div>
                            {os.items.length ? (
                              <ul className="mt-sm space-y-2xs border-t border-black/5 pt-sm text-label-sm text-on-surface">
                                {os.items.slice(0, 3).map((it) => (
                                  <li key={it.id} className="truncate">
                                    {it.qtd}× {it.nome}
                                  </li>
                                ))}
                                {os.items.length > 3 ? (
                                  <li className="text-on-surface-variant">
                                    +{os.items.length - 3} produto
                                    {os.items.length - 3 === 1 ? "" : "s"}
                                  </li>
                                ) : null}
                              </ul>
                            ) : null}
                            {os.pending ? (
                              <div className="mt-xs rounded bg-error-container/40 px-xs py-2xs text-label-sm text-on-error-container">
                                Retorno pendente
                              </div>
                            ) : null}
                            {osNeedsDisposition(os) ? (
                              <div className="mt-xs rounded bg-violet-100 px-xs py-2xs text-label-sm font-medium text-violet-900">
                                Uso/sobra pendente
                              </div>
                            ) : null}
                            {osPendingBaixaItems(os).length ? (
                              <div className="mt-xs rounded bg-amber-100 px-xs py-2xs text-label-sm font-medium text-amber-950">
                                Baixa pendente
                              </div>
                            ) : null}
                            {os.envio?.div ? (
                              <div className="mt-xs text-label-sm text-error">
                                Divergência material
                              </div>
                            ) : null}
                          </button>
                          <div className="mt-sm flex items-center justify-between gap-xs">
                            <span className="text-label-sm text-on-surface-variant">
                              {mineCard ? "Com você" : "Outro setor"}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              className={cn(
                                btnPrimary,
                                "justify-center rounded-full px-md shadow-sm",
                              )}
                              onClick={() => void onOsCardCta(os, cta)}
                            >
                              {cta.label}
                              <Icon name="arrow_forward" className="text-[14px]" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {!count ? (
                      <div
                        className={cn(
                          "rounded-xl border border-dashed px-sm py-lg text-center text-label-md",
                          style.empty,
                        )}
                      >
                        {filteredCol
                          ? "Nenhuma OS com esse filtro"
                          : "Nenhuma OS nesta etapa"}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "agenda" ? (
          <div className="flex flex-col gap-md">
            <div className="flex flex-wrap gap-xs">
              {(
                [
                  ["lista", "Lista"],
                  ["calendario", "Calendário"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAgendaView(id)}
                  className={cn(agendaView === id ? btnPrimary : btnOutline)}
                >
                  {label}
                </button>
              ))}
            </div>

            {agendaView === "lista" ? (
              <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
                {agendaOs.map((os) => {
                  const mineCard = isMySectorStage(os.stage);
                  const finished = os.stage >= 6;
                  return (
                    <article
                      key={os.id}
                      className={cn(
                        "rounded-xl border border-black/5 bg-white p-md shadow-sm",
                        finished && "opacity-45",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void openDetail(os)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-xs">
                          <span className="text-label-md font-bold tracking-wide text-on-surface">
                            {os.num}
                          </span>
                          <span className="rounded-full bg-neutral-900 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-white">
                            {osTipoBadgeLabel(os.tipo)}
                          </span>
                        </div>
                        <div className="mt-xs text-body-md font-bold text-on-surface">
                          {os.clientName}
                        </div>
                        {os.servico ? (
                          <div className="mt-2xs line-clamp-2 text-label-sm text-on-surface-variant">
                            — {os.servico}
                          </div>
                        ) : null}
                        <div className="mt-sm flex flex-col gap-2xs text-label-sm text-on-surface-variant">
                          <div className="flex items-center gap-xs">
                            <Icon name="calendar_month" className="text-[15px]" />
                            <span>
                              {formatOsDateBr(os.agDate)}
                              {os.periodo ? ` · ${os.periodo}` : ""}
                              {os.hora ? ` · ${os.hora}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-xs">
                            <Icon
                              name={os.items.length ? "inventory_2" : "public"}
                              className="text-[15px]"
                            />
                            <span>{osMaterialHint(os)}</span>
                          </div>
                          <div className="flex items-center gap-xs">
                            {osResponsavelInitial(os) ? (
                              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-bold text-white">
                                {osResponsavelInitial(os)}
                              </span>
                            ) : (
                              <Icon name="group" className="text-[15px]" />
                            )}
                            <span className="truncate">
                              {osResponsavelLabel(os) ?? "Sem responsável"}
                            </span>
                          </div>
                          <div className="flex items-center gap-xs">
                            <Icon name="flag" className="text-[15px]" />
                            <span>{osStageName(os.stage)}</span>
                          </div>
                        </div>
                        {os.items.length ? (
                          <ul className="mt-sm space-y-2xs border-t border-black/5 pt-sm text-label-sm text-on-surface">
                            {os.items.map((it) => (
                              <li key={it.id}>
                                {it.qtd}× {it.nome}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </button>
                      <div className="mt-sm flex items-center justify-between gap-xs">
                        <span className="text-label-sm text-on-surface-variant">
                          {mineCard ? "Com você" : "Outro setor"}
                        </span>
                        <div className="flex flex-wrap justify-end gap-xs">
                          <button
                            type="button"
                            className={btnMuted}
                            onClick={() => void openHistory(os)}
                          >
                            Histórico
                          </button>
                          <button
                            type="button"
                            className={cn(btnPrimary, "rounded-full")}
                            onClick={() => openSchedule(os)}
                          >
                            Reagendar
                            <Icon name="arrow_forward" className="text-[14px]" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!agendaOs.length ? (
                  <p className="text-body-md text-on-surface-variant sm:col-span-2 xl:col-span-3">
                    Nenhuma OS agendada.
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  "grid gap-md",
                  calSheetOpen && "xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]",
                )}
              >
                <ActivitiesCalendar
                  items={agendaCalendarItems}
                  pendingItems={agendaPendingItems}
                  legend={OS_ACTIVITY_LEGEND}
                  month={calMonth}
                  onMonthChange={setCalMonth}
                  onSelect={(id) => {
                    const os = osList.find((o) => o.id === id);
                    if (!os) return;
                    setCalSheetOpen(true);
                    openDetail(os, { fromCalendar: true });
                  }}
                  {...(boot.user.canAssistencia || boot.user.isAdmin
                    ? { onCreate: openNewOs, createLabel: "+ Nova OS" }
                    : {})}
                />
                {calSheetOpen ? (
                  <aside className="flex max-h-[min(80vh,52rem)] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 xl:sticky xl:top-md">
                    <div className="flex shrink-0 items-start justify-between gap-sm border-b border-outline-variant px-md py-sm">
                      <div className="min-w-0">
                        <p className="text-title-md font-semibold text-on-surface">
                          {selected?.num ?? "OS"}
                        </p>
                        <p className="truncate text-label-md text-on-surface-variant">
                          {selected
                            ? selected.clientName + " · " + osStageName(selected.stage)
                            : "Carregando…"}
                        </p>
                        {selected ? (
                          <p className="mt-2xs flex items-center gap-xs truncate text-label-sm text-on-surface">
                            {osResponsavelInitial(selected) ? (
                              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-bold text-white">
                                {osResponsavelInitial(selected)}
                              </span>
                            ) : null}
                            <span className="truncate">
                              {osResponsavelLabel(selected) ?? "Sem responsável"}
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => {
                          setCalSheetOpen(false);
                          setSelectedId(null);
                        }}
                      >
                        <Icon name="close" className="text-[18px]" />
                        Fechar
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-md py-md">
                      {selected ? (
                        renderOsDetail("panel")
                      ) : (
                        <p className="text-body-md text-on-surface-variant">Carregando OS…</p>
                      )}
                    </div>
                  </aside>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {tab === "conf" ? (
          <div className="grid gap-md md:grid-cols-2">
            {confOs.map((os) => (
              <div
                key={os.id}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() => openDetail(os)}
                >
                  <div className="font-semibold text-on-surface">
                    {os.num} · {os.clientName}
                  </div>
                  <div className="text-label-md text-on-surface-variant">
                    {os.conf ? "Aguardando aceite" : "Pronto para conferir"}
                  </div>
                </button>
              </div>
            ))}
            {!confOs.length ? (
              <p className="text-on-surface-variant">Nenhuma OS aguardando conferência.</p>
            ) : null}
          </div>
        ) : null}

        {tab === "rel" ? (
          <div className="flex flex-col gap-md">
            <PageSection className="flex flex-col gap-md">
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <h2 className="text-title-md font-semibold text-on-surface">
                    Relatório de OS
                  </h2>
                  <p className="text-label-md text-on-surface-variant">
                    OS executadas e finalizadas · filtre por cliente e período
                  </p>
                </div>
                <div className="flex flex-wrap gap-xs">
                  <button
                    type="button"
                    className={btnMuted}
                    disabled={
                      !relClient &&
                      relDatePreset === "todos" &&
                      !relDateFrom &&
                      !relDateTo
                    }
                    onClick={() => {
                      setRelClient("");
                      setRelDatePreset("todos");
                      setRelDateFrom("");
                      setRelDateTo("");
                    }}
                  >
                    Limpar filtros
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={relPdfBusy || !relOs.length}
                    onClick={() => void exportRelatorioPdf()}
                  >
                    <Icon name="picture_as_pdf" className="text-[16px]" />
                    {relPdfBusy ? "Gerando…" : "Exportar PDF"}
                  </button>
                </div>
              </div>

              <div className="grid gap-md md:grid-cols-2 xl:grid-cols-4">
                <label className="flex flex-col gap-2xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                  Cliente
                  <input
                    type="search"
                    list="rel-client-suggestions"
                    value={relClient}
                    onChange={(e) => setRelClient(e.target.value)}
                    placeholder="Digite para buscar o cliente…"
                    className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                  <datalist id="rel-client-suggestions">
                    {relClientOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </label>
                <label className="flex flex-col gap-2xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                  Período
                  <select
                    value={relDatePreset}
                    onChange={(e) => setRelDatePreset(e.target.value as DatePreset)}
                    className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface"
                  >
                    {DATE_PRESET_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {relDatePreset === "personalizado" ? (
                  <>
                    <label className="flex flex-col gap-2xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                      De
                      <input
                        type="date"
                        value={relDateFrom}
                        onChange={(e) => setRelDateFrom(e.target.value)}
                        className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface"
                      />
                    </label>
                    <label className="flex flex-col gap-2xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                      Até
                      <input
                        type="date"
                        value={relDateTo}
                        onChange={(e) => setRelDateTo(e.target.value)}
                        className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface"
                      />
                    </label>
                  </>
                ) : (
                  <div className="flex flex-col justify-end gap-2xs text-label-md text-on-surface-variant md:col-span-2">
                    {relDateRange.from || relDateRange.to
                      ? `${formatOsDateBr(relDateRange.from) || "…"} → ${formatOsDateBr(relDateRange.to) || "…"}`
                      : "Sem recorte de data"}
                  </div>
                )}
              </div>

              <div className="grid gap-sm sm:grid-cols-3">
                <div className="rounded-xl border border-outline-variant bg-surface px-md py-sm">
                  <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                    OS no filtro
                  </div>
                  <div className="text-title-lg font-bold text-on-surface">{relStats.total}</div>
                </div>
                <div className="rounded-xl border border-outline-variant bg-surface px-md py-sm">
                  <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                    Clientes
                  </div>
                  <div className="text-title-lg font-bold text-on-surface">{relStats.clients}</div>
                </div>
                <div className="rounded-xl border border-outline-variant bg-surface px-md py-sm">
                  <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                    Com material
                  </div>
                  <div className="text-title-lg font-bold text-on-surface">
                    {relStats.withMaterial}
                  </div>
                </div>
              </div>
            </PageSection>

            <div className="grid gap-md lg:grid-cols-2">
              {relOs.map((os) => (
                <article
                  key={os.id}
                  className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm"
                >
                  <header className="mb-sm flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-xs">
                        <h2 className="text-title-md font-semibold text-on-surface">
                          {os.num}
                        </h2>
                        <span className="rounded-full bg-neutral-900 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-white">
                          {osTipoBadgeLabel(os.tipo)}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-xs py-2xs text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                          {osStageName(os.stage)}
                        </span>
                      </div>
                      <p className="mt-2xs text-body-md font-bold text-on-surface">
                        {os.clientName}
                        {os.clientCity ? (
                          <span className="font-normal text-on-surface-variant">
                            {" "}
                            · {os.clientCity}
                          </span>
                        ) : null}
                      </p>
                      {os.subtipo ? (
                        <p className="text-label-sm text-on-surface-variant">
                          {osTipoLabel(os.tipo)} · {os.subtipo}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      <button
                        type="button"
                        className={btnMuted}
                        onClick={() => void openDetail(os)}
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={relPdfBusy}
                        onClick={() => void exportOsPdf(os)}
                      >
                        <Icon name="picture_as_pdf" className="text-[14px]" />
                        PDF
                      </button>
                    </div>
                  </header>

                  {os.servico ? (
                    <p className="mb-sm line-clamp-2 text-body-md text-on-surface-variant">
                      — {os.servico}
                    </p>
                  ) : null}

                  <dl className="grid gap-sm text-body-md sm:grid-cols-2">
                    <div>
                      <dt className="text-label-sm text-on-surface-variant">Data</dt>
                      <dd className="font-medium">
                        {formatOsDateBr(osReportDate(os)) || "—"}
                        {os.periodo ? ` · ${os.periodo}` : ""}
                        {os.hora ? ` · ${os.hora}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label-sm text-on-surface-variant">Responsável</dt>
                      <dd className="flex items-center gap-xs font-medium">
                        {osResponsavelInitial(os) ? (
                          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-bold text-white">
                            {osResponsavelInitial(os)}
                          </span>
                        ) : null}
                        <span className="truncate">
                          {osResponsavelLabel(os) ?? "—"}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label-sm text-on-surface-variant">Check-in / out</dt>
                      <dd className="text-label-md">
                        {os.ciAt ? new Date(os.ciAt).toLocaleString("pt-BR") : "—"}
                        {" → "}
                        {os.coAt ? new Date(os.coAt).toLocaleString("pt-BR") : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label-sm text-on-surface-variant">Orçamento / Ticket</dt>
                      <dd>
                        {os.quoteNumero || "—"}
                        {os.ticketId ? ` · #${os.ticketId}` : ""}
                      </dd>
                    </div>
                  </dl>

                  {os.resolucao || os.rel?.texto ? (
                    <div className="mt-sm rounded-lg bg-surface px-sm py-xs">
                      <div className="text-label-sm font-semibold text-on-surface-variant">
                        Resolução
                      </div>
                      <p className="mt-2xs line-clamp-3 whitespace-pre-wrap text-body-md text-on-surface">
                        {os.resolucao || os.rel?.texto}
                      </p>
                    </div>
                  ) : null}

                  {os.items.length ? (
                    <ul className="mt-sm space-y-2xs border-t border-outline-variant pt-sm text-label-md text-on-surface">
                      {os.items.slice(0, 4).map((it) => (
                        <li key={it.id} className="flex justify-between gap-sm">
                          <span className="min-w-0 truncate">
                            {it.qtd}× {it.nome}
                          </span>
                          <span className="shrink-0 text-on-surface-variant">
                            {it.usado != null ? `uso ${it.usado}` : ""}
                            {it.devolvido != null ? ` · dev ${it.devolvido}` : ""}
                          </span>
                        </li>
                      ))}
                      {os.items.length > 4 ? (
                        <li className="text-on-surface-variant">
                          +{os.items.length - 4} material
                          {os.items.length - 4 === 1 ? "" : "is"}
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <p className="mt-sm border-t border-outline-variant pt-sm text-label-sm text-on-surface-variant">
                      Sem materiais
                    </p>
                  )}
                </article>
              ))}
            </div>

            {!relOs.length ? (
              <PageSection>
                <p className="text-body-md text-on-surface-variant">
                  Nenhuma OS executada/finalizada com esses filtros.
                </p>
              </PageSection>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={histOpen && Boolean(selected)} onOpenChange={setHistOpen}>
        <DialogContent className="dialog-lg max-h-[90vh] overflow-y-auto">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Histórico · {selected.num}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-md">
                <p className="text-label-md text-on-surface-variant">
                  {selected.clientName} · {osStageName(selected.stage)}
                </p>

                {(selected.rel?.fotos?.length || selected.rel?.anexos?.length || selected.resolucao) ? (
                  <div className="rounded-xl border border-outline-variant bg-surface p-md">
                    <h3 className="mb-sm text-label-md font-semibold text-on-surface">
                      Resolução e anexos
                    </h3>
                    {selected.resolucao || selected.rel?.texto ? (
                      <p className="mb-sm whitespace-pre-wrap text-body-md text-on-surface">
                        {selected.resolucao || selected.rel?.texto}
                      </p>
                    ) : null}
                    {selected.rel?.fotos?.length ? (
                      <div className="mb-sm flex flex-wrap gap-sm">
                        {selected.rel.fotos.map((foto, i) => (
                          <a
                            key={i}
                            href={foto}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-lg border border-outline-variant"
                          >
                            <img
                              src={foto}
                              alt={`Foto ${i + 1}`}
                              className="h-28 w-28 object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {selected.rel?.anexos?.length ? (
                      <ul className="space-y-xs text-label-md">
                        {selected.rel.anexos.map((a, i) => (
                          <li key={`${a.name}-${i}`}>
                            <a
                              href={a.data}
                              download={a.name}
                              className="font-medium text-primary underline"
                            >
                              {a.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <h3 className="mb-sm text-label-md font-semibold text-on-surface-variant">
                    Linha do tempo
                  </h3>
                  {(selected.events ?? []).length ? (
                    <ul className="space-y-sm border-l border-outline-variant pl-md">
                      {(selected.events ?? []).map((ev) => (
                        <li key={ev.id} className="relative">
                          <span className="absolute -left-[1.15rem] top-1.5 size-2 rounded-full bg-primary" />
                          <div className="text-label-sm text-on-surface-variant">
                            {new Date(ev.quando).toLocaleString("pt-BR")} · {ev.quem}
                          </div>
                          <div className="text-body-md text-on-surface">{ev.acao}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-md text-on-surface-variant">
                      Sem eventos registrados ainda.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected) && !histOpen && !(tab === "agenda" && agendaView === "calendario" && calSheetOpen)} onOpenChange={(open) => { if (!open) { setSelectedId(null); setCalSheetOpen(false); } }}>
        <DialogContent className="dialog-lg max-h-[90vh] overflow-y-auto">
          {selected ? renderOsDetail("dialog") : null}
        </DialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="dialog-lg">
          <DialogHeader>
            <DialogTitle>Nova OS</DialogTitle>
          </DialogHeader>
          <div className="grid gap-lg sm:grid-cols-2">
            <label className="block text-label-md text-on-surface-variant sm:col-span-2">
              Tipo
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as typeof tipo);
                  setSubtipo("");
                }}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              >
                {boot.catalogs.tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {tipo === "manut" || tipo === "monit" ? (
              <label className="block text-label-md text-on-surface-variant sm:col-span-2">
                Subtipo
                <select
                  value={subtipo}
                  onChange={(e) => setSubtipo(e.target.value)}
                  className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                >
                  <option value="">Selecione...</option>
                  {(tipo === "manut" ? OS_SUBTIPOS_MANUT : OS_SUBTIPOS_MONIT).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tipo === "pedido" ? (
              <label className="block text-label-md text-on-surface-variant sm:col-span-2">
                Orçamento
                <input
                  value={quoteNumero}
                  onChange={async (e) => {
                    const v = e.target.value;
                    setQuoteNumero(v);
                    setQuoteId(null);
                    if (v.trim().length >= 2) {
                      const hits = await searchQuotesFn({ data: { query: v } });
                      setQuoteHits(hits);
                    } else setQuoteHits([]);
                  }}
                  className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                  placeholder="Buscar ORC..."
                />
                {quoteHits.length ? (
                  <ul className="mt-xs max-h-32 overflow-auto rounded-lg bg-surface-container/40">
                    {quoteHits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="w-full px-md py-sm text-left text-body-md hover:bg-surface-container"
                          onClick={() => {
                            setQuoteId(h.id);
                            setQuoteNumero(h.numero);
                            if (h.clientName) {
                              setSelectedClient({
                                codigo: 0,
                                nome: h.clientName,
                                cnpjCpf: null,
                              });
                              setClientQuery(h.clientName);
                            }
                            setQuoteHits([]);
                          }}
                        >
                          {h.numero} · {h.clientName}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
            ) : null}

            {boot.apps.length > 1 ? (
              <label className="block text-label-md text-on-surface-variant sm:col-span-2">
                Empresa Omie
                <select
                  value={omieAppId}
                  onChange={(e) => {
                    setOmieAppId(e.target.value);
                    setSelectedClient(null);
                    setClientQuery("");
                    setClientResults([]);
                  }}
                  className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                >
                  {boot.apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="sm:col-span-2">
              <label className="block text-label-md text-on-surface-variant">Cliente Omie *</label>
              {selectedClient && selectedClient.codigo > 0 ? (
                <div className="mt-xs flex items-center justify-between gap-sm rounded-lg bg-surface-container/50 px-md py-sm">
                  <div className="min-w-0">
                    <p className="truncate text-body-md">{selectedClient.nome}</p>
                    <p className="text-label-md text-on-surface-variant">
                      Código {selectedClient.codigo}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-label-md font-semibold text-primary"
                    onClick={() => {
                      setSelectedClient(null);
                      setClientQuery("");
                    }}
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <div className="relative mt-xs">
                  <input
                    value={clientQuery}
                    onChange={(e) => {
                      setClientQuery(e.target.value);
                      setSelectedClient(null);
                    }}
                    placeholder="Buscar razão social / CNPJ (mín. 2 letras)"
                    className="w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                  />
                  {searchingClients ? (
                    <p className="mt-xs text-label-md text-on-surface-variant">Buscando na Omie…</p>
                  ) : null}
                  {clientResults.length > 0 ? (
                    <ul className="absolute z-20 mt-xs max-h-48 w-full overflow-auto rounded-lg border border-outline-variant/70 bg-surface shadow-lg">
                      {clientResults.map((client) => (
                        <li key={client.codigo}>
                          <button
                            type="button"
                            className="block w-full px-md py-sm text-left text-body-md hover:bg-surface-container"
                            onClick={() => {
                              setSelectedClient({
                                codigo: client.codigo,
                                nome: client.nome,
                                cnpjCpf: client.cnpjCpf,
                              });
                              setClientQuery(client.nome);
                              setClientResults([]);
                            }}
                          >
                            {client.nome}
                            <span className="ml-xs text-label-md text-on-surface-variant">
                              #{client.codigo}
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
              Cidade
              <input
                value={clientCity}
                onChange={(e) => setClientCity(e.target.value)}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant sm:col-span-2">
              Serviço / descrição
              <textarea
                value={servico}
                onChange={(e) => setServico(e.target.value)}
                rows={3}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              />
            </label>
            {tipo === "pedido" ? (
              <div className="sm:col-span-2">
                <div className="text-label-md text-on-surface-variant">Itens</div>
                <ul className="mt-xs space-y-2xs text-body-md">
                  {items.map((it, idx) => (
                    <li key={`${it.nome}-${idx}`}>
                      {it.qtd}× {it.nome}
                    </li>
                  ))}
                </ul>
                <div className="mt-sm flex gap-sm">
                  <input
                    value={itemDraft}
                    onChange={(e) => setItemDraft(e.target.value)}
                    placeholder="Nome do item"
                    className="min-w-0 flex-1 rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!itemDraft.trim()) return;
                      setItems((prev) => [...prev, { qtd: 1, nome: itemDraft.trim() }]);
                      setItemDraft("");
                    }}
                    className="rounded-lg bg-surface-container px-md py-sm text-label-md"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setNewOpen(false)}
              className="rounded-lg px-md py-sm text-label-md text-on-surface-variant hover:bg-surface-container"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !selectedClient?.nome.trim() ||
                ((tipo === "manut" || tipo === "monit") && !subtipo) ||
                (tipo === "pedido" && !quoteId && !quoteNumero.trim())
              }
              onClick={async () => {
                if (!selectedClient) return;
                await run(() =>
                  createOsFn({
                    data: {
                      tipo,
                      subtipo: subtipo || null,
                      clientName: selectedClient.nome,
                      clientCode: selectedClient.codigo > 0 ? selectedClient.codigo : null,
                      omieAppId: omieAppId || null,
                      clientCity,
                      servico,
                      quoteId,
                      quoteNumero: quoteNumero || null,
                      items: tipo === "pedido" ? items : undefined,
                    },
                  }),
                );
                setNewOpen(false);
              }}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              Criar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <DialogContent
          className={cn(
            "gap-0 overflow-hidden p-0",
            "[&>button]:right-4 [&>button]:top-4 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:focus:ring-amber-300",
          )}
        >
          <DialogHeader className="gap-0 border-b-2 border-[#F5C518] bg-neutral-950 px-xl py-md pr-3xl text-left">
            <p className="text-label-sm font-bold tracking-wide text-[#F5C518]">
              OS {selected?.num ?? "—"}
            </p>
            <DialogTitle className="text-title-md font-bold uppercase tracking-wide text-white">
              {selected ? osScheduleTitle(selected.tipo) : "AGENDAR OS"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex max-h-[min(70vh,40rem)] flex-col gap-md overflow-y-auto px-xl py-md">
            {selected ? (
              <div className="rounded-xl border border-outline-variant bg-surface px-md py-sm">
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-xs">
                      <span className="rounded-full bg-neutral-900 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-white">
                        {osTipoBadgeLabel(selected.tipo)}
                      </span>
                      <span className="text-label-sm text-on-surface-variant">
                        {osStageName(selected.stage)}
                      </span>
                    </div>
                    <div className="mt-xs text-body-md font-bold text-on-surface">
                      {selected.clientName}
                      <span className="font-normal text-on-surface-variant">
                        {" "}
                        · {selected.servico ? `— ${selected.servico}` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-sm flex flex-wrap gap-x-md gap-y-2xs text-label-sm text-on-surface-variant">
                  <div className="flex items-center gap-xs">
                    <Icon
                      name={selected.items.length ? "inventory_2" : "public"}
                      className="text-[15px]"
                    />
                    <span>{osMaterialHint(selected)}</span>
                  </div>
                  {osAgendaHint(selected) ? (
                    <div className="flex items-center gap-xs">
                      <Icon name="calendar_month" className="text-[15px]" />
                      <span>{osAgendaHint(selected)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-xs">
                    {osResponsavelInitial(selected) ? (
                      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-bold text-white">
                        {osResponsavelInitial(selected)}
                      </span>
                    ) : (
                      <Icon name="group" className="text-[15px]" />
                    )}
                    <span>{osResponsavelLabel(selected) ?? "Sem responsável"}</span>
                  </div>
                </div>
                {selected.items.length ? (
                  <ul className="mt-sm space-y-xs border-t border-outline-variant pt-sm text-label-md text-on-surface">
                    {selected.items.map((it) => (
                      <li key={it.id} className="flex items-start justify-between gap-sm">
                        <span className="min-w-0">
                          <span className="font-semibold">{it.qtd}×</span> {it.nome}
                        </span>
                        <span className="shrink-0 text-label-sm text-on-surface-variant">
                          {OS_ITEM_STATUS_LABEL[it.status as OsItemStatus] ?? it.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-md sm:grid-cols-2">
              <label className="flex flex-col gap-2xs text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                Data
                <input
                  type="date"
                  value={agDate}
                  onChange={(e) => setAgDate(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800"
                />
              </label>
              <label className="flex flex-col gap-2xs text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                Período
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800"
                >
                  {boot.catalogs.periodos.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-xs">
              <label className="inline-flex cursor-pointer items-center gap-sm text-body-md text-on-surface">
                <input
                  type="checkbox"
                  checked={horaEspecifica}
                  onChange={(e) => {
                    setHoraEspecifica(e.target.checked);
                    if (!e.target.checked) setHora("");
                  }}
                  className="size-4 rounded border-neutral-400 accent-neutral-900"
                />
                Horário específico
              </label>
              {horaEspecifica ? (
                <label className="flex max-w-[12rem] flex-col gap-2xs text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                  Horário
                  <input
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800"
                  />
                </label>
              ) : null}
            </div>

            <label className="flex flex-col gap-2xs text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Equipe técnica (opcional)
              <select
                value={teamId}
                onChange={(e) =>
                  setTeamId(e.target.value ? Number(e.target.value) : "")
                }
                className="w-full rounded-md border border-neutral-300 bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800"
              >
                <option value="">Definir depois, na execução</option>
                {boot.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-label-sm text-on-surface-variant">
              Escolher a equipe agora só reserva a agenda dela. O material só sai do estoque
              quando a OS for colocada em execução.
            </p>

            <label className="flex flex-col gap-2xs text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Técnico / responsável (opcional)
              <input
                value={tecnicoNome}
                onChange={(e) => setTecnicoNome(e.target.value)}
                placeholder="Nome do técnico"
                className="w-full rounded-md border border-neutral-300 bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800"
              />
            </label>
          </div>

          <DialogFooter className="mt-0 border-t border-outline-variant/50 px-xl py-md">
            <button
              type="button"
              className={cn(btnOutline, "justify-center border-neutral-800 text-on-surface")}
              onClick={() => setSchedOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !selected ||
                !agDate ||
                (horaEspecifica && !hora)
              }
              onClick={async () => {
                if (!selected) return;
                await run(() =>
                  scheduleOsFn({
                    data: {
                      osId: selected.id,
                      agDate,
                      periodo,
                      hora: horaEspecifica && hora ? hora : null,
                      teamId: teamId === "" ? null : teamId,
                      tecnicoNome: tecnicoNome || null,
                    },
                  }),
                );
                setSchedOpen(false);
              }}
              className={cn(
                btnPrimary,
                "justify-center bg-[#F5C518] text-neutral-950 hover:bg-[#e6b800]",
              )}
            >
              Confirmar agendamento
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
