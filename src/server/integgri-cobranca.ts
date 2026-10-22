import "@tanstack/react-start/server-only";

import { createDocLink } from "@/db/doc-links";
import { getDueItemById } from "@/db/due-items";
import {
  listPendingDocsForPhone,
  markPendingFulfilled,
  queuePendingDueItems,
  queuePendingTestDocument,
} from "@/db/waba-pending";
import { formatDisplayDate, listOmieApps } from "@/server/omie/client";
import { resolveDueItemPdfWithStatus } from "@/server/omie/documents";
import {
  sendWhatsAppCobrancaTemplate,
  sendWhatsAppDocument,
  sendWhatsAppDocumentoPagamentoTemplate,
  sendWhatsAppText,
  usesWabaTemplateForCobranca,
} from "@/server/whatsapp";

function digitsPhone(value: string) {
  return value.replace(/\D/g, "");
}

export function extractInboundPhone(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    root["number"],
    root["phone"],
    root["from"],
    root["contactNumber"],
    (root["contact"] as Record<string, unknown> | undefined)?.["number"],
    (root["contact"] as Record<string, unknown> | undefined)?.["phone"],
    (root["data"] as Record<string, unknown> | undefined)?.["number"],
    (root["data"] as Record<string, unknown> | undefined)?.["from"],
    (root["message"] as Record<string, unknown> | undefined)?.["from"],
    (root["ticket"] as Record<string, unknown> | undefined)?.["contact"],
  ];
  for (const value of candidates) {
    if (typeof value === "string" || typeof value === "number") {
      const digits = digitsPhone(String(value));
      if (digits.length >= 10) return digits;
    }
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      for (const key of ["number", "phone", "mobile", "whatsapp"]) {
        const nestedValue = nested[key];
        if (typeof nestedValue === "string" || typeof nestedValue === "number") {
          const digits = digitsPhone(String(nestedValue));
          if (digits.length >= 10) return digits;
        }
      }
    }
  }
  return null;
}

export function isInboundCustomerMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const root = payload as Record<string, unknown>;
  const fromMe =
    root["fromMe"] ??
    root["from_me"] ??
    (root["message"] as Record<string, unknown> | undefined)?.["fromMe"];
  if (fromMe === true || fromMe === "true" || fromMe === 1) return false;
  const direction = String(root["direction"] ?? root["type"] ?? "").toLowerCase();
  if (direction.includes("out") || direction === "sent") return false;
  return true;
}

