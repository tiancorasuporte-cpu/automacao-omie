import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { paginateList, TablePager } from "@/components/TablePager";
import {
  getNotificationSettingsFn,
  getOmieAppsFn,
  getDueItemBoletoViewFn,
  listDueItemsFn,
  sendDueItemNotificationFn,
  sendSelectedDueItemsFn,
} from "@/lib/omie";
import { isAdmin, requireModule } from "@/lib/require-auth";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { DueItem, DueItemType } from "@/db/schema";

const PAGE_SIZE = 15;

const TYPE_LABELS = {
  boleto: "Boleto",
  nfe: "NF-e",
  nfse: "NFS-e",
} as const;

type TypeFilter = "all" | DueItemType;

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

export const Route = createFileRoute("/vencimentos")({
  validateSearch: searchSchema,
  beforeLoad: () => requireModule("vencimentos"),
  loader: async () => {
    const [items, apps, notifySettings] = await Promise.all([
      listDueItemsFn(),
      getOmieAppsFn(),
      getNotificationSettingsFn().catch(() => null),
    ]);
    return { items, apps, notifySettings };
  },
  head: () => ({
    meta: [{ title: `Vencimentos — ${APP_NAME}` }],
  }),
  component: VencimentosPage,
});

function formatDate(value: string | Date) {
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toIso = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  return { from: toIso(start), to: toIso(end) };
}

