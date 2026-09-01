import "@tanstack/react-start/server-only";

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

type HttpGlobal = typeof globalThis & {
  __wahaWebhookHttp?: {
    server: Server;
    handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  };
};

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/api/waha/webhook") {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "automacao-omie",
      webhook: "waha",
      transport: "http",
      hint: "Endpoint HTTP para o WAHA (evita falha de certificado HTTPS).",
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : null;
    const event = String((body as { event?: string } | null)?.event ?? "");
    const session = String((body as { session?: string } | null)?.session ?? "");
    console.info("[waha-webhook-http] POST recebido", { event, session });
    const { handleWahaIncomingWebhook } = await import("@/server/waha-bot");
    const result = await handleWahaIncomingWebhook(body);
    console.info("[waha-webhook-http] resultado", result);
    sendJson(res, 200, result);
  } catch (error) {
    console.error("[waha-webhook-http]", error);
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Falha no webhook",
    });
  }
}

/** HTTP sem TLS — o WAHA rejeita o certificado autoassinado do Vite (HTTPS). */
export function startWahaWebhookHttpServer() {
  const g = globalThis as HttpGlobal;
  const rawPort = (process.env["WAHA_WEBHOOK_HTTP_PORT"] ?? "18094").trim();
  const port = Number(rawPort);
  if (!Number.isFinite(port) || port <= 0) {
    console.warn("[waha-webhook-http] Porta inválida:", rawPort);
    return null;
  }

  // Atualiza o handler no HMR sem derrubar a porta.
  if (g.__wahaWebhookHttp?.server) {
    g.__wahaWebhookHttp.handle = handleRequest;
    return g.__wahaWebhookHttp.server;
  }

  const server = createServer((req, res) => {
    void g.__wahaWebhookHttp!.handle(req, res);
  });

  g.__wahaWebhookHttp = { server, handle: handleRequest };

  server.listen(port, "0.0.0.0", () => {
    console.info(`[waha-webhook-http] ouvindo em http://0.0.0.0:${port}/api/waha/webhook`);
  });

  server.on("error", (error) => {
    console.error("[waha-webhook-http] falha ao iniciar:", error);
  });

  return server;
}

export function stopWahaWebhookHttpServer() {
  const g = globalThis as HttpGlobal;
  if (!g.__wahaWebhookHttp?.server) return;
  try {
    g.__wahaWebhookHttp.server.close();
    console.info("[waha-webhook-http] listener HTTP encerrado.");
  } catch {
    // ignore
  }
  delete g.__wahaWebhookHttp;
}