async function resolveItemDocumentLink(dueItemId: number, phone: string) {
  const item = await getDueItemById(dueItemId);
  if (!item) throw new Error(`Documento ${dueItemId} não encontrado.`);
  const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
  if (!app) throw new Error(`App Omie não encontrado para o item ${dueItemId}.`);

  const result = await resolveDueItemPdfWithStatus(app, item);
  const target =
    result.link?.trim() ||
    (result.document?.url ? result.document.url.trim() : "") ||
    "";
  if (!target) {
    throw new Error(result.status ?? `Sem link/PDF para o item ${dueItemId}.`);
  }

  const label = [
    item.clientName?.trim(),
    (result.documentNumber ?? item.documentNumber)
      ? `Doc. ${result.documentNumber ?? item.documentNumber}`
      : null,
    `Venc. ${formatDisplayDate(item.dueDate)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const short = await createDocLink({
    targetUrl: target,
    dueItemId,
    phone,
    label,
  });
  return { ...short, targetUrl: target, label, item };
}

/**
 * Envia template documento_para_pagamento com {{1}} = link do boleto.
 * Um template por documento (cada um com seu link).
 */
export async function notifyCobrancaViaWabaTemplate(chatId: string, dueItemIds: number[]) {
  const phone = digitsPhone(chatId);
  const errors: string[] = [];
  let sent = 0;

  for (const dueItemId of dueItemIds) {
    try {
      const doc = await resolveItemDocumentLink(dueItemId, phone);
      await sendWhatsAppDocumentoPagamentoTemplate(phone, doc.url);
      sent += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Falha no template com link.");
    }
  }

  if (sent === 0) {
    // Fallback antigo: aviso estático + fila para resposta (se API de variáveis falhar).
    await sendWhatsAppCobrancaTemplate(phone);
    await queuePendingDueItems(phone, dueItemIds);
    if (errors.length) {
      throw new Error(errors.join(" | "));
    }
  } else if (errors.length) {
    console.warn("[waba-cobranca] parcial", { sent, errors });
  }
}

export async function fulfillPendingDocsForPhone(phone: string) {
  const pending = await listPendingDocsForPhone(phone);
  if (!pending.length) {
    return { ok: true as const, sent: 0, skipped: true as const, reason: "Sem documentos pendentes." };
  }

  const chatId = digitsPhone(phone);
  const errors: string[] = [];
  let sent = 0;
  const fulfilledIds: number[] = [];

  for (const row of pending) {
    try {
      if (row.testBase64 && row.testFilename) {
        await sendWhatsAppDocument(
          chatId,
          {
            filename: row.testFilename,
            mimetype: row.testMimetype || "application/pdf",
            base64: row.testBase64,
          },
          "Segue o documento solicitado.",
        );
        sent += 1;
        fulfilledIds.push(row.id);
        continue;
      }

      if (!row.dueItemId) {
        fulfilledIds.push(row.id);
        continue;
      }

      const doc = await resolveItemDocumentLink(row.dueItemId, chatId);
      try {
        await sendWhatsAppDocumentoPagamentoTemplate(chatId, doc.url);
        sent += 1;
        fulfilledIds.push(row.id);
        continue;
      } catch {
        // tenta arquivo/link livre se a janela permitir
      }

      const item = doc.item;
      const result = await resolveDueItemPdfWithStatus(
        listOmieApps().find((entry) => entry.id === item.omieAppId)!,
        item,
      );
      const caption = doc.label;

      if (result.document) {
        await sendWhatsAppDocument(chatId, result.document, caption);
        sent += 1;
        fulfilledIds.push(row.id);
        continue;
      }
      if (result.link || doc.targetUrl) {
        await sendWhatsAppText(
          chatId,
          [`📎 Documento`, caption, "", result.link || doc.targetUrl].filter(Boolean).join("\n"),
        );
        sent += 1;
        fulfilledIds.push(row.id);
        continue;
      }
      errors.push(`Item ${row.dueItemId}: ${result.status ?? "PDF indisponível."}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Falha ao enviar documento.");
    }
  }

  await markPendingFulfilled(fulfilledIds);
  return { ok: true as const, sent, errors, skipped: false as const };
}

export async function handleInteggriInboundWebhook(payload: unknown) {
  if (!isInboundCustomerMessage(payload)) {
    return { ok: true, ignored: true, reason: "mensagem de saída ou inválida" };
  }
  const phone = extractInboundPhone(payload);
  if (!phone) {
    return { ok: true, ignored: true, reason: "telefone não encontrado no payload" };
  }
  if (!usesWabaTemplateForCobranca()) {
    return { ok: true, ignored: true, reason: "fluxo WABA de cobrança inativo" };
  }
  const result = await fulfillPendingDocsForPhone(phone);
  console.info("[integgri-webhook] fulfill", { phone, ...result });
  return { ok: true, phone, ...result };
}

export async function prepareTestDocumentoPagamento(phone: string, documentUrl?: string) {
  const target =
    documentUrl?.trim() ||
    "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
  const short = await createDocLink({
    targetUrl: target,
    phone,
    label: "Teste documento_para_pagamento",
  });
  const result = await sendWhatsAppDocumentoPagamentoTemplate(phone, short.url);
  return {
    phone: digitsPhone(phone),
    template: "documento_para_pagamento",
    variable: short.url,
    targetUrl: target,
    channel: result.channel,
  };
}

export async function prepareTestCobrancaFlow(phone: string) {
  return prepareTestDocumentoPagamento(phone);
}
