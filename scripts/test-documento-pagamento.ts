/**
 * Envia template documento_para_pagamento com {{1}} = link do PDF.
 *
 * Uso:
 *   bun scripts/test-documento-pagamento.ts 5516997266605
 *   bun scripts/test-documento-pagamento.ts 5516997266605 https://exemplo.com/boleto.pdf
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

const phone = (process.argv[2] ?? "5516997266605").replace(/\D/g, "");
const documentUrl = process.argv[3];

const { ensureSchema } = await import("../src/db/schema");
await ensureSchema();

const { prepareTestDocumentoPagamento } = await import("../src/server/integgri-cobranca");

try {
  const result = await prepareTestDocumentoPagamento(phone, documentUrl);
  console.log("OK:", result);
  console.log("Confira o WhatsApp — o template deve trazer o link na variável.");
} catch (error) {
  console.error("FALHOU:", error instanceof Error ? error.message : error);
  console.error(`
A API Chat da Integgri só envia templates ESTÁTICOS (sem {{1}}).
Templates com variável precisam do Soft10 WABA liberado (SOFT10_TOKEN) ou
permissão da Integgri para templates dinâmicos.
`);
  process.exit(1);
}
