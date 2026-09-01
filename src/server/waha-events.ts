import "@tanstack/react-start/server-only";

import { isWhatsAppBotEnabled, handleWahaIncomingWebhook } from "@/server/waha-bot";
import { markWahaBotReady } from "@/server/waha-bot-ready";
import { isWahaConfigured, readWahaConfig } from "@/server/waha";

type WsGlobal = typeof globalThis & {
  __wahaEventsWs?: {
    socket: WebSocket | null;
    starting: boolean;
    stop: boolean;
  };
};

function buildWahaWsUrl() {
  const config = readWahaConfig();
  if (!config.url) return null;

  const httpBase = config.url.replace(/\/+$/, "");
  const wsBase = httpBase.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws"));
  const url = new URL(`${wsBase}/ws`);
  url.searchParams.set("session", config.session || "default");
  url.searchParams.append("events", "message");
  if (config.apiKey) url.searchParams.set("x-api-key", config.apiKey);
  return url.toString();
}

function scheduleReconnect(delayMs: number) {
  const g = globalThis as WsGlobal;
  if (g.__wahaEventsWs?.stop) return;
  setTimeout(() => {
    void startWahaEventsSocket();
  }, delayMs);
}

/** Só o script `bot:listen` (ou WAHA_BOT_IN_DEV=true) pode abrir WebSocket. */
export function mayRunWahaInboundListener() {
  if (process.env["WAHA_BOT_IN_DEV"] === "true") return true;
  return process.argv.some((arg) => arg.includes("waha-bot-listener"));
}

/** Escuta eventos no WAHA via WebSocket (saída da rede — não depende de firewall de entrada). */
export async function startWahaEventsSocket() {
  if (!mayRunWahaInboundListener()) return;

  const g = globalThis as WsGlobal;
  if (!g.__wahaEventsWs) {
    g.__wahaEventsWs = { socket: null, starting: false, stop: false };
  }
  const state = g.__wahaEventsWs;
  state.stop = false;

  if (!(await isWhatsAppBotEnabled())) return;
  if (!isWahaConfigured()) return;

  if (state.starting) return;
  if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  // Fecha conexão anterior antes de abrir outra (interval/reconnect).
  if (state.socket) {
    try {
      state.socket.close();
    } catch {
      // ignore
    }
    state.socket = null;
  }

  const wsUrl = buildWahaWsUrl();
  if (!wsUrl) return;

  state.starting = true;
  try {
    const socket = new WebSocket(wsUrl);
    state.socket = socket;

    socket.addEventListener("open", () => {
      state.starting = false;
      markWahaBotReady();
      console.info("[waha-ws] conectado — ouvindo message");
      void import("@/server/waha-bot-control").then(({ writeWahaBotStatus }) => {
        writeWahaBotStatus({
          pid: process.pid,
          readyAt: Date.now(),
          connected: true,
        });
      });
    });

    socket.addEventListener("message", (event) => {
      void (async () => {
        try {
          const raw = typeof event.data === "string" ? event.data : String(event.data);
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            console.info("[waha-ws] evento não-JSON", raw.slice(0, 200));
            return;
          }
          const eventName = String((body as { event?: string })?.event ?? "");
          console.info("[waha-ws] evento", eventName || "(sem nome)", raw.slice(0, 240));
          const result = await handleWahaIncomingWebhook(body);
          if ("replied" in result && result.replied) {
            console.info("[waha-ws] respondeu", result);
          } else if ("ignored" in result) {
            if (result.ignored === "duplicate") {
              console.info("[waha-ws] ignorado duplicate (outro processo já processou)");
            } else {
              console.info("[waha-ws] ignorado", result.ignored);
            }
          } else if (!result.ok) {
            console.warn("[waha-ws] falha", result);
          }
        } catch (error) {
          console.error("[waha-ws] erro ao processar evento", error);
        }
      })();
    });

    socket.addEventListener("error", () => {
      console.warn("[waha-ws] erro de conexão");
    });

    socket.addEventListener("close", () => {
      state.starting = false;
      state.socket = null;
      void import("@/server/waha-bot-control").then(({ writeWahaBotStatus }) => {
        writeWahaBotStatus({
          pid: process.pid,
          connected: false,
        });
      });
      if (state.stop) return;
      console.warn("[waha-ws] desconectado — reconectando em 5s");
      scheduleReconnect(5_000);
    });
  } catch (error) {
    state.starting = false;
    state.socket = null;
    console.warn("[waha-ws] falha ao abrir:", error);
    scheduleReconnect(10_000);
  }
}

export function stopWahaEventsSocket() {
  const g = globalThis as WsGlobal;
  if (!g.__wahaEventsWs) return;
  g.__wahaEventsWs.stop = true;
  try {
    g.__wahaEventsWs.socket?.close();
  } catch {
    // ignore
  }
  g.__wahaEventsWs.socket = null;
  g.__wahaEventsWs.starting = false;
}

if (!mayRunWahaInboundListener()) {
  stopWahaEventsSocket();
}
