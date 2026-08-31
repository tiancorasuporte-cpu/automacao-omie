import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { TablePager } from "@/components/TablePager";
import { listNotificationLogsFn } from "@/lib/omie";
import { requireAuth } from "@/lib/require-auth";

const TYPE_LABELS = {
  boleto: "Boleto",
  nfe: "NF-e",
  nfse: "NFS-e",
} as const;

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

export const Route = createFileRoute("/notificacoes")({
  validateSearch: searchSchema,
  beforeLoad: requireAuth,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps }) => listNotificationLogsFn({ data: { page: deps.page } }),
  head: () => ({
    meta: [{ title: "Notificações — Automação Omie" }],
  }),
  component: NotificacoesPage,
});

function formatDateTime(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function NotificacoesPage() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();

  const setPage = (page: number) => {
    navigate({ search: { page } });
  };

  return (
    <AppShell mobileTitle="Notificações">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <div>
            <h2 className="text-headline-lg tracking-tight text-primary">Notificações enviadas</h2>
            <p className="mt-base text-body-lg text-on-surface-variant">
              Histórico de alertas WhatsApp enviados (inclui envios em modo teste).
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-body-md">
                <thead className="border-b border-outline-variant bg-surface-container-low">
                  <tr>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Enviado em</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Cliente</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Empresa</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Tipo</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Vencimento</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Telefone</th>
                    <th className="px-md py-sm text-label-md text-on-surface-variant">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-md py-xl text-center text-on-surface-variant">
                        Nenhuma notificação registrada ainda.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((entry) => (
                      <tr key={entry.id} className="border-b border-outline-variant/60">
                        <td className="px-md py-sm text-on-surface">{formatDateTime(entry.sentAt)}</td>
                        <td className="px-md py-sm text-primary">{entry.clientName ?? "—"}</td>
                        <td className="px-md py-sm text-on-surface">{entry.omieAppName ?? "—"}</td>
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
                            <span className="text-label-md text-error" title={entry.error ?? undefined}>
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
              onPageChange={setPage}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
