import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { btnOutline, btnPrimary, PageTitle } from "@/components/PageChrome";
import { getDashboardFn, syncOmieFn, sendNotificationsFn } from "@/lib/omie";
import { isAdmin, requireModule } from "@/lib/require-auth";
import { APP_NAME } from "@/lib/brand";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => requireModule("dashboard"),
  loader: () => getDashboardFn(),
  head: () => ({
    meta: [{ title: `Painel — ${APP_NAME}` }],
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
    {
      label: "Atraso (+10 dias)",
      value: data.stats.pending_overdue_notifications,
      icon: "warning",
    },
  ];

  return (
    <AppShell mobileTitle="Painel">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <PageTitle
            title="Painel"
            subtitle="Boletos sincronizados do Omie com alertas WhatsApp via WAHA."
          >
            {admin ? (
              <>
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
                  className={btnPrimary}
                >
                  <Icon name="sync" className="text-[16px]" />
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
                          (result.overdueSent ? ` Atraso: ${result.overdueSent}.` : "") +
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
                  className="inline-flex items-center gap-xs rounded-lg border border-white/40 px-sm py-xs text-label-md text-on-primary hover:bg-white/10 disabled:opacity-50"
                >
                  <Icon name="send" className="text-[16px]" />
                  {pending === "notify" ? "Enviando..." : "Enviar alertas"}
                </button>
              </>
            ) : null}
          </PageTitle>

          {message ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-md py-sm text-body-md text-emerald-900">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-md py-sm text-body-md text-red-900">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-gutter md:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
              >
                <div className="flex items-center gap-xs text-label-md text-on-surface-variant">
                  <Icon name={card.icon} className="text-primary" />
                  {card.label}
                </div>
                <div className="mt-sm text-headline-md text-primary">{card.value}</div>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <h3 className="mb-md text-title-md text-on-surface">Status da integração</h3>
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

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <h3 className="mb-md text-title-md text-on-surface">Últimas sincronizações</h3>
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
