import "@tanstack/react-start/server-only";

export type WahaConfig = {
  url: string;
  apiKey: string;
  session: string;
};

export function readWahaConfig(): WahaConfig {
  return {
    url: (process.env["WAHA_URL"] ?? "").trim().replace(/\/+$/, ""),
    apiKey: (process.env["WAHA_API_KEY"] ?? "").trim(),
    session: (process.env["WAHA_SESSION"] ?? "default").trim() || "default",
  };
}

export function isWahaConfigured(config = readWahaConfig()) {
  return Boolean(config.url);
}

export async function sendWahaText(chatId: string, text: string, config = readWahaConfig()) {
  if (!config.url) {
    throw new Error("Informe a URL do WAHA em Configurações.");
  }
  const response = await fetch(`${config.url}/api/sendText`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {}),
    },
    body: JSON.stringify({
      session: config.session,
      chatId,
      text,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body.slice(0, 280) || `WAHA retornou ${response.status}`);
  }
}

export async function sendWahaFile(
  chatId: string,
  file: { filename: string; mimetype: string; url?: string; base64?: string },
  caption?: string,
  config = readWahaConfig(),
) {
  if (!config.url) {
    throw new Error("Informe a URL do WAHA em Configurações.");
  }
  if (!file.url && !file.base64) {
    throw new Error("Arquivo sem URL ou conteúdo.");
  }

  const response = await fetch(`${config.url}/api/sendFile`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {}),
    },
    body: JSON.stringify({
      session: config.session,
      chatId,
      caption: caption ?? "",
      file: {
        mimetype: file.mimetype,
        filename: file.filename,
        ...(file.url ? { url: file.url } : { data: file.base64 }),
      },
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body.slice(0, 280) || `WAHA retornou ${response.status}`);
  }
}

const MAX_WAHA_FILE_BYTES = 16 * 1024 * 1024;

async function downloadFileAsBase64(file: {
  url: string;
  filename: string;
  mimetype: string;
}) {
  const response = await fetch(file.url, {
    headers: { Accept: `${file.mimetype},application/octet-stream,*/*` },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Não foi possível baixar o arquivo (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 64) {
    throw new Error("Arquivo baixado está vazio ou inválido.");
  }
  if (buffer.length > MAX_WAHA_FILE_BYTES) {
    throw new Error("Arquivo grande demais para enviar no WhatsApp.");
  }

  const isPdf = file.mimetype.includes("pdf") || file.filename.toLowerCase().endsWith(".pdf");
  if (isPdf && !(buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)) {
    throw new Error("Arquivo baixado não é um PDF válido.");
  }

  return {
    filename: file.filename,
    mimetype: file.mimetype,
    base64: buffer.toString("base64"),
  };
}

export async function sendWahaDocument(
  chatId: string,
  file: { filename: string; mimetype: string; url?: string; base64?: string },
  caption?: string,
  config = readWahaConfig(),
) {
  const payload =
    file.url && !file.base64 ? await downloadFileAsBase64({ url: file.url, filename: file.filename, mimetype: file.mimetype }) : file;

  await sendWahaFile(chatId, payload, caption, config);
  return { mode: "file" as const };
}

function wahaHeaders(config: WahaConfig) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {}),
  };
}

export function buildWahaWebhookUrl(publicBaseUrl: string) {
  const explicit = (process.env["WAHA_WEBHOOK_URL"] ?? "").trim().replace(/\/+$/, "");
  if (explicit) {
    return explicit.endsWith("/api/waha/webhook") ? explicit : `${explicit}/api/waha/webhook`;
  }

  const base = publicBaseUrl.trim().replace(/\/+$/, "").replace(/\/api\/waha\/webhook\/?$/i, "");
  if (!base) return null;

  const httpPort = (process.env["WAHA_WEBHOOK_HTTP_PORT"] ?? "18094").trim();
  try {
    const url = new URL(base);
    // Listener HTTP dedicado: o WAHA rejeita o certificado autoassinado do Vite (HTTPS).
    url.protocol = "http:";
    url.port = httpPort;
    url.pathname = "/api/waha/webhook";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return `${base}/api/waha/webhook`;
  }
}

/** Remove webhooks da sessão WAHA (evita HTTP + WebSocket duplicando mensagens). */
export async function clearWahaInboundWebhooks(config = readWahaConfig()) {
  if (!config.url) {
    return { ok: false as const, error: "WAHA_URL não configurada." };
  }

  const putResponse = await fetch(`${config.url}/api/sessions/${encodeURIComponent(config.session)}`, {
    method: "PUT",
    headers: wahaHeaders(config),
    body: JSON.stringify({
      name: config.session,
      config: { webhooks: [] },
    }),
  });

  if (putResponse.ok) {
    return { ok: true as const };
  }

  const body = await putResponse.text().catch(() => "");
  return {
    ok: false as const,
    error: body.slice(0, 180) || `HTTP ${putResponse.status}`,
  };
}

/** Configura no WAHA o webhook de mensagens apontando para este app. */
export async function registerWahaInboundWebhook(publicBaseUrl: string, config = readWahaConfig()) {
  if (!config.url) {
    return { ok: false as const, error: "WAHA_URL não configurada." };
  }

  try {
    const { startWahaWebhookHttpServer } = await import("@/server/waha-webhook-http");
    startWahaWebhookHttpServer();
  } catch (error) {
    console.warn("[waha] não foi possível iniciar listener HTTP do webhook:", error);
  }

  const webhookUrl = buildWahaWebhookUrl(publicBaseUrl);
  if (!webhookUrl) {
    return { ok: false as const, error: "Informe a URL pública do app (PUBLIC_APP_URL)." };
  }

  const webhookConfig = {
    url: webhookUrl,
    events: ["message"],
    hmac: null,
    retries: undefined,
    customHeaders: null,
  };

  // Tentativa 1: atualizar sessão existente
  const putResponse = await fetch(`${config.url}/api/sessions/${encodeURIComponent(config.session)}`, {
    method: "PUT",
    headers: wahaHeaders(config),
    body: JSON.stringify({
      name: config.session,
      config: {
        webhooks: [webhookConfig],
      },
    }),
  });

  if (putResponse.ok) {
    return { ok: true as const, webhookUrl, method: "session_put" as const };
  }

  // Tentativa 2: endpoint dedicado de webhooks (algumas builds WAHA)
  const postResponse = await fetch(
    `${config.url}/api/sessions/${encodeURIComponent(config.session)}/webhooks`,
    {
      method: "POST",
      headers: wahaHeaders(config),
      body: JSON.stringify(webhookConfig),
    },
  );

  if (postResponse.ok) {
    return { ok: true as const, webhookUrl, method: "webhooks_post" as const };
  }

  const putBody = await putResponse.text().catch(() => "");
  const postBody = await postResponse.text().catch(() => "");
  return {
    ok: false as const,
    webhookUrl,
    error:
      `Não foi possível registrar o webhook automaticamente. ` +
      `Configure manualmente no WAHA a URL: ${webhookUrl} ` +
      `(eventos: message, message.any). ` +
      `Detalhe: ${(postBody || putBody).slice(0, 180) || `HTTP ${postResponse.status}`}`,
  };
}
