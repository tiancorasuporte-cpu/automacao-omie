import "@tanstack/react-start/server-only";

import {
  envioPagamentoTemplateName,
  isInteggriConfigured,
  lembreteVencimentoTemplateName,
  readCobrancaTemplateName,
  readDocumentoPagamentoTemplateName,
  readInteggriConfig,
  sendInteggriDocument,
  sendInteggriTemplate,
  sendInteggriText,
  type WabaEnvioDocCount,
  type WabaLembreteDocCount,
} from "@/server/integgri";
import { isWahaConfigured, sendWahaDocument, sendWahaText } from "@/server/waha";

export type WhatsAppProvider = "integgri" | "waha";

export type WabaDocsTemplateKind = "lembrete" | "envio";

export function readWhatsAppProvider(): WhatsAppProvider {
  const raw = (process.env["WHATSAPP_PROVIDER"] ?? "").trim().toLowerCase();
  if (raw === "waha") return "waha";
  if (raw === "integgri") return "integgri";
  if (isInteggriConfigured()) return "integgri";
  return "waha";
}

export function isWhatsAppSendConfigured() {
  const provider = readWhatsAppProvider();
  return provider === "integgri" ? isInteggriConfigured() : isWahaConfigured();
}

/** Em conexão WABA Meta, cobrança sai só por template; o PDF vai depois da resposta do cliente. */
export function usesWabaTemplateForCobranca() {
  return readWhatsAppProvider() === "integgri" && isInteggriConfigured();
}

export async function sendWhatsAppText(chatId: string, text: string) {
  if (readWhatsAppProvider() === "integgri") {
    await sendInteggriText(chatId, text);
    return;
  }
  await sendWahaText(chatId, text);
}

export async function sendWhatsAppCobrancaTemplate(chatId: string) {
  if (!usesWabaTemplateForCobranca()) {
    throw new Error("Template de cobrança só está disponível com Integgri/WABA configurada.");
  }
  await sendInteggriTemplate(chatId, readCobrancaTemplateName());
}

/** Template legado com 1 variável = link. */
export async function sendWhatsAppDocumentoPagamentoTemplate(chatId: string, documentLink: string) {
  if (!usesWabaTemplateForCobranca()) {
    throw new Error("Template de documento só está disponível com Integgri/WABA configurada.");
  }
  const link = documentLink.trim();
  if (!/^https?:\/\//i.test(link)) {
    throw new Error("Link do documento inválido.");
  }
  return sendInteggriTemplate(chatId, readDocumentoPagamentoTemplateName(), {
    body: link,
    variables: [link],
  });
}

/**
 * Templates novos:
 * - lembrete_de_vencimento_1|2_documento(s)
 * - envio_para_pagamento_1|2|3_documento(s)
 *
 * Variáveis: {{1}} nome, {{2}} link1, {{3}} link2, {{4}} link3
 */
export async function sendWhatsAppDocsBundleTemplate(input: {
  chatId: string;
  kind: WabaDocsTemplateKind;
  clientName: string;
  documentLinks: string[];
}) {
  if (!usesWabaTemplateForCobranca()) {
    throw new Error("Template WABA só está disponível com Integgri configurada.");
  }

  const name = input.clientName.trim() || "Cliente";
  const links = input.documentLinks.map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l));
  if (!links.length) throw new Error("Nenhum link de documento válido.");

  const maxPerMessage = input.kind === "lembrete" ? 2 : 3;
  const chunks: string[][] = [];
  for (let i = 0; i < links.length; i += maxPerMessage) {
    chunks.push(links.slice(i, i + maxPerMessage));
  }

  let lastChannel: "integgri" | "soft10" = "integgri";
  const templates: string[] = [];

  for (const chunk of chunks) {
    const count = chunk.length as WabaLembreteDocCount | WabaEnvioDocCount;
    const templateName =
      input.kind === "lembrete"
        ? lembreteVencimentoTemplateName(Math.min(count, 2) as WabaLembreteDocCount)
        : envioPagamentoTemplateName(Math.min(count, 3) as WabaEnvioDocCount);

    // msg1=nome, msg2..=links
    const variables = [name, ...chunk];
    const result = await sendInteggriTemplate(input.chatId, templateName, {
      body: chunk[0],
      variables,
    });
    lastChannel = result.channel;
    templates.push(templateName);
  }

  return { channel: lastChannel, templates, messages: chunks.length };
}

export async function sendWhatsAppDocument(
  chatId: string,
  file: { filename: string; mimetype: string; url?: string; base64?: string },
  caption?: string,
) {
  if (readWhatsAppProvider() === "integgri") {
    await sendInteggriDocument(chatId, file, caption);
    return { mode: "file" as const };
  }
  return sendWahaDocument(chatId, file, caption);
}

export function whatsappProviderLabel(provider = readWhatsAppProvider()) {
  return provider === "integgri" ? "Integgri Chat" : "WAHA";
}

export function readWhatsAppStatus() {
  const provider = readWhatsAppProvider();
  const integgri = readInteggriConfig();
  return {
    provider,
    integgriConfigured: isInteggriConfigured(integgri),
    wahaConfigured: isWahaConfigured(),
    sendConfigured: isWhatsAppSendConfigured(),
  };
}
