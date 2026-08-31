import "@tanstack/react-start/server-only";

import { reloadEnvFromFile } from "@/db/client";

export type OmieAppConfig = {
  id: string;
  name: string;
  appKey: string;
  appSecret: string;
  notifyPhone: string | null;
};

const OMIE_BASE = "https://app.omie.com.br/api/v1";

function envKey(prefix: string, suffix: string) {
  return `OMIE_${prefix.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_${suffix}`;
}

export function listOmieApps(): OmieAppConfig[] {
  reloadEnvFromFile();
  const raw = (process.env["OMIE_APPS"] ?? "").trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((id) => {
      const prefix = id.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      const appKey = process.env[envKey(prefix, "APP_KEY")] ?? process.env[envKey(id, "APP_KEY")] ?? "";
      const appSecret =
        process.env[envKey(prefix, "APP_SECRET")] ?? process.env[envKey(id, "APP_SECRET")] ?? "";
      const name =
        process.env[envKey(prefix, "NAME")] ??
        process.env[envKey(id, "NAME")] ??
        id.replace(/_/g, " ");
      const notifyPhone =
        process.env[envKey(prefix, "NOTIFY_PHONE")] ??
        process.env[envKey(id, "NOTIFY_PHONE")] ??
        null;
      return { id, name, appKey, appSecret, notifyPhone: notifyPhone?.trim() || null };
    })
    .filter((app) => app.appKey && app.appSecret);
}

export function formatOmieDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDisplayDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  if (value instanceof Date) return formatOmieDate(value);
  const iso = value.includes("T") ? value.slice(0, 10) : value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (br) return value.trim();
  return value;
}

export function parseOmieDate(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value.replace(",", "."));
  return null;
}

type OmieCallResult<T> = T & {
  faultstring?: string;
  faultcode?: string;
  error_message?: string;
  error_code?: number;
};

let lastOmieRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function omieDelayMs() {
  const raw = process.env["OMIE_REQUEST_DELAY_MS"]?.trim();
  const parsed = raw ? Number(raw) : 400;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 400;
}

async function throttleOmieRequest() {
  const delay = omieDelayMs();
  const now = Date.now();
  const wait = lastOmieRequestAt + delay - now;
  if (wait > 0) await sleep(wait);
  lastOmieRequestAt = Date.now();
}

function isRateLimitError(message: string) {
  const text = message.toLowerCase();
  return text.includes("too many requests") || text.includes("429");
}

export async function omieCall<T>(
  app: OmieAppConfig,
  endpoint: string,
  call: string,
  param: Record<string, unknown> | Record<string, unknown>[],
): Promise<T> {
  const retryDelays = [2_000, 5_000, 10_000, 20_000];

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    await throttleOmieRequest();

    const response = await fetch(`${OMIE_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        call,
        app_key: app.appKey,
        app_secret: app.appSecret,
        param: Array.isArray(param) ? param : [param],
      }),
    });

    const text = await response.text();
    let body: OmieCallResult<T>;
    try {
      body = JSON.parse(text) as OmieCallResult<T>;
    } catch {
      throw new Error(text.slice(0, 280) || `Omie retornou ${response.status}`);
    }

    const fault =
      body.faultstring ||
      body.error_message ||
      (body.error_code ? text.slice(0, 280) : "") ||
      text.slice(0, 280);
    if (!response.ok || body.faultstring || body.error_message || body.error_code) {
      if (isRateLimitError(fault) && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]!);
        continue;
      }
      throw new Error(fault || `Omie retornou ${response.status}`);
    }

    return body;
  }

  throw new Error("Omie: limite de requisições excedido.");
}

export async function omiePaginate<TResponse extends Record<string, unknown>>(
  app: OmieAppConfig,
  endpoint: string,
  call: string,
  buildParam: (page: number) => Record<string, unknown>,
  extract: (response: TResponse) => {
    page: number;
    totalPages: number;
    items: unknown[];
  },
) {
  const all: unknown[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await omieCall<TResponse>(app, endpoint, call, buildParam(page));
    const parsed = extract(response);
    all.push(...parsed.items);
    totalPages = parsed.totalPages || 1;
    page += 1;
  }

  return all;
}
