import "@tanstack/react-start/server-only";

import { isGroupChatId, normalizeInboxChatId } from "@/server/waha-handoff";
import { isWahaConfigured, readWahaConfig, type WahaConfig } from "@/server/waha";

export type InboxChat = {
  id: string;
  name: string;
  picture: string | null;
  isGroup: boolean;
  lastMessage: {
    id: string | null;
    body: string;
    timestamp: number | null;
    fromMe: boolean;
  } | null;
  humanHandoff: boolean;
};

export type InboxMessage = {
  id: string;
  body: string;
  timestamp: number | null;
  fromMe: boolean;
  type: string | null;
  hasMedia: boolean;
};

async function wahaGet<T>(path: string, config: WahaConfig): Promise<T> {
  const response = await fetch(`${config.url}${path}`, {
    headers: {
      Accept: "application/json",
      ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 280) || `WAHA retornou ${response.status}`);
  }
  return JSON.parse(text) as T;
}

function messageBody(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return "";
  const body = raw["body"] ?? raw["text"] ?? raw["caption"];
  if (typeof body === "string" && body.trim()) return body.trim();
  const type = String(raw["type"] ?? raw["_data"] ?? "").toLowerCase();
  if (type.includes("image")) return "📷 Imagem";
  if (type.includes("video")) return "🎬 Vídeo";
  if (type.includes("audio") || type.includes("ptt")) return "🎤 Áudio";
  if (type.includes("document") || type.includes("file")) return "📎 Arquivo";
  if (type.includes("sticker")) return "🎭 Figurinha";
  if (type.includes("location")) return "📍 Localização";
  if (type.includes("contact") || type.includes("vcard")) return "👤 Contato";
  return "";
}

function messageTimestamp(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return null;
  const value = raw["timestamp"] ?? raw["t"];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed > 1_000_000_000_000 ? Math.floor(parsed / 1000) : parsed;
    }
  }
  return null;
}

function mapOverviewItem(
  item: Record<string, unknown>,
  humanHandoffs: Set<string>,
): InboxChat | null {
  const id = normalizeInboxChatId(String(item["id"] ?? ""));
  if (!id) return null;

  const lastRaw = item["lastMessage"] as Record<string, unknown> | null | undefined;
  const name = String(item["name"] ?? "").trim() || formatChatLabel(id);
  const picture = typeof item["picture"] === "string" ? item["picture"] : null;

  return {
    id,
    name,
    picture,
    isGroup: isGroupChatId(id),
    lastMessage: lastRaw
      ? {
          id: typeof lastRaw["id"] === "string" ? lastRaw["id"] : null,
          body: messageBody(lastRaw),
          timestamp: messageTimestamp(lastRaw),
          fromMe: Boolean(lastRaw["fromMe"]),
        }
      : null,
    humanHandoff: humanHandoffs.has(id),
  };
}

function mapMessage(raw: Record<string, unknown>): InboxMessage | null {
  const id = String(raw["id"] ?? "").trim();
  if (!id) return null;
  const type = typeof raw["type"] === "string" ? raw["type"] : null;
  const hasMedia = Boolean(raw["hasMedia"] ?? raw["media"] ?? (type && type !== "chat"));
  return {
    id,
    body: messageBody(raw),
    timestamp: messageTimestamp(raw),
    fromMe: Boolean(raw["fromMe"]),
    type,
    hasMedia,
  };
}

export function formatChatLabel(chatId: string) {
  const base = chatId.split("@")[0] ?? chatId;
  if (/^\d+$/.test(base) && base.length >= 10) {
    const local = base.length > 11 ? base.slice(-11) : base;
    const ddd = local.length >= 10 ? local.slice(0, 2) : "";
    const rest = local.slice(ddd.length);
    if (ddd && rest.length >= 8) {
      const part1 = rest.slice(0, rest.length - 4);
      const part2 = rest.slice(-4);
      return `+55 (${ddd}) ${part1}-${part2}`;
    }
    return `+${base}`;
  }
  return base || chatId;
}

export async function fetchInboxChats(options?: { limit?: number; offset?: number }) {
  const config = readWahaConfig();
  if (!isWahaConfigured(config)) {
    return { ok: false as const, error: "WAHA não configurado. Ajuste em Configurações." };
  }

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const session = encodeURIComponent(config.session);
  const path = `/api/${session}/chats/overview?limit=${limit}&offset=${offset}`;

  const { listHumanHandoffs } = await import("@/server/waha-handoff");
  const humanHandoffs = new Set(listHumanHandoffs());

  const raw = await wahaGet<Record<string, unknown>[]>(path, config);
  const chats = raw
    .map((item) => mapOverviewItem(item, humanHandoffs))
    .filter((item): item is InboxChat => item != null)
    .sort((a, b) => (b.lastMessage?.timestamp ?? 0) - (a.lastMessage?.timestamp ?? 0));

  return { ok: true as const, chats, configured: true };
}

export async function fetchInboxMessages(chatId: string, options?: { limit?: number }) {
  const config = readWahaConfig();
  if (!isWahaConfigured(config)) {
    return { ok: false as const, error: "WAHA não configurado. Ajuste em Configurações." };
  }

  const normalized = normalizeInboxChatId(chatId);
  if (!normalized) {
    return { ok: false as const, error: "Conversa inválida." };
  }

  const limit = options?.limit ?? 40;
  const session = encodeURIComponent(config.session);
  const encodedChat = encodeURIComponent(normalized);
  const path =
    `/api/${session}/chats/${encodedChat}/messages` +
    `?limit=${limit}&downloadMedia=false`;

  const raw = await wahaGet<Record<string, unknown>[]>(path, config);
  const messages = raw
    .map((item) => mapMessage(item))
    .filter((item): item is InboxMessage => item != null)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const { isHumanHandoff } = await import("@/server/waha-handoff");

  return {
    ok: true as const,
    chatId: normalized,
    messages,
    humanHandoff: isHumanHandoff(normalized),
  };
}
