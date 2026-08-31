import "@tanstack/react-start/server-only";
import { hash } from "bcryptjs";

import { getSql } from "./client";

export type AppRole = "superadmin" | "admin" | "operator";

export type AppUser = {
  id: number;
  username: string;
  name: string;
  role: AppRole;
  active: boolean;
};

export type AppUserRow = AppUser & {
  password_hash: string;
};

export type DueItemType = "boleto" | "nfe" | "nfse";

export type DueItem = {
  id: number;
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
  notifiedAt: string | null;
  syncedAt: string;
};

let ready: Promise<void> | undefined;

export function resetSchemaReady() {
  ready = undefined;
}

export async function getDb() {
  if (!ready) {
    ready = ensureSchema().catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
  }
  await ready;
  return getSql();
}

async function tableExists(name: string) {
  const sql = getSql();
  const rows = await sql<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${name}
    ) as exists
  `;
  return Boolean(rows[0]?.exists);
}

async function indexExists(name: string) {
  const sql = getSql();
  const rows = await sql<{ exists: boolean }[]>`
    select exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = ${name}
    ) as exists
  `;
  return Boolean(rows[0]?.exists);
}

export async function ensureSchema() {
  const sql = getSql();

  if (!(await tableExists("users"))) {
    await sql`
      create table users (
        id serial primary key,
        username varchar(64) not null unique,
        password_hash text not null,
        name varchar(120) not null,
        role varchar(32) not null default 'operator',
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("due_items"))) {
    await sql`
      create table due_items (
        id serial primary key,
        omie_app_id varchar(64) not null,
        omie_app_name varchar(160) not null,
        item_type varchar(16) not null,
        omie_code bigint,
        integration_code varchar(120),
        document_number varchar(80),
        client_code bigint,
        client_name varchar(200),
        client_phone varchar(32),
        due_date date not null,
        amount numeric(15, 2),
        status varchar(40),
        notified_at timestamptz,
        synced_at timestamptz not null default now(),
        unique (omie_app_id, item_type, omie_code, due_date)
      )
    `;
  }

  if (!(await indexExists("due_items_due_date_idx"))) {
    await sql.unsafe("create index due_items_due_date_idx on due_items (due_date)");
  }
  if (!(await indexExists("due_items_notified_idx"))) {
    await sql.unsafe(
      "create index due_items_notified_idx on due_items (due_date, notified_at) where notified_at is null",
    );
  }

  if (!(await tableExists("notification_log"))) {
    await sql`
      create table notification_log (
        id serial primary key,
        due_item_id integer not null references due_items(id) on delete cascade,
        phone varchar(32) not null,
        message text not null,
        success boolean not null default true,
        error text,
        sent_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("sync_log"))) {
    await sql`
      create table sync_log (
        id serial primary key,
        omie_app_id varchar(64),
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        items_found integer not null default 0,
        error text
      )
    `;
  }

  if (!(await tableExists("app_settings"))) {
    await sql`
      create table app_settings (
        key varchar(64) primary key,
        value text not null,
        updated_at timestamptz not null default now()
      )
    `;
  }

  const superUsername = process.env["APP_SUPERADMIN_USERNAME"] ?? "superadmin";
  const superPassword = process.env["APP_SUPERADMIN_PASSWORD"] ?? "ancora";
  const superName = process.env["APP_SUPERADMIN_NAME"] ?? "Super Admin";

  const existing = await sql<{ id: number }[]>`
    select id from users where username = ${superUsername} limit 1
  `;
  if (!existing[0]) {
    const passwordHash = await hash(superPassword, 10);
    await sql`
      insert into users (username, password_hash, name, role)
      values (${superUsername}, ${passwordHash}, ${superName}, 'superadmin')
    `;
  }
}
