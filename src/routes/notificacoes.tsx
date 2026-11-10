import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  btnOnPrimaryOutline,
  btnMuted,
  fieldClass,
  filterControlClass,
  PageTitle,
} from "@/components/PageChrome";
import { TablePager } from "@/components/TablePager";
import { getOmieAppsFn, listNotificationLogsFn } from "@/lib/omie";
import { requireModule } from "@/lib/require-auth";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const TYPE_LABELS = {
  boleto: "Boleto",
  nfe: "NF-e",
  nfse: "NFS-e",
} as const;

const KIND_LABELS = {
  pre_due: "Pré-vencimento",
  overdue: "Atraso (+10 dias)",
} as const;

const emptySearch = {
  page: 1,
  client: "",
  appId: "all",
  itemType: "all" as const,
  kind: "all" as const,
  status: "all" as const,
  sentFrom: "",
  sentTo: "",
  phone: "",
};

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  client: z.string().catch(""),
  appId: z.string().catch("all"),
  itemType: z.enum(["all", "boleto", "nfe", "nfse"]).catch("all"),
  kind: z.enum(["all", "pre_due", "overdue"]).catch("all"),
  status: z.enum(["all", "ok", "fail"]).catch("all"),
  sentFrom: z.string().catch(""),
  sentTo: z.string().catch(""),
  phone: z.string().catch(""),
});

type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/notificacoes")({
  validateSearch: searchSchema,
  beforeLoad: () => requireModule("notificacoes"),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [data, apps] = await Promise.all([
      listNotificationLogsFn({
        data: {
          page: deps.page,
          client: deps.client || null,
          appId: deps.appId === "all" ? null : deps.appId,
          itemType: deps.itemType,
          kind: deps.kind,
          status: deps.status,
          sentFrom: deps.sentFrom || null,
          sentTo: deps.sentTo || null,
          phone: deps.phone || null,
        },
      }),
      getOmieAppsFn(),
    ]);
    return { data, apps };
  },
  head: () => ({
    meta: [{ title: `Notificações — ${APP_NAME}` }],
  }),
  component: NotificacoesPage,
});

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function hasFilters(search: Search) {
  return (
    search.client.trim() !== "" ||
    search.appId !== "all" ||
    search.itemType !== "all" ||
    search.kind !== "all" ||
    search.status !== "all" ||
    search.sentFrom !== "" ||
    search.sentTo !== "" ||
    search.phone.trim() !== ""
  );
}

