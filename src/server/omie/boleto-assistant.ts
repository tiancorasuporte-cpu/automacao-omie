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
import {
  extractDocumentQuery,
  formatDocumentSearchAnswer,
  locateModePrompt,
  searchDueDocuments,
} from "@/server/omie/document-search";
import { formatDisplayDate } from "@/server/omie/client";
import { APP_NAME } from "@/lib/brand";

export type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationMode = "menu" | "boleto" | "locate" | "human";

export function welcomeMenuMessage() {
  return [
    `Olá! Sou o assistente da *${APP_NAME}*.`,
    "",
    "Como posso ajudar?",
    "",
    "*1* — Solicitar boleto (CNPJ/CPF)",
    "*2* — Falar com um atendente",
    "*3* — Localizar boleto ou NF (número/cliente)",
    "",
    "Responda com *1*, *2* ou *3* — ou mande direto: *boleto 1675821 Lampa*.",
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
  if (
    /^(1|boleto|boletos|solicitar boleto|quero boleto|meu boleto|consultar boleto por cnpj)$/.test(
      normalized,
    )
  ) {
    return "boleto";
  }
  if (/^(2|atendente|humano|atendimento|falar com atendente|quero atendente)$/.test(normalized)) {
    return "human";
  }
  if (
    /^(3|localizar|localiza|encontrar|procurar|buscar)$/.test(normalized) ||
    /^localizar\b/.test(normalized) ||
    /^(nao|não)\s+(acho|encont|consigo\s+local)/.test(normalized)
  ) {
    return "locate";
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

async function runDocumentLocate(message: string) {
  const query = extractDocumentQuery(message);
  try {
    const result = await searchDueDocuments({
      numbers: query.numbers,
      clientHint: query.clientHint,
    });
    return {
      ok: true as const,
      source: "locate" as const,
      answer: formatDocumentSearchAnswer(result),
      mode: "locate" as const,
      pendingBoletos: undefined,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Falha ao localizar documento.",
    };
  }
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
  const docQuery = extractDocumentQuery(input.message);

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

  if (menuChoice === "locate") {
    return {
      ok: true as const,
      source: "menu" as const,
      answer: locateModePrompt(),
      mode: "locate" as const,
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

  // Localizar por número de boleto/NF (+ cliente) — prioriza sobre o fluxo de CNPJ quando há nº curto.
  if (
    mode === "locate" ||
    (docQuery.numbers.length > 0 && !documento) ||
    (docQuery.wantsLocate && docQuery.numbers.length > 0)
  ) {
    // Em modo locate sem número ainda, só pede o prompt.
    if (mode === "locate" && docQuery.numbers.length === 0 && !docQuery.clientHint) {
      return {
        ok: true as const,
        source: "locate" as const,
        answer: locateModePrompt(),
        mode: "locate" as const,
        pendingBoletos: undefined,
      };
    }
    if (docQuery.numbers.length > 0 || docQuery.clientHint) {
      return runDocumentLocate(input.message);
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

  if (mode === "locate") {
    return {
      ok: true as const,
      source: "locate" as const,
      answer: locateModePrompt(),
      mode: "locate" as const,
      pendingBoletos: undefined,
    };
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
    // Frases do tipo "não acho o boleto 123" já caíram no locate acima.
    return {
      ok: true as const,
      source: "faq" as const,
      answer: boletoModePrompt(),
      mode: "boleto" as const,
      pendingBoletos: input.pendingBoletos,
    };
  }

  // Sem Groq para mensagens aleatórias — só menu/boleto/locate.
  return {
    ok: true as const,
    source: "menu" as const,
    answer: welcomeMenuMessage(),
    mode: "menu" as const,
    pendingBoletos: undefined,
  };
}
