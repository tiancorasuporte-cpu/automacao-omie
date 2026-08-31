import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { toWhatsAppChatId } from "@/server/omie/notifications";

const saveSchema = z.object({
  url: z.string().trim(),
  apiKey: z.string(),
  session: z.string().trim().min(1, "Informe a sessão do WAHA"),
});

const testSchema = z.object({
  phone: z.string().trim().min(8, "Informe um WhatsApp para teste"),
});

export const getWahaSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { readWahaConfig, isWahaConfigured } = await import("@/server/waha");
  const config = readWahaConfig();
  return {
    url: config.url,
    session: config.session,
    hasApiKey: Boolean(config.apiKey),
    configured: isWahaConfigured(config),
  };
});

export const saveWahaSettingsFn = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    const { upsertEnv } = await import("@/db/client");
    const url = data.url.trim().replace(/\/+$/, "");
    upsertEnv({
      WAHA_URL: url,
      WAHA_SESSION: data.session.trim() || "default",
      ...(data.apiKey.trim() ? { WAHA_API_KEY: data.apiKey.trim() } : {}),
    });
    return { ok: true as const };
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
      await sendWahaText(chatId, "Automação Omie: conexão com o WAHA ok.");
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível enviar pelo WAHA.",
      };
    }
  });
