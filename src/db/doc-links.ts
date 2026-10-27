import "@tanstack/react-start/server-only";

import { randomBytes } from "node:crypto";

import { getDb } from "@/db/schema";

function newToken() {
  return randomBytes(12).toString("base64url");
}

const DEFAULT_PUBLIC_SITE_URL = "https://sistema.ancoraseguranca.app";

/** Host privado/local — não serve para link de WhatsApp. */
function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

function normalizeSiteBase(raw: string) {
  const cleaned = raw.trim().replace(/\/+$/, "").replace(/\/api\/waha\/webhook$/i, "");
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned.includes("://") ? cleaned : `https://${cleaned}`);
    if (isPrivateOrLocalHost(url.hostname)) return null;
    // WhatsApp/Meta templates preferem HTTPS público.
    if (url.protocol === "http:" && url.port && url.port !== "80") return null;
    return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Base pública do app para links /d/*.
 * Não usa PUBLIC_APP_URL de webhook WAHA (costuma ser IP LAN).
 */
export function readPublicSiteUrl() {
  const candidates = [
    process.env["PUBLIC_SITE_URL"]?.trim(),
    process.env["PUBLIC_APP_URL"]?.trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeSiteBase(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_PUBLIC_SITE_URL;
}

/** URL segura para variável de template WABA (HTTPS público). */
export function isPublicTemplateUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    if (isPrivateOrLocalHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function createDocLink(input: {
  targetUrl: string;
  dueItemId?: number | null;
  phone?: string | null;
  label?: string | null;
  expiresInDays?: number;
}) {
  const db = await getDb();
  const targetUrl = input.targetUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    throw new Error("URL do documento inválida.");
  }

  const token = newToken();
  const expiresInDays = input.expiresInDays ?? 30;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const [row] = (await db`
    insert into doc_links (token, target_url, due_item_id, phone, label, expires_at)
    values (
      ${token},
      ${targetUrl},
      ${input.dueItemId ?? null},
      ${input.phone ? input.phone.replace(/\D/g, "") : null},
      ${input.label?.slice(0, 200) ?? null},
      ${expiresAt}
    )
    returning token
  `) as Array<{ token: string }>;

  const publicToken = row?.token ?? token;
  return {
    token: publicToken,
    url: `${readPublicSiteUrl()}/d/${publicToken}`,
  };
}

export async function resolveDocLink(token: string) {
  const db = await getDb();
  const cleaned = token.trim();
  if (!cleaned) return null;
  const [row] = (await db`
    select token, target_url, expires_at
    from doc_links
    where token = ${cleaned}
    limit 1
  `) as Array<{ token: string; target_url: string; expires_at: string | null }>;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  await db`update doc_links set hits = hits + 1 where token = ${cleaned}`;
  return row.target_url;
}
