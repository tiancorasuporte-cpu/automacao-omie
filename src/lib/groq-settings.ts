import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const saveSchema = z.object({
  apiKey: z.string(),
  model: z.string().trim().min(1, "Informe o modelo"),
  clearKey: z.boolean().optional(),
});

export const getGroqSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSuperadmin } = await import("@/lib/require-auth");
  await requireSuperadmin();
  const { isGroqConfigured, readGroqConfig } = await import("@/server/groq");
  const config = readGroqConfig();
  return {
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
    configured: isGroqConfigured(),
    maskedKey: config.apiKey ? `••••${config.apiKey.slice(-4)}` : null,
  };
});

export const saveGroqSettingsFn = createServerFn({ method: "POST" })
  .validator((input) => saveSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireSuperadmin } = await import("@/lib/require-auth");
    await requireSuperadmin();
    const { upsertEnv } = await import("@/db/client");
    const model = data.model.trim() || "openai/gpt-oss-20b";

    if (data.clearKey) {
      upsertEnv({
        GROQ_API_KEY: "",
        GROQ_MODEL: model,
      });
      return { ok: true as const, cleared: true as const };
    }

    const updates: Record<string, string> = { GROQ_MODEL: model };
    const key = data.apiKey.trim();
    if (key) updates.GROQ_API_KEY = key;
    upsertEnv(updates);
    return { ok: true as const, cleared: false as const };
  });

export const testGroqFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireSuperadmin } = await import("@/lib/require-auth");
  await requireSuperadmin();
  const { isGroqConfigured, chatWithGroq } = await import("@/server/groq");
  if (!isGroqConfigured()) {
    return { ok: false as const, error: "Configure a chave Groq antes de testar." };
  }
  try {
    const answer = await chatWithGroq({
      message: "Responda apenas com a palavra: ok",
      pathname: "/hotels",
    });
    return { ok: true as const, answer: answer.slice(0, 200) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Falha ao testar o Groq.",
    };
  }
});
