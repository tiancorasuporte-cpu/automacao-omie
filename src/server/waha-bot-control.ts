import "@tanstack/react-start/server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), ".cache");
const STATUS_FILE = join(CACHE_DIR, "waha-bot-status.json");
const RESTART_FILE = join(CACHE_DIR, "waha-bot-restart.json");

export type WahaBotStatus = {
  pid: number;
  readyAt: number;
  connected: boolean;
  updatedAt: number;
  lastRestartAt?: number;
};

type RestartRequest = {
  requestedAt: number;
  requestedBy?: string;
};

function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(path: string, data: unknown) {
  ensureCacheDir();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, path);
}

export function readWahaBotStatus(): WahaBotStatus | null {
  const status = readJsonFile<WahaBotStatus>(STATUS_FILE);
  if (!status) return null;
  // Consider stale if no heartbeat for 45s.
  if (Date.now() - status.updatedAt > 45_000) {
    return { ...status, connected: false };
  }
  return status;
}

export function writeWahaBotStatus(partial: Partial<WahaBotStatus> & Pick<WahaBotStatus, "pid">) {
  const prev = readJsonFile<WahaBotStatus>(STATUS_FILE);
  const next: WahaBotStatus = {
    pid: partial.pid,
    readyAt: partial.readyAt ?? prev?.readyAt ?? Date.now(),
    connected: partial.connected ?? prev?.connected ?? false,
    updatedAt: Date.now(),
    lastRestartAt: partial.lastRestartAt ?? prev?.lastRestartAt,
  };
  writeJsonAtomic(STATUS_FILE, next);
}

export function requestWahaBotRestart(requestedBy = "admin") {
  const payload: RestartRequest = { requestedAt: Date.now(), requestedBy };
  writeJsonAtomic(RESTART_FILE, payload);
  return payload;
}

export function readWahaBotRestartRequest(): RestartRequest | null {
  return readJsonFile<RestartRequest>(RESTART_FILE);
}

export function isBotListenerProcess() {
  if (process.env["WAHA_BOT_IN_DEV"] === "true") return true;
  return process.argv.some((arg) => arg.includes("waha-bot-listener"));
}

export async function restartWahaBotListenerInProcess() {
  const { stopWahaEventsSocket, startWahaEventsSocket } = await import("@/server/waha-events");
  const { markWahaBotReady } = await import("@/server/waha-bot-ready");
  const { clearWahaInboundWebhooks } = await import("@/server/waha");

  stopWahaEventsSocket();
  await new Promise((resolve) => setTimeout(resolve, 500));

  const { clearWahaDedupeCache } = await import("@/server/waha-dedupe");
  clearWahaDedupeCache();

  const cleared = await clearWahaInboundWebhooks();
  markWahaBotReady();
  await startWahaEventsSocket();

  writeWahaBotStatus({
    pid: process.pid,
    readyAt: Date.now(),
    connected: false,
    lastRestartAt: Date.now(),
  });

  return {
    ok: true as const,
    mode: "in-process" as const,
    webhooksCleared: cleared.ok,
  };
}

export async function restartWahaBotListener() {
  if (isBotListenerProcess()) {
    return restartWahaBotListenerInProcess();
  }

  const before = readWahaBotStatus();
  requestWahaBotRestart();

  // Wait up to 12s for listener to pick up restart and reconnect.
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = readWahaBotStatus();
    if (!status) continue;
    if (status.lastRestartAt && (!before?.lastRestartAt || status.lastRestartAt > before.lastRestartAt)) {
      return {
        ok: true as const,
        mode: "external" as const,
        pid: status.pid,
        connected: status.connected,
      };
    }
  }

  const status = readWahaBotStatus();
  if (status && Date.now() - status.updatedAt < 45_000) {
    return {
      ok: true as const,
      mode: "external" as const,
      pid: status.pid,
      connected: status.connected,
      warning: "Reinício solicitado; confira o terminal do bot:listen.",
    };
  }

  return {
    ok: false as const,
    error: "Nenhum listener ativo. Rode npm run bot:listen e tente novamente.",
  };
}

export async function stopWahaBotListeners() {
  const { execSync } = await import("node:child_process");
  const psStop = [
    "Get-CimInstance Win32_Process",
    "| Where-Object { $_.Name -eq 'bun.exe' -and $_.CommandLine -match 'waha-bot-listener' }",
    "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }",
  ].join(" ");
  try {
    if (process.platform === "win32") {
      const output = execSync(`powershell -NoProfile -Command "${psStop}"`, { encoding: "utf8" }).trim();
      const pids = output.split(/\s+/).filter(Boolean);
      return {
        ok: true as const,
        stopped: pids.length,
        pids: pids.map(Number),
      };
    }
    execSync("pkill -f waha-bot-listener || true");
    return { ok: true as const, stopped: -1, pids: [] as number[] };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Não foi possível parar o bot.",
    };
  }
}
