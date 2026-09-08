/**
 * Para o bot WhatsApp por completo:
 *   npm run bot:stop
 */
import { reloadEnvFromFile } from "../src/db/client";

reloadEnvFromFile();

const { stopWahaBotCompletely } = await import("../src/server/waha-bot-control");

const result = await stopWahaBotCompletely();

if (!result.ok) {
  console.error("[bot:stop]", result.error);
  process.exit(1);
}

if (result.stopped === 0) {
  console.info("[bot:stop] nenhum processo listener encontrado; bot desativado nas configurações.");
} else {
  console.info(`[bot:stop] ${result.stopped} processo(s) encerrado(s): ${result.pids.join(", ")}`);
}

if (result.webhooksCleared) {
  console.info("[bot:stop] webhooks do WAHA removidos.");
}

console.info("[bot:stop] Bot automático desligado. Para voltar: marque o checkbox em Configurações e rode npm run bot:listen");
