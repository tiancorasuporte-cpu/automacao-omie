/**
 * Listener dedicado do bot WhatsApp — use só este processo para inbound:
 *   npm run bot:listen
 *
 * Pode rodar junto com `npm run dev` (painel); o dev não inicia o bot por padrão.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { reloadEnvFromFile } from "../src/db/client";

const LISTENER_LOCK = join(process.cwd(), ".cache", "waha-bot-listener.pid");

function isProcessAlive(pid: number) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireListenerLock() {
  if (existsSync(LISTENER_LOCK)) {
    const oldPid = Number(readFileSync(LISTENER_LOCK, "utf8").trim());
    if (oldPid !== process.pid && isProcessAlive(oldPid)) {
      console.error(
        `[waha-bot-listener] já existe um listener ativo (PID ${oldPid}). Rode: npm run bot:stop`,
      );
      process.exit(1);
    }
  }
  writeFileSync(LISTENER_LOCK, String(process.pid), "utf8");
}

function releaseListenerLock() {
  try {
    if (existsSync(LISTENER_LOCK)) {
      const current = Number(readFileSync(LISTENER_LOCK, "utf8").trim());
      if (current === process.pid) unlinkSync(LISTENER_LOCK);
    }
  } catch {
    // ignore
  }
}

reloadEnvFromFile();
acquireListenerLock();

const { markWahaBotReady } = await import("../src/server/waha-bot-ready");
markWahaBotReady();

const { isWahaConfigured, clearWahaInboundWebhooks } = await import("../src/server/waha");
const { startWahaEventsSocket } = await import("../src/server/waha-events");
const { isWhatsAppBotEnabled } = await import("../src/server/waha-bot");
const {
  writeWahaBotStatus,
  readWahaBotRestartRequest,
  restartWahaBotListenerInProcess,
} = await import("../src/server/waha-bot-control");
const { clearWahaDedupeCache } = await import("../src/server/waha-dedupe");

clearWahaDedupeCache();

if (!(await isWhatsAppBotEnabled())) {
  console.error("[waha-bot-listener] WHATSAPP_BOT_ENABLED=false — abortando.");
  releaseListenerLock();
  process.exit(1);
}

if (!isWahaConfigured()) {
  console.error("[waha-bot-listener] WAHA_URL não configurada.");
  releaseListenerLock();
  process.exit(1);
}

console.info("[waha-bot-listener] iniciando WebSocket (único listener)…");

writeWahaBotStatus({
  pid: process.pid,
  readyAt: Date.now(),
  connected: false,
});

const cleared = await clearWahaInboundWebhooks();
if (cleared.ok) {
  console.info("[waha-bot-listener] webhooks HTTP removidos do WAHA.");
} else {
  console.warn("[waha-bot-listener] não foi possível limpar webhooks:", cleared.error);
}

await startWahaEventsSocket();

console.info("[waha-bot-listener] ouvindo mensagens. Ctrl+C para parar.");

let lastHandledRestartAt = readWahaBotRestartRequest()?.requestedAt ?? 0;

setInterval(() => {
  void (async () => {
    if (!(await isWhatsAppBotEnabled())) {
      const { stopWahaEventsSocket } = await import("../src/server/waha-events");
      stopWahaEventsSocket();
      console.info("[waha-bot-listener] bot desativado nas configurações — encerrando listener.");
      releaseListenerLock();
      process.exit(0);
    }
  })();
}, 3_000);

setInterval(() => {
  writeWahaBotStatus({ pid: process.pid });
}, 30_000);

setInterval(() => {
  const request = readWahaBotRestartRequest();
  if (!request || request.requestedAt <= lastHandledRestartAt) return;
  lastHandledRestartAt = request.requestedAt;
  console.info("[waha-bot-listener] reinício solicitado pelo painel…");
  void restartWahaBotListenerInProcess().then((result) => {
    console.info("[waha-bot-listener] reiniciado", result);
  });
}, 2_000);

process.on("SIGINT", () => {
  releaseListenerLock();
  process.exit(0);
});
process.on("SIGTERM", () => {
  releaseListenerLock();
  process.exit(0);
});
