import { createHash, randomBytes } from "node:crypto";

import { getDb, type AppUser } from "@/db/schema";
import { findUserById } from "@/db/users";

const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRawMobileToken() {
  return randomBytes(32).toString("base64url");
}

export async function createMobileSession(userId: number) {
  const rawToken = createRawMobileToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const db = await getDb();
  await db`
    insert into mobile_sessions (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;
  return { token: rawToken, expiresAt: expiresAt.toISOString() };
}

export async function revokeMobileSession(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const db = await getDb();
  await db`delete from mobile_sessions where token_hash = ${tokenHash}`;
}

export async function findUserByMobileToken(
  rawToken: string,
): Promise<AppUser | null> {
  const tokenHash = hashToken(rawToken);
  const db = await getDb();
  const [row] = await db<{ user_id: number; expires_at: string }[]>`
    select user_id, expires_at::text as expires_at
    from mobile_sessions
    where token_hash = ${tokenHash}
    limit 1
  `;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db`delete from mobile_sessions where token_hash = ${tokenHash}`;
    return null;
  }
  await db`
    update mobile_sessions
    set last_seen_at = now()
    where token_hash = ${tokenHash}
  `;
  const user = await findUserById(row.user_id);
  return user ?? null;
}

export async function upsertMobileDeviceToken(input: {
  userId: number;
  expoPushToken: string;
  platform?: string;
}) {
  const token = input.expoPushToken.trim();
  if (!token) throw new Error("Token de push inválido.");
  const platform = (input.platform ?? "android").trim() || "android";
  const db = await getDb();
  await db`
    insert into mobile_device_tokens (user_id, expo_push_token, platform, updated_at)
    values (${input.userId}, ${token}, ${platform}, now())
    on conflict (user_id, expo_push_token)
    do update set platform = excluded.platform, updated_at = now()
  `;
}

export async function listExpoPushTokensForUser(userId: number) {
  const db = await getDb();
  const rows = await db<{ expo_push_token: string }[]>`
    select expo_push_token
    from mobile_device_tokens
    where user_id = ${userId}
  `;
  return rows.map((r) => r.expo_push_token);
}

export async function findTecnicoUserIdsByNome(tecnicoNome: string | null | undefined) {
  const name = (tecnicoNome ?? "").trim();
  if (!name) return [] as number[];
  const db = await getDb();
  const rows = await db<{ id: number }[]>`
    select id
    from users
    where active = true
      and coalesce(is_tecnico, false) = true
      and lower(trim(name)) = lower(${name})
  `;
  return rows.map((r) => Number(r.id));
}
