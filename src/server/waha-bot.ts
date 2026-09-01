import "@tanstack/react-start/server-only";

import { getSetting } from "@/db/settings";
import { answerBoletoAssistant, type ChatHistoryItem, type ConversationMode } from "@/server/omie/boleto-assistant";
import { sendOpenBoletoPdfs } from "@/server/omie/boleto-whatsapp";
import { buildWahaDedupeKeys, claimWahaInboundMessage } from "@/server/waha-dedupe";
import { getWahaBotReadyAt } from "@/server/waha-bot-ready";
import { readWahaConfig, sendWahaText } from "@/server/waha";

type ConversationState = {
  history: ChatHistoryItem[];
  updatedAt: number;
  processing: boolean;
  mode: ConversationMode;
  pendingBoletos?: import("@/server/omie/boleto-lookup").OpenBoletoHit[];
};

const conversations = new Map<string, ConversationState>();
const processedMessageIds = new Map<string, number>();
const processedContentKeys = new Map<string, number>();

const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const MESSAGE_ID_TTL_MS = 24 * 60 * 60 * 1000;
const CONTENT_DEDUPE_MS = 60_000;
const MAX_INBOUND_AGE_MS = 3 * 60 * 1000;
const MAX_HISTORY = 10;

function pruneCaches(now = Date.now()) {
  for (const [key, state] of conversations) {
    if (now - state.updatedAt > HISTORY_TTL_MS) conversations.delete(key);
  }
  for (const [id, at] of processedMessageIds) {
    if (now - at > MESSAGE_ID_TTL_MS) processedMessageIds.delete(id);
  }
  for (const [key, at] of processedContentKeys) {
    if (now - at > CONTENT_DEDUPE_MS * 3) processedContentKeys.delete(key);
  }
}

function contentDedupeKey(chatId: string, text: string) {
  return `${chatId}|${text.trim().toLowerCase()}`;
}

function normalizeChatId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  if (trimmed.includes("@")) {
    // GOWS/NOWEB usam @s.whatsapp.net internamente — WAHA pede @c.us no envio.
    if (trimmed.endsWith("@s.whatsapp.net")) {
      return `${trimmed.slice(0, -"@s.whatsapp.net".length)}@c.us`;
    }
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `${digits}@c.us`;
}

/** Id WAHA: `{fromMe}_{chatId}_{messageId}` */
function chatIdFromWahaMessageId(messageId: string | null | undefined) {
  if (!messageId) return null;
  const parts = messageId.split("_");
  if (parts.length < 2) return null;
  return normalizeChatId(parts[1]);
}

function extractIncomingText(payload: Record<string, unknown>) {
  const data = payload["_data"] as Record<string, unknown> | undefined;
  const gowsMessage = data?.["Message"] as Record<string, unknown> | undefined;
  const media = payload["media"] as Record<string, unknown> | undefined;
  const mediaMessage = media?.["Message"] as Record<string, unknown> | undefined;
  const nestedMessage = payload["message"] as Record<string, unknown> | undefined;

  const readNestedText = (msg: Record<string, unknown> | undefined) => {
    if (!msg) return null;
    const ext = msg["extendedTextMessage"] as Record<string, unknown> | undefined;
    const image = msg["imageMessage"] as Record<string, unknown> | undefined;
    const video = msg["videoMessage"] as Record<string, unknown> | undefined;
    const doc = msg["documentMessage"] as Record<string, unknown> | undefined;
    return (
      msg["conversation"] ??
      ext?.["text"] ??
      image?.["caption"] ??
      video?.["caption"] ??
      doc?.["caption"] ??
      msg["body"]
    );
  };

  const candidates = [
    payload["body"],
    payload["text"],
    payload["caption"],
    nestedMessage?.["body"],
    readNestedText(nestedMessage),
    readNestedText(gowsMessage),
    readNestedText(mediaMessage),
  ];

  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text.slice(0, 1000);
  }
  return null;
}

function isFromMe(payload: Record<string, unknown>) {
  return Boolean(payload["fromMe"] ?? payload["from_me"]);
}

function isGroupChat(chatId: string) {
  return (
    chatId.endsWith("@g.us") ||
    chatId.endsWith("@newsletter") ||
    chatId === "status@broadcast" ||
    chatId.endsWith("@broadcast")
  );
}

/** Mensagem de grupo — não responder (evita DM indevido para participantes). */
function isGroupInbound(payload: Record<string, unknown>, messageId: string | null) {
  if (messageId?.includes("@g.us")) return true;

  const data = payload["_data"] as Record<string, unknown> | undefined;
  const info = data?.["Info"] as Record<string, unknown> | undefined;
  if (info?.["IsGroup"] === true) return true;

  const key = (payload["key"] ?? data?.["key"]) as Record<string, unknown> | undefined;
  const candidates = [
    payload["from"],
    payload["to"],
    payload["chatId"],
    payload["chat_id"],
    info?.["Chat"],
    key?.["remoteJid"],
    key?.["participant"],
  ];

  return candidates.some((value) => {
    const text = String(value ?? "");
    return text.includes("@g.us") || text.includes("@newsletter") || text.endsWith("@broadcast");
  });
}

