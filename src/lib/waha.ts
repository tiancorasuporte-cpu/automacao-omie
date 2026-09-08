import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { toWhatsAppChatId } from "@/server/omie/notifications";
import { APP_NAME } from "@/lib/brand";

const saveSchema = z.object({
  url: z.string().trim(),
  apiKey: z.string(),
  session: z.string().trim().min(1, "Informe a sessão do WAHA"),
  publicAppUrl: z.string().trim().optional(),
  whatsappBotEnabled: z.boolean().optional(),
});

const testSchema = z.object({
  phone: z.string().trim().min(8, "Informe um WhatsApp para teste"),
});

export const getWahaSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { readWahaConfig, isWahaConfigured, buildWahaWebhookUrl } = await import("@/server/waha");
  const { readWahaBotStatus } = await import("@/server/waha-bot-control");
  const { getSetting } = await import("@/db/settings");
  const config = readWahaConfig();
  const publicAppUrl =
    (await getSetting("public_app_url"))?.trim() || process.env["PUBLIC_APP_URL"]?.trim() || "";
  const botSetting = await getSetting("whatsapp_bot_enabled");
  const botStatus = readWahaBotStatus();
  return {
    url: config.url,
    session: config.session,
    hasApiKey: Boolean(config.apiKey),
    configured: isWahaConfigured(config),
    publicAppUrl,
    webhookUrl: buildWahaWebhookUrl(publicAppUrl),
    whatsappBotEnabled: botSetting !== "false",
    botStatus,
  };
});

export const saveWahaSettingsFn = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    const { upsertEnv } = await import("@/db/client");
    const { setSetting } = await import("@/db/settings");
    const { registerWahaInboundWebhook } = await import("@/server/waha");

    const url = data.url.trim().replace(/\/+$/, "");
    upsertEnv({
      WAHA_URL: url,
      WAHA_SESSION: data.session.trim() || "default",
      ...(data.apiKey.trim() ? { WAHA_API_KEY: data.apiKey.trim() } : {}),
      ...(data.publicAppUrl != null
        ? { PUBLIC_APP_URL: data.publicAppUrl.trim().replace(/\/+$/, "") }
        : {}),
    });

    if (data.publicAppUrl != null) {
      await setSetting("public_app_url", data.publicAppUrl.trim().replace(/\/+$/, ""));
    }
    if (data.whatsappBotEnabled != null) {
      await setSetting("whatsapp_bot_enabled", data.whatsappBotEnabled ? "true" : "false");
    }

    let webhook: { ok: boolean; webhookUrl?: string; error?: string } | null = null;
    const publicUrl =
      data.publicAppUrl?.trim().replace(/\/+$/, "") ||
      process.env["PUBLIC_APP_URL"]?.trim().replace(/\/+$/, "") ||
      "";
    if (data.whatsappBotEnabled !== false && publicUrl && url) {
      webhook = await registerWahaInboundWebhook(publicUrl);
    }

    return { ok: true as const, webhook };
  });

export const testWahaFn = createServerFn({ method: "POST" })
  .validator(testSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    const chatId = toWhatsAppChatId(data.phone);
    if (!chatId) {
      return { ok: false as const, error: "Número de WhatsApp inválido." };
    }
    try {
      const { sendWahaText } = await import("@/server/waha");
      await sendWahaText(chatId, `${APP_NAME}: conexão com o WAHA ok.`);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível enviar pelo WAHA.",
      };
    }
  });

export const registerWahaWebhookFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { getSetting } = await import("@/db/settings");
  const { registerWahaInboundWebhook } = await import("@/server/waha");
  const publicUrl =
    (await getSetting("public_app_url"))?.trim() || process.env["PUBLIC_APP_URL"]?.trim() || "";
  if (!publicUrl) {
    return {
      ok: false as const,
      error: "Informe a URL pública do app (acessível pelo servidor do WAHA).",
    };
  }
  return registerWahaInboundWebhook(publicUrl);
});

export const restartWahaBotFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { restartWahaBotListener } = await import("@/server/waha-bot-control");
  return restartWahaBotListener();
});

export const stopWahaBotFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { stopWahaBotListeners } = await import("@/server/waha-bot-control");
  return stopWahaBotListeners();
});
