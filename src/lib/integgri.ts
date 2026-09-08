import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { APP_NAME } from "@/lib/brand";

const saveSchema = z.object({
  url: z.string().trim(),
  token: z.string(),
  whatsappId: z.string().trim().optional(),
  queueId: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  enabled: z.boolean(),
});

const testSchema = z.object({
  phone: z.string().trim().min(8, "Informe um WhatsApp para teste"),
});

export const getInteggriSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { readInteggriConfig, isInteggriConfigured } = await import("@/server/integgri");
  const { readWhatsAppProvider } = await import("@/server/whatsapp");
  const config = readInteggriConfig();
  const provider = readWhatsAppProvider();
  return {
    url: config.url,
    hasToken: Boolean(config.token),
    whatsappId: config.whatsappId,
    queueId: config.queueId,
    userId: config.userId,
    configured: isInteggriConfigured(config),
    enabled: provider === "integgri",
    provider,
  };
});

export const saveInteggriSettingsFn = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    const { upsertEnv } = await import("@/db/client");
    const { normalizeInteggriUrl } = await import("@/server/integgri");
    const url = normalizeInteggriUrl(data.url.trim() || "https://iapi.integgri.com.br");
    upsertEnv({
      INTEGGRI_URL: url,
      INTEGGRI_WHATSAPP_ID: data.whatsappId?.trim() ?? "",
      INTEGGRI_QUEUE_ID: data.queueId?.trim() ?? "",
      INTEGGRI_USER_ID: data.userId?.trim() ?? "",
      WHATSAPP_PROVIDER: data.enabled ? "integgri" : "waha",
      ...(data.token.trim() ? { INTEGGRI_TOKEN: data.token.trim() } : {}),
    });
    return { ok: true as const };
  });

export const testInteggriFn = createServerFn({ method: "POST" })
  .validator(testSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    const { toWhatsAppChatId } = await import("@/server/omie/notifications");
    const chatId = toWhatsAppChatId(data.phone);
    if (!chatId) {
      return { ok: false as const, error: "Número de WhatsApp inválido." };
    }
    try {
      const { sendInteggriText, isInteggriConfigured } = await import("@/server/integgri");
      if (!isInteggriConfigured()) {
        return { ok: false as const, error: "Salve URL e token da Integgri antes de testar." };
      }
      await sendInteggriText(chatId, `${APP_NAME}: conexão com a Integgri ok.`);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível enviar pela Integgri.",
      };
    }
  });