function currentMonthLabel() {
  const now = new Date();
  return now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function matchesText(value: string | null | undefined, filter: string) {
  if (!filter.trim()) return true;
  return String(value ?? "")
    .toLowerCase()
    .includes(filter.trim().toLowerCase());
}

function downloadPdfBase64(filename: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function dueTone(dueDate: string) {
  const today = todayIso();
  if (dueDate < today) return "overdue" as const;
  if (dueDate === today) return "today" as const;
  return "upcoming" as const;
}

function TypeBadge({ type }: { type: DueItemType }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-sm py-xs text-label-md font-medium",
        type === "boleto" && "bg-primary-container/40 text-primary",
        type === "nfe" && "bg-secondary-container/50 text-on-secondary-container",
        type === "nfse" && "bg-tertiary-container/50 text-on-tertiary-container",
      )}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "ok";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-md py-md",
        tone === "warn" && "border-error/30 bg-error-container/15",
        tone === "ok" && "border-secondary-container/50 bg-secondary-container/20",
        tone === "default" && "border-outline-variant bg-surface-container-lowest",
      )}
    >
      <p className="text-label-md text-on-surface-variant">{label}</p>
      <p
        className={cn(
          "mt-xs text-headline-md font-semibold tracking-tight",
          tone === "warn" ? "text-error" : "text-primary",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-xs text-label-md text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

function VencimentosPage() {
  const { items, apps, notifySettings } = Route.useLoaderData();
  const testMode = Boolean(notifySettings?.testModeEnabled);
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const admin = isAdmin(user);
  const { page: urlPage } = Route.useSearch();
  const { query } = useShellSearch();
  const [appFilter, setAppFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [clientFilter, setClientFilter] = useState("");
  const [documentFilter, setDocumentFilter] = useState("");
  const monthRange = useMemo(() => currentMonthRange(), []);
  const [dueFrom, setDueFrom] = useState(monthRange.from);
  const [dueTo, setDueTo] = useState(monthRange.to);
  const [issueFrom, setIssueFrom] = useState("");
  const [issueTo, setIssueTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const busy = sendingId !== null || bulkSending || viewingId !== null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (appFilter !== "all" && item.omieAppId !== appFilter) return false;
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      if (!matchesText(item.clientName, clientFilter)) return false;
      if (!matchesText(item.documentNumber, documentFilter)) return false;
      if (dueFrom && item.dueDate < dueFrom) return false;
      if (dueTo && item.dueDate > dueTo) return false;
      if (issueFrom || issueTo) {
        if (!item.issueDate) return false;
        if (issueFrom && item.issueDate < issueFrom) return false;
        if (issueTo && item.issueDate > issueTo) return false;
      }
      if (!q) return true;
      return [item.clientName, item.documentNumber, item.omieAppName, item.clientPhone]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(q));
    });
  }, [
    items,
    query,
    appFilter,
    typeFilter,
    clientFilter,
    documentFilter,
    dueFrom,
    dueTo,
    issueFrom,
    issueTo,
  ]);

  const hasActiveFilters =
    appFilter !== "all" ||
    typeFilter !== "all" ||
    clientFilter.trim() !== "" ||
    documentFilter.trim() !== "" ||
    dueFrom !== monthRange.from ||
    dueTo !== monthRange.to ||
    issueFrom !== "" ||
    issueTo !== "";

  const summary = useMemo(() => {
    const today = todayIso();
    let overdue = 0;
    let todayCount = 0;
    let total = 0;
    for (const item of filtered) {
      total += item.amount ?? 0;
      if (item.dueDate < today) overdue += 1;
      else if (item.dueDate === today) todayCount += 1;
    }
    return { count: filtered.length, overdue, todayCount, total };
  }, [filtered]);

  const pagination = useMemo(
    () => paginateList(filtered, urlPage, PAGE_SIZE),
    [filtered, urlPage],
  );

  const pageIds = useMemo(
    () => pagination.items.map((item) => item.id),
    [pagination.items],
  );
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const allPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  useEffect(() => {
    if (urlPage > pagination.totalPages) {
      navigate({ search: { page: pagination.totalPages }, replace: true });
    }
  }, [urlPage, pagination.totalPages, navigate]);

  useEffect(() => {
    navigate({ search: { page: 1 }, replace: true });
  }, [query, navigate]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [query, appFilter, typeFilter, clientFilter, documentFilter, dueFrom, dueTo, issueFrom, issueTo]);

  const setPage = (nextPage: number) => {
    navigate({ search: { page: nextPage } });
  };

  const resetFilters = () => {
    setAppFilter("all");
    setTypeFilter("all");
    setClientFilter("");
    setDocumentFilter("");
    setDueFrom(monthRange.from);
    setDueTo(monthRange.to);
    setIssueFrom("");
    setIssueTo("");
    setPage(1);
  };

  async function viewDocument(item: DueItem) {
    setViewingId(item.id);
    setFeedback(null);
    try {
      const result = await getDueItemBoletoViewFn({
        data: { dueItemId: item.id },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      if (result.mode === "link") {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return;
      }
      downloadPdfBase64(result.filename, result.base64);
    } finally {
      setViewingId(null);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  async function sendAlert(item: DueItem) {
    setSendingId(item.id);
    setFeedback(null);
    try {
      const result = await sendDueItemNotificationFn({
        data: { dueItemId: item.id },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      const warn =
        result.errors.length > 0 ? ` Avisos: ${result.errors.join("; ")}` : "";
      setFeedback({
        type: "ok",
        text: result.testMode
          ? `Enviado em modo teste para ${result.sentPhones} número(s).${warn}`
          : `Alerta enviado para ${result.sentPhones} número(s).${warn}`,
      });
      await router.invalidate();
    } finally {
      setSendingId(null);
    }
  }

  async function sendSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkSending(true);
    setFeedback(null);
    try {
      const result = await sendSelectedDueItemsFn({
        data: { dueItemIds: ids },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      const warn =
        result.errors.length > 0 ? ` Avisos: ${result.errors.join("; ")}` : "";
      setFeedback({
        type: "ok",
        text: result.testMode
          ? `MODO TESTE: ${result.sent} doc(s) · ${result.contacts ?? "?"} msg(s) só no número de teste.${warn}`
          : `Lote enviado: ${result.sent} documento(s) · ${result.contacts ?? "?"} contato(s).${warn}`,
      });
      setSelectedIds(new Set());
      await router.invalidate();
    } finally {
      setBulkSending(false);
    }
  }

  const inputClass =
    "mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary outline-none transition-colors focus:border-outline";

  return (
    <AppShell mobileTitle="Vencimentos" searchPlaceholder="Busca rápida (cliente, documento, telefone)...">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-7xl space-y-lg">
          <div className="flex w-full flex-col gap-md sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-label-md uppercase tracking-wider text-on-surface-variant">
                Cobrança
              </p>
              <h2 className="mt-xs text-headline-lg tracking-tight text-primary">Vencimentos</h2>
              <p className="mt-base text-body-md text-on-surface-variant">
                Documentos em aberto · padrão{" "}
                <span className="font-medium text-primary">{currentMonthLabel()}</span>
              </p>
              {testMode ? (
                <p className="mt-sm rounded-lg border border-error/30 bg-error-container/25 px-md py-sm text-body-md text-error">
                  Modo teste ativo — envios vão só para{" "}
                  <span className="font-semibold tabular-nums">
                    {notifySettings?.testNotifyPhone || "o número de teste"}
                  </span>
                  , não para os clientes. Desligue em Configurações para envio real.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className="inline-flex shrink-0 items-center gap-xs rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm text-label-md text-primary hover:bg-surface-container-high"
            >
              <Icon name="tune" className="text-[18px]" />
              {filtersOpen ? "Ocultar filtros" : "Filtros"}
              {hasActiveFilters ? (
                <span className="ml-xs rounded-full bg-secondary-container px-sm py-px text-[0.65rem] font-bold text-on-secondary-container">
                  on
                </span>
              ) : null}
            </button>
          </div>

          <div className="grid gap-sm sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Documentos" value={String(summary.count)} hint="Com os filtros atuais" />
            <StatCard label="Valor total" value={formatMoney(summary.total)} />
            <StatCard
              label="Vencem hoje"
              value={String(summary.todayCount)}
              tone={summary.todayCount > 0 ? "ok" : "default"}
            />
            <StatCard
              label="Em atraso"
              value={String(summary.overdue)}
              tone={summary.overdue > 0 ? "warn" : "default"}
            />
          </div>

          {filtersOpen ? (
            <section className="space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
              <div className="flex flex-wrap gap-xs">
                {(
                  [
                    ["all", "Todos"],
                    ["boleto", "Boleto"],
                    ["nfe", "NF-e"],
                    ["nfse", "NFS-e"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setTypeFilter(value);
                      setPage(1);
                    }}
                    className={cn(
                      "rounded-full px-md py-xs text-label-md transition-colors",
                      typeFilter === value
                        ? "bg-secondary-container font-semibold text-on-secondary-container"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-sm md:grid-cols-2 lg:grid-cols-4">
                <label className="block text-label-md text-on-surface-variant">
                  Cliente
                  <input
                    value={clientFilter}
                    onChange={(event) => {
                      setClientFilter(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Nome do cliente"
                    className={inputClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Nº do documento
                  <input
                    value={documentFilter}
                    onChange={(event) => {
                      setDocumentFilter(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Ex.: 130"
                    className={inputClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Empresa
                  <select
                    value={appFilter}
                    onChange={(event) => {
                      setAppFilter(event.target.value);
                      setPage(1);
                    }}
                    className={inputClass}
                  >
                    <option value="all">Todas</option>
                    {apps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-secondary hover:bg-surface-container-high"
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-sm border-t border-outline-variant/70 pt-md md:grid-cols-2 lg:grid-cols-4">
                <label className="block text-label-md text-on-surface-variant">
                  Vencimento de
                  <input
                    type="date"
                    value={dueFrom}
                    onChange={(event) => {
                      setDueFrom(event.target.value);
                      setPage(1);
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Vencimento até
                  <input
                    type="date"
                    value={dueTo}
                    onChange={(event) => {
                      setDueTo(event.target.value);
                      setPage(1);
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Emissão de
                  <input
                    type="date"
                    value={issueFrom}
                    onChange={(event) => {
                      setIssueFrom(event.target.value);
                      setPage(1);
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Emissão até
                  <input
                    type="date"
                    value={issueTo}
                    onChange={(event) => {
                      setIssueTo(event.target.value);
                      setPage(1);
                    }}
                    className={inputClass}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {feedback ? (
            <p
              className={cn(
                "rounded-lg px-md py-sm text-body-md",
                feedback.type === "ok"
                  ? "bg-secondary-fixed/30 text-primary"
                  : "bg-error-container/30 text-error",
              )}
            >
              {feedback.text}
            </p>
          ) : null}

          {admin && selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-sm rounded-xl border border-secondary-container/60 bg-secondary-container/25 px-md py-sm">
              <p className="text-body-md text-primary">
                <span className="font-semibold tabular-nums">{selectedIds.size}</span>{" "}
                documento(s) selecionado(s)
              </p>
              <div className="flex flex-wrap gap-xs">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
                >
                  Limpar seleção
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendSelected()}
                  className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container hover:opacity-90 disabled:opacity-50"
                >
                  <Icon name={bulkSending ? "hourglass_empty" : "send"} className="text-[16px]" />
                  {bulkSending ? "Enviando..." : "Enviar selecionados"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-body-md">
                <thead className="sticky top-0 z-10 border-b border-outline-variant bg-surface-container-low/95 backdrop-blur">
                  <tr>
                    {admin ? (
                      <th className="w-10 px-md py-sm">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          disabled={pageIds.length === 0 || busy}
                          onChange={toggleSelectPage}
                          aria-label="Selecionar página"
                          className="size-4 accent-[var(--color-secondary)]"
                        />
                      </th>
                    ) : null}
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Tipo</th>
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Cliente</th>
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Documento</th>
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Emissão</th>
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Vencimento</th>
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Empresa</th>
                    <th className="px-md py-sm text-right text-label-md font-medium text-on-surface-variant">
                      Valor
                    </th>
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Contato</th>
                    <th className="px-md py-sm text-label-md font-medium text-on-surface-variant">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={admin ? 10 : 9}
                        className="px-md py-2xl text-center text-on-surface-variant"
                      >
                        {items.length === 0
                          ? "Nenhum documento na janela sincronizada. Configure os apps Omie e sincronize."
                          : "Nenhum resultado para os filtros aplicados."}
                      </td>
                    </tr>
                  ) : (
                    pagination.items.map((item) => {
                      const tone = dueTone(item.dueDate);
                      const selected = selectedIds.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            "border-b border-outline-variant/50 transition-colors hover:bg-surface-container-low/70",
                            selected && "bg-secondary-container/20",
                          )}
                        >
                          {admin ? (
                            <td className="px-md py-sm">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={busy}
                                onChange={() => toggleSelected(item.id)}
                                aria-label={`Selecionar ${item.clientName ?? item.documentNumber ?? item.id}`}
                                className="size-4 accent-[var(--color-secondary)]"
                              />
                            </td>
                          ) : null}
                          <td className="px-md py-sm">
                            <TypeBadge type={item.itemType} />
                          </td>
                          <td className="max-w-[14rem] px-md py-sm">
                            <p className="truncate font-medium text-primary">
                              {item.clientName ?? "—"}
                            </p>
                          </td>
                          <td className="px-md py-sm tabular-nums text-on-surface">
                            {item.documentNumber ?? "—"}
                          </td>
                          <td className="px-md py-sm text-on-surface-variant">
                            {item.issueDate ? formatDate(item.issueDate) : "—"}
                          </td>
                          <td className="px-md py-sm">
                            <span
                              className={cn(
                                "inline-flex rounded-md px-sm py-xs text-label-md font-semibold tabular-nums",
                                tone === "overdue" && "bg-error-container/40 text-error",
                                tone === "today" && "bg-secondary-container/60 text-on-secondary-container",
                                tone === "upcoming" && "text-primary",
                              )}
                            >
                              {formatDate(item.dueDate)}
                            </span>
                          </td>
                          <td className="px-md py-sm text-on-surface-variant">{item.omieAppName}</td>
                          <td className="px-md py-sm text-right font-medium tabular-nums text-primary">
                            {formatMoney(item.amount)}
                          </td>
                          <td className="px-md py-sm">
                            <div className="flex flex-col gap-0.5">
                              {item.notifiedAt ? (
                                <span className="text-label-md text-secondary">Pré-vencimento</span>
                              ) : item.clientPhone ? (
                                <span className="text-label-md text-on-surface-variant">
                                  {item.clientPhone}
                                </span>
                              ) : (
                                <span className="text-label-md text-error">Sem telefone</span>
                              )}
                              {item.overdueNotifiedAt ? (
                                <span className="text-label-md text-error">Atraso alertado</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-md py-sm">
                            <div className="flex flex-wrap gap-xs">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => viewDocument(item)}
                                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
                                title={
                                  item.itemType === "boleto"
                                    ? "Abrir boleto"
                                    : `Baixar ${TYPE_LABELS[item.itemType]}`
                                }
                              >
                                <Icon
                                  name={
                                    viewingId === item.id
                                      ? "hourglass_empty"
                                      : item.itemType === "boleto"
                                        ? "picture_as_pdf"
                                        : "download"
                                  }
                                  className="text-[16px]"
                                />
                                {viewingId === item.id
                                  ? "..."
                                  : item.itemType === "boleto"
                                    ? "Boleto"
                                    : "PDF"}
                              </button>
                              {admin ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => sendAlert(item)}
                                  className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container hover:opacity-90 disabled:opacity-50"
                                  title="Enviar alerta WhatsApp"
                                >
                                  <Icon
                                    name={sendingId === item.id ? "hourglass_empty" : "send"}
                                    className="text-[16px]"
                                  />
                                  {sendingId === item.id ? "..." : "Enviar"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <TablePager
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
