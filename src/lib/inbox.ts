import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const listSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const messagesSchema = z.object({
  chatId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

const sendSchema = z.object({
  chatId: z.string().trim().min(1),
  text: z.string().trim().min(1, "Digite uma mensagem"),
  assumeHandoff: z.boolean().optional(),
});

const chatIdSchema = z.object({
  chatId: z.string().trim().min(1),
});

export const listInboxChatsFn = createServerFn({ method: "GET" })
  .validator(listSchema.optional())
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { fetchInboxChats } = await import("@/server/waha-inbox");
    const { isWahaConfigured } = await import("@/server/waha");
    try {
      const result = await fetchInboxChats(data);
      return { ...result, configured: isWahaConfigured() };
    } catch (error) {
      return {
        ok: false as const,
        configured: isWahaConfigured(),
        error: error instanceof Error ? error.message : "Não foi possível listar conversas.",
      };
    }
  });

export const getInboxMessagesFn = createServerFn({ method: "GET" })
  .validator(messagesSchema)
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { fetchInboxMessages } = await import("@/server/waha-inbox");
    try {
      return await fetchInboxMessages(data.chatId, { limit: data.limit });
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível carregar mensagens.",
      };
    }
  });

export const sendInboxReplyFn = createServerFn({ method: "POST" })
  .validator(sendSchema)
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { sendWhatsAppText } = await import("@/server/whatsapp");
    const { addHumanHandoff, normalizeInboxChatId } = await import("@/server/waha-handoff");

    const chatId = normalizeInboxChatId(data.chatId);
    if (!chatId) {
      return { ok: false as const, error: "Conversa inválida." };
    }

    if (data.assumeHandoff !== false) {
      addHumanHandoff(chatId);
    }

    try {
      await sendWhatsAppText(chatId, data.text);
      return { ok: true as const, chatId };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível enviar a mensagem.",
      };
    }
  });

export const assumeInboxChatFn = createServerFn({ method: "POST" })
  .validator(chatIdSchema)
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { addHumanHandoff } = await import("@/server/waha-handoff");
    return addHumanHandoff(data.chatId);
  });

export const releaseInboxChatFn = createServerFn({ method: "POST" })
  .validator(chatIdSchema)
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { removeHumanHandoff } = await import("@/server/waha-handoff");
    return removeHumanHandoff(data.chatId);
  });
