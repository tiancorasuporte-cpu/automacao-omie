import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { paginateList, TablePager } from "@/components/TablePager";
import { getOmieAppsFn, getDueItemBoletoViewFn, listDueItemsFn, sendDueItemNotificationFn } from "@/lib/omie";
import { isAdmin, requireAuth } from "@/lib/require-auth";
import { APP_NAME } from "@/lib/brand";
import type { DueItemType } from "@/db/schema";

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
  beforeLoad: requireAuth,
  loader: async () => {
    const [items, apps] = await Promise.all([listDueItemsFn(), getOmieAppsFn()]);
    return { items, apps };
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

function VencimentosPage() {
  const { items, apps } = Route.useLoaderData();
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
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (appFilter !== "all" && item.omieAppId !== appFilter) return false;
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      if (!matchesText(item.clientName, clientFilter)) return false;
      if (!matchesText(item.documentNumber, documentFilter)) return false;
      if (dueFrom && item.dueDate < dueFrom) return false;
      if (dueTo && item.dueDate > dueTo) return false;
      if (!q) return true;
      return [item.clientName, item.documentNumber, item.omieAppName, item.clientPhone]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(q));
    });
  }, [items, query, appFilter, typeFilter, clientFilter, documentFilter, dueFrom, dueTo]);

  const hasActiveFilters =
    appFilter !== "all" ||
    typeFilter !== "all" ||
    clientFilter.trim() !== "" ||
    documentFilter.trim() !== "" ||
    dueFrom !== "" ||
    dueTo !== "";

  const pagination = useMemo(
    () => paginateList(filtered, urlPage, PAGE_SIZE),
    [filtered, urlPage],
  );

  useEffect(() => {
    if (urlPage > pagination.totalPages) {
      navigate({ search: { page: pagination.totalPages }, replace: true });
    }
  }, [urlPage, pagination.totalPages, navigate]);

  useEffect(() => {
    navigate({ search: { page: 1 }, replace: true });
  }, [query, navigate]);

  const setPage = (nextPage: number) => {
    navigate({ search: { page: nextPage } });
  };

  const resetFilters = () => {
    setAppFilter("all");
    setTypeFilter("all");
    setClientFilter("");
    setDocumentFilter("");
    setDueFrom("");
    setDueTo("");
    setPage(1);
  };

  return (
    <AppShell mobileTitle="Vencimentos" searchPlaceholder="Busca rápida (cliente, documento, telefone)...">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <div>
            <h2 className="text-headline-lg tracking-tight text-primary">Vencimentos</h2>
            <p className="mt-base text-body-lg text-on-surface-variant">
              Boletos, NF-e e NFS-e em aberto com vencimento em{" "}
              <span className="font-medium capitalize text-primary">{currentMonthLabel()}</span>.
            </p>
          </div>

          <div className="grid gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md md:grid-cols-2 lg:grid-cols-3">
            <label className="block text-label-md text-on-surface-variant">
              Cliente
              <input
                value={clientFilter}
                onChange={(event) => {
                  setClientFilter(event.target.value);
                  setPage(1);
                }}
                placeholder="Nome do cliente"
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary"
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
                placeholder="Ex.: 130 ou chave NF-e"
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary"
              />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Tipo
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as TypeFilter);
                  setPage(1);
                }}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary"
              >
                <option value="all">Todos</option>
                {(Object.keys(TYPE_LABELS) as DueItemType[]).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Empresa
              <select
                value={appFilter}
                onChange={(event) => {
                  setAppFilter(event.target.value);
                  setPage(1);
                }}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary"
              >
                <option value="all">Todas</option>
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Vencimento de
              <input
                type="date"
                value={dueFrom}
                onChange={(event) => {
                  setDueFrom(event.target.value);
                  setPage(1);
                }}
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary"
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
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary"
              />
            </label>
            <div className="flex items-end">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-secondary"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </div>

          {feedback ? (
            <p
              className={`rounded-lg px-md py-sm text-body-md ${
                feedback.type === "ok"
                  ? "bg-secondary-fixed/30 text-primary"
                  : "bg-error-container/30 text-error"
              }`}
            >
              {feedback.text}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-body-md">
                <thead className="border-b border-outline-variant bg-surface-container-low">
                  <tr>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Tipo</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Vencimento</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Empresa</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Cliente</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Documento</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Valor</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">WhatsApp</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-md py-xl text-center text-on-surface-variant">
                        {items.length === 0
                          ? "Nenhum documento neste mês. Configure os apps Omie no `.env` e sincronize."
                          : "Nenhum resultado para os filtros aplicados."}
                      </td>
                    </tr>
                  ) : (
                    pagination.items.map((item) => (
                      <tr key={item.id} className="border-b border-outline-variant/60">
                        <td className="px-md py-sm">
                          <span
                            className={`inline-flex rounded-full px-sm py-xs text-label-md ${
                              item.itemType === "boleto"
                                ? "bg-primary-container/40 text-primary"
                                : item.itemType === "nfe"
                                  ? "bg-secondary-container/50 text-on-secondary-container"
                                  : "bg-tertiary-container/50 text-on-tertiary-container"
                            }`}
                          >
                            {TYPE_LABELS[item.itemType]}
                          </span>
                        </td>
                        <td className="px-md py-sm text-primary">{formatDate(item.dueDate)}</td>
                        <td className="px-md py-sm text-on-surface">{item.omieAppName}</td>
                        <td className="px-md py-sm text-on-surface">{item.clientName ?? "—"}</td>
                        <td className="px-md py-sm text-on-surface">{item.documentNumber ?? "—"}</td>
                        <td className="px-md py-sm text-on-surface">{formatMoney(item.amount)}</td>
                        <td className="px-md py-sm">
                          <div className="flex flex-col gap-xs">
                            {item.notifiedAt ? (
                              <span className="text-label-md text-secondary">Pré-vencimento</span>
                            ) : item.clientPhone ? (
                              <span className="text-label-md text-on-surface-variant">{item.clientPhone}</span>
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
                              disabled={viewingId !== null || sendingId !== null}
                              onClick={async () => {
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
                              }}
                              className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
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
                                ? item.itemType === "boleto"
                                  ? "Abrindo..."
                                  : "Baixando..."
                                : item.itemType === "boleto"
                                  ? "Boleto"
                                  : "PDF"}
                            </button>
                            {admin ? (
                              <button
                                type="button"
                                disabled={sendingId !== null || viewingId !== null}
                                onClick={async () => {
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
                                      result.errors.length > 0
                                        ? ` Avisos: ${result.errors.join("; ")}`
                                        : "";
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
                                }}
                                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
                                title="Enviar alerta WhatsApp"
                              >
                                <Icon
                                  name={sendingId === item.id ? "hourglass_empty" : "send"}
                                  className="text-[16px]"
                                />
                                {sendingId === item.id ? "Enviando..." : "Enviar"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
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
