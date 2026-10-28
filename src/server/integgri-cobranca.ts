import "@tanstack/react-start/server-only";

import { createDocLink, isPublicTemplateUrl } from "@/db/doc-links";
import { getDueItemById } from "@/db/due-items";
import {
  listPendingDocsForPhone,
  markPendingFulfilled,
  queuePendingDueItems,
} from "@/db/waba-pending";
import { formatDisplayDate, listOmieApps } from "@/server/omie/client";
import { resolveDueItemPdfWithStatus } from "@/server/omie/documents";
import {
  sendWhatsAppCobrancaTemplate,
  sendWhatsAppDocsBundleTemplate,
  sendWhatsAppDocument,
  sendWhatsAppDocumentoPagamentoTemplate,
  sendWhatsAppText,
  usesWabaTemplateForCobranca,
  type WabaDocsTemplateKind,
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

function tituloCodeFromItem(item: {
  itemType: string;
  omieCode: number | null;
  integrationCode: string | null;
}) {
  if (item.integrationCode?.startsWith("titulo:")) {
    const n = Number(item.integrationCode.slice("titulo:".length));
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (item.itemType === "boleto" && item.omieCode && item.omieCode > 0) return item.omieCode;
  return null;
}

async function resolveItemDocumentLink(dueItemId: number, phone: string) {
  const item = await getDueItemById(dueItemId);
  if (!item) throw new Error(`Documento ${dueItemId} não encontrado.`);
  const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
  if (!app) throw new Error(`App Omie não encontrado para o item ${dueItemId}.`);

  const result = await resolveDueItemPdfWithStatus(app, item);
  let target =
    result.link?.trim() ||
    (result.document?.url ? result.document.url.trim() : "") ||
    "";

  // NFS-e/NF-e costumam vir só em PDF base64 — tenta boleto do título para o template.
  if (!isPublicTemplateUrl(target) && item.itemType !== "boleto") {
    const tituloCode = tituloCodeFromItem(item);
    if (tituloCode) {
      const boleto = await resolveDueItemPdfWithStatus(app, {
        ...item,
        itemType: "boleto",
        omieCode: tituloCode,
      });
      const boletoUrl =
        boleto.link?.trim() ||
        (boleto.document?.url ? boleto.document.url.trim() : "") ||
        "";
      if (isPublicTemplateUrl(boletoUrl)) {
        target = boletoUrl;
      }
    }
  }

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

  // Preferir URL pública do Omie/prefeitura. Encurtador /d/ só como fallback
  // e nunca com IP LAN (PUBLIC_APP_URL do WAHA).
  if (isPublicTemplateUrl(target)) {
    return {
      token: "",
      url: target,
      targetUrl: target,
      templateLink: target,
      label,
      item,
    };
  }

  const short = await createDocLink({
    targetUrl: target,
    dueItemId,
    phone,
    label,
  });
  if (!isPublicTemplateUrl(short.url)) {
    throw new Error(
      `Link público indisponível para o item ${dueItemId}. Defina PUBLIC_SITE_URL (ex.: https://sistema.ancoraseguranca.app).`,
    );
  }
  return { ...short, targetUrl: target, templateLink: short.url, label, item };
}

/**
 * Envia templates por quantidade de documentos (mesmo cliente):
 * - lembrete: lembrete_de_vencimento_1|2_documento(s)
 * - envio: envio_para_pagamento_1|2|3_documento(s)
 *
 * Vars: {{1}} nome, {{2}} link1, {{3}} link2, {{4}} link3
 */
export async function notifyCobrancaViaWabaTemplate(
  chatId: string,
  dueItemIds: number[],
  options?: { kind?: WabaDocsTemplateKind },
) {
  const phone = digitsPhone(chatId);
  const kind: WabaDocsTemplateKind = options?.kind ?? "envio";
  const uniqueIds = [...new Set(dueItemIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!uniqueIds.length) throw new Error("Nenhum documento para enviar.");

  const errors: string[] = [];
  const resolved = await Promise.all(
    uniqueIds.map(async (dueItemId) => {
      try {
        const doc = await resolveItemDocumentLink(dueItemId, phone);
        return {
          ok: true as const,
          dueItemId,
          templateLink: doc.templateLink,
          clientName: doc.item.clientName,
        };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : `Falha ao resolver documento ${dueItemId}.`,
        };
      }
    }),
  );
  const docs: Array<{ dueItemId: number; templateLink: string; clientName: string | null }> = [];
  for (const entry of resolved) {
    if (entry.ok) {
      docs.push({
        dueItemId: entry.dueItemId,
        templateLink: entry.templateLink,
        clientName: entry.clientName,
      });
    } else {
      errors.push(entry.error);
    }
  }

  if (!docs.length) {
    await sendWhatsAppCobrancaTemplate(phone);
    await queuePendingDueItems(phone, uniqueIds);
    throw new Error(errors.join(" | ") || "Sem links de documento.");
  }

  const clientName =
    docs.map((d) => d.clientName?.trim()).find(Boolean) ||
    "Cliente";

  try {
    const result = await sendWhatsAppDocsBundleTemplate({
      chatId: phone,
      kind,
      clientName,
      documentLinks: docs.map((d) => d.templateLink),
    });
    const sentLinkSet = new Set(result.sentLinks);
    const sentDueItemIds = docs
      .filter((d) => sentLinkSet.has(d.templateLink))
      .map((d) => d.dueItemId);
    const skippedDueItemIds = uniqueIds.filter((id) => !sentDueItemIds.includes(id));
    const allErrors = [...errors, ...result.errors];
    if (allErrors.length || result.plannedMessages > result.messages) {
      console.warn("[waba-cobranca] parcial", {
        errors: allErrors,
        templates: result.templates,
        planned: result.plannedMessages,
        sent: result.messages,
        sentDueItemIds,
        skippedDueItemIds,
      });
    }
    return {
      ...result,
      sentDueItemIds,
      skippedDueItemIds,
      resolveErrors: errors,
    };
  } catch (error) {
    await sendWhatsAppCobrancaTemplate(phone);
    await queuePendingDueItems(phone, uniqueIds);
    throw error;
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
        await sendWhatsAppDocumentoPagamentoTemplate(chatId, doc.templateLink);
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
  const result = await sendWhatsAppDocsBundleTemplate({
    chatId: phone,
    kind: "envio",
    clientName: "Cliente Teste",
    documentLinks: [target],
  });
  return {
    phone: digitsPhone(phone),
    templates: result.templates,
    variable: target,
    targetUrl: target,
    channel: result.channel,
  };
}

export async function prepareTestCobrancaFlow(phone: string) {
  return prepareTestDocumentoPagamento(phone);
}
