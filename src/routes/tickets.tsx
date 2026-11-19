import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  ActivitiesCalendar,
  TICKET_ACTIVITY_LEGEND,
  activityInitial,
  startOfMonth,
  ticketActivityStatus,
  toYmd,
} from "@/components/ActivitiesCalendar";
import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  btnMuted,
  btnOutline,
  btnPrimary,
  fieldClass,
  filterControlClass,
  mobileCardClass,
  PageSection,
  PageTitle,
  SectionHeader,
  statusBadgeClass,
  tableHeadCellClass,
  tableHeadClass,
} from "@/components/PageChrome";
import { notifyText } from "@/lib/notify";
import {
  SoftDialogBody,
  SoftDialogContent,
  SoftDialogHeader,
} from "@/components/SoftOsDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import { OS_SUBTIPOS_MANUT, OS_SUBTIPOS_MONIT } from "@/lib/assistencia-domain";
import {
  assumeTicketFn,
  commentTicketFn,
  createTicketFn,
  forwardTicketFn,
  getTicketFn,
  getTicketsBootstrapFn,
  linkTicketMoniFn,
  listTicketMoniEmpresasFn,
  listTicketsFn,
  openOsFromTicketFn,
  reopenTicketFn,
  resolveTicketFn,
  scheduleTicketFn,
  searchTicketClientsFn,
  searchTicketMoniContasFn,
  updateTicketPrioridadeFn,
} from "@/lib/tickets";
import {
  DATE_PRESET_OPTIONS,
  inDateRange,
  resolveDatePreset,
  type DatePreset,
} from "@/lib/date-filters";
import {
  defaultSetoresForCat,
  prioridadeDotClass,
  TICKET_ATIVOS,
  TICKET_CATS,
  TICKET_PRIO_ORD,
  TICKET_PRIOS,
  ticketCatLabel,
  ticketSetorNome,
  ticketStatusLabel,
  type TicketPrio,
} from "@/lib/tickets-domain";
import { moniDetailLines, moniShortLabel } from "@/lib/moni-display";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tickets")({
  beforeLoad: () => requireModule("tickets"),
  loader: async () => getTicketsBootstrapFn(),
  head: () => ({
    meta: [{ title: `Tickets — ${APP_NAME}` }],
  }),
  component: TicketsPage,
});

type TicketRow = NonNullable<Awaited<ReturnType<typeof getTicketFn>>>;
type TicketView = "tabela" | "cards" | "calendario";

function ticketFilterDate(t: TicketRow): string {
  if (t.agDate) return t.agDate;
  if (!t.createdAt) return "";
  const d = new Date(t.createdAt);
  return Number.isNaN(d.getTime()) ? t.createdAt.slice(0, 10) : toYmd(d);
}

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR");
}

