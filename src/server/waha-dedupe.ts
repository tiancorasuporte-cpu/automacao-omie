import "@tanstack/react-start/server-only";

const ID_DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Dedupe só em memória — evita processo fantasma bloquear via arquivo. */
const memoryCache = new Map<string, number>();

function pruneMemoryCache(now = Date.now()) {
  for (const [key, at] of memoryCache) {
    if (now - at > ID_DEDUPE_TTL_MS) memoryCache.delete(key);
  }
}

/** @deprecated Não usa mais arquivo — mantido para compatibilidade no listener. */
export function clearWahaDedupeCache() {
  memoryCache.clear();
}

/** Reserva processamento — só bot:listen; dedupe em memória deste processo. */
export async function claimWahaInboundMessage(keys: string | string[]) {
  const { mayRunWahaInboundListener } = await import("@/server/waha-events");
  if (!mayRunWahaInboundListener()) {
    return false;
  }

  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!list.length) return true;

  pruneMemoryCache();
  const now = Date.now();
  for (const key of list) {
    const seenAt = memoryCache.get(key);
    if (seenAt && now - seenAt < ID_DEDUPE_TTL_MS) return false;
  }
  for (const key of list) {
    memoryCache.set(key, now);
  }
  return true;
}

export function buildWahaDedupeKeys(input: {
  messageId: string | null;
  chatId: string;
  text: string;
  payload: Record<string, unknown>;
}) {
  const keys = new Set<string>();

  const keyObj = (input.payload["key"] ??
    (input.payload["_data"] as Record<string, unknown> | undefined)?.["key"]) as
    | Record<string, unknown>
    | undefined;
  const waKeyId = keyObj?.["id"];
  if (typeof waKeyId === "string" && waKeyId) keys.add(`wa:${waKeyId}`);

  const payloadId = input.payload["id"] ?? input.payload["messageId"];
  if (typeof payloadId === "string" && payloadId && !payloadId.startsWith("evt_")) {
    keys.add(`id:${payloadId}`);
  }

  if (input.messageId && !input.messageId.startsWith("evt_")) {
    keys.add(`id:${input.messageId}`);
  }

  return [...keys];
}

/** @deprecated Use buildWahaDedupeKeys */
export function buildWahaDedupeKey(input: {
  messageId: string | null;
  chatId: string;
  text: string;
  payload: Record<string, unknown>;
}) {
  return buildWahaDedupeKeys(input)[0] ?? "";
}
