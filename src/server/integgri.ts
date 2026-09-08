import "@tanstack/react-start/server-only";

export type InteggriConfig = {
  url: string;
  token: string;
  whatsappId: string;
  queueId: string;
  userId: string;
};

export function normalizeInteggriUrl(raw: string) {
  const url = raw.trim().replace(/\/+$/, "") || "https://iapi.integgri.com.br";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "app.integgri.com.br") {
      parsed.hostname = "iapi.integgri.com.br";
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    // keep as-is
  }
  return url;
}

export function readInteggriConfig(): InteggriConfig {
  return {
    url: normalizeInteggriUrl(process.env["INTEGGRI_URL"] ?? "https://iapi.integgri.com.br"),
    token: (process.env["INTEGGRI_TOKEN"] ?? "").replace(/\s+/g, "").replace(/^"|"$/g, ""),
    whatsappId: (process.env["INTEGGRI_WHATSAPP_ID"] ?? "").trim(),
    queueId: (process.env["INTEGGRI_QUEUE_ID"] ?? "").trim(),
    userId: (process.env["INTEGGRI_USER_ID"] ?? "").trim(),
  };
}

export function isInteggriConfigured(config = readInteggriConfig()) {
  return Boolean(config.url && config.token);
}

export function chatIdToPhoneDigits(chatId: string) {
  return chatId.replace(/@.*$/, "").replace(/\D/g, "");
}

function authHeaders(token: string, json = true) {
  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function readError(response: Response) {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return parsed.error || parsed.message || body.slice(0, 280) || `Integgri HTTP ${response.status}`;
  } catch {
    return body.slice(0, 280) || `Integgri HTTP ${response.status}`;
  }
}

function sendPayload(config: InteggriConfig, number: string, body: string) {
  const payload: Record<string, unknown> = {
    number,
    body,
    sendSignature: false,
    closeTicket: false,
  };
  if (config.whatsappId) payload.whatsappId = Number(config.whatsappId) || config.whatsappId;
  if (config.queueId) payload.queueId = Number(config.queueId) || config.queueId;
  if (config.userId) payload.userId = Number(config.userId) || config.userId;
  return payload;
}

export async function sendInteggriText(chatId: string, text: string, config = readInteggriConfig()) {
  if (!isInteggriConfigured(config)) {
    throw new Error("Informe URL e token da Integgri em Configurações.");
  }
  const number = chatIdToPhoneDigits(chatId);
  if (number.length < 10) {
    throw new Error("Número de WhatsApp inválido para envio na Integgri.");
  }

  const response = await fetch(`${config.url}/api/messages/send`, {
    method: "POST",
    headers: authHeaders(config.token),
    body: JSON.stringify(sendPayload(config, number, text)),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function sendInteggriDocument(
  chatId: string,
  file: { filename: string; mimetype: string; url?: string; base64?: string },
  caption?: string,
  config = readInteggriConfig(),
) {
  if (!isInteggriConfigured(config)) {
    throw new Error("Informe URL e token da Integgri em Configurações.");
  }
  const number = chatIdToPhoneDigits(chatId);
  if (number.length < 10) {
    throw new Error("Número de WhatsApp inválido para envio na Integgri.");
  }

  let bytes: Buffer;
  if (file.base64) {
    const cleaned = file.base64.includes(",")
      ? file.base64.slice(file.base64.indexOf(",") + 1)
      : file.base64.replace(/\s+/g, "");
    bytes = Buffer.from(cleaned, "base64");
  } else if (file.url) {
    const downloaded = await fetch(file.url, {
      redirect: "follow",
      headers: { Accept: "application/pdf,application/octet-stream,*/*" },
    });
    if (!downloaded.ok) {
      throw new Error(`Não foi possível baixar o arquivo (${downloaded.status}).`);
    }
    bytes = Buffer.from(await downloaded.arrayBuffer());
  } else {
    throw new Error("Arquivo sem URL ou conteúdo.");
  }

  const wantsPdf = (file.mimetype || "").includes("pdf") || file.filename.toLowerCase().endsWith(".pdf");
  if (wantsPdf && !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    throw new Error("Arquivo não é um PDF válido (conteúdo corrompido ou HTML/URL inválida).");
  }
  if (bytes.length < 64) {
    throw new Error("Arquivo vazio ou inválido.");
  }

  const form = new FormData();
  form.append("number", number);
  form.append("body", caption ?? file.filename);
  form.append("sendSignature", "false");
  form.append("closeTicket", "false");
  if (config.whatsappId) form.append("whatsappId", config.whatsappId);
  if (config.queueId) form.append("queueId", config.queueId);
  if (config.userId) form.append("userId", config.userId);
  form.append(
    "medias",
    new Blob([bytes], { type: file.mimetype || "application/pdf" }),
    file.filename,
  );

  const response = await fetch(`${config.url}/api/messages/send`, {
    method: "POST",
    headers: authHeaders(config.token, false),
    body: form,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function listInteggriConnections(config = readInteggriConfig()) {
  if (!isInteggriConfigured(config)) {
    throw new Error("Informe URL e token da Integgri em Configurações.");
  }
  const response = await fetch(`${config.url}/api/whatsapp`, {
    headers: authHeaders(config.token),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json().catch(() => null);
}
