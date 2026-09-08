import { getDb, type DueItem, type DueItemType, type NotificationKind } from "./schema";
import { OPEN_STATUS_SQL_LIST } from "@/server/omie/status";

type DueItemRow = {
  id: number;
  omie_app_id: string;
  omie_app_name: string;
  item_type: string;
  omie_code: number | null;
  integration_code: string | null;
  document_number: string | null;
  client_code: number | null;
  client_name: string | null;
  client_phone: string | null;
  due_date: string;
  amount: string | null;
  status: string | null;
  notified_at: string | null;
  overdue_notified_at: string | null;
  synced_at: string;
};

function toIsoDate(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (text.includes("T")) return text.slice(0, 10);
  return text;
}

function toDueItem(row: DueItemRow): DueItem {
  return {
    id: row.id,
    omieAppId: row.omie_app_id,
    omieAppName: row.omie_app_name,
    itemType: row.item_type as DueItemType,
    omieCode: row.omie_code == null ? null : Number(row.omie_code),
    integrationCode: row.integration_code,
    documentNumber: row.document_number,
    clientCode: row.client_code == null ? null : Number(row.client_code),
    clientName: row.client_name,
    clientPhone: row.client_phone,
    dueDate: toIsoDate(row.due_date),
    amount: row.amount == null ? null : Number(row.amount),
    status: row.status,
    notifiedAt: row.notified_at ? toIsoDate(row.notified_at) : null,
    overdueNotifiedAt: row.overdue_notified_at ? toIsoDate(row.overdue_notified_at) : null,
    syncedAt: toIsoDate(row.synced_at),
  };
}

export async function upsertDueItem(input: {
  omieAppId: string;
  omieAppName: string;
  itemType: DueItemType;
  omieCode: number | null;
  integrationCode: string | null;
  documentNumber: string | null;
  clientCode: number | null;
  clientName: string | null;
  clientPhone: string | null;
  dueDate: string;
  amount: number | null;
  status: string | null;
}) {
  const db = await getDb();
  await db`
    insert into due_items (
      omie_app_id, omie_app_name, item_type, omie_code, integration_code,
      document_number, client_code, client_name, client_phone, due_date, amount, status, synced_at
    ) values (
      ${input.omieAppId}, ${input.omieAppName}, ${input.itemType}, ${input.omieCode},
      ${input.integrationCode}, ${input.documentNumber}, ${input.clientCode}, ${input.clientName},
      ${input.clientPhone}, ${input.dueDate}, ${input.amount}, ${input.status}, now()
    )
    on conflict (omie_app_id, item_type, omie_code, due_date) do update set
      omie_app_name = excluded.omie_app_name,
      integration_code = excluded.integration_code,
      document_number = excluded.document_number,
      client_code = coalesce(excluded.client_code, due_items.client_code),
      client_name = coalesce(nullif(trim(excluded.client_name), ''), due_items.client_name),
      client_phone = coalesce(nullif(trim(excluded.client_phone), ''), due_items.client_phone),
      amount = excluded.amount,
      status = excluded.status,
      synced_at = now()
  `;
}


export async function listDueItems(filters?: {
  currentMonthOnly?: boolean;
  from?: string;
  to?: string;
  itemType?: DueItemType;
  omieAppId?: string;
  openOnly?: boolean;
}) {
  const db = await getDb();
  const currentMonthOnly = filters?.currentMonthOnly !== false;
  const openOnly = filters?.openOnly !== false;
  const statusFilter = openOnly
    ? db`and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}`
    : db``;

  const rows = currentMonthOnly
    ? await db<DueItemRow[]>`
        select *
        from due_items
        where due_date >= date_trunc('month', current_date)::date
          and due_date <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
          ${statusFilter}
        order by due_date asc, client_name asc
      `
    : await db<DueItemRow[]>`
        select *
        from due_items
        where due_date >= current_date - interval '90 days'
          and due_date <= current_date + interval '120 days'
          ${statusFilter}
        order by due_date asc, client_name asc
      `;

  return rows
    .map(toDueItem)
    .filter((item) => {
      if (filters?.from && item.dueDate < filters.from) return false;
      if (filters?.to && item.dueDate > filters.to) return false;
      if (filters?.itemType && item.itemType !== filters.itemType) return false;
      if (filters?.omieAppId && item.omieAppId !== filters.omieAppId) return false;
      return true;
    });
}