function idade(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatTicketDateBr(value: string | null | undefined) {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

function compareTicketByDate(a: TicketRow, b: TicketRow) {
  const da = a.agDate || a.agDateFirst || "";
  const db = b.agDate || b.agDateFirst || "";
  if (da && db && da !== db) return db.localeCompare(da);
  if (da && !db) return -1;
  if (!da && db) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

function compareTicketByUrgencia(a: TicketRow, b: TicketRow) {
  const pa = TICKET_PRIO_ORD[a.prioridade] ?? 9;
  const pb = TICKET_PRIO_ORD[b.prioridade] ?? 9;
  if (pa !== pb) return pa - pb;
  return compareTicketByDate(a, b);
}

function ticketStatusBadge(status: string) {
  const kind =
    status === "aberto"
      ? "yellow"
      : status === "andamento"
        ? "dark"
        : status === "encaminhado"
          ? "blue"
          : status === "resolvido"
            ? "green"
            : status === "os"
              ? "neutral"
              : "neutral";
  return (
    <span className={statusBadgeClass(kind)}>{ticketStatusLabel(status)}</span>
  );
}

function TicketsPage() {
  const boot = Route.useLoaderData();
  const { query } = useShellSearch();
  const [tickets, setTickets] = useState<TicketRow[]>(boot.tickets);
  const [queue, setQueue] = useState<"meu" | "meus" | "todos">(
    boot.user.isAdmin ? "todos" : boot.user.sectors.length ? "meu" : "meus",
  );
  const [filter, setFilter] = useState<"ativos" | "fechados" | "todos">("ativos");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setTickets(boot.tickets);
  }, [boot.tickets]);

  useEffect(() => {
    void listTicketsFn({
      data: { queue, filter, query: "" },
    })
      .then(setTickets)
      .catch(() => undefined);
  }, []);
  const [viewMode, setViewMode] = useState<TicketView>("tabela");
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const setFeedback = (text: string | null) => notifyText(text, false);
  const setFeedbackOk = (text: string) => notifyText(text, true);
  const [comment, setComment] = useState("");
  const [resolveText, setResolveText] = useState("");
  const [draftAnexos, setDraftAnexos] = useState<
    Array<{ name: string; mime: string; data: string }>
  >([]);
  const [agDateDraft, setAgDateDraft] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [cat, setCat] = useState<string>(boot.catalogs.cats[0]?.id ?? "out");
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
  const [omieAppId, setOmieAppId] = useState(boot.omieAppId);
  const [contato, setContato] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prio, setPrio] = useState<(typeof boot.catalogs.prios)[number]>("Normal");
  const [setores, setSetores] = useState<string[]>(defaultSetoresForCat(cat));
  const [listSort, setListSort] = useState<"data" | "urgencia">("urgencia");
  const [moniEmpresa, setMoniEmpresa] = useState(1);
  const [moniEmpresas, setMoniEmpresas] = useState<number[]>([1]);
  const [moniQuery, setMoniQuery] = useState("");
  const [moniSugestoes, setMoniSugestoes] = useState<
    Awaited<ReturnType<typeof searchTicketMoniContasFn>>["items"]
  >([]);
  const [buscandoMoni, setBuscandoMoni] = useState(false);
  const [selectedMoni, setSelectedMoni] = useState<{
    empresa: number;
    codigo: string;
    nome: string | null;
    idExt: string | null;
  } | null>(null);
  const [detailMoniQuery, setDetailMoniQuery] = useState("");
  const [detailMoniSugestoes, setDetailMoniSugestoes] = useState<
    Awaited<ReturnType<typeof searchTicketMoniContasFn>>["items"]
  >([]);
  const [detailMoniEmpresa, setDetailMoniEmpresa] = useState(1);
  const [buscandoDetailMoni, setBuscandoDetailMoni] = useState(false);

  useEffect(() => {
    if (!newOpen || selectedClient || clientQuery.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const rows = await searchTicketClientsFn({
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

  useEffect(() => {
    void listTicketMoniEmpresasFn()
      .then((res) => {
        setMoniEmpresa(res.defaultMoniEmpresa || 1);
        setDetailMoniEmpresa(res.defaultMoniEmpresa || 1);
        setMoniEmpresas(res.moniEmpresas.length ? res.moniEmpresas : [res.defaultMoniEmpresa || 1]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!newOpen) {
      setMoniSugestoes([]);
      return;
    }
    const q = moniQuery.trim();
    if (q.length < 1) {
      setMoniSugestoes([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setBuscandoMoni(true);
        try {
          const res = await searchTicketMoniContasFn({
            data: { query: q, empresa: moniEmpresa, limit: 30 },
          });
          setMoniSugestoes(res.items);
        } catch {
          setMoniSugestoes([]);
        } finally {
          setBuscandoMoni(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [moniQuery, moniEmpresa, newOpen]);

  const [fwdOpen, setFwdOpen] = useState(false);
  const [fwdSetores, setFwdSetores] = useState<string[]>([]);
  const [fwdRemoveMine, setFwdRemoveMine] = useState(true);

  const [osOpen, setOsOpen] = useState(false);
  const [osTipo, setOsTipo] = useState<"visita" | "manut" | "monit" | "pedido">("visita");
  const [osSub, setOsSub] = useState("");
  const [osQuote, setOsQuote] = useState("");

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDetailMoniSugestoes([]);
      return;
    }
    const q = detailMoniQuery.trim();
    if (q.length < 1) {
      setDetailMoniSugestoes([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setBuscandoDetailMoni(true);
        try {
          const res = await searchTicketMoniContasFn({
            data: { query: q, empresa: detailMoniEmpresa, limit: 30 },
          });
          setDetailMoniSugestoes(res.items);
        } catch {
          setDetailMoniSugestoes([]);
        } finally {
          setBuscandoDetailMoni(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [detailMoniQuery, detailMoniEmpresa, selected?.id]);

  useEffect(() => {
    setAgDateDraft(selected?.agDate ?? "");
  }, [selected?.id, selected?.agDate]);

  useEffect(() => {
    setComment("");
    setResolveText("");
    setDraftAnexos([]);
  }, [selected?.id]);

  async function selectTicket(id: number, opts?: { openDetail?: boolean }) {
    setSelectedId(id);
    if (opts?.openDetail !== false) setDetailOpen(true);
    try {
      const full = await getTicketFn({ data: { id } });
      if (full) {
        setTickets((prev) => {
          const idx = prev.findIndex((t) => t.id === full.id);
          if (idx < 0) return [full, ...prev];
          const copy = [...prev];
          copy[idx] = full;
          return copy;
        });
      }
    } catch {
      // lista parcial já cobre
    }
  }

  const dateRange = useMemo(
    () => resolveDatePreset(datePreset, dateFrom, dateTo),
    [datePreset, dateFrom, dateTo],
  );

  const filtersActive = Boolean(
    nameFilter.trim() ||
      tipoFilter ||
      datePreset !== "todos" ||
      dateFrom ||
      dateTo,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameQ = nameFilter.trim().toLowerCase();
    const rows = tickets.filter((t) => {
      if (q) {
        const hay = `${t.num} ${t.clientName} ${t.descricao} ${t.codigoRef ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tipoFilter && t.cat !== tipoFilter) return false;
      if (nameQ) {
        const hay = `${t.clientName} ${t.num} ${t.descricao} ${t.codigoRef ?? ""} ${t.contato ?? ""}`.toLowerCase();
        if (!hay.includes(nameQ)) return false;
      }
      if (!inDateRange(ticketFilterDate(t), dateRange.from, dateRange.to)) return false;
      return true;
    });
    return rows
      .slice()
      .sort(listSort === "urgencia" ? compareTicketByUrgencia : compareTicketByDate);
  }, [tickets, query, nameFilter, tipoFilter, dateRange, listSort]);

  const ticketCalendarItems = useMemo(
    () =>
      filtered
        .map((t) => {
          const date =
            t.agDate ||
            (t.createdAt
              ? (() => {
                  const d = new Date(t.createdAt);
                  return Number.isNaN(d.getTime())
                    ? t.createdAt.slice(0, 10)
                    : toYmd(d);
                })()
              : "");
          if (!date) return null;
          const st = ticketActivityStatus(t.status);
          return {
            id: t.id,
            date,
            title: t.clientName,
            subtitle: t.num,
            statusKey: st.key,
            statusLabel: st.label,
            barClass: st.barClass,
            meta: t.num,
            initial: activityInitial(t.respName),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null),
    [filtered],
  );

  const ticketPendingItems = useMemo(
    () =>
      filtered
        .filter((t) => !t.agDate && TICKET_ATIVOS.includes(t.status))
        .map((t) => {
          const st = ticketActivityStatus(t.status);
          return {
            id: t.id,
            date: "",
            title: `${t.num} · ${t.clientName}`,
            subtitle: ticketStatusLabel(t.status),
            statusKey: st.key,
            statusLabel: st.label,
            barClass: st.barClass,
            meta: null,
            initial: activityInitial(t.respName),
          };
        }),
    [filtered],
  );

  async function reload(nextQueue = queue, nextFilter = filter) {
    setBusy(true);
    try {
      const list = await listTicketsFn({
        data: { queue: nextQueue, filter: nextFilter, query: "" },
      });
      setTickets(list);
      if (selectedId && !list.some((t) => t.id === selectedId)) {
        // mantém seleção atual se ainda existir; senão limpa
        setSelectedId((cur) => (cur && list.some((t) => t.id === cur) ? cur : null));
      }
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<TicketRow | null | undefined>) {
    setBusy(true);
    setFeedback(null);
    try {
      const updated = await action();
      if (updated) {
        setTickets((prev) => {
          const idx = prev.findIndex((t) => t.id === updated.id);
          if (idx < 0) return [updated, ...prev];
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        });
        setSelectedId(updated.id);
      }
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Falha na ação");
    } finally {
      setBusy(false);
    }
  }

  async function onTicketFilesSelected(files: FileList | null) {
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
    if (next.length) setDraftAnexos((prev) => [...prev, ...next].slice(0, 10));
  }

  // Função de render (não componente): evita remount a cada tecla nos inputs.
  function renderTicketDetail() {
    if (!selected) return null;
    return (
      <div className="flex flex-col gap-md">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-md">
            <h2 className="inline-flex items-center gap-sm text-title-md text-on-surface">
              <span
                className={cn(
                  "inline-block size-2.5 rounded-full",
                  prioridadeDotClass(selected.prioridade),
                )}
                title={`Prioridade: ${selected.prioridade}`}
              />
              {selected.num}
            </h2>
            {ticketStatusBadge(selected.status)}
          </div>
          <p className="mt-xs text-body-md font-medium text-on-surface">{selected.clientName}</p>
          <p className="text-label-md text-on-surface-variant">
            {ticketCatLabel(selected.cat)} ·{" "}
            {selected.setores.map(ticketSetorNome).join(", ")}
          </p>
          {selected.status !== "resolvido" && selected.status !== "os" ? (
            <label className="mt-sm inline-flex items-center gap-xs text-label-md text-on-surface-variant">
              Prioridade
              <select
                value={selected.prioridade}
                disabled={busy}
                className={cn(fieldClass, "mt-0 w-auto")}
                onChange={(e) =>
                  run(() =>
                    updateTicketPrioridadeFn({
                      data: {
                        id: selected.id,
                        prioridade: e.target.value as TicketPrio,
                      },
                    }),
                  )
                }
              >
                {TICKET_PRIOS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-sm text-label-md text-on-surface-variant">
              Prioridade: {selected.prioridade}
            </p>
          )}
          {selected.agDate || selected.agDateFirst ? (
            <p className="mt-2xs text-label-md text-on-surface-variant">
              Agenda: {formatTicketDateBr(selected.agDate)}
              {selected.agDateFirst &&
              selected.agDate &&
              selected.agDateFirst !== selected.agDate
                ? ` · 1ª: ${formatTicketDateBr(selected.agDateFirst)}`
                : ""}
            </p>
          ) : null}
          {selected.contato ? (
            <p className="mt-2xs text-label-md text-on-surface-variant">
              Contato: {selected.contato}
            </p>
          ) : null}
          <p className="mt-sm whitespace-pre-wrap text-body-md text-on-surface">
            {selected.descricao}
          </p>
          {selected.osId ? (
            <Link
              to="/assistencia"
              search={{ view: "kanban" }}
              className="mt-sm inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-white px-md py-sm text-label-md font-semibold text-on-surface hover:bg-surface-container"
            >
              <Icon name="handyman" className="text-[16px]" />
              Abrir O.S. no quadro
              <Icon name="open_in_new" className="text-[16px]" />
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-xs">
          {(selected.status === "aberto" || selected.status === "encaminhado") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => assumeTicketFn({ data: { id: selected.id } }))}
              className={btnPrimary}
            >
              Assumir
            </button>
          )}
          {selected.status !== "os" &&
            selected.status !== "resolvido" &&
            boot.user.canOpenOs && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOsTipo("visita");
                  setOsSub("");
                  setOsQuote("");
                  setOsOpen(true);
                }}
                className={btnOutline}
              >
                Abrir OS
              </button>
            )}
          {selected.status !== "resolvido" && selected.status !== "os" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFwdSetores([]);
                  setFwdRemoveMine(true);
                  setFwdOpen(true);
                }}
                className={btnOutline}
              >
                Encaminhar
              </button>
              <button
                type="button"
                disabled={busy || (!resolveText.trim() && !draftAnexos.length)}
                onClick={() =>
                  run(() =>
                    resolveTicketFn({
                      data: {
                        id: selected.id,
                        texto: resolveText,
                        anexos: draftAnexos,
                      },
                    }),
                  ).then(() => {
                    setResolveText("");
                    setDraftAnexos([]);
                  })
                }
                className={btnOutline}
              >
                Resolver
              </button>
            </>
          )}
          {selected.status === "resolvido" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => reopenTicketFn({ data: { id: selected.id } }))}
              className={btnMuted}
            >
              Reabrir
            </button>
          )}
        </div>

        {selected.status !== "resolvido" && selected.status !== "os" ? (
          <label className="block text-label-md text-on-surface-variant">
            Texto da solução (para Resolver)
            <textarea
              value={resolveText}
              onChange={(e) => setResolveText(e.target.value)}
              rows={2}
              className={fieldClass}
            />
          </label>
        ) : null}

        <div className="flex flex-wrap items-end gap-xs">
          <label className="min-w-[10rem] flex-1 text-label-md text-on-surface-variant">
            Data agendada
            <input
              type="date"
              value={agDateDraft}
              onChange={(e) => setAgDateDraft(e.target.value)}
              className={fieldClass}
            />
          </label>
          <button
            type="button"
            disabled={busy || agDateDraft === (selected.agDate ?? "")}
            onClick={() =>
              run(() =>
                scheduleTicketFn({
                  data: { id: selected.id, agDate: agDateDraft || null },
                }),
              )
            }
            className={btnPrimary}
          >
            Salvar data
          </button>
          {selected.agDate ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() =>
                  scheduleTicketFn({
                    data: { id: selected.id, agDate: null },
                  }),
                ).then(() => setAgDateDraft(""))
              }
              className={btnMuted}
            >
              Limpar
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-outline-variant bg-white p-md">
          <div className="flex flex-wrap items-start justify-between gap-sm">
            <div>
              <h3 className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                Conta Moni
              </h3>
              <p className="mt-2xs text-label-sm text-on-surface-variant">
                Vincule a conta do Moni a este ticket.
              </p>
            </div>
            {selected.moniContaCodigo ? (
              <button
                type="button"
                disabled={busy}
                className={btnMuted}
                onClick={() =>
                  run(() =>
                    linkTicketMoniFn({
                      data: {
                        id: selected.id,
                        moniEmpresa: null,
                        moniContaCodigo: null,
                      },
                    }),
                  ).then(() => {
                    setDetailMoniQuery("");
                    setDetailMoniSugestoes([]);
                  })
                }
              >
                Remover
              </button>
            ) : null}
          </div>
          {selected.moniContaCodigo ? (
            <div className="mt-sm text-body-md text-on-surface">
              <p>{moniShortLabel(selected)}</p>
              {moniDetailLines(selected.moniDetalhe).map((line) => (
                <p key={line} className="text-label-md text-on-surface-variant">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="relative mt-sm grid gap-sm sm:grid-cols-[minmax(0,9rem)_1fr]">
              <label className="text-label-md text-on-surface-variant">
                Empresa
                <select
                  value={detailMoniEmpresa}
                  disabled={busy}
                  className={cn(fieldClass, "mt-xs")}
                  onChange={(e) => setDetailMoniEmpresa(Number(e.target.value) || 1)}
                >
                  {moniEmpresas.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-label-md text-on-surface-variant">
                Buscar conta
                <input
                  value={detailMoniQuery}
                  disabled={busy}
                  placeholder="Código, nome ou CNPJ"
                  className={cn(fieldClass, "mt-xs")}
                  onChange={(e) => setDetailMoniQuery(e.target.value)}
                />
              </label>
              {buscandoDetailMoni ? (
                <p className="sm:col-span-2 text-label-sm text-on-surface-variant">Buscando…</p>
              ) : null}
              {detailMoniSugestoes.length > 0 ? (
                <ul className="absolute left-0 right-0 top-full z-20 mt-xs max-h-48 overflow-auto rounded-lg border border-outline-variant bg-white shadow-lg sm:col-span-2">
                  {detailMoniSugestoes.map((conta) => (
                    <li key={`${conta.empresa}-${conta.codigo}`}>
                      <button
                        type="button"
                        className="block w-full px-md py-sm text-left text-body-md hover:bg-surface-container"
                        onClick={() =>
                          run(() =>
                            linkTicketMoniFn({
                              data: {
                                id: selected.id,
                                moniEmpresa: conta.empresa || detailMoniEmpresa,
                                moniContaCodigo: String(conta.codigo),
                                moniContaNome: conta.nome,
                                moniContaIdExt: conta.segundoCodigo,
                              },
                            }),
                          ).then(() => {
                            setDetailMoniQuery("");
                            setDetailMoniSugestoes([]);
                          })
                        }
                      >
                        Emp.{conta.empresa || detailMoniEmpresa} ·{" "}
                        {conta.segundoCodigo || conta.codigo}
                        {conta.nome ? ` · ${conta.nome}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-xs">
          <div className="flex gap-xs">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário..."
              className={cn(fieldClass, "mt-0 min-w-0 flex-1")}
            />
            <button
              type="button"
              disabled={busy || (!comment.trim() && !draftAnexos.length)}
              onClick={() =>
                run(() =>
                  commentTicketFn({
                    data: {
                      id: selected.id,
                      texto: comment,
                      anexos: draftAnexos,
                    },
                  }),
                ).then(() => {
                  setComment("");
                  setDraftAnexos([]);
                })
              }
              className={btnPrimary}
            >
              Enviar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            <label className={cn(btnMuted, "cursor-pointer")}>
              <Icon name="attach_file" className="text-[16px]" />
              Anexos
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onTicketFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {draftAnexos.length ? (
              <span className="text-label-md text-on-surface-variant">
                {draftAnexos.length} arquivo(s)
              </span>
            ) : null}
          </div>
          {draftAnexos.length ? (
            <ul className="space-y-2xs">
              {draftAnexos.map((a, idx) => (
                <li
                  key={`${a.name}-${idx}`}
                  className="flex items-center justify-between gap-xs rounded-lg border border-outline-variant bg-surface px-sm py-xs text-label-md"
                >
                  <span className="truncate">{a.name}</span>
                  <button
                    type="button"
                    className={btnMuted}
                    onClick={() =>
                      setDraftAnexos((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <h3 className="mb-sm text-label-md font-semibold text-on-surface-variant">Timeline</h3>
          <ul className="space-y-sm border-l border-outline-variant pl-md">
            {(selected.events ?? []).map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[1.15rem] top-1.5 size-2 rounded-full bg-primary" />
                <div className="text-label-sm text-on-surface-variant">
                  {formatWhen(ev.quando)} · {ev.quem}
                </div>
                <div className="text-body-md font-medium text-on-surface">{ev.titulo}</div>
                {ev.texto ? (
                  <div className="whitespace-pre-wrap text-body-md text-on-surface-variant">
                    {ev.texto}
                  </div>
                ) : null}
                {ev.anexos?.length ? (
                  <ul className="mt-xs space-y-2xs">
                    {ev.anexos.map((a, i) => (
                      <li key={`${ev.id}-${i}`}>
                        <a
                          href={a.data}
                          download={a.name}
                          className="inline-flex items-center gap-2xs text-label-md font-medium text-primary hover:underline"
                        >
                          <Icon name="attach_file" className="text-[14px]" />
                          {a.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <AppShell mobileTitle="Tickets" searchPlaceholder="Buscar ticket, cliente...">
      <div className="@container flex flex-col gap-md px-margin-mobile py-md md:px-margin-desktop md:py-lg">
        <PageTitle
          title="Tickets"
          subtitle="Filas por setor, encaminhamento e abertura de OS."
        >
          <button
            type="button"
            onClick={() => {
              setCat(boot.catalogs.cats[0]?.id ?? "out");
              setSetores(defaultSetoresForCat(boot.catalogs.cats[0]?.id ?? "out"));
              setClientQuery("");
              setSelectedClient(null);
              setClientResults([]);
              setOmieAppId(boot.omieAppId);
              setContato("");
              setDescricao("");
              setPrio("Normal");
              setSelectedMoni(null);
              setMoniQuery("");
              setMoniSugestoes([]);
              setNewOpen(true);
            }}
            className={btnPrimary}
          >
            <Icon name="add" className="text-[16px]" />
            Novo ticket
          </button>
        </PageTitle>

        <PageSection>
          <SectionHeader
            title="Tickets"
            subtitle={
              filtered.length
                ? `${filtered.length} encontrado(s)`
                : "Nenhum ticket nesta fila"
            }
          >
            <div className="flex flex-wrap gap-xs">
              {(
                [
                  ["tabela", "Tabela"],
                  ["cards", "Cards"],
                  ["calendario", "Calendário"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={cn(viewMode === id ? btnPrimary : btnOutline)}
                >
                  {label}
                </button>
              ))}
              <div className="inline-flex rounded-lg border border-outline-variant bg-white p-2xs">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-md py-xs text-label-md font-medium",
                    listSort === "data"
                      ? "bg-neutral-900 text-white"
                      : "text-on-surface-variant hover:bg-surface-container",
                  )}
                  onClick={() => setListSort("data")}
                >
                  Data
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-md py-xs text-label-md font-medium",
                    listSort === "urgencia"
                      ? "bg-neutral-900 text-white"
                      : "text-on-surface-variant hover:bg-surface-container",
                  )}
                  onClick={() => setListSort("urgencia")}
                >
                  Urgência
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(filtersOpen || filtersActive ? btnPrimary : btnOutline)}
            >
              <Icon name="filter_list" className="text-[16px]" />
              Filtros
              {filtersActive ? (
                <span className="rounded-full bg-white/25 px-xs text-label-sm">ativos</span>
              ) : null}
            </button>
            <select
              value={queue}
              onChange={(e) => {
                const id = e.target.value as "meu" | "meus" | "todos";
                setQueue(id);
                void reload(id, filter);
              }}
              className={filterControlClass}
            >
              <option value="meu">Meu setor</option>
              <option value="meus">Abertos por mim</option>
              <option value="todos">Todos</option>
            </select>
            <select
              value={filter}
              onChange={(e) => {
                const id = e.target.value as "ativos" | "fechados" | "todos";
                setFilter(id);
                void reload(queue, id);
              }}
              className={filterControlClass}
            >
              <option value="ativos">Ativos</option>
              <option value="fechados">Fechados</option>
              <option value="todos">Todos status</option>
            </select>
          </SectionHeader>

          {filtersOpen ? (
            <div className="mb-md flex flex-wrap items-end gap-md rounded-xl border border-outline-variant bg-surface-container-low p-md">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-2xs text-label-md text-on-surface-variant">
                Nome / nº
                <input
                  type="search"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Cliente, ticket, contato…"
                  className={fieldClass}
                />
              </label>
              <label className="flex min-w-[12rem] flex-col gap-2xs text-label-md text-on-surface-variant">
                Tipo
                <select
                  value={tipoFilter}
                  onChange={(e) => setTipoFilter(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Todos</option>
                  {TICKET_CATS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[10rem] flex-col gap-2xs text-label-md text-on-surface-variant">
                Data
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                  className={fieldClass}
                >
                  {DATE_PRESET_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {datePreset === "personalizado" ? (
                <>
                  <label className="flex flex-col gap-2xs text-label-md text-on-surface-variant">
                    De
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="flex flex-col gap-2xs text-label-md text-on-surface-variant">
                    Até
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                </>
              ) : null}
              {filtersActive ? (
                <button
                  type="button"
                  className={btnMuted}
                  onClick={() => {
                    setNameFilter("");
                    setTipoFilter("");
                    setDatePreset("todos");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : null}

          {viewMode === "calendario" ? (
            <ActivitiesCalendar
              items={ticketCalendarItems}
              pendingItems={ticketPendingItems}
              legend={TICKET_ACTIVITY_LEGEND}
              month={calMonth}
              onMonthChange={setCalMonth}
              onSelect={(id) => {
                void selectTicket(id);
              }}
              onCreate={() => {
                setCat(boot.catalogs.cats[0]?.id ?? "out");
                setSetores(defaultSetoresForCat(boot.catalogs.cats[0]?.id ?? "out"));
                setClientQuery("");
                setSelectedClient(null);
                setClientResults([]);
                setOmieAppId(boot.omieAppId);
                setContato("");
                setDescricao("");
                setPrio("Normal");
                setSelectedMoni(null);
                setMoniQuery("");
                setMoniSugestoes([]);
                setNewOpen(true);
              }}
              createLabel="+ Novo ticket"
            />
          ) : filtered.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Nenhum ticket encontrado.</p>
          ) : viewMode === "cards" ? (
            <div className="space-y-sm">
              {filtered.map((t) => {
                const moni = moniShortLabel(t);
                return (
                  <article key={t.id} className={mobileCardClass}>
                    <div className="flex items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-xs text-title-md text-primary">
                          <span
                            className={cn(
                              "inline-block size-2.5 rounded-full",
                              prioridadeDotClass(t.prioridade),
                            )}
                            title={`Prioridade: ${t.prioridade}`}
                          />
                          {t.num}
                        </p>
                        <p className="truncate text-body-md text-on-surface">{t.clientName}</p>
                        <div className="mt-xs flex flex-col gap-2xs">
                          <div className="flex flex-wrap items-center gap-xs">
                            {ticketStatusBadge(t.status)}
                            <span className="text-label-md text-on-surface-variant">
                              {t.prioridade} · {idade(t.createdAt)}
                            </span>
                          </div>
                          {t.agDate || t.agDateFirst ? (
                            <div className="text-label-sm leading-tight text-on-surface-variant">
                              <div>{formatTicketDateBr(t.agDate)}</div>
                              {t.agDateFirst &&
                              t.agDate &&
                              t.agDateFirst !== t.agDate ? (
                                <div className="text-[11px] opacity-80">
                                  {formatTicketDateBr(t.agDateFirst)}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {moni ? (
                            <div className="text-label-sm text-on-surface-variant">
                              <div>Moni · {moni}</div>
                              {moniDetailLines(t.moniDetalhe)
                                .slice(0, 2)
                                .map((line) => (
                                  <div key={line} className="text-[11px] opacity-80">
                                    {line}
                                  </div>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => void selectTicket(t.id)}
                      >
                        <Icon name="visibility" className="text-[16px]" />
                        Ver
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-body-md">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableHeadCellClass}>Nº</th>
                    <th className={tableHeadCellClass}>Cliente</th>
                    <th className={tableHeadCellClass}>Status</th>
                    <th className={tableHeadCellClass}>Prioridade</th>
                    <th className={tableHeadCellClass}>Agenda</th>
                    <th className={tableHeadCellClass}>Moni</th>
                    <th className={tableHeadCellClass}>Categoria</th>
                    <th className={tableHeadCellClass}>Setores</th>
                    <th className={tableHeadCellClass}>Idade</th>
                    <th className={tableHeadCellClass}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const moni = moniShortLabel(t);
                    return (
                      <tr key={t.id} className="border-t border-outline-variant">
                        <td className="px-sm py-xs font-medium">
                          <span className="inline-flex items-center gap-xs">
                            <span
                              className={cn(
                                "inline-block size-2.5 rounded-full",
                                prioridadeDotClass(t.prioridade),
                              )}
                              title={`Prioridade: ${t.prioridade}`}
                            />
                            {t.num}
                          </span>
                        </td>
                        <td className="px-sm py-xs">{t.clientName}</td>
                        <td className="px-sm py-xs">{ticketStatusBadge(t.status)}</td>
                        <td className="px-sm py-xs">{t.prioridade}</td>
                        <td className="px-sm py-xs text-on-surface-variant">
                          <div className="leading-tight">
                            <div>{formatTicketDateBr(t.agDate)}</div>
                            {t.agDateFirst &&
                            t.agDate &&
                            t.agDateFirst !== t.agDate ? (
                              <div className="text-[11px] opacity-80">
                                {formatTicketDateBr(t.agDateFirst)}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-sm py-xs text-on-surface-variant">
                          {moni ? (
                            <div className="leading-tight">
                              <div className="max-w-[14rem] truncate" title={moni}>
                                {moni}
                              </div>
                              {moniDetailLines(t.moniDetalhe)
                                .slice(0, 1)
                                .map((line) => (
                                  <div key={line} className="text-[11px] opacity-80">
                                    {line}
                                  </div>
                                ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-sm py-xs">{ticketCatLabel(t.cat)}</td>
                        <td className="px-sm py-xs text-on-surface-variant">
                          {t.setores.map(ticketSetorNome).join(", ")}
                        </td>
                        <td className="px-sm py-xs text-on-surface-variant">
                          {idade(t.createdAt)}
                        </td>
                        <td className="px-sm py-xs">
                          <button
                            type="button"
                            className={btnOutline}
                            onClick={() => void selectTicket(t.id)}
                          >
                            <Icon name="visibility" className="text-[16px]" />
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PageSection>
      </div>

      <Dialog
        open={detailOpen && Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
          }
        }}
      >
        <SoftDialogContent size="xl" className="max-h-[92vh] overflow-hidden">
          <SoftDialogHeader eyebrow="TICKETS" title={selected?.num ?? "Ticket"} />
          <SoftDialogBody className="max-h-[min(78vh,52rem)] overflow-y-auto">
            {selected ? (
              renderTicketDetail()
            ) : (
              <p className="text-body-md text-on-surface-variant">Carregando ticket…</p>
            )}
          </SoftDialogBody>
        </SoftDialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="dialog-lg">
          <DialogHeader>
            <DialogTitle>Novo ticket</DialogTitle>
          </DialogHeader>
          <div className="grid gap-lg sm:grid-cols-2">
            <label className="block text-label-md text-on-surface-variant sm:col-span-2">
              Assunto
              <select
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  setSetores(defaultSetoresForCat(e.target.value));
                }}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              >
                {boot.catalogs.cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

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
              {selectedClient ? (
                <div className="mt-xs flex items-center justify-between gap-sm rounded-lg bg-surface-container/50 px-md py-sm">
                  <div className="min-w-0">
                    <p className="truncate text-body-md text-on-surface">{selectedClient.nome}</p>
                    <p className="text-label-md text-on-surface-variant">
                      Código {selectedClient.codigo}
                      {selectedClient.cnpjCpf ? ` · ${selectedClient.cnpjCpf}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-label-md font-semibold text-primary"
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
                    onChange={(e) => setClientQuery(e.target.value)}
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
                              if (!contato.trim() && client.contato) setContato(client.contato);
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
              Contato
              <input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Prioridade
              <select
                value={prio}
                onChange={(e) => setPrio(e.target.value as typeof prio)}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              >
                {boot.catalogs.prios.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2 rounded-xl border border-outline-variant p-md">
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div>
                  <p className="text-label-md font-semibold text-on-surface">Conta Moni</p>
                  <p className="text-label-sm text-on-surface-variant">
                    Opcional — vincule ao abrir o ticket.
                  </p>
                </div>
                {selectedMoni ? (
                  <button
                    type="button"
                    className="text-label-md font-semibold text-primary"
                    onClick={() => {
                      setSelectedMoni(null);
                      setMoniQuery("");
                    }}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              {selectedMoni ? (
                <p className="mt-sm text-body-md text-on-surface">
                  Emp.{selectedMoni.empresa} · {selectedMoni.idExt || selectedMoni.codigo}
                  {selectedMoni.nome ? ` · ${selectedMoni.nome}` : ""}
                </p>
              ) : (
                <div className="relative mt-sm grid gap-sm sm:grid-cols-[minmax(0,9rem)_1fr]">
                  <label className="text-label-md text-on-surface-variant">
                    Empresa
                    <select
                      value={moniEmpresa}
                      className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                      onChange={(e) => setMoniEmpresa(Number(e.target.value) || 1)}
                    >
                      {moniEmpresas.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-label-md text-on-surface-variant">
                    Buscar conta
                    <input
                      value={moniQuery}
                      placeholder="Código, nome ou CNPJ"
                      className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
                      onChange={(e) => setMoniQuery(e.target.value)}
                    />
                  </label>
                  {buscandoMoni ? (
                    <p className="sm:col-span-2 text-label-sm text-on-surface-variant">Buscando…</p>
                  ) : null}
                  {moniSugestoes.length > 0 ? (
                    <ul className="absolute left-0 right-0 top-full z-30 mt-xs max-h-48 overflow-auto rounded-lg border border-outline-variant bg-white shadow-lg sm:col-span-2">
                      {moniSugestoes.map((conta) => (
                        <li key={`${conta.empresa}-${conta.codigo}`}>
                          <button
                            type="button"
                            className="block w-full px-md py-sm text-left text-body-md hover:bg-surface-container"
                            onClick={() => {
                              setSelectedMoni({
                                empresa: conta.empresa || moniEmpresa,
                                codigo: String(conta.codigo),
                                nome: conta.nome,
                                idExt: conta.segundoCodigo,
                              });
                              setMoniQuery("");
                              setMoniSugestoes([]);
                            }}
                          >
                            Emp.{conta.empresa || moniEmpresa} ·{" "}
                            {conta.segundoCodigo || conta.codigo}
                            {conta.nome ? ` · ${conta.nome}` : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="text-label-md text-on-surface-variant">Setores *</legend>
              <div className="mt-sm flex flex-wrap gap-sm">
                {boot.catalogs.setores.map((s) => {
                  const on = setores.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "cursor-pointer rounded-full px-md py-xs text-label-md transition",
                        on
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() =>
                          setSetores((prev) =>
                            on ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                          )
                        }
                      />
                      {s.nome}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="block text-label-md text-on-surface-variant sm:col-span-2">
              Descrição *
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                className="mt-xs w-full rounded-lg border border-outline-variant/70 bg-surface px-md py-sm text-body-md"
              />
            </label>
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
                busy || !selectedClient || !descricao.trim() || !setores.length
              }
              onClick={async () => {
                if (!selectedClient) return;
                setBusy(true);
                setFeedback(null);
                try {
                  const created = await createTicketFn({
                    data: {
                      cat,
                      clientName: selectedClient.nome,
                      clientCode: selectedClient.codigo,
                      omieAppId: omieAppId || null,
                      contato,
                      descricao,
                      prioridade: prio,
                      setores,
                      ...(selectedMoni
                        ? {
                            moniEmpresa: selectedMoni.empresa,
                            moniContaCodigo: selectedMoni.codigo,
                            moniContaNome: selectedMoni.nome,
                            moniContaIdExt: selectedMoni.idExt,
                          }
                        : {}),
                    },
                  });
                  if (created) {
                    setTickets((prev) => [
                      created,
                      ...prev.filter((t) => t.id !== created.id),
                    ]);
                    setSelectedId(created.id);
                    setDetailOpen(true);
                    setFilter("ativos");
                  }
                  setNewOpen(false);
                  await reload(queue, "ativos");
                } catch (e) {
                  setFeedback(e instanceof Error ? e.message : "Falha ao criar ticket");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              Abrir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fwdOpen} onOpenChange={setFwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encaminhar</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-sm">
            {boot.catalogs.setores.map((s) => {
              const on = fwdSetores.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={cn(
                    "cursor-pointer rounded-lg border px-sm py-xs text-label-md",
                    on ? "border-primary bg-primary/10 text-primary" : "border-outline-variant",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() =>
                      setFwdSetores((prev) =>
                        on ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                  />
                  {s.nome}
                </label>
              );
            })}
          </div>
          <label className="mt-md flex items-center gap-sm text-label-md">
            <input
              type="checkbox"
              checked={fwdRemoveMine}
              onChange={(e) => setFwdRemoveMine(e.target.checked)}
            />
            Remover meus setores
          </label>
          <DialogFooter>
            <button
              type="button"
              disabled={busy || !selected || !fwdSetores.length}
              onClick={async () => {
                if (!selected) return;
                await run(() =>
                  forwardTicketFn({
                    data: {
                      id: selected.id,
                      addSetores: fwdSetores,
                      removeMine: fwdRemoveMine,
                    },
                  }),
                );
                setFwdOpen(false);
              }}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              Encaminhar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={osOpen} onOpenChange={setOsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir OS a partir do ticket</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-md">
            <label className="text-label-md text-on-surface-variant">
              Tipo
              <select
                value={osTipo}
                onChange={(e) => {
                  setOsTipo(e.target.value as typeof osTipo);
                  setOsSub("");
                }}
                className="mt-xs w-full rounded-lg border border-outline-variant px-md py-sm"
              >
                <option value="visita">Orçamento · visita</option>
                <option value="manut">Manutenção</option>
                <option value="monit">Monitoramento</option>
                <option value="pedido">Pedido aprovado</option>
              </select>
            </label>
            {osTipo === "manut" ? (
              <label className="text-label-md text-on-surface-variant">
                Subtipo
                <select
                  value={osSub}
                  onChange={(e) => setOsSub(e.target.value)}
                  className="mt-xs w-full rounded-lg border border-outline-variant px-md py-sm"
                >
                  <option value="">Selecione...</option>
                  {OS_SUBTIPOS_MANUT.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {osTipo === "monit" ? (
              <label className="text-label-md text-on-surface-variant">
                Subtipo
                <select
                  value={osSub}
                  onChange={(e) => setOsSub(e.target.value)}
                  className="mt-xs w-full rounded-lg border border-outline-variant px-md py-sm"
                >
                  <option value="">Selecione...</option>
                  {OS_SUBTIPOS_MONIT.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {osTipo === "pedido" ? (
              <label className="text-label-md text-on-surface-variant">
                Nº orçamento
                <input
                  value={osQuote}
                  onChange={(e) => setOsQuote(e.target.value)}
                  className="mt-xs w-full rounded-lg border border-outline-variant px-md py-sm"
                  placeholder="ORC-2026-00001"
                />
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <button
              type="button"
              disabled={
                busy ||
                !selected ||
                ((osTipo === "manut" || osTipo === "monit") && !osSub) ||
                (osTipo === "pedido" && !osQuote.trim())
              }
              onClick={async () => {
                if (!selected) return;
                setBusy(true);
                setFeedback(null);
                try {
                  const result = await openOsFromTicketFn({
                    data: {
                      ticketId: selected.id,
                      tipo: osTipo,
                      subtipo: osSub || null,
                      quoteNumero: osQuote || null,
                    },
                  });
                  if (result.ticket) {
                    setTickets((prev) =>
                      prev.map((t) => (t.id === result.ticket!.id ? result.ticket! : t)),
                    );
                  }
                  setOsOpen(false);
                  setFeedbackOk(result.os ? `OS ${result.os.num} criada.` : "OS vinculada.");
                } catch (e) {
                  setFeedback(e instanceof Error ? e.message : "Falha ao abrir OS");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              Criar OS
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
