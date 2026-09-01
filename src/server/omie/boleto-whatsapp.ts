import "@tanstack/react-start/server-only";

import { formatDisplayDate, listOmieApps } from "@/server/omie/client";
import { resolveBoletoPdfWithStatus } from "@/server/omie/documents";
import type { OpenBoletoHit } from "@/server/omie/boleto-lookup";
import { sendWahaDocument, sendWahaText } from "@/server/waha";

const MAX_BOLETO_PDFS = 5;

function money(value: number | null) {
  return value == null
    ? "—"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBoletoSection(input: {
  index: number;
  hit: OpenBoletoHit;
  link?: string | null;
  barcode?: string | null;
  documentNumber?: string | null;
}) {
  const doc = input.documentNumber ?? input.hit.documentNumber;
  const lines = [
    `*${input.index + 1}.* ${input.hit.omieAppName}${doc ? ` · Doc. ${doc}` : ""}`,
    `   Venc. ${formatDisplayDate(input.hit.dueDate)} · ${money(input.hit.amount)}`,
  ];
  if (input.link) lines.push("", input.link);
  if (input.barcode) lines.push("", `Linha digitável:\n${input.barcode}`);
  return lines.join("\n");
}

/** Envia PDFs (ou links) dos boletos encontrados na consulta por CNPJ. */
export async function sendOpenBoletoPdfs(chatId: string, boletos: OpenBoletoHit[]) {
  const apps = listOmieApps();
  let sent = 0;
  const failures: string[] = [];
  const linkSections: string[] = [];

  for (const hit of boletos) {
    if (sent + linkSections.length >= MAX_BOLETO_PDFS) break;

    if (!hit.omieCode) {
      failures.push(
        `• ${hit.omieAppName} venc. ${formatDisplayDate(hit.dueDate)}: sem código Omie para gerar PDF.`,
      );
      continue;
    }

    const app = apps.find((a) => a.id === hit.omieAppId);
    if (!app) continue;

    try {
      const result = await resolveBoletoPdfWithStatus(app, {
        omieCode: hit.omieCode,
        integrationCode: hit.integrationCode,
        documentNumber: hit.documentNumber,
      });

      const caption = [
        hit.omieAppName,
        (result.documentNumber ?? hit.documentNumber)
          ? `Doc. ${result.documentNumber ?? hit.documentNumber}`
          : null,
        `Venc. ${formatDisplayDate(hit.dueDate)}`,
        money(hit.amount),
      ]
        .filter(Boolean)
        .join(" · ");

      if (result.document) {
        try {
          await sendWahaDocument(chatId, result.document, caption);
          sent += 1;
          console.info("[waha-bot] PDF enviado", { chatId, omieCode: hit.omieCode });
          continue;
        } catch (pdfError) {
          console.warn("[waha-bot] PDF falhou, tentando link", hit.omieCode, pdfError);
          if (!result.link) throw pdfError;
        }
      }

      if (result.link) {
        linkSections.push(
          formatBoletoSection({
            index: sent + linkSections.length,
            hit,
            link: result.link,
            barcode: result.barcode,
            documentNumber: result.documentNumber ?? hit.documentNumber,
          }),
        );
        continue;
      }

      failures.push(
        `• ${hit.omieAppName} venc. ${formatDisplayDate(hit.dueDate)}${hit.documentNumber ? ` (doc. ${hit.documentNumber})` : ""}: ${result.status ?? "PDF indisponível."}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao enviar PDF.";
      failures.push(
        `• ${hit.omieAppName} venc. ${formatDisplayDate(hit.dueDate)}: ${msg.slice(0, 120)}`,
      );
      console.warn("[waha-bot] falha ao enviar boleto", hit.omieAppId, hit.omieCode, error);
    }
  }

  if (linkSections.length > 0) {
    await sendWahaText(chatId, ["📎 *Boletos:*", "", ...linkSections].join("\n\n"));
    sent += linkSections.length;
    console.info("[waha-bot] links enviados em lote", { chatId, count: linkSections.length });
  }

  if (failures.length > 0) {
    await sendWahaText(
      chatId,
      [
        sent > 0
          ? "Alguns boletos não puderam ser anexados:"
          : "Não consegui obter o PDF/link destes boletos:",
        ...failures.slice(0, 5),
        "",
        "_Boletos vencidos podem precisar ser gerados ou prorrogados no Omie._",
      ].join("\n"),
    );
  }

  return sent;
}
