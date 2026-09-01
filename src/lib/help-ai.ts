import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const askSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  pathname: z.string().max(200).optional(),
  history: z.array(historyItemSchema).max(12).optional(),
});

export const getHelpAiStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) return { enabled: false as const };
  const { isGroqConfigured } = await import("@/server/groq");
  return { enabled: isGroqConfigured() };
});

export const askHelpChatFn = createServerFn({ method: "POST" })
  .validator((input) => askSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/auth");
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false as const, error: "Faça login para usar o assistente." };
    }

    const { answerBoletoAssistant } = await import("@/server/omie/boleto-assistant");
    return answerBoletoAssistant({
      message: data.message,
      pathname: data.pathname,
      history: data.history,
    });
  });