export async function getDueItemById(id: number) {
  const db = await getDb();
  const rows = await db<DueItemRow[]>`
    select *
    from due_items
    where id = ${id}
    limit 1
  `;
  const row = rows[0];
  return row ? toDueItem(row) : null;
}

export const DEFAULT_OVERDUE_NOTIFICATION_DAYS = 10;

export async function getDueItemsForNotification(targetDate: string) {
  const db = await getDb();
  const rows = await db<DueItemRow[]>`
    select *
    from due_items
    where due_date = ${targetDate}::date
      and notified_at is null
      and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      and not exists (
        select 1
        from notification_log nl
        where nl.due_item_id = due_items.id
          and nl.success = true
          and coalesce(nl.kind, 'pre_due') = 'pre_due'
          and nl.sent_at >= current_date
      )
    order by omie_app_name, client_name
  `;
  return rows.map(toDueItem);
}

export async function getDueItemsForOverdueNotification(
  overdueDays = DEFAULT_OVERDUE_NOTIFICATION_DAYS,
  referenceDate = new Date(),
) {
  const db = await getDb();
  const target = new Date(referenceDate);
  target.setDate(target.getDate() - overdueDays);
  const targetIso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;

  const rows = await db<DueItemRow[]>`
    select *
    from due_items
    where due_date = ${targetIso}::date
      and overdue_notified_at is null
      and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      and not exists (
        select 1
        from notification_log nl
        where nl.due_item_id = due_items.id
          and nl.success = true
          and nl.kind = 'overdue'
      )
    order by omie_app_name, client_name
  `;
  return rows.map(toDueItem);
}

export async function markDueItemNotified(id: number) {
  const db = await getDb();
  await db`update due_items set notified_at = now() where id = ${id}`;
}

export async function markDueItemOverdueNotified(id: number) {
  const db = await getDb();
  await db`update due_items set overdue_notified_at = now() where id = ${id}`;
}

/** Marca como RECEBIDO itens que sumiram da lista de títulos em aberto do Omie. */
export async function markStaleOpenDueItems(input: {
  omieAppId: string;
  from: string;
  to: string;
  openOmieCodes: number[];
}) {
  const db = await getDb();
  const codes = input.openOmieCodes.filter((code) => Number.isFinite(code) && code > 0);
  if (codes.length === 0) {
    const rows = await db<{ count: number }[]>`
      update due_items
      set status = 'RECEBIDO', synced_at = now()
      where omie_app_id = ${input.omieAppId}
        and due_date between ${input.from}::date and ${input.to}::date
        and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
        and item_type = 'boleto'
      returning 1
    `;
    return rows.length;
  }

  const rows = await db<{ count: number }[]>`
    update due_items
    set status = 'RECEBIDO', synced_at = now()
    where omie_app_id = ${input.omieAppId}
      and due_date between ${input.from}::date and ${input.to}::date
      and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      and item_type = 'boleto'
      and (omie_code is null or not (omie_code = any(${codes})))
    returning 1
  `;
  return rows.length;
}

/** Fecha NF-e/NFS-e sem status cobrável (evita alerta de nota já quitada). */
export async function closeNonOpenInvoiceDueItems() {
  const db = await getDb();
  const rows = await db<{ count: number }[]>`
    update due_items
    set status = 'RECEBIDO', synced_at = now()
    where item_type in ('nfe', 'nfse')
      and (
        status is null
        or trim(status) = ''
        or upper(trim(status)) in ('F', 'C', 'R', 'L')
      )
      and (
        notified_at is null
        or overdue_notified_at is null
        or upper(trim(coalesce(status, ''))) not in ('RECEBIDO', 'CANCELADO', 'BAIXADO', 'LIQUIDADO', 'PAGO')
      )
    returning 1
  `;
  return rows.length;
}

export async function insertNotificationLog(input: {
  dueItemId: number;
  phone: string;
  message: string;
  success: boolean;
  error?: string | null;
  kind?: NotificationKind;
}) {
  const db = await getDb();
  await db`
    insert into notification_log (due_item_id, phone, message, success, error, kind)
    values (${input.dueItemId}, ${input.phone}, ${input.message}, ${input.success}, ${input.error ?? null}, ${input.kind ?? "pre_due"})
  `;
}

/** Contatos distintos com envio bem-sucedido na última hora (anti-spam). */
export async function countSuccessfulNotifyPhonesLastHour() {
  const db = await getDb();
  const rows = await db<{ total: number }[]>`
    select count(distinct phone)::int as total
    from notification_log
    where success = true
      and sent_at >= now() - interval '1 hour'
  `;
  return rows[0]?.total ?? 0;
}

