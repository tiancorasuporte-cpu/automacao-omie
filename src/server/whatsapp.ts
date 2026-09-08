import "@tanstack/react-start/server-only";

import {
  isInteggriConfigured,
  readInteggriConfig,
  sendInteggriDocument,
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

export async function sendWhatsAppText(chatId: string, text: string) {
  if (readWhatsAppProvider() === "integgri") {
    await sendInteggriText(chatId, text);
    return;
  }
  await sendWahaText(chatId, text);
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
