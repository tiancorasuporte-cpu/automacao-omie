import "@tanstack/react-start/server-only";

import {
  boletosToDeliver,
  extractDocumento,
  formatBoletoLookupAnswer,
  formatBoletoStatusLabel,
  lookupBoletosByDocumento,
  parseBoletoSelection,
  type OpenBoletoHit,
} from "@/server/omie/boleto-lookup";
import { formatDisplayDate } from "@/server/omie/client";
import { APP_NAME } from "@/lib/brand";

export type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationMode = "menu" | "boleto" | "human";

export function welcomeMenuMessage() {
  return [
    `Olá! Sou o assistente da *${APP_NAME}*.`,
    "",
    "Como posso ajudar?",
    "",
    "*1* — Solicitar boleto (CNPJ/CPF)",
    "*2* — Falar com um atendente",
    "",
    "Responda com *1* ou *2*.",
  ].join("\n");
}

export function handoffToHumanMessage() {
  return [
    "Certo! Encaminhei sua conversa para um *atendente*.",
    "",
    "Aguarde — a partir de agora o bot *não responderá* neste chat.",
    "Quando o atendente finalizar, você pode digitar *menu* para voltar ao bot.",
  ].join("\n");
}

export function boletoModePrompt() {
  return "Envie o *CNPJ* ou *CPF* para eu buscar e enviar seus boletos.\n\n(Digite *menu* para voltar às opções.)";
}

function isGreeting(text: string) {
  return /^(oi|ol[aá]|bom dia|boa tarde|boa noite|hey|hello|hi|e a[ií]|opa)\b/i.test(text.trim());
}

function wantsMainMenu(text: string) {
  return /\b(menu|inicio|início|voltar|reiniciar|0)\b/i.test(text.trim());
}

function parseMenuSelection(text: string): ConversationMode | null {
  const normalized = text.trim().toLowerCase();
  if (/^(1|boleto|boletos|solicitar boleto|quero boleto|meu boleto)$/.test(normalized)) {
    return "boleto";
  }
  if (/^(2|atendente|humano|atendimento|falar com atendente|quero atendente)$/.test(normalized)) {
    return "human";
  }
  return null;
}

function wantsBoleto(text: string) {
  return /\b(boleto|boletos|fatura|faturas|titulo|título|vencimento|2[aª]\s*via|segunda\s*via|pdf|link)\b/i.test(
    text,
  );
}

function wantsBoletoDelivery(text: string) {
  return /\b(link|pdf|envia|enviar|manda|mandar|segunda\s*via|2[aª]\s*via|todos?\s*os?\s*boletos?|me\s*manda|me\s*envia)\b/i.test(
    text,
  );
}

function formatSelectionAnswer(hit: OpenBoletoHit, index: number) {
  return [
    `Segue o boleto *${index + 1}*:`,
    `${hit.omieAppName} · Doc. ${hit.documentNumber ?? "—"}`,
    `Venc. ${formatDisplayDate(hit.dueDate)} · ${formatBoletoStatusLabel(hit.status)}`,
    "",
    "📎 Enviando PDF ou link em seguida…",
  ].join("\n");
}

export async function answerBoletoAssistant(input: {
  message: string;
  history?: ChatHistoryItem[];
  pathname?: string;
  pendingBoletos?: OpenBoletoHit[];
  mode?: ConversationMode;
}) {
  const mode = input.mode ?? "menu";
  const documento = extractDocumento(input.message);
  const menuChoice = parseMenuSelection(input.message);

  if (wantsMainMenu(input.message)) {
    return {
      ok: true as const,
      source: "menu" as const,
      answer: welcomeMenuMessage(),
      mode: "menu" as const,
      pendingBoletos: undefined,
    };
  }

  if (menuChoice === "human") {
    return {
      ok: true as const,
      source: "menu" as const,
      answer: handoffToHumanMessage(),
      mode: "human" as const,
      pendingBoletos: undefined,
    };
  }

  if (menuChoice === "boleto") {
    return {
      ok: true as const,
      source: "menu" as const,
      answer: boletoModePrompt(),
      mode: "boleto" as const,
      pendingBoletos: undefined,
    };
  }

  if (!documento && input.pendingBoletos?.length) {
    const index = parseBoletoSelection(input.message, input.pendingBoletos.length);
    if (index != null) {
      const hit = input.pendingBoletos[index]!;
      return {
        ok: true as const,
        source: "omie" as const,
        answer: formatSelectionAnswer(hit, index),
        boletos: [hit],
        pendingBoletos: input.pendingBoletos,
        mode: "boleto" as const,
      };
    }

    if (wantsBoletoDelivery(input.message)) {
      const boletos = boletosToDeliver(input.pendingBoletos);
      if (boletos.length > 0) {
        return {
          ok: true as const,
          source: "omie" as const,
          answer: `📎 Enviando *${boletos.length}* boleto(s) (PDF ou link)…`,
          boletos,
          pendingBoletos: input.pendingBoletos,
          mode: "boleto" as const,
        };
      }
      return {
        ok: true as const,
        source: "omie" as const,
        answer:
          "Não encontrei boletos em aberto na lista anterior para enviar. Envie o CNPJ/CPF para consultar de novo.",
        pendingBoletos: input.pendingBoletos,
        mode: "boleto" as const,
      };
    }
  }

  if (documento) {
    try {
      const result = await lookupBoletosByDocumento(documento);
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }

      const boletos = boletosToDeliver(result.boletos);

      return {
        ok: true as const,
        source: "omie" as const,
        answer: formatBoletoLookupAnswer(result),
        boletos,
        pendingBoletos: result.boletos,
        mode: "boleto" as const,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao consultar boletos no Omie.",
      };
    }
  }

  if (mode === "menu" || isGreeting(input.message) || !input.history?.length) {
    return {
      ok: true as const,
      source: "menu" as const,
      answer: welcomeMenuMessage(),
      mode: "menu" as const,
      pendingBoletos: undefined,
    };
  }

  if (mode === "boleto" || wantsBoleto(input.message)) {
    return {
      ok: true as const,
      source: "faq" as const,
      answer: boletoModePrompt(),
      mode: "boleto" as const,
      pendingBoletos: input.pendingBoletos,
    };
  }

  // Sem Groq para mensagens aleatórias — só menu/boleto.
  return {
    ok: true as const,
    source: "menu" as const,
    answer: welcomeMenuMessage(),
    mode: "menu" as const,
    pendingBoletos: undefined,
  };
}
