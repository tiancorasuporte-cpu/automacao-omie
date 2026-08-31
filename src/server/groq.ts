import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import "@tanstack/react-start/server-only";

import { HELP_TOPICS } from "@/lib/help-chat";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** llama-3.3-70b-versatile was retired on Groq (2026-08-16). */
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const FALLBACK_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.6-27b"] as const;

function decodeEnvValue(value: string) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** Always re-read GROQ_* from .env so hot reloads / stale process.env don't keep a dead model. */
export function readGroqConfig() {
  const fromFile: Record<string, string> = {};
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== "GROQ_API_KEY" && key !== "GROQ_MODEL") continue;
      fromFile[key] = decodeEnvValue(trimmed.slice(eq + 1).trim());
    }
  }

  const apiKey = (fromFile.GROQ_API_KEY ?? process.env["GROQ_API_KEY"] ?? "").trim();
  const model = (fromFile.GROQ_MODEL ?? process.env["GROQ_MODEL"] ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  // Keep process.env in sync for the rest of the request.
  if (apiKey) process.env["GROQ_API_KEY"] = apiKey;
  else delete process.env["GROQ_API_KEY"];
  process.env["GROQ_MODEL"] = model;

  return { apiKey, model };
}

export function isGroqConfigured() {
  return Boolean(readGroqConfig().apiKey);
}

function buildSystemPrompt(pathname?: string) {
  const topics = HELP_TOPICS.map((topic) => `- ${topic.label}: ${topic.answer}`).join("\n");
  return [
    "Você é o Assistente Âncora Access, da Âncora Segurança.",
    "Ajude operadores de hotel a usar a suíte de controle de acesso (Face Max, hóspedes, funcionários, monitoramento, câmeras, Waha).",
    "Responda em português do Brasil, de forma clara, curta e prática (no máximo 2–4 frases curtas, ou passos numerados).",
    "Não invente botões ou telas que não existam. Se não souber, diga para olhar a tela atual ou falar com o suporte Âncora.",
    "Não peça e não invente senhas, tokens ou dados sensíveis.",
    pathname ? `O usuário está na rota: ${pathname}` : "",
    "Base de conhecimento da suíte:",
    topics,
  ]
    .filter(Boolean)
    .join("\n");
}

export type GroqChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function isModelUnavailableError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("decommissioned") ||
    lower.includes("model_not_found") ||
    lower.includes("does not exist") ||
    lower.includes("not available") ||
    lower.includes("no longer supported") ||
    (lower.includes("invalid model") && lower.includes("model"))
  );
}

function friendlyGroqError(message: string, model: string) {
  if (isModelUnavailableError(message)) {
    return `Modelo "${model}" indisponível no Groq. Troque GROQ_MODEL no .env para openai/gpt-oss-20b e reinicie.`;
  }
  const lower = message.toLowerCase();
  if (lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return "A chave GROQ_API_KEY parece inválida. Gere outra em console.groq.com/keys.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "Limite de uso do Groq atingido. Aguarde um pouco e tente de novo.";
  }
  return `${message.slice(0, 160)} (modelo: ${model})`;
}

function extractAssistantText(payload: {
  choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
}) {
  const message = payload.choices?.[0]?.message;
  if (!message) return null;
  const content = message.content?.trim();
  if (content) return content;
  const reasoning = message.reasoning?.trim();
  if (reasoning) return reasoning;
  return null;
}

async function requestGroqCompletion(input: {
  apiKey: string;
  model: string;
  messages: GroqChatMessage[];
}) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.3,
      max_completion_tokens: 450,
      messages: input.messages,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
    choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
  } | null;

  if (!response.ok) {
    const raw = payload?.error?.message || payload?.error?.code || `Groq HTTP ${response.status}`;
    throw new Error(raw);
  }

  const text = extractAssistantText(payload ?? {});
  if (!text) throw new Error("Resposta vazia do Groq");
  return text;
}

export async function chatWithGroq(input: {
  message: string;
  pathname?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const { apiKey, model: preferredModel } = readGroqConfig();
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada");

  const messages: GroqChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.pathname) },
    ...(input.history ?? []).slice(-10).map((item) => ({
      role: item.role,
      content: item.content.slice(0, 1500),
    })),
    { role: "user", content: input.message.slice(0, 1000) },
  ];

  const modelsToTry = [preferredModel, ...FALLBACK_MODELS.filter((item) => item !== preferredModel)];
  let lastError = "Falha ao falar com o Groq";
  let lastModel = preferredModel;

  for (const model of modelsToTry) {
    lastModel = model;
    try {
      return await requestGroqCompletion({ apiKey, model, messages });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (!isModelUnavailableError(lastError)) {
        throw new Error(friendlyGroqError(lastError, model));
      }
      // try next fallback model
    }
  }

  throw new Error(friendlyGroqError(lastError, lastModel));
}
