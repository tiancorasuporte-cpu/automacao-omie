/**
 * Teste do fluxo WABA:
 * 1) Envia template aviso_de_cobranca
 * 2) Guarda um PDF de teste pendente para o número
 * 3) Quando a pessoa responder (webhook) OU você rodar com --fulfill, envia o PDF
 *
 * Uso:
 *   bun scripts/test-waba-cobranca.ts 5516997266605
 *   bun scripts/test-waba-cobranca.ts 5516997266605 --fulfill
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
const fulfill = process.argv.includes("--fulfill");

const { ensureSchema } = await import("../src/db/schema");
await ensureSchema();

const { prepareTestCobrancaFlow, fulfillPendingDocsForPhone } = await import(
  "../src/server/integgri-cobranca"
);

if (fulfill) {
  console.log("Enviando PDF pendente para", phone, "(simula resposta do cliente)...");
  const result = await fulfillPendingDocsForPhone(phone);
  console.log(result);
  if (result.sent > 0) {
    console.log("OK: PDF enviado. Confira o WhatsApp.");
  } else {
    console.log("Nada enviado. Rode sem --fulfill primeiro, ou responda o template e configure o webhook.");
  }
  process.exit(result.sent > 0 ? 0 : 1);
}

console.log("Preparando fluxo: template + PDF pendente para", phone);
const prepared = await prepareTestCobrancaFlow(phone);
console.log("OK:", prepared);
console.log(`
Próximos passos:
1) Confira se o WhatsApp ${phone} recebeu o template aviso_de_cobranca.
2) Responda essa mensagem no WhatsApp (qualquer texto).
3) Configure na Integgri o webhook:
   https://sistema.ancoraseguranca.app/api/integgri/webhook
   (evento de mensagem recebida)
4) Ou, depois de responder, rode:
   bun scripts/test-waba-cobranca.ts ${phone} --fulfill
`);
