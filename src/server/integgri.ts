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
  let digits = chatId.replace(/@.*$/, "").replace(/\D/g, "");
  // WhatsApp BR: garante DDI 55 quando vier só DDD+número.
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits;
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

function soft10Token(config: InteggriConfig) {
  return (process.env["SOFT10_TOKEN"] ?? config.token).replace(/\s+/g, "").replace(/^"|"$/g, "");
}

function soft10BaseUrl() {
  return (process.env["SOFT10_URL"] ?? "https://api.soft10.io/v1").replace(/\/+$/, "");
}

/**
 * Templates com {{1}}, {{2}}… não passam no /api/messages/send da Integgri (só estáticos).
 * Tentamos Soft10 WABA (Meta-style) quando há variáveis.
 */
async function sendSoft10Template(
  number: string,
  templateName: string,
  variables: string[],
  config: InteggriConfig,
) {
  const token = soft10Token(config);
  if (!token) throw new Error("Token Soft10/Integgri ausente.");

  const components: Array<Record<string, unknown>> = [];
  if (variables.length) {
    components.push({
      type: "body",
      parameters: variables.map((text) => ({ type: "text", text })),
    });
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: number,
    type: "template",
    template: {
      name: templateName,
      language: { code: (process.env["WABA_TEMPLATE_LANG"] ?? "pt_BR").trim() || "pt_BR" },
      ...(components.length ? { components } : {}),
    },
  };
  if (config.whatsappId) payload.whatsappId = config.whatsappId;

  const response = await fetch(`${soft10BaseUrl()}/waba/message/send`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

/** Converte ["a","b"] → { msg1: "a", msg2: "b" } (contrato Integgri / corpo do template). */
export function toTemplateBodyVariable(variables: string[]) {
  const out: Record<string, string> = {};
  variables.forEach((text, index) => {
    out[`msg${index + 1}`] = text;
  });
  return out;
}

/**
 * Envia template WABA via Integgri Chat API.
 * Com variáveis no CORPO: `templateBodyVariable: { msg1, msg2, … }`.
 * Variáveis no cabeçalho do template Meta ainda não são suportadas pela Integgri.
 */
export async function sendInteggriTemplate(
  chatId: string,
  templateName: string,
  options?: { body?: string; variables?: string[] },
  config = readInteggriConfig(),
) {
  if (!isInteggriConfigured(config)) {
    throw new Error("Informe URL e token da Integgri em Configurações.");
  }
  const number = chatIdToPhoneDigits(chatId);
  if (number.length < 10) {
    throw new Error("Número de WhatsApp inválido para envio na Integgri.");
  }
  const name = templateName.trim();
  if (!name) throw new Error("Nome do template WABA não informado.");
  const variables = (options?.variables ?? []).map((v) => v.trim()).filter(Boolean);

  const payload: Record<string, unknown> = {
    number,
    body: variables[0] || options?.body?.trim() || name,
    templateName: name,
    sendSignature: false,
    closeTicket: false,
  };
  if (variables.length > 0) {
    payload.templateBodyVariable = toTemplateBodyVariable(variables);
  }
  if (config.whatsappId) payload.whatsappId = Number(config.whatsappId) || config.whatsappId;
  if (config.queueId) payload.queueId = Number(config.queueId) || config.queueId;
  if (config.userId) payload.userId = Number(config.userId) || config.userId;

  const response = await fetch(`${config.url}/api/messages/send`, {
    method: "POST",
    headers: authHeaders(config.token),
    body: JSON.stringify(payload),
  });
  if (response.ok) return { channel: "integgri" as const };

  const integgriErr = await readError(response);

  // Fallback Soft10 (Meta-style) se a Integgri rejeitar variáveis.
  if (variables.length > 0) {
    try {
      await sendSoft10Template(number, name, variables, config);
      return { channel: "soft10" as const };
    } catch (soft10Error) {
      const soft10Err = soft10Error instanceof Error ? soft10Error.message : String(soft10Error);
      throw new Error(
        `Template com variáveis falhou. Integgri: ${integgriErr} | Soft10: ${soft10Err}`,
      );
    }
  }

  throw new Error(integgriErr);
}

export function readCobrancaTemplateName() {
  return (process.env["INTEGGRI_COBRANCA_TEMPLATE"] ?? "aviso_de_cobranca").trim() || "aviso_de_cobranca";
}

export function readDocumentoPagamentoTemplateName() {
  return (
    (process.env["INTEGGRI_DOCUMENTO_TEMPLATE"] ?? "documento_para_pagamento").trim() ||
    "documento_para_pagamento"
  );
}

/** Lembrete D-1 (pré-vencimento): 1 ou 2 documentos. */
export type WabaLembreteDocCount = 1 | 2;
/** Envio manual / cobrança: 1, 2 ou 3 documentos. */
export type WabaEnvioDocCount = 1 | 2 | 3;

export function lembreteVencimentoTemplateName(count: WabaLembreteDocCount) {
  if (count === 1) {
    return (
      process.env["INTEGGRI_LEMBRETE_1_TEMPLATE"]?.trim() || "lembrete_de_vencimento_1_documento"
    );
  }
  return (
    process.env["INTEGGRI_LEMBRETE_2_TEMPLATE"]?.trim() || "lembrete_de_vencimento_2_documentos"
  );
}

export function envioPagamentoTemplateName(count: WabaEnvioDocCount) {
  if (count === 1) {
    return (
      process.env["INTEGGRI_ENVIO_1_TEMPLATE"]?.trim() || "envio_para_pagamento_1_documento"
    );
  }
  if (count === 2) {
    return (
      process.env["INTEGGRI_ENVIO_2_TEMPLATE"]?.trim() || "envio_para_pagamento_2_documentos"
    );
  }
  return (
    process.env["INTEGGRI_ENVIO_3_TEMPLATE"]?.trim() || "envio_para_pagamento_3_documentos"
  );
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
