import { getDb } from "./schema";

export const ACCESS_DENIED = 6;
export const ACCESS_GRANTED = 7;
export const ACCESS_REMOTE_API = 10;
export const ACCESS_PUSHBUTTON = 11;
export const ACCESS_REMOTE_WEB = 12;

export type AccessEventKind = "face" | "button" | "remote" | "denied" | "other";

export function accessEventKind(code: number): AccessEventKind {
  if (code === ACCESS_GRANTED) return "face";
  if (code === ACCESS_PUSHBUTTON) return "button";
  if (code === ACCESS_REMOTE_API || code === ACCESS_REMOTE_WEB) return "remote";
  if (code === ACCESS_DENIED) return "denied";
  return "other";
}

export function accessEventLabel(code: number) {
  switch (code) {
    case 1:
      return "Dispositivo inválido";
    case 2:
      return "Regra de identificação inválida";
    case 3:
      return "Não identificado";
    case 4:
      return "Identificação pendente";
    case 5:
      return "Tempo de identificação esgotado";
    case ACCESS_DENIED:
      return "Acesso negado";
    case ACCESS_GRANTED:
      return "Acesso por face";
    case 8:
      return "Acesso pendente";
    case 9:
      return "Usuário não é administrador";
    case ACCESS_REMOTE_API:
      return "Acionamento remoto";
    case ACCESS_PUSHBUTTON:
      return "Acesso por botoeira";
    case ACCESS_REMOTE_WEB:
      return "Acionamento pela interface web";
    case 13:
      return "Entrada cancelada";
    case 14:
      return "Sem resposta";
    case 15:
      return "Acesso por interfone";
    default:
      return `Evento ${code}`;
  }
}

export type AccessEventInsert = {
  deviceId: number;
  guestId: number | null;
  controlIdLogId: number;
  controlIdUserId: number | null;
  eventCode: number;
  occurredAt: Date;
  portalId: number | null;
  confidence: number | null;
};

export type PresencePerson = {
  id: number;
  name: string;
  kind: "guest" | "staff";
  role: string;
  status: "Active" | "Inactive";
  since: string | null;
  hasPhoto: boolean;
  lastDevice: string | null;
  lastEventCode: number | null;
};

export async function getSyncCursor(deviceId: number) {
  const db = await getDb();
  const rows = await db<{ last_access_log_id: string | number; ancora_group_id: string | number | null; ancora_rule_id: string | number | null }[]>`
    select last_access_log_id, ancora_group_id, ancora_rule_id
    from device_sync_state
    where device_id = ${deviceId}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    await db`
      insert into device_sync_state (device_id) values (${deviceId})
      on conflict (device_id) do nothing
    `;
    return { lastAccessLogId: 0, groupId: null as number | null, ruleId: null as number | null };
  }
  return {
    lastAccessLogId: Number(row.last_access_log_id) || 0,
    groupId: row.ancora_group_id == null ? null : Number(row.ancora_group_id),
    ruleId: row.ancora_rule_id == null ? null : Number(row.ancora_rule_id),
  };
}

export async function saveSyncCursor(
  deviceId: number,
  patch: { lastAccessLogId?: number; groupId?: number | null; ruleId?: number | null },
) {
  const db = await getDb();
  await db`
    insert into device_sync_state (device_id, last_access_log_id, ancora_group_id, ancora_rule_id)
    values (
      ${deviceId},
      ${patch.lastAccessLogId ?? 0},
      ${patch.groupId ?? null},
      ${patch.ruleId ?? null}
    )
    on conflict (device_id) do update set
      last_access_log_id = coalesce(${patch.lastAccessLogId ?? null}, device_sync_state.last_access_log_id),
      ancora_group_id = coalesce(${patch.groupId ?? null}, device_sync_state.ancora_group_id),
      ancora_rule_id = coalesce(${patch.ruleId ?? null}, device_sync_state.ancora_rule_id)
  `;
}

export async function insertAccessEvents(events: AccessEventInsert[]) {
  if (events.length === 0) return;
  const db = await getDb();
  for (const event of events) {
    if (!Number.isFinite(event.controlIdLogId) || event.controlIdLogId <= 0) continue;
    if (!Number.isFinite(event.eventCode)) continue;
    const occurredAt =
      event.occurredAt instanceof Date && !Number.isNaN(event.occurredAt.getTime())
        ? event.occurredAt
        : new Date();
    try {
      await db`
        insert into access_events (
          device_id, guest_id, control_id_log_id, control_id_user_id,
          event_code, occurred_at, portal_id, confidence
        )
        values (
          ${event.deviceId},
          ${event.guestId},
          ${event.controlIdLogId},
          ${event.controlIdUserId},
          ${event.eventCode},
          ${occurredAt},
          ${event.portalId},
          ${event.confidence}
        )
        on conflict (device_id, control_id_log_id) do update set
          guest_id = coalesce(excluded.guest_id, access_events.guest_id),
          control_id_user_id = coalesce(excluded.control_id_user_id, access_events.control_id_user_id)
      `;
    } catch {
      // Keep importing the rest if one log is malformed.
    }
  }
}

export async function listPresence(hotelId: number, now = new Date()): Promise<PresencePerson[]> {
  const db = await getDb();
  const rows = await db<
    {
      id: number;
      name: string;
      kind: string;
      room: string | null;
      department: string | null;
      has_photo: boolean;
      last_access_at: Date | null;
      last_event_code: number | null;
      last_device: string | null;
    }[]
  >`
    select
      g.id,
      g.name,
      g.kind,
      g.room,
      g.department,
      (g.photo is not null) as has_photo,
      last_evt.occurred_at as last_access_at,
      last_evt.event_code as last_event_code,
      last_evt.device_name as last_device
    from guests g
    left join lateral (
      select e.occurred_at, e.event_code, d.name as device_name
      from access_events e
      join devices d on d.id = e.device_id
      where e.guest_id = g.id
      order by e.occurred_at desc
      limit 1
    ) last_evt on true
    where g.active = true and g.hotel_id = ${hotelId}
    order by
      case when last_evt.occurred_at is null then 1 else 0 end,
      last_evt.occurred_at desc nulls last,
      g.name
  `;

  const activeWindowMs = 18 * 60 * 60 * 1000;

  return rows.map((row) => {
    const kind = row.kind === "staff" ? "staff" : "guest";
    const role =
      kind === "staff"
        ? `Funcionário${row.department ? ` • ${row.department}` : ""}`
        : `Hóspede${row.room ? ` • Quarto ${row.room}` : ""}`;
    const last = row.last_access_at ? row.last_access_at.getTime() : 0;
    const isActive =
      row.last_event_code === ACCESS_GRANTED && last > 0 && now.getTime() - last < activeWindowMs;

    return {
      id: row.id,
      name: row.name,
      kind,
      role,
      status: isActive ? "Active" : "Inactive",
      since: row.last_access_at ? row.last_access_at.toISOString() : null,
      hasPhoto: row.has_photo,
      lastDevice: row.last_device,
      lastEventCode: row.last_event_code,
    };
  });
}

export type AccessEventFilter = {
  hotelId: number;
  limit?: number;
  page?: number;
  year?: number | null;
  month?: number | null;
  day?: number | null;
};

function dateParts(filter: AccessEventFilter) {
  return {
    year: filter.year ?? null,
    month: filter.month ?? null,
    day: filter.day ?? null,
  };
}

export async function countFilteredAccessEvents(filter: AccessEventFilter) {
  const db = await getDb();
  const { year, month, day } = dateParts(filter);
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count
    from access_events e
    join devices d on d.id = e.device_id
    where
      d.hotel_id = ${filter.hotelId}
      and (${year}::int is null or extract(year from timezone('America/Sao_Paulo', e.occurred_at)) = ${year})
      and (${month}::int is null or extract(month from timezone('America/Sao_Paulo', e.occurred_at)) = ${month})
      and (${day}::int is null or extract(day from timezone('America/Sao_Paulo', e.occurred_at)) = ${day})
  `;
  return rows[0]?.count ?? 0;
}

