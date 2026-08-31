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

export async function sendWahaDocument(
  chatId: string,
  file: { filename: string; mimetype: string; url?: string; base64?: string },
  caption?: string,
  config = readWahaConfig(),
) {
  try {
    await sendWahaFile(chatId, file, caption, config);
    return { mode: "file" as const };
  } catch (error) {
    if (!file.url) throw error;

    const lines = [caption?.trim(), `📎 ${file.filename}`, file.url].filter(Boolean);
    await sendWahaText(chatId, lines.join("\n"), config);
    return { mode: "link" as const };
  }
}
