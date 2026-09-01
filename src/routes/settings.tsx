import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  getNotificationSettingsFn,
  getOmieAppsFn,
  saveNotificationSettingsFn,
} from "@/lib/omie";
import {
  getGroqSettingsFn,
  saveGroqSettingsFn,
  testGroqFn,
} from "@/lib/groq-settings";
import { getWahaSettingsFn, saveWahaSettingsFn, testWahaFn, registerWahaWebhookFn, restartWahaBotFn, stopWahaBotFn } from "@/lib/waha";
import { isSuperadmin, requireAdmin } from "@/lib/require-auth";
import { Route as RootRoute } from "@/routes/__root";

export const Route = createFileRoute("/settings")({
  beforeLoad: requireAdmin,
  loader: async () => {
    const [waha, notifications, apps, groq] = await Promise.all([
      getWahaSettingsFn(),
      getNotificationSettingsFn(),
      getOmieAppsFn(),
      getGroqSettingsFn().catch(() => null),
    ]);
    return { waha, notifications, apps, groq };
  },
  head: () => ({
    meta: [{ title: "Configurações — Automação Omie" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { waha, notifications, apps, groq } = Route.useLoaderData();
  const { user } = RootRoute.useRouteContext();
  const router = useRouter();

  return (
    <AppShell mobileTitle="Configurações">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-3xl space-y-lg">
          <div>
            <h2 className="text-headline-lg tracking-tight text-primary">Configurações</h2>
            <p className="mt-base text-body-lg text-on-surface-variant">
              WAHA, alertas automáticos, assistente Groq e aplicativos Omie configurados no `.env`.
            </p>
          </div>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h3 className="mb-sm flex items-center gap-xs text-title-lg text-primary">
              <Icon name="apps" className="text-secondary" />
              Aplicativos Omie
            </h3>
            {apps.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                Nenhum app configurado. Defina `OMIE_APPS` e as chaves no arquivo `.env`.
              </p>
            ) : (
              <ul className="space-y-sm">
                {apps.map((app) => (
                  <li
                    key={app.id}
                    className="rounded-lg border border-outline-variant px-md py-sm text-body-md text-on-surface"
                  >
                    <strong>{app.name}</strong> ({app.id})
                    {app.notifyPhone ? (
                      <span className="block text-label-md text-on-surface-variant">
                        WhatsApp fallback: {app.notifyPhone}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <NotificationSettings initial={notifications} onSaved={() => router.invalidate()} />
          {waha ? <WahaSettings initial={waha} /> : null}
          {isSuperadmin(user) && groq ? <GroqSettings initial={groq} /> : null}
        </div>
      </main>
    </AppShell>
  );
}

function NotificationSettings({
  initial,
  onSaved,
}: {
  initial: {
    notificationsEnabled: boolean;
    notificationTime: string;
    defaultNotifyPhone: string;
    testModeEnabled: boolean;
    testNotifyPhone: string;
    hourlyLimit: number;
  };
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(initial.notificationsEnabled);
  const [time, setTime] = useState(initial.notificationTime);
  const [phone, setPhone] = useState(initial.defaultNotifyPhone);
  const [testMode, setTestMode] = useState(initial.testModeEnabled);
  const [testPhone, setTestPhone] = useState(initial.testNotifyPhone);
  const [hourlyLimit, setHourlyLimit] = useState(initial.hourlyLimit);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
      <h3 className="mb-sm flex items-center gap-xs text-title-lg text-primary">
        <Icon name="notifications" className="text-secondary" />
        Alertas de vencimento
      </h3>
      <p className="mb-md text-body-md text-on-surface-variant">
        Envia WhatsApp com 1 dia de antecedência para boletos que vencem amanhã. Se o cliente tiver
        celular, telefone 1 e telefone 2 no Omie, a mensagem vai para todos os números válidos.
      </p>
      <form
        className="space-y-md"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setMessage(null);
          try {
            await saveNotificationSettingsFn({
              data: {
                notificationsEnabled: enabled,
                notificationTime: time,
                defaultNotifyPhone: phone,
                testModeEnabled: testMode,
                testNotifyPhone: testPhone,
                hourlyLimit,
              },
            });
            setMessage("Configurações salvas.");
            onSaved();
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="flex items-center gap-sm text-body-md text-on-surface">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Alertas automáticos ativos
        </label>

        <div className="rounded-lg border border-secondary-container/40 bg-secondary-fixed/20 p-md">
          <label className="flex items-center gap-sm text-body-md font-semibold text-primary">
            <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
            Modo teste (recomendado no início)
          </label>
          <p className="mt-sm text-label-md text-on-surface-variant">
            Enquanto ativo, todas as mensagens vão para o número de teste abaixo — nenhum cliente recebe.
          </p>
          <label className="mt-md block text-label-md text-on-surface-variant">
            WhatsApp de teste
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="5511999999999"
              required={testMode}
              className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
            />
          </label>
        </div>

        <label className="block text-label-md text-on-surface-variant">
          Horário diário de envio
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
        </label>
        <label className="block text-label-md text-on-surface-variant">
          Limite de contatos por hora
          <input
            type="number"
            min={1}
            max={200}
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
          <span className="mt-xs block text-label-md text-on-surface-variant">
            Conta números distintos com envio OK na última hora (lote + individual). Padrão: 20.
            Reduz risco de bloqueio, mas não elimina — WAHA não é a API oficial da Meta.
          </span>
        </label>
        <label className="block text-label-md text-on-surface-variant">
          WhatsApp padrão (quando o cliente Omie não tiver telefone)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511999999999"
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
        </label>
        {message ? <p className="text-body-md text-primary">{message}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
        >
          {pending ? "Salvando..." : "Salvar alertas"}
        </button>
      </form>
    </section>
  );
}

function WahaSettings({
  initial,
}: {
  initial: {
    url: string;
    session: string;
    hasApiKey: boolean;
    configured: boolean;
    publicAppUrl: string;
    webhookUrl: string | null;
    whatsappBotEnabled: boolean;
    botStatus: {
      pid: number;
      readyAt: number;
      connected: boolean;
      updatedAt: number;
      lastRestartAt?: number;
    } | null;
  };
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initial.url);
  const [session, setSession] = useState(initial.session);
  const [apiKey, setApiKey] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState(initial.publicAppUrl);
  const [botEnabled, setBotEnabled] = useState(initial.whatsappBotEnabled);
  const [testPhone, setTestPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [restartPending, setRestartPending] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const botActive =
    initial.botStatus != null && Date.now() - initial.botStatus.updatedAt < 45_000;
  const botStatusLabel = botActive
    ? initial.botStatus?.connected
      ? `Listener ativo (PID ${initial.botStatus.pid}) · conectado ao WAHA`
      : `Listener ativo (PID ${initial.botStatus.pid}) · reconectando…`
    : "Listener inativo — rode npm run bot:listen";

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
      <h3 className="mb-sm flex items-center gap-xs text-title-lg text-primary">
        <Icon name="chat" className="text-secondary" />
        WAHA (WhatsApp)
      </h3>
      <form
        className="space-y-md"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          setMessage(null);
          try {
            const result = await saveWahaSettingsFn({
              data: {
                url,
                session,
                apiKey,
                publicAppUrl,
                whatsappBotEnabled: botEnabled,
              },
            });
            if (result.webhook?.ok) {
              setMessage(`Configurações salvas. Webhook ativo: ${result.webhook.webhookUrl}`);
            } else if (result.webhook && !result.webhook.ok) {
              setMessage("Configurações salvas.");
              setError(result.webhook.error ?? "Webhook não registrado automaticamente.");
            } else {
              setMessage("Configurações do WAHA salvas.");
            }
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="flex items-center gap-sm text-body-md text-on-surface">
          <input type="checkbox" checked={botEnabled} onChange={(e) => setBotEnabled(e.target.checked)} />
          Bot IA no WhatsApp (responde mensagens recebidas)
        </label>
        <div className="rounded-lg border border-outline-variant bg-surface-container px-md py-sm text-body-md text-on-surface-variant">
          <span className="font-medium text-on-surface">Status do listener:</span> {botStatusLabel}
        </div>
        <label className="block text-label-md text-on-surface-variant">
          URL pública deste app (acessível pelo servidor do WAHA)
          <input
            value={publicAppUrl}
            onChange={(e) => setPublicAppUrl(e.target.value)}
            placeholder="http://192.168.10.x:3000 ou https://seu-dominio"
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
          <span className="mt-xs block text-label-md text-on-surface-variant">
            Webhook (HTTP :18094, sem TLS):{" "}
            {publicAppUrl.trim()
              ? (() => {
                  try {
                    const u = new URL(publicAppUrl.trim());
                    u.protocol = "http:";
                    u.port = "18094";
                    u.pathname = "/api/waha/webhook";
                    return u.toString().replace(/\/$/, "");
                  } catch {
                    return `${publicAppUrl.trim().replace(/\/+$/, "")}/api/waha/webhook`;
                  }
                })()
              : "defina a URL pública acima"}
          </span>
        </label>
        <label className="block text-label-md text-on-surface-variant">
          URL do WAHA
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
        </label>
        <label className="block text-label-md text-on-surface-variant">
          Sessão
          <input
            value={session}
            onChange={(e) => setSession(e.target.value)}
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
        </label>
        <label className="block text-label-md text-on-surface-variant">
          API Key {initial.hasApiKey ? "(deixe vazio para manter)" : ""}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
        </label>
        <div className="flex flex-wrap gap-sm">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
          >
            Salvar WAHA
          </button>
          <button
            type="button"
            disabled={pending || restartPending}
            onClick={async () => {
              setRestartPending(true);
              setError(null);
              setMessage(null);
              try {
                const result = await restartWahaBotFn();
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                if ("warning" in result && result.warning) {
                  setMessage(result.warning);
                } else {
                  setMessage("Bot reiniciado. WebSocket reconectado ao WAHA.");
                }
                await router.invalidate();
              } finally {
                setRestartPending(false);
              }
            }}
            className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary"
          >
            {restartPending ? "Reiniciando…" : "Reiniciar bot"}
          </button>
          <button
            type="button"
            disabled={pending || restartPending || stopPending}
            onClick={async () => {
              setStopPending(true);
              setError(null);
              setMessage(null);
              try {
                const result = await stopWahaBotFn();
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                if (result.stopped === 0) {
                  setMessage("Nenhum listener estava rodando.");
                } else {
                  setMessage(`Bot parado (${result.stopped} processo(s) encerrado(s)).`);
                }
                await router.invalidate();
              } finally {
                setStopPending(false);
              }
            }}
            className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary"
          >
            {stopPending ? "Parando…" : "Parar bot"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setError(null);
              setMessage(null);
              const result = await registerWahaWebhookFn();
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setMessage(`Webhook registrado: ${result.webhookUrl}`);
            }}
            className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary"
          >
            Registrar webhook
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setError(null);
              setMessage(null);
              const result = await testWahaFn({ data: { phone: testPhone } });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setMessage("Mensagem de teste enviada.");
            }}
            className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary"
          >
            Testar envio
          </button>
        </div>
        <input
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          placeholder="WhatsApp para teste"
          className="w-full rounded-lg border border-outline-variant px-md py-sm"
        />
        {message ? <p className="text-body-md text-primary">{message}</p> : null}
        {error ? <p className="text-body-md text-on-error-container">{error}</p> : null}
        {!initial.configured ? (
          <p className="text-label-md text-on-surface-variant">Informe a URL do WAHA para habilitar os alertas.</p>
        ) : null}
      </form>
    </section>
  );
}

function GroqSettings({
  initial,
}: {
  initial: {
    model: string;
    hasApiKey: boolean;
    configured: boolean;
    maskedKey: string | null;
  };
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
      <h3 className="mb-sm flex items-center gap-xs text-title-lg text-primary">
        <Icon name="smart_toy" className="text-secondary" />
        Assistente Groq (IA)
      </h3>
      <p className="mb-md text-body-md text-on-surface-variant">
        Usado no chat flutuante: pergunta o que deseja, pede CNPJ para boleto e consulta títulos em
        aberto no Omie. Sem chave, a consulta por CNPJ ainda funciona com respostas fixas.
      </p>
      <form
        className="space-y-md"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          setMessage(null);
          try {
            await saveGroqSettingsFn({ data: { apiKey, model } });
            setApiKey("");
            setMessage("Configurações do Groq salvas.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Falha ao salvar.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="block text-label-md text-on-surface-variant">
          API Key {initial.hasApiKey ? `(atual: ${initial.maskedKey})` : ""}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={initial.hasApiKey ? "Deixe vazio para manter" : "gsk_..."}
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
        </label>
        <label className="block text-label-md text-on-surface-variant">
          Modelo
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="openai/gpt-oss-20b"
            className="mt-base w-full rounded-lg border border-outline-variant px-md py-sm"
          />
        </label>
        <div className="flex flex-wrap gap-sm">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
          >
            Salvar Groq
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setError(null);
              setMessage(null);
              const result = await testGroqFn();
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setMessage(`Teste OK: ${result.answer}`);
            }}
            className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-primary"
          >
            Testar IA
          </button>
          {initial.hasApiKey ? (
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await saveGroqSettingsFn({ data: { apiKey: "", model, clearKey: true } });
                  setMessage("Chave Groq removida.");
                } finally {
                  setPending(false);
                }
              }}
              className="rounded-lg border border-outline-variant px-md py-sm text-label-md text-error"
            >
              Remover chave
            </button>
          ) : null}
        </div>
        {message ? <p className="text-body-md text-primary">{message}</p> : null}
        {error ? <p className="text-body-md text-on-error-container">{error}</p> : null}
        {!initial.configured ? (
          <p className="text-label-md text-on-surface-variant">
            Obtenha a chave em console.groq.com/keys e salve aqui.
          </p>
        ) : null}
      </form>
    </section>
  );
}