function NotificacoesPage() {
  const { data, apps } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(() => hasFilters(search));

  const patchSearch = (patch: Partial<Search>, resetPage = true) => {
    navigate({
      search: (prev) => ({
        ...prev,
        ...patch,
        ...(resetPage ? { page: 1 } : {}),
      }),
    });
  };

  return (
    <AppShell mobileTitle="Notificações">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <PageTitle
            title="Notificações"
            subtitle="Histórico de alertas WhatsApp enviados (inclui envios em modo teste)."
          >
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className={btnOnPrimaryOutline}
            >
              <Icon name="tune" className="text-[16px]" />
              {filtersOpen ? "Ocultar filtros" : "Filtros"}
              {hasFilters(search) ? (
                <span className="ml-xs rounded-full bg-secondary-container px-sm py-px text-[0.65rem] font-bold text-on-secondary-container">
                  on
                </span>
              ) : null}
            </button>
          </PageTitle>

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
                    onClick={() => patchSearch({ itemType: value })}
                    className={cn(
                      "rounded-full px-md py-xs text-label-md transition-colors",
                      search.itemType === value
                        ? "bg-secondary-container font-semibold text-on-secondary-container"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-xs">
                {(
                  [
                    ["all", "Todos alertas"],
                    ["pre_due", "Pré-vencimento"],
                    ["overdue", "Atraso"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patchSearch({ kind: value })}
                    className={cn(
                      "rounded-full px-md py-xs text-label-md transition-colors",
                      search.kind === value
                        ? "bg-secondary-container font-semibold text-on-secondary-container"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-xs">
                {(
                  [
                    ["all", "Todos status"],
                    ["ok", "Enviado"],
                    ["fail", "Falhou"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patchSearch({ status: value })}
                    className={cn(
                      "rounded-full px-md py-xs text-label-md transition-colors",
                      search.status === value
                        ? "bg-secondary-container font-semibold text-on-secondary-container"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-sm md:grid-cols-2 lg:grid-cols-3">
                <label className="block text-label-md text-on-surface-variant">
                  Cliente
                  <input
                    value={search.client}
                    onChange={(event) => patchSearch({ client: event.target.value })}
                    placeholder="Nome do cliente"
                    className={fieldClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Empresa
                  <select
                    value={search.appId}
                    onChange={(event) => patchSearch({ appId: event.target.value })}
                    className={cn(fieldClass, "bg-surface")}
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
                  Telefone
                  <input
                    value={search.phone}
                    onChange={(event) => patchSearch({ phone: event.target.value })}
                    placeholder="DDD + número"
                    className={fieldClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Enviado de
                  <input
                    type="date"
                    value={search.sentFrom}
                    onChange={(event) => patchSearch({ sentFrom: event.target.value })}
                    className={cn(fieldClass, filterControlClass)}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Enviado até
                  <input
                    type="date"
                    value={search.sentTo}
                    onChange={(event) => patchSearch({ sentTo: event.target.value })}
                    className={cn(fieldClass, filterControlClass)}
                  />
                </label>
              </div>

              {hasFilters(search) ? (
                <button
                  type="button"
                  onClick={() => navigate({ search: emptySearch })}
                  className={btnMuted}
                >
                  <Icon name="filter_alt_off" className="text-[16px]" />
                  Limpar filtros
                </button>
              ) : null}
            </section>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            <div className="overflow-x-auto p-md">
              <table className="min-w-full text-left text-body-md">
                <thead className="bg-primary text-label-md font-semibold uppercase tracking-wide text-on-primary">
                  <tr>
                    <th className="px-sm py-xs">Enviado em</th>
                    <th className="px-sm py-xs">Cliente</th>
                    <th className="px-sm py-xs">Empresa</th>
                    <th className="px-sm py-xs">Alerta</th>
                    <th className="px-sm py-xs">Tipo</th>
                    <th className="px-sm py-xs">Vencimento</th>
                    <th className="px-sm py-xs">Telefone</th>
                    <th className="px-sm py-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-md py-xl text-center text-on-surface-variant">
                        Nenhuma notificação encontrada com esses filtros.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((entry) => (
                      <tr key={entry.id} className="border-b border-outline-variant/60">
                        <td className="whitespace-nowrap px-md py-sm text-on-surface">
                          {formatDateTime(entry.sentAt)}
                        </td>
                        <td className="px-md py-sm text-primary">{entry.clientName ?? "—"}</td>
                        <td className="px-md py-sm text-on-surface">{entry.omieAppName ?? "—"}</td>
                        <td className="px-md py-sm text-on-surface-variant">
                          {KIND_LABELS[entry.kind]}
                        </td>
                        <td className="px-md py-sm">
                          {entry.itemType ? (
                            <span className="inline-flex items-center gap-xs rounded-full bg-surface-container-high px-sm py-xs text-label-md">
                              <Icon
                                name={
                                  entry.itemType === "boleto"
                                    ? "receipt_long"
                                    : entry.itemType === "nfe"
                                      ? "inventory_2"
                                      : "handyman"
                                }
                                className="text-[16px]"
                              />
                              {TYPE_LABELS[entry.itemType]}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-md py-sm text-on-surface">{formatDate(entry.dueDate)}</td>
                        <td className="px-md py-sm text-on-surface-variant">{entry.phone}</td>
                        <td className="px-md py-sm">
                          {entry.success ? (
                            <span className="text-label-md text-secondary">Enviado</span>
                          ) : (
                            <span
                              className="text-label-md text-error"
                              title={entry.error ?? undefined}
                            >
                              Falhou
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePager
              page={data.page}
              totalPages={data.totalPages}
              totalItems={data.totalItems}
              pageSize={data.pageSize}
              onPageChange={(page) => patchSearch({ page }, false)}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