function isDirectInboundChat(chatId: string | null) {
  if (!chatId) return false;
  if (isGroupChat(chatId)) return false;
  return chatId.endsWith("@c.us") || chatId.endsWith("@lid") || chatId.endsWith("@s.whatsapp.net");
}

function normalizeEpochMs(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e12) return Math.floor(n);
  if (n > 1e9) return Math.floor(n * 1000);
  return null;
}

function extractMessageTimestampMs(input: {
  root: Record<string, unknown>;
  payload: Record<string, unknown>;
}) {
  const data = input.payload["_data"] as Record<string, unknown> | undefined;
  const key = (input.payload["key"] ?? data?.["key"]) as Record<string, unknown> | undefined;

  const candidates = [
    input.payload["timestamp"],
    input.root["timestamp"],
    data?.["messageTimestamp"],
    key?.["timestamp"],
    input.payload["t"],
  ];

  for (const candidate of candidates) {
    const ms = normalizeEpochMs(candidate);
    if (ms) return ms;
  }
  return null;
}

function isRecentInboundMessage(input: {
  root: Record<string, unknown>;
  payload: Record<string, unknown>;
}) {
  const readyAt = getWahaBotReadyAt();
  const messageAt = extractMessageTimestampMs(input) ?? Date.now();
  const now = Date.now();

  if (readyAt > 0 && messageAt < readyAt - 5_000) {
    return { ok: false as const, reason: "before_bot" as const };
  }
  if (now - messageAt > MAX_INBOUND_AGE_MS) {
    return { ok: false as const, reason: "stale" as const };
  }

  return { ok: true as const };
}

function sameWhatsAppId(a: string | null, b: string | null) {
  if (!a || !b) return false;
  if (a === b) return true;
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  return da.length >= 10 && da === db;
}

/**
 * Destino da resposta:
 * - mensagem recebida (!fromMe) → chat do remetente (nunca o próprio "me")
 * - prioriza chatId / from / id da mensagem
 */
function resolveReplyChatId(input: {
  root: Record<string, unknown>;
  payload: Record<string, unknown>;
  fromMe: boolean;
  messageId: string | null;
}) {
  const { root, payload, fromMe, messageId } = input;

  if (!fromMe && isGroupInbound(payload, messageId)) {
    return null;
  }

  const meId = normalizeChatId((root["me"] as Record<string, unknown> | undefined)?.["id"] as string);
  const key = (payload["key"] ??
    (payload["_data"] as Record<string, unknown> | undefined)?.["key"]) as
    | Record<string, unknown>
    | undefined;

  const fromField = normalizeChatId(payload["from"] as string);
  const toField = normalizeChatId(payload["to"] as string);
  const chatField = normalizeChatId(payload["chatId"] as string ?? payload["chat_id"] as string);
  const remoteJid = normalizeChatId(key?.["remoteJid"] as string);
  const fromMessageId = chatIdFromWahaMessageId(messageId);

  // Mensagem direta recebida: responder só quem enviou (from).
  if (!fromMe) {
    if (fromField && isDirectInboundChat(fromField) && !sameWhatsAppId(fromField, meId)) {
      return fromField;
    }
    if (chatField && isDirectInboundChat(chatField) && !sameWhatsAppId(chatField, meId)) {
      return chatField;
    }
    return null;
  }

  const ordered = [chatField, toField, fromMessageId, remoteJid, fromField];

  for (const candidate of ordered) {
    if (!candidate) continue;
    if (isGroupChat(candidate)) continue;
    if (sameWhatsAppId(candidate, meId)) continue;
    return candidate;
  }

  return null;
}

export async function isWhatsAppBotEnabled() {
  const setting = await getSetting("whatsapp_bot_enabled");
  if (setting != null) return setting === "true";
  return (process.env["WHATSAPP_BOT_ENABLED"] ?? "true").trim().toLowerCase() !== "false";
}

export function parseWahaWebhookBody(body: unknown) {
  const root = (body ?? {}) as Record<string, unknown>;
  const event = String(root["event"] ?? root["type"] ?? "").toLowerCase();
  const payload = (root["payload"] ?? root["data"] ?? root["message"] ?? root) as Record<
    string,
    unknown
  >;

  const payloadId = payload["id"] ?? payload["messageId"];
  const rootId = root["id"];
  let messageId: string | null = null;
  if (typeof payloadId === "string" || typeof payloadId === "number") {
    messageId = String(payloadId);
  } else if (typeof rootId === "string" && !String(rootId).startsWith("evt_")) {
    messageId = String(rootId);
  }
  const fromMe = isFromMe(payload);
  const chatId = resolveReplyChatId({ root, payload, fromMe, messageId });
  const text = extractIncomingText(payload);
  const session = String(root["session"] ?? payload["session"] ?? readWahaConfig().session);

  return {
    event,
    payload,
    messageId: messageId || null,
    chatId,
    text,
    session,
    fromMe,
    from: normalizeChatId(payload["from"] as string),
    to: normalizeChatId(payload["to"] as string),
  };
}

