import "@tanstack/react-start/server-only";

import {
  isInteggriConfigured,
  readCobrancaTemplateName,
  readDocumentoPagamentoTemplateName,
  readInteggriConfig,
  sendInteggriDocument,
  sendInteggriTemplate,
  sendInteggriText,
} from "@/server/integgri";
import { isWahaConfigured, sendWahaDocument, sendWahaText } from "@/server/waha";

export type WhatsAppProvider = "integgri" | "waha";

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

/** Template com variável {{1}} = link do documento. */
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
