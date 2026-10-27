/**
 * Testa templates novos (lembrete + envio) com boletos reais Omie.
 * Uso: bun scripts/test-waba-doc-templates.ts 16997266605
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
    if (process.env[key] == null) process.env[key] = value;
  }
}

const phoneRaw = (process.argv[2] ?? "16997266605").replace(/\D/g, "");
const phone = phoneRaw.startsWith("55") ? phoneRaw : `55${phoneRaw}`;

const { ensureSchema } = await import("../src/db/schema");
await ensureSchema();

const { listDueItems } = await import("../src/db/due-items");
const { listOmieApps } = await import("../src/server/omie/client");
const { resolveDueItemPdfWithStatus } = await import("../src/server/omie/documents");
const { sendWhatsAppDocsBundleTemplate } = await import("../src/server/whatsapp");

const items = await listDueItems({ openOnly: true, currentMonthOnly: false });
const links: string[] = [];
let clientName = "Cliente Teste Âncora";

for (const item of items.filter((i) => i.itemType === "boleto" && i.omieCode)) {
  if (links.length >= 3) break;
  const app = listOmieApps().find((a) => a.id === item.omieAppId);
  if (!app) continue;
  const result = await resolveDueItemPdfWithStatus(app, item);
  const target =
    result.link?.trim() ||
    (result.document?.url ? result.document.url.trim() : "") ||
    "";
  if (!target.startsWith("https://cdn.omie.com.br")) continue;
  if (item.clientName?.trim()) clientName = item.clientName.trim();
  links.push(target);
  console.log(`link ${links.length}: doc=${result.documentNumber ?? item.documentNumber}`);
}

if (links.length < 1) {
  console.error("Não achei boleto Omie com link.");
  process.exit(1);
}

const cases: Array<{
  label: string;
  kind: "lembrete" | "envio";
  count: number;
}> = [
  { label: "lembrete 1 doc", kind: "lembrete", count: 1 },
  { label: "lembrete 2 docs", kind: "lembrete", count: Math.min(2, links.length) },
  { label: "envio 1 doc", kind: "envio", count: 1 },
  { label: "envio 2 docs", kind: "envio", count: Math.min(2, links.length) },
  { label: "envio 3 docs", kind: "envio", count: Math.min(3, links.length) },
];

for (const c of cases) {
  if (c.count < 1) continue;
  if (c.kind === "lembrete" && c.count === 2 && links.length < 2) {
    console.log(`SKIP ${c.label}: precisa de 2 links`);
    continue;
  }
  if (c.kind === "envio" && c.count === 3 && links.length < 3) {
    console.log(`SKIP ${c.label}: precisa de 3 links`);
    continue;
  }
  console.log(`\n>>> Enviando ${c.label}…`);
  try {
    const result = await sendWhatsAppDocsBundleTemplate({
      chatId: phone,
      kind: c.kind,
      clientName,
      documentLinks: links.slice(0, c.count),
    });
    console.log("OK", result);
  } catch (error) {
    console.error("FALHOU", c.label, error instanceof Error ? error.message : error);
  }
  await new Promise((r) => setTimeout(r, 2500));
}

console.log("\nPronto. Confira o WhatsApp em", phone);
