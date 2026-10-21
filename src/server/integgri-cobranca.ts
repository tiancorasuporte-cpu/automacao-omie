import "@tanstack/react-start/server-only";

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
  const fromMe = root["fromMe"] ?? root["from_me"] ?? (root["message"] as Record<string, unknown> | undefined)?.["fromMe"];
  if (fromMe === true || fromMe === "true" || fromMe === 1) return false;
  const direction = String(root["direction"] ?? root["type"] ?? "").toLowerCase();
  if (direction.includes("out") || direction === "sent") return false;
  return true;
}

/** Avisa por template e guarda os boletos para enviar só depois da resposta. */
export async function notifyCobrancaViaWabaTemplate(chatId: string, dueItemIds: number[]) {
  await sendWhatsAppCobrancaTemplate(chatId);
  await queuePendingDueItems(chatId, dueItemIds);
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

      const item = await getDueItemById(row.dueItemId);
      if (!item) {
        fulfilledIds.push(row.id);
        continue;
      }
      const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
      if (!app) {
        errors.push(`Item ${row.dueItemId}: app Omie não encontrado.`);
        continue;
      }

      const result = await resolveDueItemPdfWithStatus(app, item);
      const caption = [
        item.clientName?.trim(),
        (result.documentNumber ?? item.documentNumber)
          ? `Doc. ${result.documentNumber ?? item.documentNumber}`
          : null,
        `Venc. ${formatDisplayDate(item.dueDate)}`,
      ]
        .filter(Boolean)
        .join(" · ");

      if (result.document) {
        await sendWhatsAppDocument(chatId, result.document, caption);
        sent += 1;
        fulfilledIds.push(row.id);
        continue;
      }
      if (result.link) {
        await sendWhatsAppText(
          chatId,
          [`📎 Documento`, caption, "", result.link].filter(Boolean).join("\n"),
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

export async function prepareTestCobrancaFlow(phone: string) {
  const pdf = Buffer.from(`%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 78 >>stream
BT /F1 16 Tf 72 720 Td (Boleto teste - resposta WABA) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000394 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
467
%%EOF
`);

  await sendWhatsAppCobrancaTemplate(phone);
  const pendingId = await queuePendingTestDocument({
    phone,
    filename: "boleto-teste.pdf",
    mimetype: "application/pdf",
    base64: pdf.toString("base64"),
  });
  return { pendingId, template: "aviso_de_cobranca", phone: digitsPhone(phone) };
}
