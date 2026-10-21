import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type WabaPendingDoc = {
  id: number;
  phone: string;
  dueItemId: number | null;
  testFilename: string | null;
  testMimetype: string | null;
  testBase64: string | null;
  createdAt: string;
};

function digitsPhone(value: string) {
  return value.replace(/\D/g, "");
}

export async function queuePendingDueItems(phone: string, dueItemIds: number[]) {
  const db = await getDb();
  const normalized = digitsPhone(phone);
  if (normalized.length < 10 || !dueItemIds.length) return;
  for (const dueItemId of dueItemIds) {
    await db`
      insert into waba_pending_docs (phone, due_item_id)
      values (${normalized}, ${dueItemId})
    `;
  }
}

export async function queuePendingTestDocument(input: {
  phone: string;
  filename: string;
  mimetype: string;
  base64: string;
}) {
  const db = await getDb();
  const normalized = digitsPhone(input.phone);
  if (normalized.length < 10) throw new Error("Telefone inválido.");
  const [row] = (await db`
    insert into waba_pending_docs (phone, test_filename, test_mimetype, test_base64)
    values (
      ${normalized},
      ${input.filename.slice(0, 200)},
      ${input.mimetype.slice(0, 120)},
      ${input.base64}
    )
    returning id
  `) as Array<{ id: number }>;
  return row?.id ?? 0;
}

export async function listPendingDocsForPhone(phone: string) {
  const db = await getDb();
  const normalized = digitsPhone(phone);
  if (normalized.length < 10) return [] as WabaPendingDoc[];
  const rows = (await db`
    select
      id, phone, due_item_id, test_filename, test_mimetype, test_base64,
      created_at::text as created_at
    from waba_pending_docs
    where fulfilled_at is null
      and (
        phone = ${normalized}
        or phone = ${normalized.slice(-11)}
        or right(phone, 11) = ${normalized.slice(-11)}
        or right(phone, 10) = ${normalized.slice(-10)}
      )
    order by id asc
  `) as Array<Record<string, unknown>>;

  return rows.map(
    (row): WabaPendingDoc => ({
      id: Number(row["id"]),
      phone: String(row["phone"] ?? ""),
      dueItemId: row["due_item_id"] == null ? null : Number(row["due_item_id"]),
      testFilename: row["test_filename"] == null ? null : String(row["test_filename"]),
      testMimetype: row["test_mimetype"] == null ? null : String(row["test_mimetype"]),
      testBase64: row["test_base64"] == null ? null : String(row["test_base64"]),
      createdAt: String(row["created_at"] ?? ""),
    }),
  );
}

export async function markPendingFulfilled(ids: number[]) {
  if (!ids.length) return;
  const db = await getDb();
  await db`
    update waba_pending_docs
    set fulfilled_at = now()
    where id in ${db(ids)} and fulfilled_at is null
  `;
}