export async function handleWahaIncomingWebhook(body: unknown) {
  pruneCaches();

  const { mayRunWahaInboundListener } = await import("@/server/waha-events");
  if (!mayRunWahaInboundListener()) {
    return { ok: true as const, ignored: "not_listener" as const };
  }

  if (!(await isWhatsAppBotEnabled())) {
    return { ok: true as const, ignored: "bot_disabled" as const };
  }

  const parsed = parseWahaWebhookBody(body);
  const root = (body ?? {}) as Record<string, unknown>;

  // message.any duplica message; ack/reaction etc. não são conversa.
  if (parsed.event === "message.any") {
    return { ok: true as const, ignored: "message_any" as const };
  }
  if (parsed.event && parsed.event !== "message") {
    return { ok: true as const, ignored: "not_message" as const };
  }

  const isMessageEvent = !parsed.event || parsed.event === "message";

  if (!isMessageEvent) {
    return { ok: true as const, ignored: "not_message" as const };
  }
  if (parsed.fromMe) {
    return { ok: true as const, ignored: "from_me" as const };
  }
  if (!parsed.chatId) {
    console.warn("[waha-bot] sem chatId de resposta", {
      from: parsed.from,
      to: parsed.to,
      messageId: parsed.messageId,
    });
    return { ok: true as const, ignored: "no_chat" as const };
  }
  if (isGroupInbound(parsed.payload, parsed.messageId) || (parsed.from && isGroupChat(parsed.from))) {
    return { ok: true as const, ignored: "group" as const };
  }
  if (isGroupChat(parsed.chatId)) {
    return { ok: true as const, ignored: "group" as const };
  }
  if (!parsed.text) {
    return { ok: true as const, ignored: "no_text" as const };
  }

  const freshness = isRecentInboundMessage({ root, payload: parsed.payload });
  if (!freshness.ok) {
    return { ok: true as const, ignored: freshness.reason };
  }

  const config = readWahaConfig();
  if (parsed.session && config.session && parsed.session !== config.session) {
    return { ok: true as const, ignored: "other_session" as const };
  }

  const dedupeKeys = buildWahaDedupeKeys({
    messageId: parsed.messageId,
    chatId: parsed.chatId,
    text: parsed.text,
    payload: parsed.payload,
  });
  const claimed = await claimWahaInboundMessage(dedupeKeys);
  if (!claimed) {
    console.info("[waha-bot] dedupe ignorou", { keys: dedupeKeys, chatId: parsed.chatId });
    return { ok: true as const, ignored: "duplicate" as const };
  }

  if (parsed.messageId) {
    processedMessageIds.set(parsed.messageId, Date.now());
  }

  console.info("[waha-bot] respondendo em", parsed.chatId, {
    from: parsed.from,
    to: parsed.to,
    text: parsed.text.slice(0, 80),
  });

  const state = conversations.get(parsed.chatId) ?? {
    history: [],
    updatedAt: Date.now(),
    processing: false,
    mode: "menu" as ConversationMode,
  };

  if (state.mode === "human") {
    const resetToMenu = /\b(menu|inicio|início|voltar|reiniciar|0)\b/i.test(parsed.text.trim());
    if (!resetToMenu) {
      console.info("[waha-bot] conversa com atendente — bot silenciado", parsed.chatId);
      return { ok: true as const, ignored: "human_handoff" as const };
    }
  }

  if (state.processing) {
    return { ok: true as const, ignored: "busy" as const };
  }

  state.processing = true;
  conversations.set(parsed.chatId, state);

  try {
    const result = await answerBoletoAssistant({
      message: parsed.text,
      history: state.history,
      pathname: "/whatsapp",
      pendingBoletos: state.pendingBoletos,
      mode: state.mode,
    });

    if (!result.ok) {
      await sendWahaText(parsed.chatId, result.error);
      return { ok: false as const, error: result.error, chatId: parsed.chatId };
    }

    await sendWahaText(parsed.chatId, result.answer);

    let pdfsSent = 0;
    if ("boletos" in result && result.boletos?.length) {
      pdfsSent = await sendOpenBoletoPdfs(parsed.chatId, result.boletos);
      console.info("[waha-bot] PDFs enviados:", pdfsSent, "de", result.boletos.length);
    }

    state.history = [
      ...state.history,
      { role: "user", content: parsed.text },
      { role: "assistant", content: result.answer },
    ].slice(-MAX_HISTORY);
    if ("pendingBoletos" in result) {
      state.pendingBoletos = result.pendingBoletos;
    }
    if ("mode" in result && result.mode) {
      state.mode = result.mode;
    }
    state.updatedAt = Date.now();
    conversations.set(parsed.chatId, state);

    return {
      ok: true as const,
      replied: true as const,
      source: result.source,
      chatId: parsed.chatId,
      pdfsSent,
    };
  } finally {
    state.processing = false;
    conversations.set(parsed.chatId, state);
  }
}
