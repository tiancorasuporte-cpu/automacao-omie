import { reloadEnvFromFile } from "../src/db/client";
import { listDueItems } from "../src/db/due-items";
import { formatDisplayDate, listOmieApps } from "../src/server/omie/client";
import { resolveDueItemDocument } from "../src/server/omie/documents";
import { buildDueReminderMessage, toWhatsAppChatId } from "../src/server/omie/notifications";
import { sendWahaDocument, sendWahaText } from "../src/server/waha";

reloadEnvFromFile();

const targetPhone = process.argv[2] ?? "16997266605";
const chatId = toWhatsAppChatId(targetPhone);

if (!chatId) {
  console.error("Telefone invalido:", targetPhone);
  process.exit(1);
}

const items = await listDueItems({ currentMonthOnly: false, openOnly: true });
const candidates = items.filter((item) => item.clientName?.trim());

if (candidates.length === 0) {
  console.error("Nenhum vencimento encontrado.");
  process.exit(1);
}

const item = candidates[Math.floor(Math.random() * candidates.length)]!;
const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
if (!app) {
  console.error("App Omie nao encontrado:", item.omieAppId);
  process.exit(1);
}

const dueDateLabel = formatDisplayDate(item.dueDate);
const message = buildDueReminderMessage(item, dueDateLabel);
const document = await resolveDueItemDocument(app, item);

console.log("Cliente:", item.clientName);
console.log("Empresa:", item.omieAppName);
console.log("Tipo:", item.itemType);
console.log("Enviando para:", chatId);
console.log("PDF:", document?.filename ?? "indisponivel");
console.log("---");
console.log(message);
console.log("---");

await sendWahaText(chatId, message);

if (document) {
  const result = await sendWahaDocument(
    chatId,
    document,
    `${item.clientName} · Doc. ${item.documentNumber ?? "—"} · Venc. ${dueDateLabel}`,
  );
  console.log(result.mode === "file" ? "PDF enviado:" : "Link do PDF enviado:", document.filename);
} else {
  console.log("PDF nao disponivel para este registro.");
}

console.log("Concluido.");
