import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { answerHelpQuestion } from "@/lib/help-chat";

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

    const { isGroqConfigured, chatWithGroq } = await import("@/server/groq");
    if (isGroqConfigured()) {
      try {
        const answer = await chatWithGroq({
          message: data.message,
          pathname: data.pathname,
          history: data.history,
        });
        return { ok: true as const, source: "groq" as const, answer };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Falha ao falar com o Groq";
        const fallback = answerHelpQuestion(data.message);
        return {
          ok: true as const,
          source: "faq" as const,
          answer: `${fallback.answer}\n\n(IA indisponível: ${reason})`,
        };
      }
    }

    const faq = answerHelpQuestion(data.message);
    return { ok: true as const, source: "faq" as const, answer: faq.answer };
  });
