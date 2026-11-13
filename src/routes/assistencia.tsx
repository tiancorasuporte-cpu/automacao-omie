import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ActivitiesCalendar,
  OS_ACTIVITY_LEGEND,
  activityInitial,
  osActivityStatus,
} from "@/components/ActivitiesCalendar";
import { useAppConfirm } from "@/components/AppConfirm";
import { AppShell, useShellSearch } from "@/components/AppShell";
import { AssistChecklistConfig } from "@/components/AssistChecklistConfig";
import { AssistOsChecklistPanel } from "@/components/AssistOsChecklistPanel";
import { Icon } from "@/components/Icon";
import { PhotoCapture, type CapturedPhoto } from "@/components/PhotoCapture";
import {
  btnMuted,
  btnOutline,
  btnPrimary,
  feedbackErrClass,
  feedbackOkClass,
  fieldClass,
  PageSection,
  PageTitle,
} from "@/components/PageChrome";
import {
  SoftDialogBody,
  SoftDialogContent,
  SoftDialogFooter,
  SoftDialogHeader,
  SoftSummaryCard,
  softCancelBtnClass,
  softFieldLabelClass,
  softInputClass,
  softPrimaryBtnClass,
} from "@/components/SoftOsDialog";
import { Dialog } from "@/components/ui/dialog";
import {
  acceptConferenceFn,
  addOsItemFn,
  advanceOsFn,
  backfillOsClientLocationsFn,
  checkInOsFn,
  checkOutOsFn,
  createOsFn,
  deleteOsFn,
  pauseOsFn,
  resumeOsFn,
  finishVisitaFn,
  getAssistenciaBootstrapFn,
  getOsFn,
  listOsFn,
  listTecnicosProximosFn,
  markExecutedFn,
  moveOsKanbanFn,
  receivePurchaseFn,
  reopenOsFn,
  requestReturnFn,
  resolveOsMaterialBaixaFn,
  resolveReturnFn,
  saveOsLevFn,
  saveOsMaterialDispositionFn,
  saveOsResolucaoFn,
  scheduleOsFn,
  searchAssistClientsFn,
  searchAssistProductsFn,
  searchQuotesFn,
  startExecOsFn,
  submitConferenceFn,
  syncOsClientLocationFn,
  updateOsItemFn,
} from "@/lib/assistencia";
import { notifyComprasUnreadChanged } from "@/lib/compras";
import {
  OS_ITEM_STATUS_CLASS,
  OS_ITEM_STATUS_LABEL,
  OS_STAGES,
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
import {
  companyHasCoords,
  formatDistanceKm,
  type CompanyLocation,
} from "@/lib/geo";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

type TabId = "kanban" | "agenda" | "conf" | "rel" | "config";

function parseAssistView(raw: unknown): TabId {
  if (
    raw === "agenda" ||
    raw === "conf" ||
    raw === "rel" ||
    raw === "kanban" ||
    raw === "config"
  ) {
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

type AgendaView = "lista" | "calendario" | "cronograma";
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

function osDetailTitle(tipo: string) {
  if (tipo === "pedido") return "DETALHE · INSTALAÇÃO";
  if (tipo === "manut") return "DETALHE · MANUTENÇÃO";
  if (tipo === "monit") return "DETALHE · MONITORAMENTO";
  if (tipo === "visita") return "DETALHE · ORÇAMENTO";
  return "DETALHE DA OS";
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
    aprovadoPor: os.aprovadoPor,
    aprovadoEm: os.aprovadoEm,
    aprovacaoAnexoName: os.aprovacaoAnexo?.name ?? null,
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
    assinatura:
      typeof os.rel?.assinatura === "string" && os.rel.assinatura.trim().length > 16
        ? os.rel.assinatura.trim()
        : null,
  };
}

function AssistenciaPage() {
  const boot = Route.useLoaderData();
  const { view: viewFromUrl } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { query } = useShellSearch();
  const { confirm: askConfirm, ConfirmHost, open: confirmOpen } = useAppConfirm();
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
  const [problemTypes, setProblemTypes] = useState(boot.problemTypes ?? []);
  const [checklistsCatalog, setChecklistsCatalog] = useState(boot.checklists ?? []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackOk, setFeedbackOk] = useState(false);
  const [kanbanFilters, setKanbanFilters] = useState(emptyKanbanFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openColFilter, setOpenColFilter] = useState<number | null>(null);
  const [globalTipo, setGlobalTipo] = useState("");
  const [globalName, setGlobalName] = useState("");
  const [agendaTecnico, setAgendaTecnico] = useState("");
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
  const dragOsIdRef = useRef<number | null>(null);
  const suppressCardClickRef = useRef(false);

  useEffect(() => {
    setOsList(boot.osList);
  }, [boot.osList]);

  useEffect(() => {
    if (boot.companyLocation) setCompanyLocation(boot.companyLocation);
  }, [boot.companyLocation]);

  useEffect(() => {
    void listOsFn({ data: {} }).then(setOsList).catch(() => undefined);
    void backfillOsClientLocationsFn({ data: { limit: 10 } })
      .then((res) => {
        if (res.updated.length > 0) {
          void listOsFn({ data: {} }).then(setOsList).catch(() => undefined);
        }
      })
      .catch(() => undefined);
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
  const [newProblemTypeId, setNewProblemTypeId] = useState<number | null>(null);
  const [newChecklistIds, setNewChecklistIds] = useState<number[]>([]);
  const [addChecklistIdDraft, setAddChecklistIdDraft] = useState("");
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
      cidade: string | null;
      estado: string | null;
      cep: string | null;
      contato: string | null;
    }>
  >([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [clientCity, setClientCity] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientUf, setClientUf] = useState("");
  const [clientCep, setClientCep] = useState("");
  const [companyLocation, setCompanyLocation] = useState<CompanyLocation>(
    boot.companyLocation ?? {
      label: "Base Âncora",
      address: "",
      city: "",
      uf: "",
      cep: "",
      lat: null,
      lng: null,
    },
  );
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
  const [tecnicosProximos, setTecnicosProximos] = useState<
    Array<{
      userId: number | null;
      name: string;
      distanceKm: number | null;
      locationAt: string | null;
      stale: boolean;
      hasGps: boolean;
    }>
  >([]);
  const [tecnicosProximosLoading, setTecnicosProximosLoading] = useState(false);
  const geoTriedOsIdsRef = useRef<Set<number>>(new Set());
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseMotivo, setPauseMotivo] = useState("");

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
  const [extraQtd, setExtraQtd] = useState("1");
  const [extraProductId, setExtraProductId] = useState<number | null>(null);
  const [extraProductCode, setExtraProductCode] = useState<number | null>(null);
  const [extraProductResults, setExtraProductResults] = useState<
    Array<{
      id: number;
      codigoProduto: number;
      descricao: string;
      unidade: string | null;
      cmcEfetivo: number | null;
    }>
  >([]);
  const [searchingExtraProducts, setSearchingExtraProducts] = useState(false);
  const [matDisp, setMatDisp] = useState<
    Record<number, { usado: string; sobraDestino: "" | "devolver" | "equipe" }>
  >({});
  const [matDispErrors, setMatDispErrors] = useState<Record<number, string>>({});

  const selected = useMemo(
    () => osList.find((o) => o.id === selectedId) ?? null,
    [osList, selectedId],
  );

  useEffect(() => {
    const q = extraNome.trim();
    if (q.length < 2 || extraProductId != null) {
      setExtraProductResults([]);
      setSearchingExtraProducts(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingExtraProducts(true);
      try {
        const appId = selected?.omieAppId || omieAppId || undefined;
        const rows = await searchAssistProductsFn({
          data: { omieAppId: appId, query: q, limit: 40 },
        });
        setExtraProductResults(
          rows.map((r) => ({
            id: r.id,
            codigoProduto: r.codigoProduto,
            descricao: r.descricao,
            unidade: r.unidade,
            cmcEfetivo: r.cmcEfetivo,
          })),
        );
      } catch {
        setExtraProductResults([]);
      } finally {
        setSearchingExtraProducts(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [extraNome, extraProductId, selected?.omieAppId, omieAppId]);

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

  const agendaTecnicoOptions = useMemo(() => {
    const names = new Set<string>();
    for (const os of osList) {
      const tec = (os.tecnicoNome ?? "").trim();
      if (tec) names.add(tec);
    }
    for (const team of boot.teams) {
      for (const m of team.members) {
        if (m.active && m.name.trim()) names.add(m.name.trim());
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [osList, boot.teams]);

  /** Agenda: só OS já agendadas (etapa Agendado+ com data). */
  const agendaOs = useMemo(() => {
    const tecQ = agendaTecnico.trim().toLowerCase();
    return filtered
      .filter((o) => Boolean(o.agDate) && o.stage >= 4)
      .filter((o) => {
        if (!tecQ) return true;
        const tec = (o.tecnicoNome ?? "").trim().toLowerCase();
        const team = (o.teamName ?? "").trim().toLowerCase();
        return tec === tecQ || tec.includes(tecQ) || team.includes(tecQ);
      })
      .sort((a, b) => (a.agDate ?? "").localeCompare(b.agDate ?? ""));
  }, [filtered, agendaTecnico]);

  const agendaCalendarItems = useMemo(
    () =>
      agendaOs.map((os) => {
        const st = osActivityStatus(os.stage, Boolean(os.agDate), Boolean(os.pausedAt));
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

  /** Cronograma: só aguardando agendamento + agendadas, por região e distância. */
  const cronogramaGroups = useMemo(() => {
    const tecQ = agendaTecnico.trim().toLowerCase();
    const rows = filtered
      .filter((o) => o.stage === 3 || o.stage === 4)
      .filter((o) => {
        if (!tecQ) return true;
        const tec = (o.tecnicoNome ?? "").trim().toLowerCase();
        const team = (o.teamName ?? "").trim().toLowerCase();
        return tec === tecQ || tec.includes(tecQ) || team.includes(tecQ);
      })
      .slice()
      .sort((a, b) => {
        const da = a.distanceKm == null ? Number.POSITIVE_INFINITY : a.distanceKm;
        const db = b.distanceKm == null ? Number.POSITIVE_INFINITY : b.distanceKm;
        if (da !== db) return da - db;
        const dateCmp = (a.agDate ?? "9999").localeCompare(b.agDate ?? "9999");
        if (dateCmp !== 0) return dateCmp;
        return a.clientName.localeCompare(b.clientName, "pt-BR");
      });

    const map = new Map<string, OsRow[]>();
    for (const os of rows) {
      const key =
        os.clientRegion?.trim() ||
        [os.clientCity, os.clientUf].filter(Boolean).join("/") ||
        "Sem região";
      const list = map.get(key) ?? [];
      list.push(os);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([region, items]) => {
        const withDist = items.filter((i) => i.distanceKm != null);
        const avg =
          withDist.length > 0
            ? withDist.reduce((s, i) => s + (i.distanceKm ?? 0), 0) / withDist.length
            : null;
        return { region, items, avgKm: avg };
      })
      .sort((a, b) => {
        const aa = a.avgKm == null ? Number.POSITIVE_INFINITY : a.avgKm;
        const bb = b.avgKm == null ? Number.POSITIVE_INFINITY : b.avgKm;
        if (aa !== bb) return aa - bb;
        return a.region.localeCompare(b.region, "pt-BR");
      });
  }, [filtered, agendaTecnico]);

  const cronogramaTotal = useMemo(
    () => cronogramaGroups.reduce((n, g) => n + g.items.length, 0),
    [cronogramaGroups],
  );

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

  function canSilentKanbanAdvance(os: OsRow, toStage: number) {
    if (toStage <= os.stage) return false;
    if (os.stage === 0 && toStage === 1) return true;
    if (os.stage === 1 && (toStage === 2 || toStage === 3)) return true;
    if (os.stage === 6 && toStage === 7) return true;
    return false;
  }

  async function onKanbanDrop(toStage: number, osIdArg?: number | null) {
    const osId = osIdArg ?? dragOsIdRef.current ?? dragOsId;
    dragOsIdRef.current = null;
    setDragOverStage(null);
    setDragOsId(null);
    if (osId == null || busy) return;
    const os = osList.find((o) => o.id === osId);
    if (!os || os.stage === toStage) return;

    const cta = osCardPrimaryCta(os);

    // Voltar etapa: mantém fluxo de retorno/aprovação.
    if (toStage < os.stage) {
      await run(() => moveOsKanbanFn({ data: { osId, toStage } }));
      return;
    }

    // Etapas que precisam da tela do botão (agendar / iniciar / abrir).
    if (cta.kind === "schedule" || cta.kind === "start" || cta.kind === "open") {
      await onOsCardCta(os, cta);
      return;
    }

    // Avanço simples só quando a coluna bate com o próximo passo.
    if (cta.kind === "advance" && canSilentKanbanAdvance(os, toStage)) {
      await run(() => moveOsKanbanFn({ data: { osId, toStage } }));
      return;
    }

    await onOsCardCta(os, cta);
  }

  function osNeedsDisposition(os: OsRow) {
    if ((os.stage !== 5 && os.stage !== 6) || !os.coAt) return false;
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
      setMatDispErrors({});
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
    setMatDispErrors({});
  }, [selected?.id, selected?.items]);

  function openNewOs() {
    setTipo("manut");
    setSubtipo("");
    setNewProblemTypeId(null);
    setNewChecklistIds([]);
    setAddChecklistIdDraft("");
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

  const activeProblemTypes = useMemo(
    () => problemTypes.filter((p) => p.active),
    [problemTypes],
  );

  const linkedChecklistsForNew = useMemo(() => {
    if (!newProblemTypeId) return [];
    return checklistsCatalog.filter(
      (c) => c.active && c.problemTypeIds.includes(newProblemTypeId),
    );
  }, [checklistsCatalog, newProblemTypeId]);

  const extraChecklistsForNew = useMemo(() => {
    const selected = new Set(newChecklistIds);
    return checklistsCatalog.filter((c) => c.active && !selected.has(c.id));
  }, [checklistsCatalog, newChecklistIds]);

  function selectNewProblemType(idRaw: string) {
    const id = idRaw ? Number(idRaw) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      setNewProblemTypeId(null);
      setSubtipo("");
      setNewChecklistIds([]);
      setAddChecklistIdDraft("");
      return;
    }
    const problem = problemTypes.find((p) => p.id === id);
    setNewProblemTypeId(id);
    setSubtipo(problem?.name ?? "");
    const linked = checklistsCatalog
      .filter((c) => c.active && c.problemTypeIds.includes(id))
      .map((c) => c.id);
    setNewChecklistIds(linked);
    setAddChecklistIdDraft("");
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

  async function run(
    action: () => Promise<OsRow | null | undefined>,
    opts?: { okMessage?: string },
  ) {
    setBusy(true);
    setFeedback(null);
    setFeedbackOk(false);
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
      if (opts?.okMessage) {
        setFeedbackOk(true);
        setFeedback(opts.okMessage);
      }
    } catch (e) {
      setFeedbackOk(false);
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
      let full = await getOsFn({ data: { id: os.id } });
      const needsGeo =
        full &&
        full.clientLat == null &&
        Boolean(
          (full.clientAddress && full.clientAddress.trim()) ||
            (full.clientCep && full.clientCep.replace(/\D/g, "").length >= 8) ||
            full.clientCode,
        ) &&
        !geoTriedOsIdsRef.current.has(full.id);
      if (needsGeo && full) {
        geoTriedOsIdsRef.current.add(full.id);
        try {
          full = await syncOsClientLocationFn({
            data: { osId: full.id, fromOmie: Boolean(full.clientCode) },
          });
        } catch {
          // best-effort
        }
      }
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

  function tecnicoProximidadeLabel(name: string) {
    const row = tecnicosProximos.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (!row) return name;
    if (row.distanceKm != null) {
      return `${name} · ${formatDistanceKm(row.distanceKm)}`;
    }
    if (row.hasGps && row.stale) return `${name} · GPS antigo`;
    return `${name} · sem GPS`;
  }

  async function loadTecnicosProximos(
    osId: number,
    nextTeamId: number | "",
    preferNome?: string,
  ) {
    setTecnicosProximosLoading(true);
    try {
      const res = await listTecnicosProximosFn({
        data: {
          osId,
          teamId: nextTeamId === "" ? null : nextTeamId,
        },
      });
      setTecnicosProximos(res.items);
      const closest = res.items.find((t) => t.distanceKm != null && !t.stale);
      if (preferNome && res.items.some((t) => t.name === preferNome)) {
        setTecnicoNome(preferNome);
      } else if (closest) {
        setTecnicoNome(closest.name);
      }
    } catch {
      setTecnicosProximos([]);
    } finally {
      setTecnicosProximosLoading(false);
    }
  }

  async function openHistory(os: OsRow) {
    await openDetail(os, { fromCalendar: calSheetOpen });
    setHistOpen(true);
  }

  function membersOfTeam(id: number | "") {
    if (id === "") return [];
    const team = boot.teams.find((t) => t.id === id);
    return (team?.members ?? []).filter((m) => m.active);
  }

  function resolveTecnicoForTeam(id: number | "", current: string) {
    const members = membersOfTeam(id);
    if (!members.length) {
      if (id === "") return current;
      const team = boot.teams.find((t) => t.id === id);
      return current || team?.name || "";
    }
    if (current && members.some((m) => m.name === current)) return current;
    return members.length === 1 ? members[0]!.name : "";
  }

  function openSchedule(os: OsRow) {
    applyOsDetailState(os);
    setAgDate(os.agDate ?? "");
    setPeriodo(os.periodo ?? "Manhã");
    setHora(os.hora ?? "");
    setHoraEspecifica(Boolean(os.hora));
    const nextTeam = os.teamId ?? "";
    setTeamId(nextTeam);
    const resolved = resolveTecnicoForTeam(nextTeam, os.tecnicoNome ?? "");
    setTecnicoNome(resolved);
    setTecnicosProximos([]);
    setSchedOpen(true);
    void loadTecnicosProximos(os.id, nextTeam, resolved || undefined);
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
      const hasItems = os.items.length > 0;
      if (hasItems) {
        const ok = await askConfirm({
          title: "Confirmar equipamentos",
          description: `Enviar a OS ${os.num} para o técnico confirmar os equipamentos no app?`,
          confirmLabel: "Enviar",
        });
        if (!ok) return;
        await run(() =>
          startExecOsFn({ data: { osId: os.id, materialOk: false } }),
        );
      } else {
        await run(() =>
          startExecOsFn({ data: { osId: os.id, materialOk: true } }),
        );
      }
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


  function renderOsSummaryCard(os: OsRow, opts?: { hideItemList?: boolean }) {
    return (
      <SoftSummaryCard>
        <div className="flex flex-wrap items-center gap-xs">
          <span className="rounded-full bg-neutral-900 px-xs py-2xs text-[10px] font-bold uppercase tracking-wide text-white">
            {osTipoBadgeLabel(os.tipo)}
          </span>
          <span className="text-label-sm text-on-surface-variant">{osStageName(os.stage)}</span>
          {os.subtipo ? (
            <span className="text-label-sm text-on-surface-variant">· {os.subtipo}</span>
          ) : null}
          {os.quoteNumero ? (
            <span className="text-label-sm text-on-surface-variant">· {os.quoteNumero}</span>
          ) : null}
        </div>
        <div className="mt-xs text-body-md font-bold text-on-surface">
          {os.clientName}
          <span className="font-normal text-on-surface-variant">
            {" "}
            · {os.servico ? `— ${os.servico}` : "—"}
          </span>
        </div>
        <div className="mt-sm flex flex-wrap gap-x-md gap-y-2xs text-label-sm text-on-surface-variant">
          <div className="flex items-center gap-xs">
            <Icon name={os.items.length ? "inventory_2" : "public"} className="text-[15px]" />
            <span>{osMaterialHint(os)}</span>
          </div>
          {osAgendaHint(os) ? (
            <div className="flex items-center gap-xs">
              <Icon name="calendar_month" className="text-[15px]" />
              <span>{osAgendaHint(os)}</span>
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
            <span>{osResponsavelLabel(os) ?? "Sem responsável"}</span>
          </div>
          {(os.clientAddress || os.clientCity || os.distanceKm != null) && (
            <div className="flex items-center gap-xs">
              <Icon name="location_on" className="text-[15px]" />
              <span>
                {os.clientRegion || os.clientCity || "Local"}
                {os.distanceKm != null ? ` · ${formatDistanceKm(os.distanceKm)} da base` : ""}
              </span>
            </div>
          )}
        </div>
        {os.clientAddress ? (
          <p className="mt-2xs line-clamp-2 text-label-sm text-on-surface-variant">
            {os.clientAddress}
          </p>
        ) : null}
        {!opts?.hideItemList && os.items.length ? (
          <ul className="mt-sm space-y-xs border-t border-outline-variant pt-sm text-label-md text-on-surface">
            {os.items.map((it) => (
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
      </SoftSummaryCard>
    );
  }

  // Função de render (não componente): evita remount a cada tecla no textarea.
  function renderOsDetail(variant: "dialog" | "panel" = "dialog") {
    if (!selected) return null;
    return (
      <>
        <div className="flex flex-col gap-md">
                {feedback ? (
                  <div className={feedbackOk ? feedbackOkClass : feedbackErrClass}>
                    {feedback}
                  </div>
                ) : null}
                {variant === "dialog" ? (
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0 flex-1">
                      {renderOsSummaryCard(selected, { hideItemList: true })}
                      <div className="mt-sm flex flex-wrap gap-xs">
                        <button
                          type="button"
                          disabled={busy}
                          className={btnOutline}
                          onClick={() =>
                            void run(async () => {
                              const next = await syncOsClientLocationFn({
                                data: { osId: selected.id, fromOmie: true },
                              });
                              setOsList((prev) =>
                                prev.map((o) => (o.id === next.id ? next : o)),
                              );
                              setFeedback(
                                next.distanceKm != null
                                  ? `Localização atualizada · ${formatDistanceKm(next.distanceKm)} da base`
                                  : "Endereço salvo, mas não achamos coords no mapa. Confira rua/número/CEP no Omie.",
                              );
                              setFeedbackOk(next.distanceKm != null);
                            })
                          }
                        >
                          <Icon name="my_location" className="text-[16px]" />
                          Atualizar localização Omie
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={cn(softCancelBtnClass, "shrink-0")}
                      onClick={() => setHistOpen(true)}
                    >
                      <Icon name="history" className="text-[16px]" />
                      Histórico
                    </button>
                  </div>
                ) : (
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
                )}

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
                                    void run(async () => {
                                      const updated = await updateOsItemFn({
                                        data: { itemId: it.id, status: "separado" },
                                      });
                                      if (!updated || updated.stage !== 1) return updated;
                                      const pending = updated.items.some(
                                        (i) =>
                                          i.status === "pendente" || i.status === "recebido",
                                      );
                                      if (pending) return updated;
                                      const needBuy = updated.items.some(
                                        (i) => i.status === "comprar",
                                      );
                                      const nextLabel = needBuy
                                        ? "Compras"
                                        : "Aguardando agendamento";
                                      const ok = await askConfirm({
                                        title: "Avançar etapa",
                                        description: `Todo material separado na OS ${updated.num}. Avançar automaticamente para “${nextLabel}”?`,
                                        confirmLabel: "Avançar",
                                      });
                                      if (!ok) return updated;
                                      return advanceOsFn({ data: { osId: updated.id } });
                                    })
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
                                    void run(async () => {
                                      await updateOsItemFn({
                                        data: { itemId: it.id, status: "comprar" },
                                      });
                                      notifyComprasUnreadChanged();
                                    })
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
                      <div className="relative mt-sm flex flex-col gap-xs">
                        <div className="flex gap-sm">
                          <input
                            value={extraQtd}
                            onChange={(e) => setExtraQtd(e.target.value)}
                            className="w-16 shrink-0 rounded-lg border border-outline-variant px-sm py-xs text-body-md"
                            title="Quantidade"
                          />
                          <input
                            value={extraNome}
                            onChange={(e) => {
                              setExtraNome(e.target.value);
                              setExtraProductId(null);
                              setExtraProductCode(null);
                            }}
                            placeholder="Buscar produto Omie…"
                            className="min-w-0 flex-1 rounded-lg border border-outline-variant px-sm py-xs text-body-md"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            disabled={busy || !extraNome.trim()}
                            onClick={() =>
                              run(() =>
                                addOsItemFn({
                                  data: {
                                    osId: selected.id,
                                    qtd: Number(extraQtd.replace(",", ".")) || 1,
                                    nome: extraNome.trim(),
                                    productId: extraProductId,
                                    status: selected.stage === 5 ? "extra" : "pendente",
                                  },
                                }),
                              ).then(() => {
                                setExtraNome("");
                                setExtraQtd("1");
                                setExtraProductId(null);
                                setExtraProductCode(null);
                                setExtraProductResults([]);
                              })
                            }
                            className="rounded-lg bg-secondary-container px-md py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                        {searchingExtraProducts ? (
                          <p className="text-label-sm text-on-surface-variant">Buscando na Omie…</p>
                        ) : null}
                        {extraProductResults.length && extraProductId == null ? (
                          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-outline-variant bg-white shadow-lg">
                            {extraProductResults.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className="flex w-full flex-col gap-2xs px-sm py-xs text-left hover:bg-surface-container"
                                  onClick={() => {
                                    setExtraNome(p.descricao);
                                    setExtraProductId(p.id);
                                    setExtraProductCode(p.codigoProduto);
                                    setExtraProductResults([]);
                                  }}
                                >
                                  <span className="text-body-md font-medium text-on-surface">
                                    {p.descricao}
                                  </span>
                                  <span className="text-label-sm text-on-surface-variant">
                                    #{p.codigoProduto}
                                    {p.unidade ? ` · ${p.unidade}` : ""}
                                    {p.cmcEfetivo != null
                                      ? ` · CMC ${p.cmcEfetivo.toLocaleString("pt-BR", {
                                          style: "currency",
                                          currency: "BRL",
                                        })}`
                                      : ""}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {extraNome.trim().length >= 2 &&
                        !searchingExtraProducts &&
                        !extraProductResults.length &&
                        extraProductId == null ? (
                          <p className="text-label-sm text-on-surface-variant">
                            Nenhum produto Omie encontrado — você ainda pode adicionar o texto livre.
                          </p>
                        ) : null}
                        {extraProductId != null ? (
                          <p className="text-label-sm text-emerald-800">
                            Produto Omie vinculado
                            {extraProductCode != null ? ` · #${extraProductCode}` : ""}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-sm">
                  {boot.user.canDeleteOs ? (
                    <button
                      type="button"
                      disabled={busy || selected.stage >= 7}
                      onClick={() => {
                        void (async () => {
                          const ok = await askConfirm({
                            title: "Excluir OS",
                            description: `Excluir a OS ${selected.num}? Esta ação não pode ser desfeita.`,
                            confirmLabel: "Excluir",
                            danger: true,
                          });
                          if (!ok) return;
                          await run(async () => {
                            await deleteOsFn({ data: { osId: selected.id } });
                            setSelectedId(null);
                            setCalSheetOpen(false);
                            return null;
                          });
                        })();
                      }}
                      className="rounded-lg border border-error/40 bg-error-container/20 px-md py-sm text-label-md font-semibold text-error disabled:opacity-50"
                    >
                      Excluir OS
                    </button>
                  ) : null}
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
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            const hasItems = selected.items.length > 0;
                            if (hasItems) {
                              const ok = await askConfirm({
                                title: "Confirmar material",
                                description: `Enviar material da OS ${selected.num} para o técnico confirmar no app?`,
                                confirmLabel: "Enviar",
                              });
                              if (!ok) return;
                              await run(() =>
                                startExecOsFn({
                                  data: { osId: selected.id, materialOk: false },
                                }),
                              );
                              return;
                            }
                            await run(() =>
                              startExecOsFn({
                                data: { osId: selected.id, materialOk: true },
                              }),
                            );
                          })();
                        }}
                        className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                      >
                        {selected.items.length
                          ? selected.envio
                            ? "Reenviar p/ confirmar material"
                            : "Enviar p/ técnico confirmar material"
                          : "Iniciar execução"}
                      </button>
                      {selected.items.length ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              const ok = await askConfirm({
                                title: "Iniciar sem app",
                                description:
                                  "Confirmar material agora e iniciar execução sem o app do técnico?",
                                confirmLabel: "Iniciar",
                              });
                              if (!ok) return;
                              await run(() =>
                                startExecOsFn({
                                  data: { osId: selected.id, materialOk: true },
                                }),
                              );
                            })();
                          }}
                          className="rounded-lg border border-outline-variant px-md py-sm text-label-md"
                        >
                          OK material (iniciar sem app)
                        </button>
                      ) : null}
                    </>
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
                  {selected.stage === 5 &&
                  selected.ciAt &&
                  !selected.coAt &&
                  !selected.pausedAt &&
                  (boot.user.canAssistencia || boot.user.isAdmin) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPauseMotivo("");
                        setPauseOpen(true);
                      }}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-md py-sm text-label-md font-semibold text-amber-900"
                    >
                      Pausar OS
                    </button>
                  ) : null}
                  {selected.stage === 5 &&
                  selected.pausedAt &&
                  !selected.coAt &&
                  (boot.user.canAssistencia || boot.user.isAdmin) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(() => resumeOsFn({ data: { osId: selected.id } }))
                      }
                      className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                    >
                      Retomar OS
                    </button>
                  ) : null}
                </div>

                {selected.stage === 5 && selected.pausedAt ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-md py-sm text-body-md text-amber-950">
                    <div className="font-semibold">OS pausada</div>
                    <p className="mt-2xs text-label-md">
                      {selected.pauseMotivo || "Sem motivo informado"}
                      {selected.pausedAt
                        ? ` · desde ${new Date(selected.pausedAt).toLocaleString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                ) : null}

                <AssistOsChecklistPanel
                  osId={selected.id}
                  problemTypeId={selected.problemTypeId ?? null}
                  problemTypeName={selected.problemTypeName ?? null}
                  problemTypes={problemTypes}
                  checklistCatalog={checklistsCatalog}
                  canEdit={
                    (boot.user.canAssistencia || boot.user.isAdmin) && selected.stage < 7
                  }
                  canFill={
                    (boot.user.canAssistencia || boot.user.isAdmin) &&
                    selected.stage === 5 &&
                    Boolean(selected.ciAt) &&
                    !selected.coAt
                  }
                  busy={busy}
                  setBusy={setBusy}
                  setFeedback={(v) => {
                    if (!v) {
                      setFeedback(null);
                      return;
                    }
                    setFeedback(v.text);
                    setFeedbackOk(v.type === "ok");
                  }}
                  onOsUpdated={(os) => {
                    const row = os as OsRow;
                    setOsList((prev) => prev.map((o) => (o.id === row.id ? { ...o, ...row } : o)));
                  }}
                />

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
                    ) : selected.pausedAt ? (
                      <p className="text-label-md text-amber-900">
                        OS pausada — retome para liberar o check-out.
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
                          {selected.ciAt && !selected.pausedAt ? (
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
                          ) : selected.pausedAt ? (
                            <span className="self-center text-label-md text-amber-900">
                              Retome a OS para fazer check-out.
                            </span>
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

                {(selected.stage === 5 || selected.stage === 6) &&
                selected.coAt &&
                selected.items.some((i) =>
                  ["campo", "extra", "aplicado", "separado", "recebido"].includes(i.status),
                ) ? (
                  (() => {
                    const matItems = selected.items.filter((i) =>
                      ["campo", "extra", "aplicado", "separado", "recebido"].includes(
                        i.status,
                      ),
                    );
                    const needsDisp = osNeedsDisposition(selected);
                    const pendingBaixa = osPendingBaixaItems(selected);
                    const canBaixa =
                      (boot.user.canEstoque || boot.user.isAdmin) &&
                      !needsDisp &&
                      pendingBaixa.length > 0;
                    const step12Done = !needsDisp;
                    const step3Done =
                      step12Done &&
                      (pendingBaixa.length === 0 ||
                        matItems.every(
                          (i) =>
                            !i.productId ||
                            !(i.usado ?? 0) ||
                            i.baixaStatus === "feita" ||
                            i.baixaStatus === "ignorada",
                        ));
                    const hasCatalogUsed = matItems.some(
                      (i) => i.productId != null && (i.usado ?? 0) > 0,
                    );

                    return (
                      <div className="rounded-xl border border-violet-300 bg-violet-50 p-md">
                        <h3 className="text-title-md font-semibold text-violet-950">
                          Fechar materiais desta O.S.
                        </h3>
                        <p className="mt-2xs text-label-md text-violet-900/80">
                          Depois do check-out: diga o que foi usado, o que sobrou e (Estoque)
                          confirme a baixa na empresa.
                        </p>

                        <ol className="mt-sm flex flex-wrap gap-xs text-label-sm">
                          <li
                            className={cn(
                              "rounded-full px-sm py-2xs font-semibold",
                              step12Done
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-violet-200 text-violet-950",
                            )}
                          >
                            1–2. Uso e sobra {step12Done ? "✓" : "· falta"}
                          </li>
                          <li
                            className={cn(
                              "rounded-full px-sm py-2xs font-semibold",
                              !step12Done
                                ? "bg-white/60 text-violet-800/70"
                                : step3Done
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "bg-amber-100 text-amber-950",
                            )}
                          >
                            3. Baixa empresa{" "}
                            {!step12Done
                              ? "· depois"
                              : step3Done
                                ? "✓"
                                : canBaixa
                                  ? "· sua vez"
                                  : "· Estoque"}
                          </li>
                        </ol>

                        {/* Passos 1 e 2 */}
                        <div className="mt-md space-y-sm">
                          <div>
                            <p className="text-label-md font-semibold text-violet-950">
                              Passo 1 — O que foi instalado / usado
                            </p>
                            <p className="text-label-sm text-violet-900/70">
                              Quantidade enviada já vem preenchida. Ajuste se usou menos.
                            </p>
                          </div>

                          {matItems.map((it) => {
                            const draft = matDisp[it.id] ?? {
                              usado: String(it.qtd),
                              sobraDestino: "" as const,
                            };
                            const usadoN =
                              Number(String(draft.usado).replace(",", ".")) || 0;
                            const sobra = Math.max(0, it.qtd - usadoN);
                            const err = matDispErrors[it.id];
                            const savedOk =
                              it.usado != null &&
                              (sobra <= 0 ||
                                it.sobraDestino === "devolver" ||
                                it.sobraDestino === "equipe");

                            return (
                              <div
                                key={it.id}
                                className={cn(
                                  "rounded-lg border bg-white p-sm",
                                  err
                                    ? "border-red-400 ring-1 ring-red-300"
                                    : savedOk && !needsDisp
                                      ? "border-emerald-200"
                                      : "border-violet-200",
                                )}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-sm">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-body-md font-medium text-on-surface">
                                      {it.nome}
                                    </p>
                                    <p className="text-label-sm text-on-surface-variant">
                                      Enviado: {it.qtd}
                                      {it.productId ? " · produto do catálogo" : ""}
                                    </p>
                                  </div>
                                  <label className="flex flex-col gap-2xs text-label-sm font-semibold text-on-surface-variant">
                                    Usou
                                    <input
                                      inputMode="decimal"
                                      value={draft.usado}
                                      disabled={busy}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        setMatDisp((prev) => {
                                          const cur = prev[it.id] ?? draft;
                                          const nextUsado =
                                            Number(String(value).replace(",", ".")) || 0;
                                          const nextSobra = Math.max(0, it.qtd - nextUsado);
                                          return {
                                            ...prev,
                                            [it.id]: {
                                              usado: value,
                                              sobraDestino:
                                                nextSobra <= 0
                                                  ? ""
                                                  : cur.sobraDestino === "devolver" ||
                                                      cur.sobraDestino === "equipe"
                                                    ? cur.sobraDestino
                                                    : "",
                                            },
                                          };
                                        });
                                        setMatDispErrors((prev) => {
                                          if (!prev[it.id]) return prev;
                                          const copy = { ...prev };
                                          delete copy[it.id];
                                          return copy;
                                        });
                                      }}
                                      className="w-24 rounded border border-outline-variant px-sm py-xs text-body-md font-normal text-on-surface"
                                    />
                                  </label>
                                </div>

                                <p className="mt-xs text-label-md text-on-surface">
                                  Sobra:{" "}
                                  <span className="font-semibold">
                                    {sobra > 0 ? sobra : "nenhuma (usou tudo)"}
                                  </span>
                                </p>

                                {sobra > 0 ? (
                                  <div className="mt-sm space-y-xs">
                                    <p className="text-label-md font-semibold text-violet-950">
                                      Passo 2 — O que fazer com a sobra ({sobra})
                                    </p>
                                    <div className="flex flex-wrap gap-xs">
                                      <button
                                        type="button"
                                        disabled={busy}
                                        className={cn(
                                          draft.sobraDestino === "devolver"
                                            ? btnPrimary
                                            : btnOutline,
                                        )}
                                        onClick={() => {
                                          setMatDisp((prev) => ({
                                            ...prev,
                                            [it.id]: {
                                              ...draft,
                                              sobraDestino: "devolver",
                                            },
                                          }));
                                          setMatDispErrors((prev) => {
                                            if (!prev[it.id]) return prev;
                                            const copy = { ...prev };
                                            delete copy[it.id];
                                            return copy;
                                          });
                                        }}
                                      >
                                        Devolver para a empresa
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        className={cn(
                                          draft.sobraDestino === "equipe"
                                            ? btnPrimary
                                            : btnOutline,
                                        )}
                                        onClick={() => {
                                          setMatDisp((prev) => ({
                                            ...prev,
                                            [it.id]: {
                                              ...draft,
                                              sobraDestino: "equipe",
                                            },
                                          }));
                                          setMatDispErrors((prev) => {
                                            if (!prev[it.id]) return prev;
                                            const copy = { ...prev };
                                            delete copy[it.id];
                                            return copy;
                                          });
                                        }}
                                      >
                                        Fica com a equipe
                                      </button>
                                    </div>
                                    <p className="text-label-sm text-on-surface-variant">
                                      {draft.sobraDestino === "devolver"
                                        ? "A sobra volta para o estoque da empresa."
                                        : draft.sobraDestino === "equipe"
                                          ? "A sobra permanece no estoque da equipe."
                                          : "Escolha uma opção para a sobra."}
                                    </p>
                                  </div>
                                ) : null}

                                {err ? (
                                  <p className="mt-xs text-label-sm font-medium text-red-700">
                                    {err}
                                  </p>
                                ) : null}

                                {it.baixaStatus === "pendente" ? (
                                  <p className="mt-xs text-label-sm font-medium text-amber-800">
                                    Aguardando Estoque confirmar baixa na empresa
                                  </p>
                                ) : null}
                                {it.baixaStatus === "feita" ? (
                                  <p className="mt-xs text-label-sm text-emerald-700">
                                    Baixa na empresa confirmada
                                  </p>
                                ) : null}
                                {it.baixaStatus === "ignorada" ? (
                                  <p className="mt-xs text-label-sm text-on-surface-variant">
                                    Baixa na empresa ignorada
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}

                          {needsDisp ||
                          matItems.some(
                            (i) =>
                              i.usado == null ||
                              (i.qtd - (i.usado ?? 0) > 0 && !i.sobraDestino),
                          ) ? (
                            <button
                              type="button"
                              disabled={busy}
                              className={cn(btnPrimary, "w-full justify-center sm:w-auto")}
                              onClick={() => {
                                const errors: Record<number, string> = {};
                                const rows = matItems.map((i) => {
                                  const draft = matDisp[i.id];
                                  const usado =
                                    Number(
                                      String(draft?.usado ?? i.qtd).replace(",", "."),
                                    ) || 0;
                                  const clamped = Math.max(0, Math.min(i.qtd, usado));
                                  const sobra = Math.max(0, i.qtd - clamped);
                                  const destino =
                                    sobra > 0
                                      ? draft?.sobraDestino === "devolver" ||
                                        draft?.sobraDestino === "equipe"
                                        ? draft.sobraDestino
                                        : null
                                      : null;
                                  if (sobra > 0 && !destino) {
                                    errors[i.id] =
                                      "Escolha: devolver para a empresa ou ficar com a equipe.";
                                  }
                                  if (usado > i.qtd) {
                                    errors[i.id] =
                                      `Não pode usar mais que o enviado (${i.qtd}).`;
                                  }
                                  return {
                                    id: i.id,
                                    nome: i.nome,
                                    usado: clamped,
                                    sobraDestino: destino,
                                  };
                                });
                                setMatDispErrors(errors);
                                if (Object.keys(errors).length) {
                                  setFeedbackOk(false);
                                  setFeedback(
                                    "Revise os itens em destaque: falta informar a sobra ou a quantidade está inválida.",
                                  );
                                  return;
                                }
                                if (
                                  !selected.teamId &&
                                  rows.some((r) => r.usado > 0 || r.sobraDestino) &&
                                  matItems.some((i) => i.productId != null)
                                ) {
                                  setFeedbackOk(false);
                                  setFeedback(
                                    "OS sem equipe — defina a equipe no agendamento antes de salvar materiais.",
                                  );
                                  return;
                                }
                                const willNeedBaixa = rows.some((r) => {
                                  const item = matItems.find((i) => i.id === r.id);
                                  return item?.productId != null && r.usado > 0;
                                });
                                void run(
                                  () =>
                                    saveOsMaterialDispositionFn({
                                      data: {
                                        osId: selected.id,
                                        rows: rows.map(({ id, usado, sobraDestino }) => ({
                                          id,
                                          usado,
                                          sobraDestino,
                                        })),
                                      },
                                    }),
                                  {
                                    okMessage: willNeedBaixa
                                      ? "Materiais salvos. Próximo: Estoque confirma a baixa na empresa."
                                      : "Materiais salvos.",
                                  },
                                );
                              }}
                            >
                              Salvar materiais
                            </button>
                          ) : (
                            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-sm py-xs text-label-md text-emerald-900">
                              Uso e sobra registrados
                              {hasCatalogUsed
                                ? pendingBaixa.length
                                  ? " — falta Estoque confirmar a baixa."
                                  : " — baixa da empresa ok."
                                : "."}
                            </p>
                          )}
                        </div>

                        {/* Passo 3 — baixa */}
                        {step12Done ? (
                          <div className="mt-md rounded-lg border border-amber-300 bg-amber-50 p-sm">
                            <p className="text-label-md font-semibold text-amber-950">
                              Passo 3 — Baixa no estoque da empresa
                            </p>
                            {pendingBaixa.length === 0 ? (
                              <p className="mt-2xs text-label-md text-amber-900/80">
                                {hasCatalogUsed
                                  ? "Nada pendente de baixa nesta O.S."
                                  : "Sem itens de catálogo usados — não há baixa na empresa."}
                              </p>
                            ) : canBaixa ? (
                              <>
                                <p className="mt-2xs text-label-md text-amber-900/80">
                                  Confirme se esses materiais saem do estoque físico da empresa.
                                </p>
                                <ul className="mt-sm space-y-2xs text-body-md">
                                  {pendingBaixa.map((it) => (
                                    <li key={it.id}>
                                      <span className="font-semibold">
                                        {it.baixaQtd ?? it.usado}×
                                      </span>{" "}
                                      {it.nome}
                                    </li>
                                  ))}
                                </ul>
                                <div className="mt-sm flex flex-wrap gap-xs">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className={btnPrimary}
                                    onClick={() =>
                                      run(
                                        () =>
                                          resolveOsMaterialBaixaFn({
                                            data: {
                                              osId: selected.id,
                                              itemIds: pendingBaixa.map((i) => i.id),
                                              action: "baixar",
                                            },
                                          }),
                                        { okMessage: "Baixa no estoque da empresa confirmada." },
                                      )
                                    }
                                  >
                                    Confirmar baixa
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className={btnOutline}
                                    onClick={() =>
                                      run(
                                        () =>
                                          resolveOsMaterialBaixaFn({
                                            data: {
                                              osId: selected.id,
                                              itemIds: pendingBaixa.map((i) => i.id),
                                              action: "ignorar",
                                            },
                                          }),
                                        {
                                          okMessage:
                                            "Baixa ignorada — estoque da empresa não foi alterado.",
                                        },
                                      )
                                    }
                                  >
                                    Não baixar agora
                                  </button>
                                </div>
                              </>
                            ) : (
                              <p className="mt-2xs text-label-md text-amber-900/80">
                                Há {pendingBaixa.length} item(ns) aguardando o setor de Estoque
                                confirmar a baixa.
                              </p>
                            )}
                          </div>
                        ) : null}

                        {/* Conferência antiga — secundária */}
                        {selected.stage === 5 &&
                        step12Done &&
                        selected.items.some((i) =>
                          ["campo", "extra", "aplicado"].includes(i.status),
                        ) ? (
                          <details className="mt-md rounded-lg border border-outline-variant/60 bg-white p-sm">
                            <summary className="cursor-pointer text-label-md font-semibold text-on-surface">
                              Conferência avançada (opcional)
                            </summary>
                            <div className="mt-sm space-y-sm">
                              {selected.conf ? (
                                <>
                                  <p className="text-body-md">
                                    Conferido por {selected.conf.estoque}. Aceitar ou contestar:
                                  </p>
                                  <div className="flex gap-sm">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        run(() =>
                                          acceptConferenceFn({ data: { osId: selected.id } }),
                                        )
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
                                </>
                              ) : boot.user.canEstoque || boot.user.isAdmin ? (
                                <>
                                  {selected.items
                                    .filter((i) =>
                                      ["campo", "extra", "aplicado"].includes(i.status),
                                    )
                                    .map((it) => (
                                      <label
                                        key={it.id}
                                        className="flex items-center justify-between gap-sm text-body-md"
                                      >
                                        <span>
                                          {it.qtd}× {it.nome} (usou)
                                        </span>
                                        <input
                                          value={
                                            confQty[it.id] ?? String(it.usado ?? it.qtd)
                                          }
                                          onChange={(e) =>
                                            setConfQty((prev) => ({
                                              ...prev,
                                              [it.id]: e.target.value,
                                            }))
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
                                                ["campo", "extra", "aplicado"].includes(
                                                  i.status,
                                                ),
                                              )
                                              .map((i) => ({
                                                id: i.id,
                                                usou:
                                                  Number(
                                                    confQty[i.id] ?? i.usado ?? i.qtd,
                                                  ) || 0,
                                              })),
                                          },
                                        }),
                                      )
                                    }
                                    className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
                                  >
                                    Enviar conferência
                                  </button>
                                </>
                              ) : (
                                <p className="text-body-md text-on-surface-variant">
                                  Aguardando Estoque conferir.
                                </p>
                              )}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    );
                  })()
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

                {selected.stage >= 7 &&
                (boot.user.canAssistencia || boot.user.isAdmin) ? (
                  <div className="rounded-lg border border-error/50 bg-error-container/15 p-sm">
                    <h3 className="text-label-md font-semibold text-error">
                      Reabrir O.S. finalizada
                    </h3>
                    <p className="mt-2xs text-label-md text-on-surface-variant">
                      Volta para a etapa Executado. A reabertura fica registrada em vermelho no
                      histórico.
                    </p>
                    <div className="mt-sm flex flex-wrap gap-sm">
                      <input
                        value={returnMotivo}
                        onChange={(e) => setReturnMotivo(e.target.value)}
                        placeholder="Motivo da reabertura"
                        className="min-w-0 flex-1 rounded-lg border border-error/30 px-sm py-xs"
                      />
                      <button
                        type="button"
                        disabled={busy || !returnMotivo.trim()}
                        onClick={() => {
                          void (async () => {
                            const ok = await askConfirm({
                              title: "Reabrir OS",
                              description: `Reabrir a OS ${selected.num}? Ela voltará para Executado.`,
                              confirmLabel: "Reabrir",
                              danger: true,
                            });
                            if (!ok) return;
                            await run(
                              () =>
                                reopenOsFn({
                                  data: {
                                    osId: selected.id,
                                    motivo: returnMotivo.trim(),
                                  },
                                }),
                              { okMessage: `OS ${selected.num} reaberta · Executado.` },
                            );
                            setReturnMotivo("");
                          })();
                        }}
                        className="rounded-lg bg-red-600 px-md py-xs text-label-md font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Reabrir OS
                      </button>
                    </div>
                  </div>
                ) : null}

        </div>
      </>
    );
  }

  return (
    <AppShell
      mobileTitle="Assistência"
      searchPlaceholder="Buscar OS, cliente, orçamento..."
    >
      <div className="flex flex-col gap-md px-margin-mobile py-md md:px-margin-desktop md:py-lg">
        <PageTitle
          title="Assistência"
          subtitle="Quadro de O.S, agenda, conferência e relatório."
        >
          {boot.user.canAssistencia || boot.user.isAdmin ? (
            <button type="button" onClick={openNewOs} className={btnPrimary}>
              <Icon name="add" className="text-[16px]" />
              Nova OS
            </button>
          ) : null}
        </PageTitle>

        <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              No quadro
            </div>
            <div className="text-title-lg font-bold text-on-surface">
              {filtered.filter((o) => o.stage < 7).length}
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Suas pendências
            </div>
            <div className="text-title-lg font-bold text-on-surface">{myPendingOs.length}</div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Compras
            </div>
            <div className="text-title-lg font-bold text-on-surface">
              {(byStage.get(2) ?? []).length}
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Em execução
            </div>
            <div className="text-title-lg font-bold text-on-surface">
              {(byStage.get(5) ?? []).length}
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
            <div className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Finalizado
            </div>
            <div className="text-title-lg font-bold text-on-surface">
              {(byStage.get(7) ?? []).length}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-xs border-b border-outline-variant pb-sm">
          {(
            [
              ["kanban", "Quadro de O.S", "view_kanban"],
              ["agenda", "Agenda", "calendar_month"],
              ["conf", "Conferência", "fact_check"],
              ["rel", "Relatório", "assessment"],
              ["config", "Config", "settings"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => goTab(id)}
              className={cn(
                "inline-flex items-center gap-xs rounded-lg px-sm py-xs text-label-md font-semibold",
                tab === id
                  ? "bg-neutral-900 text-white"
                  : "bg-surface text-on-surface-variant hover:bg-surface-container",
              )}
            >
              <Icon name={icon} className="text-[16px]" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              "ml-auto inline-flex items-center gap-xs rounded-lg border px-sm py-xs text-label-md font-semibold",
              filtersOpen || globalFiltersActive
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-outline-variant bg-white text-on-surface",
            )}
          >
            <Icon name="filter_list" className="text-[16px]" />
            Filtros
            {globalFiltersActive ? (
              <span
                className={cn(
                  "rounded-full px-xs py-2xs text-[10px] font-bold uppercase",
                  filtersOpen || globalFiltersActive
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-950",
                )}
              >
                on
              </span>
            ) : null}
          </button>
        </div>

        {filtersOpen ? (
          <PageSection className="border-outline-variant/80 bg-surface-container-lowest">
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

        {feedback && !selectedId ? (
          <div className={feedbackOk ? feedbackOkClass : feedbackErrClass}>{feedback}</div>
        ) : null}

        {dispositionPendingOs.length > 0 ? (
          <PageSection className="border-violet-300 bg-violet-50">
            <p className="text-title-md font-semibold text-violet-950">
              Informar materiais ({dispositionPendingOs.length})
            </p>
            <p className="text-label-md text-violet-900/80">
              Abra a OS e diga quanto usou e o que sobrou (devolver ou ficar com a equipe).
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
              Confirmar baixa — Estoque ({baixaPendingOs.length})
            </p>
            <p className="text-label-md text-amber-900/80">
              Materiais já informados. Confirme se saem do estoque físico da empresa.
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
                Ver no quadro de O.S
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
          <div className="flex min-h-[70vh] gap-md overflow-x-auto pb-md">
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
                    "flex max-h-[75vh] min-h-[70vh] w-[min(22rem,88vw)] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm transition",
                    style.column,
                    dropActive && "ring-2 ring-amber-500 ring-offset-2",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverStage(stage.idx);
                  }}
                  onDragLeave={() => {
                    setDragOverStage((cur) => (cur === stage.idx ? null : cur));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = Number(e.dataTransfer.getData("text/plain"));
                    const fromData =
                      Number.isFinite(raw) && raw > 0 ? raw : null;
                    void onKanbanDrop(stage.idx, fromData);
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
                  <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-auto p-sm">
                    {visibleRows.map((os) => {
                      const mineCard = isMySectorStage(os.stage);
                      const cta = osCardPrimaryCta(os);
                      const agendaHint = osAgendaHint(os);
                      return (
                        <div
                          key={os.id}
                          draggable
                          onDragStart={(e) => {
                            if (
                              (e.target as HTMLElement | null)?.closest?.(
                                "[data-no-drag]",
                              )
                            ) {
                              e.preventDefault();
                              return;
                            }
                            suppressCardClickRef.current = true;
                            dragOsIdRef.current = os.id;
                            setDragOsId(os.id);
                            e.dataTransfer.setData("text/plain", String(os.id));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            dragOsIdRef.current = null;
                            setDragOsId(null);
                            setDragOverStage(null);
                            window.setTimeout(() => {
                              suppressCardClickRef.current = false;
                            }, 50);
                          }}
                          className={cn(
                            "cursor-grab select-none rounded-xl border p-sm transition active:cursor-grabbing",
                            style.card,
                            selectedId === os.id && "ring-2 ring-amber-600",
                            dragOsId === os.id && "opacity-60",
                          )}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (suppressCardClickRef.current) return;
                              void openDetail(os);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                void openDetail(os);
                              }
                            }}
                            className="w-full cursor-grab text-left active:cursor-grabbing"
                          >
                            <div className="flex items-start justify-between gap-xs">
                              <span className="inline-flex items-center gap-2xs text-label-md font-bold tracking-wide text-on-surface">
                                <Icon
                                  name="drag_indicator"
                                  className="text-[16px] text-on-surface-variant"
                                />
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
                            {(os.clientRegion || os.distanceKm != null) && (
                              <div className="mt-2xs flex items-center gap-xs text-label-sm text-on-surface-variant">
                                <Icon name="location_on" className="text-[15px]" />
                                <span>
                                  {os.clientRegion || os.clientCity || "Local"}
                                  {os.distanceKm != null
                                    ? ` · ${formatDistanceKm(os.distanceKm)}`
                                    : ""}
                                </span>
                              </div>
                            )}
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
                            {os.pausedAt ? (
                              <div className="mt-xs rounded bg-amber-100 px-xs py-2xs text-label-sm font-semibold text-amber-950">
                                Pausada{os.pauseMotivo ? ` · ${os.pauseMotivo}` : ""}
                              </div>
                            ) : null}
                            {os.pending ? (
                              <div className="mt-xs rounded bg-error-container/40 px-xs py-2xs text-label-sm text-on-error-container">
                                Retorno pendente
                              </div>
                            ) : null}
                            {osNeedsDisposition(os) ? (
                              <div className="mt-xs rounded bg-violet-100 px-xs py-2xs text-label-sm font-medium text-violet-900">
                                Informar materiais
                              </div>
                            ) : null}
                            {osPendingBaixaItems(os).length ? (
                              <div className="mt-xs rounded bg-amber-100 px-xs py-2xs text-label-sm font-medium text-amber-950">
                                Confirmar baixa (Estoque)
                              </div>
                            ) : null}
                            {os.envio?.div ? (
                              <div className="mt-xs text-label-sm text-error">
                                Divergência material
                              </div>
                            ) : null}
                          </div>
                          <div className="mt-sm flex items-center justify-between gap-xs">
                            <span className="text-label-sm text-on-surface-variant">
                              {mineCard ? "Com você" : "Outro setor"}
                            </span>
                            <button
                              type="button"
                              data-no-drag
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
            <div className="flex flex-wrap items-end gap-sm">
              {(
                [
                  ["lista", "Lista"],
                  ["calendario", "Calendário"],
                  ["cronograma", "Cronograma"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAgendaView(id)}
                  className={cn(
                    "inline-flex items-center gap-xs rounded-lg px-sm py-xs text-label-md font-semibold",
                    agendaView === id
                      ? "bg-neutral-900 text-white"
                      : "bg-surface text-on-surface-variant hover:bg-surface-container",
                  )}
                >
                  {label}
                </button>
              ))}
              <label className="flex min-w-[12rem] flex-col gap-2xs text-label-md text-on-surface-variant">
                Técnico
                <select
                  value={agendaTecnico}
                  onChange={(e) => setAgendaTecnico(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Todos</option>
                  {agendaTecnicoOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {agendaTecnico ? (
                <button
                  type="button"
                  className={btnMuted}
                  onClick={() => setAgendaTecnico("")}
                >
                  Limpar técnico
                </button>
              ) : null}
              {!companyHasCoords(companyLocation) ? (
                <p className="text-label-sm text-amber-900">
                  Defina a base da empresa em Configurações do sistema para calcular distâncias.
                </p>
              ) : null}
            </div>

            {agendaView === "cronograma" ? (
              <div className="space-y-md">
                <div>
                  <h2 className="text-title-md font-semibold text-on-surface">
                    Roteiro de despacho
                  </h2>
                  <p className="text-label-md text-on-surface-variant">
                    Só OS a agendar ou agendadas · {cronogramaTotal} no roteiro · região mais perto
                    primeiro.
                  </p>
                </div>
                {cronogramaGroups.length ? (
                  cronogramaGroups.map((group) => (
                    <section
                      key={group.region}
                      className="overflow-hidden rounded-xl border border-outline-variant bg-white"
                    >
                      <header className="flex flex-wrap items-center justify-between gap-sm bg-neutral-900 px-md py-sm text-white">
                        <div className="flex items-center gap-xs">
                          <Icon name="location_on" className="text-[18px] text-amber-300" />
                          <h3 className="text-label-md font-bold uppercase tracking-wide">
                            {group.region}
                          </h3>
                        </div>
                        <p className="text-label-sm text-white/75">
                          {group.items.length} OS
                          {group.avgKm != null
                            ? ` · média ${formatDistanceKm(group.avgKm)}`
                            : ""}
                        </p>
                      </header>
                      <ol className="divide-y divide-outline-variant">
                        {group.items.map((os, idx) => (
                          <li
                            key={os.id}
                            className="flex flex-wrap items-center gap-sm px-md py-sm hover:bg-surface-container-low"
                          >
                            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-label-sm font-bold text-white">
                              {idx + 1}
                            </span>
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => void openDetail(os)}
                            >
                              <div className="flex flex-wrap items-center gap-xs">
                                <span className="font-semibold text-on-surface">
                                  {os.num} · {os.clientName}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-full px-xs py-2xs text-[10px] font-bold uppercase",
                                    os.stage === 3
                                      ? "bg-amber-100 text-amber-950"
                                      : "bg-sky-100 text-sky-950",
                                  )}
                                >
                                  {os.stage === 3 ? "A agendar" : "Agendada"}
                                </span>
                              </div>
                              <p className="mt-2xs line-clamp-1 text-label-sm text-on-surface-variant">
                                {os.clientAddress || os.clientCity || "Endereço pendente"}
                              </p>
                              <p className="mt-2xs text-label-sm text-on-surface-variant">
                                {os.agDate
                                  ? `${formatOsDateBr(os.agDate)}${os.periodo ? ` · ${os.periodo}` : ""}${os.hora ? ` · ${os.hora}` : ""}`
                                  : "Sem data ainda"}
                                {osResponsavelLabel(os)
                                  ? ` · ${osResponsavelLabel(os)}`
                                  : " · sem técnico"}
                              </p>
                            </button>
                            <div className="flex shrink-0 flex-col items-end gap-2xs">
                              <span className="rounded-full bg-amber-100 px-sm py-2xs text-label-sm font-semibold text-amber-950">
                                {formatDistanceKm(os.distanceKm)}
                              </span>
                              <button
                                type="button"
                                className={btnOutline}
                                onClick={() => openSchedule(os)}
                              >
                                {os.stage === 3 ? "Agendar" : "Reagendar"}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))
                ) : (
                  <PageSection>
                    <p className="text-body-md text-on-surface-variant">
                      Nenhuma OS aguardando agendamento ou agendada para montar o roteiro.
                    </p>
                  </PageSection>
                )}
              </div>
            ) : null}

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
            ) : null}

            {agendaView === "calendario" ? (
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
            ) : null}
          </div>
        ) : null}

        {tab === "config" ? (
          <AssistChecklistConfig
            problemTypes={problemTypes}
            checklists={checklistsCatalog}
            canEdit={boot.user.canAssistencia || boot.user.isAdmin}
            busy={busy}
            setBusy={setBusy}
            setFeedback={(v) => {
              if (!v) {
                setFeedback(null);
                return;
              }
              setFeedback(v.text);
              setFeedbackOk(v.type === "ok");
            }}
            onRefresh={(next) => {
              setProblemTypes(next.problemTypes);
              setChecklistsCatalog(next.checklists);
            }}
          />
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
                    {os.aprovadoPor ? (
                      <div className="sm:col-span-2">
                        <dt className="text-label-sm text-on-surface-variant">Aprovado por</dt>
                        <dd className="font-medium">
                          {os.aprovadoPor}
                          {os.aprovadoEm
                            ? ` · ${new Date(os.aprovadoEm).toLocaleString("pt-BR")}`
                            : ""}
                          {os.aprovacaoAnexo ? (
                            <>
                              {" · "}
                              <a
                                href={os.aprovacaoAnexo.data}
                                download={os.aprovacaoAnexo.name}
                                className="text-primary underline"
                              >
                                {os.aprovacaoAnexo.name}
                              </a>
                            </>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
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

      <Dialog
        modal={!confirmOpen}
        open={histOpen && Boolean(selected)}
        onOpenChange={setHistOpen}
      >
        <SoftDialogContent size="lg">
          <SoftDialogHeader
            eyebrow={selected ? `OS ${selected.num}` : "OS"}
            title="HISTÓRICO"
          />
          <SoftDialogBody>
            {selected ? (
              <>
                {renderOsSummaryCard(selected)}

                {selected.aprovadoPor ? (
                  <SoftSummaryCard>
                    <h3 className="mb-sm text-label-md font-semibold text-on-surface">
                      Aprovação do pedido
                    </h3>
                    <p className="text-body-md text-on-surface">
                      <span className="font-semibold">{selected.aprovadoPor}</span>
                      {selected.aprovadoEm
                        ? ` · ${new Date(selected.aprovadoEm).toLocaleString("pt-BR")}`
                        : ""}
                    </p>
                    {selected.aprovacaoAnexo ? (
                      <a
                        href={selected.aprovacaoAnexo.data}
                        download={selected.aprovacaoAnexo.name}
                        className="mt-xs inline-block text-label-md font-medium text-primary underline"
                      >
                        {selected.aprovacaoAnexo.name}
                      </a>
                    ) : null}
                  </SoftSummaryCard>
                ) : null}

                {(selected.rel?.fotos?.length ||
                selected.rel?.anexos?.length ||
                selected.rel?.assinatura ||
                selected.resolucao) ? (
                  <SoftSummaryCard>
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
                      <ul className="mb-sm space-y-xs text-label-md">
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
                    {selected.rel?.assinatura ? (
                      <div>
                        <p className="mb-xs text-label-md text-on-surface-variant">
                          Assinatura do cliente
                        </p>
                        <img
                          src={selected.rel.assinatura}
                          alt="Assinatura do cliente"
                          className="max-h-40 w-full rounded-lg border border-outline-variant bg-white object-contain"
                        />
                      </div>
                    ) : null}
                  </SoftSummaryCard>
                ) : null}

                <div>
                  <h3 className="mb-sm text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    Linha do tempo
                  </h3>
                  {(selected.events ?? []).length ? (
                    <ul className="space-y-sm border-l border-outline-variant pl-md">
                      {(selected.events ?? []).map((ev) => {
                        const isReopen = /^reabertura\b/i.test(ev.acao);
                        return (
                          <li key={ev.id} className="relative">
                            <span
                              className={cn(
                                "absolute -left-[1.15rem] top-1.5 size-2 rounded-full",
                                isReopen ? "bg-red-600" : "bg-[#F5C518]",
                              )}
                            />
                            <div
                              className={cn(
                                "text-label-sm",
                                isReopen
                                  ? "font-semibold text-red-700"
                                  : "text-on-surface-variant",
                              )}
                            >
                              {new Date(ev.quando).toLocaleString("pt-BR")} · {ev.quem}
                            </div>
                            <div
                              className={cn(
                                "text-body-md",
                                isReopen
                                  ? "font-semibold text-red-700"
                                  : "text-on-surface",
                              )}
                            >
                              {ev.acao}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-body-md text-on-surface-variant">
                      Sem eventos registrados ainda.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </SoftDialogBody>
          <SoftDialogFooter>
            <button
              type="button"
              className={softCancelBtnClass}
              onClick={() => setHistOpen(false)}
            >
              Fechar
            </button>
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>

      <Dialog
        modal={!confirmOpen}
        open={Boolean(selected) && !histOpen && !(tab === "agenda" && agendaView === "calendario" && calSheetOpen)}
        onOpenChange={(open) => {
          if (!open) {
            if (confirmOpen) return;
            setSelectedId(null);
            setCalSheetOpen(false);
          }
        }}
      >
        <SoftDialogContent size="lg">
          <SoftDialogHeader
            eyebrow={selected ? `OS ${selected.num}` : "OS"}
            title={selected ? osDetailTitle(selected.tipo) : "DETALHE DA OS"}
          />
          <SoftDialogBody className="max-h-[min(75vh,48rem)]">
            {selected ? renderOsDetail("dialog") : null}
          </SoftDialogBody>
          <SoftDialogFooter>
            <button
              type="button"
              className={softCancelBtnClass}
              onClick={() => {
                setSelectedId(null);
                setCalSheetOpen(false);
              }}
            >
              Fechar
            </button>
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <SoftDialogContent size="lg">
          <SoftDialogHeader eyebrow="ASSISTÊNCIA" title="NOVA OS" />
          <SoftDialogBody>
          <div className="grid gap-lg sm:grid-cols-2">
            <label className={cn(softFieldLabelClass, "sm:col-span-2")}>
              Tipo
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as typeof tipo);
                  setSubtipo("");
                  setNewProblemTypeId(null);
                  setNewChecklistIds([]);
                  setAddChecklistIdDraft("");
                }}
                className={softInputClass}
              >
                {boot.catalogs.tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {tipo === "manut" || tipo === "monit" ? (
              <div className="space-y-sm sm:col-span-2">
                <label className="block text-label-md text-on-surface-variant">
                  Subtipo (problema)
                  <select
                    value={newProblemTypeId ?? ""}
                    onChange={(e) => selectNewProblemType(e.target.value)}
                    className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                  >
                    <option value="">Selecione...</option>
                    {activeProblemTypes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!activeProblemTypes.length ? (
                  <p className="text-label-md text-on-surface-variant">
                    Nenhum problema cadastrado. Cadastre em Config → Checklists.
                  </p>
                ) : null}
                {newProblemTypeId ? (
                  <div className="rounded-lg border border-outline-variant bg-surface-container-low p-md">
                    <p className="text-label-md font-semibold text-on-surface">Checklists</p>
                    <p className="mb-sm text-label-sm text-on-surface-variant">
                      Vinculados ao problema e extras que quiser incluir nesta OS.
                    </p>
                    {newChecklistIds.length ? (
                      <ul className="mb-sm space-y-xs">
                        {newChecklistIds.map((id) => {
                          const cl = checklistsCatalog.find((c) => c.id === id);
                          const linked = linkedChecklistsForNew.some((c) => c.id === id);
                          return (
                            <li
                              key={id}
                              className="flex items-center justify-between gap-sm rounded-md border border-outline-variant bg-surface px-sm py-xs"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-body-md text-on-surface">
                                  {cl?.name ?? `Checklist #${id}`}
                                </p>
                                <p className="text-label-sm text-on-surface-variant">
                                  {linked ? "Vinculado ao problema" : "Adicional"}
                                  {cl ? ` · ${cl.items.length} item(ns)` : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-outline-variant px-sm py-xs text-label-md"
                                onClick={() =>
                                  setNewChecklistIds((prev) => prev.filter((x) => x !== id))
                                }
                              >
                                Remover
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mb-sm text-label-md text-on-surface-variant">
                        Nenhum checklist selecionado
                        {linkedChecklistsForNew.length === 0
                          ? " (este problema ainda não tem checklist vinculado)."
                          : "."}
                      </p>
                    )}
                    {extraChecklistsForNew.length ? (
                      <div className="flex flex-wrap items-center gap-sm">
                        <select
                          value={addChecklistIdDraft}
                          onChange={(e) => setAddChecklistIdDraft(e.target.value)}
                          className="min-w-[12rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                        >
                          <option value="">Adicionar outro checklist…</option>
                          {extraChecklistsForNew.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.items.length} itens)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold disabled:opacity-50"
                          disabled={!addChecklistIdDraft}
                          onClick={() => {
                            const id = Number(addChecklistIdDraft);
                            if (!Number.isFinite(id) || id <= 0) return;
                            setNewChecklistIds((prev) =>
                              prev.includes(id) ? prev : [...prev, id],
                            );
                            setAddChecklistIdDraft("");
                          }}
                        >
                          Adicionar
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
                              setClientCity(client.cidade ?? "");
                              setClientAddress(client.endereco ?? "");
                              setClientUf(client.estado ?? "");
                              setClientCep(client.cep ?? "");
                              setClientResults([]);
                            }}
                          >
                            {client.nome}
                            <span className="ml-xs text-label-md text-on-surface-variant">
                              #{client.codigo}
                              {client.cidade ? ` · ${client.cidade}` : ""}
                              {client.estado ? `/${client.estado}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>

            <label className="block text-label-md text-on-surface-variant sm:col-span-2">
              Endereço (Omie)
              <input
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Cidade
              <input
                value={clientCity}
                onChange={(e) => setClientCity(e.target.value)}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              UF
              <input
                value={clientUf}
                onChange={(e) => setClientUf(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              CEP
              <input
                value={clientCep}
                onChange={(e) => setClientCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
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
          </SoftDialogBody>
          <SoftDialogFooter>
            <button
              type="button"
              onClick={() => setNewOpen(false)}
              className={softCancelBtnClass}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !selectedClient?.nome.trim() ||
                ((tipo === "manut" || tipo === "monit") && !newProblemTypeId) ||
                (tipo === "pedido" && !quoteId && !quoteNumero.trim())
              }
              onClick={async () => {
                if (!selectedClient) return;
                await run(() =>
                  createOsFn({
                    data: {
                      tipo,
                      subtipo: subtipo || null,
                      problemTypeId: newProblemTypeId,
                      checklistIds:
                        tipo === "manut" || tipo === "monit" ? newChecklistIds : undefined,
                      clientName: selectedClient.nome,
                      clientCode: selectedClient.codigo > 0 ? selectedClient.codigo : null,
                      omieAppId: omieAppId || null,
                      clientCity: clientCity || null,
                      clientAddress: clientAddress || null,
                      clientUf: clientUf || null,
                      clientCep: clientCep || null,
                      servico,
                      quoteId,
                      quoteNumero: quoteNumero || null,
                      items: tipo === "pedido" ? items : undefined,
                    },
                  }),
                );
                setNewOpen(false);
              }}
              className={softPrimaryBtnClass}
            >
              Criar OS
            </button>
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>

      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <SoftDialogContent>
          <SoftDialogHeader
            eyebrow={selected ? `OS ${selected.num}` : "OS"}
            title={selected ? osScheduleTitle(selected.tipo) : "AGENDAR OS"}
          />
          <SoftDialogBody>
            {selected ? renderOsSummaryCard(selected) : null}

            <div className="grid gap-md sm:grid-cols-2">
              <label className={softFieldLabelClass}>
                Data
                <input
                  type="date"
                  value={agDate}
                  onChange={(e) => setAgDate(e.target.value)}
                  className={softInputClass}
                />
              </label>
              <label className={softFieldLabelClass}>
                Período
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className={softInputClass}
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
                <label className={cn(softFieldLabelClass, "max-w-[12rem]")}>
                  Horário
                  <input
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className={softInputClass}
                  />
                </label>
              ) : null}
            </div>

            <label className={softFieldLabelClass}>
              Equipe técnica (opcional)
              <select
                value={teamId}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : "";
                  setTeamId(next);
                  const resolved = resolveTecnicoForTeam(next, "");
                  setTecnicoNome(resolved);
                  if (selected) {
                    void loadTecnicosProximos(
                      selected.id,
                      next,
                      resolved || undefined,
                    );
                  }
                }}
                className={softInputClass}
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

            <label className={softFieldLabelClass}>
              Técnico / responsável (opcional)
              {membersOfTeam(teamId).length > 0 || tecnicosProximos.length > 0 ? (
                <select
                  value={tecnicoNome}
                  onChange={(e) => setTecnicoNome(e.target.value)}
                  className={softInputClass}
                >
                  <option value="">Selecionar técnico da equipe</option>
                  {(membersOfTeam(teamId).length > 0
                    ? membersOfTeam(teamId).map((m) => m.name)
                    : tecnicosProximos.map((t) => t.name)
                  ).map((name) => (
                    <option key={name} value={name}>
                      {tecnicoProximidadeLabel(name)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={tecnicoNome}
                  onChange={(e) => setTecnicoNome(e.target.value)}
                  placeholder={
                    teamId
                      ? "Equipe sem técnicos cadastrados"
                      : "Escolha a equipe para listar técnicos"
                  }
                  className={softInputClass}
                  disabled={!teamId}
                />
              )}
            </label>
            <p className="text-label-sm text-on-surface-variant">
              {tecnicosProximosLoading
                ? "Calculando proximidade dos técnicos…"
                : selected?.clientLat == null
                  ? "Sem coords do cliente ainda — proximidade indisponível."
                  : tecnicosProximos.some((t) => t.distanceKm != null)
                    ? "Ordenado pelo GPS do app (atualizado há menos de 45 min)."
                    : "Nenhum técnico com GPS fresco no app SGO."}{" "}
            </p>
          </SoftDialogBody>

          <SoftDialogFooter>
            <button
              type="button"
              className={softCancelBtnClass}
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
              className={softPrimaryBtnClass}
            >
              Confirmar agendamento
            </button>
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>

      <Dialog
        open={pauseOpen && Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPauseOpen(false);
            setPauseMotivo("");
          }
        }}
      >
        <SoftDialogContent size="md">
          <SoftDialogHeader
            eyebrow={selected ? `OS ${selected.num}` : "OS"}
            title="PAUSAR EXECUÇÃO"
          />
          <SoftDialogBody>
            <p className="text-body-md text-on-surface-variant">
              Informe o motivo da pausa. O check-out fica bloqueado até retomar.
            </p>
            <label className={cn(softFieldLabelClass, "mt-md")}>
              Motivo
              <textarea
                value={pauseMotivo}
                onChange={(e) => setPauseMotivo(e.target.value)}
                rows={3}
                placeholder="Ex.: aguardando peça, cliente ausente, intervalo…"
                className={softInputClass}
                autoFocus
              />
            </label>
          </SoftDialogBody>
          <SoftDialogFooter>
            <button
              type="button"
              className={softCancelBtnClass}
              disabled={busy}
              onClick={() => {
                setPauseOpen(false);
                setPauseMotivo("");
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !pauseMotivo.trim() || !selected}
              className={softPrimaryBtnClass}
              onClick={() => {
                if (!selected) return;
                void run(() =>
                  pauseOsFn({
                    data: { osId: selected.id, motivo: pauseMotivo.trim() },
                  }),
                ).then(() => {
                  setPauseOpen(false);
                  setPauseMotivo("");
                });
              }}
            >
              Confirmar pausa
            </button>
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>
      {ConfirmHost}
    </AppShell>
  );
}