export async function backfillAccessEventGuests() {
  const db = await getDb();
  await db`
    update access_events e
    set guest_id = dp.guest_id
    from device_people dp
    where e.guest_id is null
      and e.control_id_user_id is not null
      and dp.device_id = e.device_id
      and dp.control_id_user_id = e.control_id_user_id
  `;
  await db`
    update access_events e
    set guest_id = g.id
    from guests g
    where e.guest_id is null
      and e.control_id_user_id is not null
      and g.control_id_user_id = e.control_id_user_id
  `;
}

export async function listRecentAccessEvents(filter: AccessEventFilter) {
  const db = await getDb();
  const limit = filter.limit ?? 10;
  const page = Math.max(1, filter.page ?? 1);
  const offset = (page - 1) * limit;
  const { year, month, day } = dateParts(filter);
  const rows = await db<
    {
      id: number;
      event_code: number;
      occurred_at: Date;
      confidence: number | null;
      device_name: string;
      device_location: string | null;
      person_id: number | null;
      person_name: string | null;
      person_kind: string | null;
      has_photo: boolean;
    }[]
  >`
    select
      e.id,
      e.event_code,
      e.occurred_at,
      e.confidence,
      d.name as device_name,
      d.location as device_location,
      g.id as person_id,
      g.name as person_name,
      g.kind as person_kind,
      (g.photo is not null) as has_photo
    from access_events e
    join devices d on d.id = e.device_id
    left join guests g on g.id = coalesce(
      e.guest_id,
      (
        select dp.guest_id
        from device_people dp
        where dp.device_id = e.device_id
          and e.control_id_user_id is not null
          and dp.control_id_user_id = e.control_id_user_id
        limit 1
      )
    )
    where
      d.hotel_id = ${filter.hotelId}
      and (${year}::int is null or extract(year from timezone('America/Sao_Paulo', e.occurred_at)) = ${year})
      and (${month}::int is null or extract(month from timezone('America/Sao_Paulo', e.occurred_at)) = ${month})
      and (${day}::int is null or extract(day from timezone('America/Sao_Paulo', e.occurred_at)) = ${day})
    order by e.occurred_at desc, e.id desc
    limit ${limit}
    offset ${offset}
  `;

  return rows.map((row) => ({
    id: row.id,
    eventCode: row.event_code,
    kind: accessEventKind(row.event_code),
    label: accessEventLabel(row.event_code),
    occurredAt:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : new Date(row.occurred_at).toISOString(),
    confidence: row.confidence,
    deviceName: row.device_location || row.device_name,
    personId: row.person_id,
    personName: row.person_name,
    personKind: row.person_kind === "staff" ? ("staff" as const) : row.person_name ? ("guest" as const) : null,
    hasPhoto: Boolean(row.has_photo),
  }));
}

export async function countAccessEvents(hotelId: number) {
  const db = await getDb();
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count
    from access_events e
    join devices d on d.id = e.device_id
    where d.hotel_id = ${hotelId}
  `;
  return rows[0]?.count ?? 0;
}
