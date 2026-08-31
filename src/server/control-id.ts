import "@tanstack/react-start/server-only";

export type DeviceEndpoint = {
  ip: string;
  port: number;
  useHttps?: boolean;
  username: string;
  password: string;
};

export type SystemInformation = {
  serial?: string;
  version?: string;
  device_id?: string;
  network?: { ip?: string; web_server_port?: number; ssl_enabled?: boolean };
  online?: boolean;
};

export type AccessLog = {
  id: number;
  time: number;
  event: number;
  user_id?: number;
  portal_id?: number;
  confidence?: number;
  registration?: string;
  userName?: string;
};

type Json = Record<string, unknown>;

export function toControlIdId(value: unknown): number | null {
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function registrationDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

const SESSION_TTL_MS = 8 * 60 * 1000;
const sessions = new Map<string, { token: string; expiresAt: number }>();

export class ControlIdError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ControlIdError";
  }
}

function endpointKey(device: DeviceEndpoint) {
  return `${device.useHttps ? "https" : "http"}://${device.ip}:${device.port}:${device.username}`;
}

export function deviceBaseUrl(device: DeviceEndpoint) {
  const protocol = device.useHttps ? "https" : "http";
  return `${protocol}://${device.ip}:${device.port}`;
}

async function readBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload === "string" && payload.trim()) return payload.slice(0, 400);
  if (typeof payload === "object") {
    const record = payload as Json;
    const message = record["error"] ?? record["message"] ?? record["code"];
    if (typeof message === "string" && message.trim()) return message;
    try {
      return JSON.stringify(payload).slice(0, 400);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function request(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 8000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
    const payload = await readBody(response);
    if (!response.ok) {
      throw new ControlIdError(errorMessage(payload, `HTTP ${response.status}`), response.status, payload);
    }
    if (payload && typeof payload === "object" && "error" in payload && (payload as Json)["error"]) {
      throw new ControlIdError(errorMessage(payload, "Control iD error"), response.status, payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ControlIdError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ControlIdError("Tempo esgotado ao falar com o equipamento");
    }
    throw new ControlIdError(error instanceof Error ? error.message : "Falha de rede com o equipamento");
  } finally {
    clearTimeout(timeout);
  }
}

export async function loginDevice(device: DeviceEndpoint): Promise<string> {
  const payload = await request(`${deviceBaseUrl(device)}/login.fcgi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: device.username, password: device.password }),
    timeoutMs: 6000,
  });
  const session =
    payload && typeof payload === "object" ? String((payload as Json)["session"] ?? "") : "";
  if (!session) {
    throw new ControlIdError("O equipamento não devolveu sessão. Confira usuário e senha.");
  }
  sessions.set(endpointKey(device), { token: session, expiresAt: Date.now() + SESSION_TTL_MS });
  return session;
}

async function getSession(device: DeviceEndpoint, force = false) {
  const cached = sessions.get(endpointKey(device));
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  return loginDevice(device);
}

export function forgetSession(device: DeviceEndpoint) {
  sessions.delete(endpointKey(device));
}

async function withSession<T>(device: DeviceEndpoint, run: (session: string) => Promise<T>): Promise<T> {
  const session = await getSession(device);
  try {
    return await run(session);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const status = error instanceof ControlIdError ? error.status : undefined;
    if (status === 401 || message.includes("session")) {
      forgetSession(device);
      const retry = await getSession(device, true);
      return run(retry);
    }
    throw error;
  }
}

function commandUrl(device: DeviceEndpoint, command: string, session: string, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({ session, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
  return `${deviceBaseUrl(device)}/${command}?${params.toString()}`;
}

export async function systemInformation(device: DeviceEndpoint): Promise<SystemInformation> {
  return withSession(device, async (session) => {
    const payload = await request(commandUrl(device, "system_information.fcgi", session), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return (payload ?? {}) as SystemInformation;
  });
}

export async function loadObjects<T>(
  device: DeviceEndpoint,
  object: string,
  extra: Json = {},
  timeoutMs = 8000,
): Promise<T[]> {
  return withSession(device, async (session) => {
    const payload = await request(commandUrl(device, "load_objects.fcgi", session), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object, ...extra }),
      timeoutMs,
    });
    const record = payload && typeof payload === "object" ? (payload as Json) : {};
    const list = record[object];
    if (Array.isArray(list)) return list as T[];
    if (list && typeof list === "object") {
      const nested = (list as Json)[object];
      if (Array.isArray(nested)) return nested as T[];
    }
    return [];
  });
}

export async function createObjects(
  device: DeviceEndpoint,
  object: string,
  values: Json[],
): Promise<number[]> {
  return withSession(device, async (session) => {
    const payload = await request(commandUrl(device, "create_objects.fcgi", session), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object, values }),
    });
    const ids = payload && typeof payload === "object" ? (payload as Json)["ids"] : null;
    return Array.isArray(ids) ? ids.map((id) => Number(id)) : [];
  });
}

export async function rebootDevice(device: DeviceEndpoint) {
  await withSession(device, async (session) => {
    await request(commandUrl(device, "reboot.fcgi", session), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      timeoutMs: 4000,
    }).catch(() => undefined);
  });
  forgetSession(device);
}

export async function openDoor(device: DeviceEndpoint) {
  await withSession(device, async (session) => {
    try {
      await request(commandUrl(device, "execute_actions.fcgi", session), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: [{ action: "door", parameters: "door=1" }] }),
      });
    } catch {
      await request(commandUrl(device, "execute_actions.fcgi", session), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: [{ action: "sec_box", parameters: "id=65793, reason=3" }] }),
      });
    }
  });
}

export async function setUserImage(device: DeviceEndpoint, userId: number, image: Buffer) {
  return withSession(device, async (session) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = await request(
      commandUrl(device, "user_set_image.fcgi", session, { user_id: userId, timestamp, match: 0 }),
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(image),
        timeoutMs: 20000,
      },
    );
    const record = payload && typeof payload === "object" ? (payload as Json) : {};
    const success = record["success"] === true || record["success"] === undefined;
    if (!success) {
      const errors = Array.isArray(record["errors"]) ? record["errors"] : [];
      const first = errors[0] as Json | undefined;
      throw new ControlIdError(String(first?.["message"] ?? "Foto rejeitada pelo Face Max"));
    }
    return payload;
  });
}

type Named = { id?: number; name?: string; type?: number };

export async function ensureAccessPolicy(device: DeviceEndpoint) {
  const groups = await loadObjects<Named>(device, "groups");
  const existingGroup = groups.find((item) => item.name === "Ancora" || item.name === "Âncora") ?? groups[0];
  let groupId = existingGroup?.id ?? null;
  if (groupId == null) {
    const ids = await createObjects(device, "groups", [{ name: "Ancora" }]);
    groupId = ids[0] ?? null;
  }

  const rules = await loadObjects<Named>(device, "access_rules");
  const existingRule =
    rules.find((item) => item.name === "Ancora Allow") ??
    rules.find((item) => item.type === 1) ??
    rules[0];
  let ruleId = existingRule?.id ?? null;
  if (ruleId == null) {
    const ids = await createObjects(device, "access_rules", [
      { name: "Ancora Allow", type: 1, priority: 0 },
    ]);
    ruleId = ids[0] ?? null;
  }

  if (groupId != null && ruleId != null) {
    const links = await loadObjects<{ group_id?: number; access_rule_id?: number }>(
      device,
      "group_access_rules",
    );
    const linked = links.some((item) => item.group_id === groupId && item.access_rule_id === ruleId);
    if (!linked) {
      await createObjects(device, "group_access_rules", [
        { group_id: groupId, access_rule_id: ruleId },
      ]).catch(() => undefined);
    }

    const zones = await loadObjects<Named>(device, "time_zones");
    const existingZone = zones.find((item) => item.name === "Ancora 24h") ?? zones[0];
    let zoneId = existingZone?.id ?? null;
    if (zoneId == null) {
      const ids = await createObjects(device, "time_zones", [{ name: "Ancora 24h" }]);
      zoneId = ids[0] ?? null;
      if (zoneId != null) {
        await createObjects(device, "time_spans", [
          {
            time_zone_id: zoneId,
            start: 0,
            end: 86399,
            sun: 1,
            mon: 1,
            tue: 1,
            wed: 1,
            thu: 1,
            fri: 1,
            sat: 1,
            hol1: 1,
            hol2: 1,
            hol3: 1,
          },
        ]).catch(() => undefined);
      }
    }
    if (zoneId != null) {
      await createObjects(device, "access_rule_time_zones", [
        { access_rule_id: ruleId, time_zone_id: zoneId },
      ]).catch(() => undefined);
    }

    const portals = await loadObjects<{ id?: number }>(device, "portals");
    const portalId = portals[0]?.id;
    if (portalId != null) {
      await createObjects(device, "portal_access_rules", [
        { portal_id: portalId, access_rule_id: ruleId },
      ]).catch(() => undefined);
    }
  }

  return { groupId, ruleId };
}

export async function modifyObjects(
  device: DeviceEndpoint,
  object: string,
  values: Json,
  where: Json,
) {
  return withSession(device, async (session) => {
    await request(commandUrl(device, "modify_objects.fcgi", session), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object, values, where }),
    });
  });
}

export async function destroyObjects(device: DeviceEndpoint, object: string, where: Json) {
  return withSession(device, async (session) => {
    await request(commandUrl(device, "destroy_objects.fcgi", session), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object, where }),
    });
  });
}

export async function destroyUserImage(device: DeviceEndpoint, userId: number) {
  return withSession(device, async (session) => {
    await request(commandUrl(device, "user_destroy_image.fcgi", session), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
  });
}

export async function destroyUser(device: DeviceEndpoint, userId: number) {
  await destroyObjects(device, "user_groups", { user_groups: { user_id: userId } }).catch(() => undefined);
  await destroyUserImage(device, userId).catch(() => undefined);
  await destroyObjects(device, "users", { users: { id: userId } });
}

export async function listDeviceUsers(device: DeviceEndpoint) {
  const users = await loadObjects<{ id: number | string; registration?: string; name?: string }>(
    device,
    "users",
    {},
    20_000,
  );
  return users
    .map((user) => ({
      id: toControlIdId(user.id),
      registration: user.registration,
      name: user.name,
    }))
    .filter((user): user is { id: number; registration?: string; name?: string } => user.id != null);
}

/** Remove todos os usuários e faces do equipamento. */
export async function destroyAllUsers(device: DeviceEndpoint) {
  const users = await listDeviceUsers(device);
  let removed = 0;
  const errors: string[] = [];
  for (const user of users) {
    try {
      await destroyUser(device, user.id);
      removed += 1;
    } catch (error) {
      errors.push(
        `${user.name || user.registration || user.id}: ${
          error instanceof Error ? error.message : "falha"
        }`,
      );
    }
  }
  // Confirma se sobrou alguém (destroy em lote quando a API permitir).
  const remaining = await listDeviceUsers(device).catch(() => [] as Awaited<ReturnType<typeof listDeviceUsers>>);
  if (remaining.length > 0) {
    await destroyObjects(device, "users", { users: {} }).catch(() => undefined);
  }
  const leftover = await listDeviceUsers(device).catch(() => remaining);
  return { removed, remaining: leftover.length, errors };
}

export async function findUsersByRegistration(device: DeviceEndpoint, registration: string) {
  const wanted = registrationDigits(registration);
  const users = await loadObjects<{ id: number | string; registration?: string; name?: string }>(device, "users");
  return users
    .map((user) => ({
      id: toControlIdId(user.id),
      registration: user.registration,
      name: user.name,
    }))
    .filter((user): user is { id: number; registration?: string; name?: string } => user.id != null)
    .filter((user) => wanted.length > 0 && registrationDigits(user.registration) === wanted);
}

export async function findOrCreateUser(
  device: DeviceEndpoint,
  input: {
    name: string;
    registration: string;
    beginTime?: number;
    endTime?: number;
  },
) {
  const existing = await findUsersByRegistration(device, input.registration);
  const matchId = existing[0]?.id ?? null;
  const payload: Json = {
    name: input.name,
    registration: input.registration,
  };
  if (input.beginTime != null) payload["begin_time"] = input.beginTime;
  if (input.endTime != null) payload["end_time"] = input.endTime;

  if (matchId) {
    await modifyObjects(
      device,
      "users",
      { ...payload, user_type_id: null },
      { users: { id: matchId } },
    ).catch(() => undefined);
    return matchId;
  }

  const ids = await createObjects(device, "users", [payload]);
  const id = ids[0];
  if (!id) throw new ControlIdError("O Face Max não criou o usuário");
  return id;
}

export async function addUserToGroup(device: DeviceEndpoint, userId: number, groupId: number) {
  await createObjects(device, "user_groups", [{ user_id: userId, group_id: groupId }]).catch(() => undefined);
}

function nestedRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function pickUserId(row: Json): number | undefined {
  const users = nestedRecord(row.users);
  const candidates = [row.user_id, row.userid, row.userId, row.user, users?.id];
  for (const value of candidates) {
    const nested = nestedRecord(value);
    const id = toControlIdId(nested?.id ?? value);
    if (id) return id;
  }
  return undefined;
}

function pickText(row: Json, keys: string[]): string | undefined {
  const users = nestedRecord(row.users);
  for (const key of keys) {
    const value = row[key] ?? users?.[key.replace(/^users\./, "")];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeAccessLog(raw: unknown): AccessLog | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Json;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const event = Number(row.event ?? row.event_id ?? 0);
  return {
    id,
    time: Number(row.time ?? 0),
    event: Number.isFinite(event) ? event : 0,
    user_id: pickUserId(row),
    portal_id: row.portal_id == null ? undefined : Number(row.portal_id),
    confidence: row.confidence == null ? undefined : Number(row.confidence),
    registration: pickText(row, ["registration", "users.registration"]),
    userName: pickText(row, ["name", "users.name", "user_name"]),
  };
}

const ACCESS_LOG_FIELDS: Array<string | Json> = [
  "id",
  "time",
  "event",
  "user_id",
  "portal_id",
  "confidence",
  { object: "users", field: "name" },
  { object: "users", field: "registration" },
];

async function loadAccessLogRows(device: DeviceEndpoint, extra: Json, timeoutMs: number) {
  try {
    return await loadObjects<unknown>(
      device,
      "access_logs",
      { ...extra, join: "LEFT", fields: ACCESS_LOG_FIELDS },
      timeoutMs,
    );
  } catch {
    return await loadObjects<unknown>(device, "access_logs", extra, timeoutMs);
  }
}

export async function loadAccessLogs(device: DeviceEndpoint, afterId: number): Promise<AccessLog[]> {
  const timeoutMs = afterId > 0 ? 3500 : 6000;
  const newest = await loadAccessLogRows(
    device,
    {
      order: ["id", "descending"],
      limit: afterId > 0 ? 150 : 250,
    },
    timeoutMs,
  );
  let logs = newest.map(normalizeAccessLog).filter((log): log is AccessLog => log !== null);
  const maxReturned = logs.reduce((max, log) => Math.max(max, log.id), 0);
  const looksLikeOldest = logs.length > 0 && maxReturned < afterId;

  if (afterId > 0 && (logs.length === 0 || looksLikeOldest)) {
    const newer = await loadAccessLogRows(
      device,
      {
        where: [
          {
            object: "access_logs",
            field: "id",
            operator: ">",
            value: afterId,
          },
        ],
        order: ["id", "ascending"],
        limit: 200,
      },
      timeoutMs,
    );
    logs = [...logs, ...newer.map(normalizeAccessLog).filter((log): log is AccessLog => log !== null)];
  }

  const seen = new Set<number>();
  return logs
    .filter((log) => {
      if (afterId > 0 && log.id <= afterId) return false;
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    })
    .sort((a, b) => a.id - b.id);
}
