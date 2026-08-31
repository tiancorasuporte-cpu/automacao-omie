import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { paginateList, TablePager } from "@/components/TablePager";
import { getOmieAppsFn, getDueItemBoletoViewFn, listDueItemsFn, sendDueItemNotificationFn } from "@/lib/omie";
import { isAdmin, requireAuth } from "@/lib/require-auth";

const PAGE_SIZE = 15;

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
    meta: [{ title: "Vencimentos — Automação Omie" }],
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

function VencimentosPage() {
  const { items, apps } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const admin = isAdmin(user);
  const { page: urlPage } = Route.useSearch();
  const { query } = useShellSearch();
  const [appFilter, setAppFilter] = useState<string>("all");
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
      if (!matchesText(item.clientName, clientFilter)) return false;
      if (!matchesText(item.documentNumber, documentFilter)) return false;
      if (dueFrom && item.dueDate < dueFrom) return false;
      if (dueTo && item.dueDate > dueTo) return false;
      if (!q) return true;
      return [item.clientName, item.documentNumber, item.omieAppName, item.clientPhone]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(q));
    });
  }, [items, query, appFilter, clientFilter, documentFilter, dueFrom, dueTo]);

  const hasActiveFilters =
    appFilter !== "all" ||
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
    setClientFilter("");
    setDocumentFilter("");
    setDueFrom("");
    setDueTo("");
    setPage(1);
  };

  return (
    <AppShell mobileTitle="Vencimentos" searchPlaceholder="Busca rápida (cliente, boleto, telefone)...">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <div>
            <h2 className="text-headline-lg tracking-tight text-primary">Vencimentos</h2>
            <p className="mt-base text-body-lg text-on-surface-variant">
              Boletos em aberto com vencimento em{" "}
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
              Nº do boleto
              <input
                value={documentFilter}
                onChange={(event) => {
                  setDocumentFilter(event.target.value);
                  setPage(1);
                }}
                placeholder="Ex.: 130"
                className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-primary"
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
                      <td colSpan={7} className="px-md py-xl text-center text-on-surface-variant">
                        {items.length === 0
                          ? "Nenhum boleto neste mês. Configure os apps Omie no `.env` e sincronize."
                          : "Nenhum resultado para os filtros aplicados."}
                      </td>
                    </tr>
                  ) : (
                    pagination.items.map((item) => (
                      <tr key={item.id} className="border-b border-outline-variant/60">
                        <td className="px-md py-sm text-primary">{formatDate(item.dueDate)}</td>
                        <td className="px-md py-sm text-on-surface">{item.omieAppName}</td>
                        <td className="px-md py-sm text-on-surface">{item.clientName ?? "—"}</td>
                        <td className="px-md py-sm text-on-surface">{item.documentNumber ?? "—"}</td>
                        <td className="px-md py-sm text-on-surface">{formatMoney(item.amount)}</td>
                        <td className="px-md py-sm">
                          {item.notifiedAt ? (
                            <span className="text-label-md text-secondary">Alertado</span>
                          ) : item.clientPhone ? (
                            <span className="text-label-md text-on-surface-variant">{item.clientPhone}</span>
                          ) : (
                            <span className="text-label-md text-error">Sem telefone</span>
                          )}
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
                                  window.open(result.url, "_blank", "noopener,noreferrer");
                                } finally {
                                  setViewingId(null);
                                }
                              }}
                              className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
                              title="Visualizar boleto em PDF"
                            >
                              <Icon
                                name={viewingId === item.id ? "hourglass_empty" : "picture_as_pdf"}
                                className="text-[16px]"
                              />
                              {viewingId === item.id ? "Abrindo..." : "Boleto"}
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
