import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { btnOnPrimaryOutline, btnPrimary, PageTitle } from "@/components/PageChrome";
import { APP_NAME } from "@/lib/brand";
import { getDashboardFn, sendNotificationsFn, syncOmieFn } from "@/lib/omie";
import { isAdmin, requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => requireModule("dashboard"),
  loader: () => getDashboardFn(),
  head: () => ({
    meta: [{ title: `Painel — ${APP_NAME}` }],
  }),
  component: DashboardPage,
});

function monthLabel(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDays(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("pt-BR")} dia${rounded === 1 ? "" : "s"}`;
}

function DashboardPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const admin = isAdmin(user);
  const [pending, setPending] = useState<"sync" | "notify" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ops = data.ops;
  const maxFluxo = Math.max(1, ...ops.fluxoOs.map((row) => row.total));
  const maxComercial = Math.max(
    1,
    ops.comercial.salvos,
    ops.comercial.enviados,
    ops.comercial.aprovados,
  );

  const topCards = [
    {
      label: "Tickets abertos",
      value: ops.kpis.ticketsAbertos,
      icon: "confirmation_number",
      to: "/tickets",
    },
    {
      label: "OS em andamento",
      value: ops.kpis.osEmAndamento,
      icon: "handyman",
      to: "/assistencia",
    },
    {
      label: "Equipes em campo",
      value: ops.kpis.equipesEmCampo,
      icon: "groups",
      to: "/assistencia",
    },
    {
      label: "Compras atrasadas",
      value: ops.kpis.comprasAtrasadas,
      icon: "shopping_cart",
      to: "/compras",
      alert: ops.kpis.comprasAtrasadas > 0,
    },
    {
      label: "Orçamentos do mês",
      value: ops.kpis.orcamentosMes,
      icon: "request_quote",
      to: "/orcamentos",
    },
  ] as const;

  return (
    <AppShell mobileTitle="Painel">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-md">
          <PageTitle
            title="Painel"
            subtitle={`Visão operacional · ${monthLabel(ops.monthKey)}`}
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
                      const total = result.results.reduce(
                        (sum, item) => sum + (item.itemsFound ?? 0),
                        0,
                      );
                      setMessage(`Sincronização Omie concluída: ${total} registros.`);
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
                        `Alertas enviados: ${result.sent}. Ignorados: ${result.skipped}.`,
                      );
                      await router.invalidate();
                    } finally {
                      setPending(null);
                    }
                  }}
                  className={btnOnPrimaryOutline}
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

          <div className="grid grid-cols-2 gap-sm md:grid-cols-3 xl:grid-cols-5">
            {topCards.map((card) => (
              <Link
                key={card.label}
                to={card.to}
                className={cn(
                  "rounded-xl border bg-surface-container-lowest p-md transition-colors hover:border-secondary",
                  "alert" in card && card.alert
                    ? "border-amber-300 bg-amber-50"
                    : "border-outline-variant",
                )}
              >
                <div className="flex items-center gap-xs text-label-md text-on-surface-variant">
                  <Icon name={card.icon} className="text-primary" />
                  {card.label}
                </div>
                <div className="mt-sm text-headline-md text-primary">{card.value}</div>
              </Link>
            ))}
          </div>

          <Link
            to="/terceiros"
            className="flex items-center justify-between gap-md rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm transition-colors hover:border-secondary"
          >
            <div>
              <p className="text-label-md text-on-surface-variant">Contas monitoradas</p>
              <p className="text-title-lg font-semibold text-primary">
                {ops.kpis.contasMonitoradas}
              </p>
            </div>
            <Icon name="desktop_windows" className="text-[22px] text-secondary" />
          </Link>

          <div className="grid gap-md xl:grid-cols-5">
            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md xl:col-span-3">
              <div className="mb-md space-y-sm">
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <h3 className="text-title-md text-primary">Fluxo das OS</h3>
                    <p className="text-label-md text-on-surface-variant">
                      Pipeline atual · {ops.osFinalizadasMes} finalizada(s) no mês
                    </p>
                  </div>
                  <div className="shrink-0 text-label-md text-on-surface-variant sm:text-right">
                    <div>
                      Tempo médio OS:{" "}
                      <span className="font-semibold text-primary">
                        {formatDays(ops.tempoMedio.geralDias)}
                      </span>
                    </div>
                    <div>
                      Manutenção:{" "}
                      <span className="font-semibold text-primary">
                        {formatDays(ops.tempoMedio.manutDias)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="-mx-1 flex gap-sm overflow-x-auto px-1 pb-1">
                {ops.fluxoOs.map((col) => (
                  <Link
                    key={col.stage}
                    to="/assistencia"
                    search={{ view: "kanban" }}
                    title={col.name}
                    className="min-w-[4.75rem] flex-1 rounded-xl border border-outline-variant bg-surface px-sm py-sm text-center hover:border-secondary"
                  >
                    <p className="whitespace-nowrap text-[0.68rem] font-semibold uppercase tracking-tight text-on-surface-variant">
                      {col.shortName}
                    </p>
                    <p className="mt-xs text-title-lg font-bold text-primary">{col.total}</p>
                    <div className="mt-sm h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{
                          width: `${Math.max(8, Math.round((col.total / maxFluxo) * 100))}%`,
                        }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md xl:col-span-2">
              <h3 className="text-title-md text-primary">Precisa de atenção</h3>
              <p className="mb-md text-label-md text-on-surface-variant">
                Urgências e pendências em aberto
              </p>
              {ops.attention.length === 0 ? (
                <p className="rounded-lg border border-dashed border-outline-variant px-md py-lg text-center text-body-md text-on-surface-variant">
                  Nada crítico no momento.
                </p>
              ) : (
                <ul className="space-y-sm">
                  {ops.attention.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        className="block rounded-xl border border-outline-variant bg-surface px-md py-sm hover:border-secondary"
                      >
                        <div className="flex items-start justify-between gap-sm">
                          <p className="min-w-0 text-body-md font-medium text-primary">
                            {item.title}
                          </p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-sm py-2xs text-[10px] font-bold uppercase tracking-wide",
                              item.severity === "alta"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-950",
                            )}
                          >
                            {item.severity === "alta" ? "Alta" : "Média"}
                          </span>
                        </div>
                        <p className="mt-2xs line-clamp-2 text-label-md text-on-surface-variant">
                          {item.detail}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-md lg:grid-cols-2">
            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
              <h3 className="text-title-md text-primary">Equipes hoje</h3>
              <p className="mb-md text-label-md text-on-surface-variant">
                Status por check-in e agenda do dia
              </p>
              {ops.equipesHoje.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">Nenhuma equipe cadastrada.</p>
              ) : (
                <ul className="space-y-sm">
                  {ops.equipesHoje.map((team) => (
                    <li
                      key={team.id}
                      className="flex items-start justify-between gap-sm overflow-hidden rounded-xl border border-outline-variant bg-surface px-md py-sm"
                    >
                      <div className="min-w-0 flex-1 overflow-hidden pr-sm">
                        <p className="truncate font-semibold text-primary">{team.name}</p>
                        {team.osNum ? (
                          <p className="mt-2xs break-words text-body-md leading-snug text-on-surface">
                            <span className="font-medium">{team.osNum}</span>
                            {team.clientName ? (
                              <span className="text-on-surface-variant"> · {team.clientName}</span>
                            ) : null}
                          </p>
                        ) : (
                          <p className="mt-2xs break-words text-body-md leading-snug text-on-surface-variant">
                            {team.detail}
                          </p>
                        )}
                        {team.osNum && team.detail ? (
                          <p className="mt-2xs break-words text-label-md leading-snug text-on-surface-variant">
                            {team.detail}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "mt-2xs shrink-0 rounded-full px-sm py-2xs text-[10px] font-bold uppercase tracking-wide",
                          team.status === "em_campo"
                            ? "bg-emerald-100 text-emerald-900"
                            : team.status === "a_caminho"
                              ? "bg-sky-100 text-sky-900"
                              : "bg-neutral-200 text-neutral-700",
                        )}
                      >
                        {team.statusLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
              <h3 className="text-title-md text-primary">Tickets abertos por setor</h3>
              <p className="mb-md text-label-md text-on-surface-variant">Distribuição atual</p>
              {ops.ticketsPorSetor.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">Sem tickets ativos.</p>
              ) : (
                <ul className="space-y-sm">
                  {ops.ticketsPorSetor.map((row) => (
                    <li key={row.id}>
                      <div className="mb-2xs flex items-center justify-between gap-sm text-label-md">
                        <span className="text-on-surface">{row.nome}</span>
                        <span className="font-semibold text-primary">{row.total}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(6, row.pct)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-md md:grid-cols-3">
            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
              <h3 className="text-title-md text-primary">Comercial · orçamentos</h3>
              <p className="mb-md text-label-md text-on-surface-variant">Competência do mês</p>
              <ul className="space-y-sm">
                {(
                  [
                    { label: "Salvos", value: ops.comercial.salvos },
                    { label: "Enviados Omie", value: ops.comercial.enviados },
                    { label: "Aprovados (pedido OS)", value: ops.comercial.aprovados },
                  ] as const
                ).map((row) => (
                  <li key={row.label}>
                    <div className="mb-2xs flex items-center justify-between text-label-md">
                      <span>{row.label}</span>
                      <span className="font-semibold text-primary">{row.value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{
                          width: `${Math.max(6, Math.round((row.value / maxComercial) * 100))}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                to="/orcamentos"
                className="mt-md inline-flex items-center gap-xs text-label-md font-semibold text-primary"
              >
                Abrir orçamentos
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </section>

            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
              <h3 className="text-title-md text-primary">Monitoramento</h3>
              <p className="mb-md text-label-md text-on-surface-variant">
                Contas ativas em terceiros
              </p>
              <p className="text-headline-md font-semibold text-primary">
                {ops.kpis.contasMonitoradas}
              </p>
              <p className="mt-xs text-body-md text-on-surface-variant">
                Soma de monitoramento padrão, exceções e proporcionais abertas.
              </p>
              <Link
                to="/terceiros"
                className="mt-md inline-flex items-center gap-xs text-label-md font-semibold text-primary"
              >
                Abrir terceiros
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </section>

            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
              <h3 className="text-title-md text-primary">Estoque</h3>
              <p className="mb-md text-label-md text-on-surface-variant">Pendências de material</p>
              <div className="grid grid-cols-2 gap-sm">
                <div className="rounded-xl border border-outline-variant bg-surface px-sm py-sm">
                  <p className="text-label-md text-on-surface-variant">Divergentes</p>
                  <p className="text-title-lg font-semibold text-primary">
                    {ops.estoque.divergentes}
                  </p>
                </div>
                <div className="rounded-xl border border-outline-variant bg-surface px-sm py-sm">
                  <p className="text-label-md text-on-surface-variant">OS p/ separar</p>
                  <p className="text-title-lg font-semibold text-primary">
                    {ops.estoque.osSeparacao}
                  </p>
                </div>
              </div>
              <Link
                to="/estoque"
                className="mt-md inline-flex items-center gap-xs text-label-md font-semibold text-primary"
              >
                Abrir estoque
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </section>
          </div>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <div className="mb-md flex flex-wrap items-end justify-between gap-sm">
              <div>
                <h3 className="text-title-md text-primary">Cobrança Omie</h3>
                <p className="text-label-md text-on-surface-variant">
                  Boletos e alertas WhatsApp · {data.appsConfigured} app(s)
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-sm md:grid-cols-5">
              {[
                { label: "Vencem hoje", value: data.stats.due_today },
                { label: "Vencem amanhã", value: data.stats.due_tomorrow },
                { label: "Próximos 7 dias", value: data.stats.due_week },
                { label: "Alertas pendentes", value: data.stats.pending_notifications },
                { label: "Atraso (+10 dias)", value: data.stats.pending_overdue_notifications },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-outline-variant bg-surface px-sm py-sm"
                >
                  <p className="text-label-md text-on-surface-variant">{card.label}</p>
                  <p className="mt-xs text-title-md font-semibold text-primary">{card.value}</p>
                </div>
              ))}
            </div>
            {data.syncLogs.length > 0 ? (
              <ul className="mt-md space-y-sm">
                {data.syncLogs.slice(0, 3).map((log) => (
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
            ) : null}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
