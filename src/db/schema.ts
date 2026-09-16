import "@tanstack/react-start/server-only";
import { hash } from "bcryptjs";

import { getSql } from "./client";
import type { AppModuleId } from "@/lib/modules";

export type AppRole = "superadmin" | "admin" | "operator";

export type { AppModuleId };

export type AppUser = {
  id: number;
  username: string;
  name: string;
  role: AppRole;
  active: boolean;
  /** Módulos liberados. Admin/superadmin sempre têm todos. */
  modules: AppModuleId[];
};

export type AppUserRow = {
  id: number;
  username: string;
  password_hash: string;
  name: string;
  role: string;
  active: boolean;
  modules?: string | null;
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
  overdueNotifiedAt: string | null;
  syncedAt: string;
};

export type NotificationKind = "pre_due" | "overdue";

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

async function columnExists(table: string, column: string) {
  const sql = getSql();
  const rows = await sql<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = ${table} and column_name = ${column}
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
        modules text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await columnExists("users", "modules"))) {
    await sql.unsafe("alter table users add column modules text");
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

  if (!(await columnExists("due_items", "overdue_notified_at"))) {
    await sql.unsafe("alter table due_items add column overdue_notified_at timestamptz");
  }
  if (!(await indexExists("due_items_overdue_notified_idx"))) {
    await sql.unsafe(
      "create index due_items_overdue_notified_idx on due_items (due_date, overdue_notified_at) where overdue_notified_at is null",
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
        sent_at timestamptz not null default now(),
        kind varchar(16) not null default 'pre_due'
      )
    `;
  }

  if (!(await columnExists("notification_log", "kind"))) {
    await sql.unsafe("alter table notification_log add column kind varchar(16) not null default 'pre_due'");
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

  if (!(await tableExists("omie_products"))) {
    await sql`
      create table omie_products (
        id serial primary key,
        omie_app_id varchar(64) not null,
        omie_app_name varchar(160) not null,
        codigo_produto bigint not null,
        codigo_interno varchar(120),
        descricao varchar(255) not null,
        unidade varchar(20),
        valor_unitario numeric(15, 4),
        ncm varchar(20),
        inactive boolean not null default false,
        synced_at timestamptz not null default now(),
        unique (omie_app_id, codigo_produto)
      )
    `;
  }
  if (!(await indexExists("omie_products_descricao_idx"))) {
    await sql.unsafe(
      "create index omie_products_descricao_idx on omie_products (omie_app_id, descricao)",
    );
  }

  if (!(await tableExists("quotes"))) {
    await sql`
      create table quotes (
        id serial primary key,
        omie_app_id varchar(64) not null,
        omie_app_name varchar(160) not null,
        client_code bigint not null,
        client_name varchar(200),
        numero_interno varchar(40) not null,
        omie_pedido_code bigint,
        integration_code varchar(120),
        numero_pedido varchar(40),
        etapa varchar(8) not null default '00',
        data_previsao date,
        observacao text,
        total numeric(15, 2),
        status varchar(32) not null default 'draft',
        error text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (numero_interno)
      )
    `;
  }

  if (!(await columnExists("quotes", "numero_interno"))) {
    await sql.unsafe("alter table quotes add column numero_interno varchar(40)");
    await sql.unsafe(`
      update quotes
      set numero_interno = 'ORC-' || to_char(created_at, 'YYYY') || '-' || lpad(id::text, 5, '0')
      where numero_interno is null or trim(numero_interno) = ''
    `);
    await sql.unsafe("alter table quotes alter column numero_interno set not null");
    await sql.unsafe(
      "create unique index if not exists quotes_numero_interno_uidx on quotes (numero_interno)",
    );
  }
  if (!(await columnExists("quotes", "observacao"))) {
    await sql.unsafe("alter table quotes add column observacao text");
  }
  if (!(await columnExists("quotes", "data_previsao"))) {
    await sql.unsafe("alter table quotes add column data_previsao date");
  }
  if (!(await columnExists("quotes", "updated_at"))) {
    await sql.unsafe("alter table quotes add column updated_at timestamptz not null default now()");
  }

  if (!(await tableExists("quote_items"))) {
    await sql`
      create table quote_items (
        id serial primary key,
        quote_id integer not null references quotes(id) on delete cascade,
        codigo_produto bigint not null,
        descricao varchar(255) not null,
        unidade varchar(20),
        quantidade numeric(15, 4) not null,
        valor_unitario numeric(15, 4) not null,
        ncm varchar(20)
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
