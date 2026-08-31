import "@tanstack/react-start/server-only";

import type { DueItem } from "@/db/schema";
import { omieCall, type OmieAppConfig } from "@/server/omie/client";

export type DueItemDocument = {
  filename: string;
  mimetype: string;
  url?: string;
  base64?: string;
};

function safeFilename(value: string) {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 80) || "documento";
}

async function resolveBoletoDocument(app: OmieAppConfig, item: DueItem) {
  if (!item.omieCode) return null;

  const response = await omieCall<{
    cLinkBoleto?: string;
    cCodStatus?: string;
    cDesStatus?: string;
  }>(app, "/financas/contareceberboleto/", "ObterBoleto", {
    nCodTitulo: item.omieCode,
    cCodIntTitulo: item.integrationCode ?? "",
  });

  if (!response.cLinkBoleto) return null;

  const label = item.documentNumber ?? String(item.omieCode);
  return {
    filename: `${safeFilename(label)}.pdf`,
    mimetype: "application/pdf",
    url: response.cLinkBoleto,
  } satisfies DueItemDocument;
}

export async function resolveDueItemDocument(app: OmieAppConfig, item: DueItem) {
  if (item.itemType !== "boleto") return null;

  try {
    return await resolveBoletoDocument(app, item);
  } catch {
    return null;
  }
}
