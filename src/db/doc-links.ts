import "@tanstack/react-start/server-only";

import { randomBytes } from "node:crypto";

import { getDb } from "@/db/schema";

function newToken() {
  return randomBytes(12).toString("base64url");
}

export function readPublicSiteUrl() {
  const raw =
    process.env["PUBLIC_SITE_URL"]?.trim() ||
    process.env["PUBLIC_APP_URL"]?.trim() ||
    "https://sistema.ancoraseguranca.app";
  return raw.replace(/\/+$/, "").replace(/\/api\/waha\/webhook$/i, "");
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
