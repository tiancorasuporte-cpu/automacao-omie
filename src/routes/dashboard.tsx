import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { getDashboardFn, syncOmieFn, sendNotificationsFn } from "@/lib/omie";
import { isAdmin, requireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  loader: () => getDashboardFn(),
  head: () => ({
    meta: [{ title: "Painel — Automação Omie" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const admin = isAdmin(user);
  const [pending, setPending] = useState<"sync" | "notify" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cards = [
    { label: "Vencem hoje", value: data.stats.due_today, icon: "today" },
    { label: "Vencem amanhã", value: data.stats.due_tomorrow, icon: "event_upcoming" },
    { label: "Próximos 7 dias", value: data.stats.due_week, icon: "date_range" },
    { label: "Alertas pendentes", value: data.stats.pending_notifications, icon: "notifications" },
  ];

  return (
    <AppShell mobileTitle="Painel">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <div className="flex flex-col gap-md md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-headline-lg tracking-tight text-primary">Painel</h2>
              <p className="mt-base text-body-lg text-on-surface-variant">
                Boletos sincronizados do Omie com alertas WhatsApp via WAHA.
              </p>
            </div>
            {admin ? (
              <div className="flex flex-wrap gap-sm">
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={async () => {
                    setPending("sync");
                    setError(null);
                    setMessage(null);
                    try {
                      const result = await syncOmieFn();
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      const total = result.results.reduce((sum, item) => sum + (item.itemsFound ?? 0), 0);
                      const details = result.results
                        .map((item) => {
                          if (!item.ok) return `${item.appId}: erro`;
                          const parts = item.breakdown
                            ? Object.entries(item.breakdown)
                                .map(([key, value]) => `${key}=${value}`)
                                .join(", ")
                            : "";
                          const warn = item.errors?.length ? ` (${item.errors.join("; ")})` : "";
                          return `${item.appId}: ${item.itemsFound}${parts ? ` [${parts}]` : ""}${warn}`;
                        })
                        .join(" | ");
                      setMessage(`Sincronização concluída: ${total} registros. ${details}`);
                      await router.invalidate();
                    } finally {
                      setPending(null);
                    }
                  }}
                  className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
                >
                  <Icon name="sync" className="text-[18px]" />
                  {pending === "sync" ? "Sincronizando..." : "Sincronizar Omie"}
                </button>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={async () => {
                    setPending("notify");
                    setError(null);
                    setMessage(null);
                    try {
                      const result = await sendNotificationsFn();
                      setMessage(
                        `Alertas enviados: ${result.sent}. Ignorados: ${result.skipped}.` +
                          (result.testMode ? " Modo teste ativo." : "") +
                          (result.errors.length
                            ? ` ${result.errors[0]?.startsWith("Envio já em andamento") ? result.errors[0] : `Erros: ${result.errors.length}.`}`
                            : ""),
                      );
                      await router.invalidate();
                    } finally {
                      setPending(null);
                    }
                  }}
                  className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md font-semibold text-primary"
                >
                  <Icon name="send" className="text-[18px]" />
                  {pending === "notify" ? "Enviando..." : "Enviar alertas"}
                </button>
              </div>
            ) : null}
          </div>

          {message ? (
            <p className="rounded-lg bg-secondary-fixed/30 px-md py-sm text-body-md text-primary">{message}</p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-error-container px-md py-sm text-body-md text-on-error-container">{error}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-gutter md:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
              >
                <div className="flex items-center gap-xs text-label-md uppercase text-on-surface-variant">
                  <Icon name={card.icon} className="text-secondary" />
                  {card.label}
                </div>
                <div className="mt-base text-headline-md text-primary">{card.value}</div>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h3 className="mb-md text-title-lg text-primary">Status da integração</h3>
            <dl className="grid gap-sm md:grid-cols-2">
              <div>
                <dt className="text-label-md text-on-surface-variant">Aplicativos Omie no .env</dt>
                <dd className="text-body-lg text-primary">{data.appsConfigured}</dd>
              </div>
              <div>
                <dt className="text-label-md text-on-surface-variant">Em aberto neste mês</dt>
                <dd className="text-body-lg text-primary">{data.stats.total_open}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h3 className="mb-md text-title-lg text-primary">Últimas sincronizações</h3>
            {data.syncLogs.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">Nenhuma sincronização registrada ainda.</p>
            ) : (
              <ul className="space-y-sm">
                {data.syncLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-outline-variant px-md py-sm"
                  >
                    <div>
                      <p className="text-body-md text-primary">{log.omie_app_id ?? "Todos"}</p>
                      <p className="text-label-md text-on-surface-variant">
                        {new Date(log.started_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-md text-primary">{log.items_found} itens</p>
                      {log.error ? (
                        <p className="text-label-md text-error">{log.error}</p>
                      ) : (
                        <p className="text-label-md text-on-surface-variant">OK</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