export type NotificationLogEntry = {
  id: number;
  dueItemId: number;
  phone: string;
  message: string;
  success: boolean;
  error: string | null;
  sentAt: string;
  kind: NotificationKind;
  clientName: string | null;
  omieAppName: string | null;
  documentNumber: string | null;
  dueDate: string | null;
  itemType: DueItemType | null;
};

type NotificationLogRow = {
  id: number;
  due_item_id: number;
  phone: string;
  message: string;
  success: boolean;
  error: string | null;
  sent_at: string;
  kind: string | null;
  client_name: string | null;
  omie_app_name: string | null;
  document_number: string | null;
  due_date: string | null;
  item_type: string | null;
};

function toNotificationLogEntry(row: NotificationLogRow): NotificationLogEntry {
  return {
    id: row.id,
    dueItemId: row.due_item_id,
    phone: row.phone,
    message: row.message,
    success: row.success,
    error: row.error,
    sentAt: toIsoDate(row.sent_at),
    kind: row.kind === "overdue" ? "overdue" : "pre_due",
    clientName: row.client_name,
    omieAppName: row.omie_app_name,
    documentNumber: row.document_number,
    dueDate: row.due_date ? toIsoDate(row.due_date) : null,
    itemType: (row.item_type as DueItemType | null) ?? null,
  };
}

export async function listNotificationLogsPaginated(page = 1, pageSize = 15) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * pageSize;

  const countRows = await db<{ total: number }[]>`
    select count(*)::int as total from notification_log
  `;
  const totalItems = countRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const rows = await db<NotificationLogRow[]>`
    select
      nl.id,
      nl.due_item_id,
      nl.phone,
      nl.message,
      nl.success,
      nl.error,
      nl.sent_at,
      nl.kind,
      di.client_name,
      di.omie_app_name,
      di.document_number,
      di.due_date,
      di.item_type
    from notification_log nl
    join due_items di on di.id = nl.due_item_id
    order by nl.sent_at desc
    limit ${pageSize} offset ${offset}
  `;

  return {
    items: rows.map(toNotificationLogEntry),
    page: Math.min(safePage, totalPages),
    pageSize,
    totalItems,
    totalPages,
  };
}

export async function getDashboardStats() {
  const db = await getDb();
  const rows = await db<
    {
      due_today: number;
      due_tomorrow: number;
      due_week: number;
      pending_notifications: number;
      pending_overdue_notifications: number;
      total_open: number;
    }[]
  >`
    select
      count(*) filter (
        where due_date = current_date
          and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      )::int as due_today,
      count(*) filter (
        where due_date = current_date + 1
          and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      )::int as due_tomorrow,
      count(*) filter (
        where due_date between current_date and current_date + 7
          and due_date <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
          and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      )::int as due_week,
      count(*) filter (
        where due_date = current_date + 1
          and notified_at is null
          and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      )::int as pending_notifications,
      count(*) filter (
        where due_date = current_date - interval '10 days'
          and overdue_notified_at is null
          and upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
      )::int as pending_overdue_notifications,
      count(*) filter (
        where upper(trim(coalesce(status, ''))) in ${db(OPEN_STATUS_SQL_LIST)}
          and due_date >= date_trunc('month', current_date)::date
          and due_date <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
      )::int as total_open
    from due_items
  `;
  return (
    rows[0] ?? {
      due_today: 0,
      due_tomorrow: 0,
      due_week: 0,
      pending_notifications: 0,
      pending_overdue_notifications: 0,
      total_open: 0,
    }
  );
}

export async function startSyncLog(omieAppId: string | null) {
  const db = await getDb();
  const rows = await db<{ id: number }[]>`
    insert into sync_log (omie_app_id) values (${omieAppId})
    returning id
  `;
  return rows[0]!.id;
}

export async function finishSyncLog(id: number, itemsFound: number, error?: string | null) {
  const db = await getDb();
  await db`
    update sync_log
    set finished_at = now(), items_found = ${itemsFound}, error = ${error ?? null}
    where id = ${id}
  `;
}

export async function getLastSyncLogs(limit = 10) {
  const db = await getDb();
  return db<
    {
      id: number;
      omie_app_id: string | null;
      started_at: string;
      finished_at: string | null;
      items_found: number;
      error: string | null;
    }[]
  >`
    select id, omie_app_id, started_at, finished_at, items_found, error
    from sync_log
    order by started_at desc
    limit ${limit}
  `;
}
