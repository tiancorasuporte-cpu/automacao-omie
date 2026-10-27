/**
 * Simula o botão Enviar (envio_para_pagamento) e valida o link público.
 * Uso: bun scripts/test-enviar-link-fix.ts [telefone] [dueItemId?]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const phoneRaw = (process.argv[2] ?? "16997266605").replace(/\D/g, "");
const phone = phoneRaw.startsWith("55") ? phoneRaw : `55${phoneRaw}`;
const forcedId = process.argv[3] ? Number(process.argv[3]) : null;

const { ensureSchema } = await import("../src/db/schema");
await ensureSchema();

const { readPublicSiteUrl, isPublicTemplateUrl } = await import("../src/db/doc-links");
const { listDueItems, getDueItemById } = await import("../src/db/due-items");
const { notifyCobrancaViaWabaTemplate } = await import("../src/server/integgri-cobranca");

console.log("PUBLIC_SITE_URL resolvido:", readPublicSiteUrl());
console.log("PUBLIC_APP_URL env:", process.env["PUBLIC_APP_URL"]);

let item =
  forcedId && Number.isFinite(forcedId)
    ? await getDueItemById(forcedId)
    : null;

if (!item) {
  const open = await listDueItems({ openOnly: true, currentMonthOnly: false });
  item =
    open.find((row) => /wabtec/i.test(row.clientName ?? "")) ??
    open.find((row) => row.itemType === "nfse") ??
    open.find((row) => row.itemType === "boleto") ??
    open[0] ??
    null;
}

if (!item) {
  console.error("Nenhum due_item aberto encontrado.");
  process.exit(1);
}

console.log("Item:", {
  id: item.id,
  type: item.itemType,
  client: item.clientName,
  doc: item.documentNumber,
  due: item.dueDate,
  omieCode: item.omieCode,
  integrationCode: item.integrationCode,
});

const result = await notifyCobrancaViaWabaTemplate(phone, [item.id], { kind: "envio" });
console.log("Envio OK:", result);

const sampleOk = isPublicTemplateUrl("https://cdn.omie.com.br/x");
const sampleBad = isPublicTemplateUrl("http://192.168.10.105:18094/d/abc");
console.log("check public CDN:", sampleOk, "| check LAN:", sampleBad);
console.log("Confira WhatsApp:", phone);
