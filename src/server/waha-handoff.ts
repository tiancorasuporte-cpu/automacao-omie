import "@tanstack/react-start/server-only";

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), ".cache");
const HANDOFF_FILE = join(CACHE_DIR, "waha-human-handoff.json");

type HandoffStore = {
  chatIds: string[];
  updatedAt: number;
};

function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function readStore(): HandoffStore {
  if (!existsSync(HANDOFF_FILE)) {
    return { chatIds: [], updatedAt: Date.now() };
  }
  try {
    const parsed = JSON.parse(readFileSync(HANDOFF_FILE, "utf8")) as HandoffStore;
    if (!Array.isArray(parsed.chatIds)) {
      return { chatIds: [], updatedAt: Date.now() };
    }
    return { chatIds: parsed.chatIds, updatedAt: parsed.updatedAt ?? Date.now() };
  } catch {
    return { chatIds: [], updatedAt: Date.now() };
  }
}

function writeStore(store: HandoffStore) {
  ensureCacheDir();
  const tmp = `${HANDOFF_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, HANDOFF_FILE);
}

export function normalizeInboxChatId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@s.whatsapp.net")) {
    return `${trimmed.slice(0, -"@s.whatsapp.net".length)}@c.us`;
  }
  return trimmed;
}

export function isGroupChatId(chatId: string) {
  return (
    chatId.endsWith("@g.us") ||
    chatId.endsWith("@newsletter") ||
    chatId === "status@broadcast" ||
    chatId.endsWith("@broadcast")
  );
}

export function listHumanHandoffs() {
  return readStore().chatIds.map((id) => normalizeInboxChatId(id) ?? id);
}

export function isHumanHandoff(chatId: string) {
  const normalized = normalizeInboxChatId(chatId);
  if (!normalized) return false;
  const ids = listHumanHandoffs();
  return ids.some((id) => id === normalized || normalizeInboxChatId(id) === normalized);
}

export function addHumanHandoff(chatId: string) {
  const normalized = normalizeInboxChatId(chatId);
  if (!normalized) return { ok: false as const, error: "Chat inválido." };
  const store = readStore();
  const ids = new Set(store.chatIds.map((id) => normalizeInboxChatId(id) ?? id));
  ids.add(normalized);
  writeStore({ chatIds: [...ids], updatedAt: Date.now() });
  return { ok: true as const, chatId: normalized };
}

export function removeHumanHandoff(chatId: string) {
  const normalized = normalizeInboxChatId(chatId);
  if (!normalized) return { ok: false as const, error: "Chat inválido." };
  const store = readStore();
  const ids = store.chatIds
    .map((id) => normalizeInboxChatId(id) ?? id)
    .filter((id) => id !== normalized);
  writeStore({ chatIds: ids, updatedAt: Date.now() });
  return { ok: true as const, chatId: normalized };
}
