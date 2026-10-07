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
        cmc numeric(15, 4),
        cmc_interno numeric(15, 4),
        markup numeric(8, 4) not null default 1.65,
        ncm varchar(20),
        inactive boolean not null default false,
        synced_at timestamptz not null default now(),
        unique (omie_app_id, codigo_produto)
      )
    `;
  }
  if ((await columnExists("omie_products", "cms")) && !(await columnExists("omie_products", "cmc"))) {
    await sql.unsafe("alter table omie_products rename column cms to cmc");
  }
  if (!(await columnExists("omie_products", "cmc"))) {
    await sql.unsafe("alter table omie_products add column cmc numeric(15, 4)");
  }
  if (!(await columnExists("omie_products", "cmc_interno"))) {
    await sql.unsafe("alter table omie_products add column cmc_interno numeric(15, 4)");
  }
  if (!(await columnExists("omie_products", "markup"))) {
    await sql.unsafe("alter table omie_products add column markup numeric(8, 4) not null default 1.65");
  }
  if (!(await indexExists("omie_products_descricao_idx"))) {
    await sql.unsafe(
      "create index omie_products_descricao_idx on omie_products (omie_app_id, descricao)",
    );
  }

  if (!(await tableExists("omie_clients"))) {
    await sql`
      create table omie_clients (
        id serial primary key,
        omie_app_id varchar(64) not null,
        omie_app_name varchar(160) not null,
        codigo_cliente bigint not null,
        razao_social varchar(255) not null,
        nome_fantasia varchar(255),
        cnpj_cpf varchar(32),
        inactive boolean not null default false,
        synced_at timestamptz not null default now(),
        unique (omie_app_id, codigo_cliente)
      )
    `;
  }
  if (!(await indexExists("omie_clients_nome_idx"))) {
    await sql.unsafe(
      "create index omie_clients_nome_idx on omie_clients (omie_app_id, razao_social)",
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

  if (!(await tableExists("monthly_services"))) {
    await sql`
      create table monthly_services (
        id serial primary key,
        nome varchar(200) not null,
        valor numeric(15, 4) not null default 0,
        custo numeric(15, 4) not null default 0,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }
  if (!(await columnExists("monthly_services", "custo"))) {
    await sql.unsafe(
      "alter table monthly_services add column custo numeric(15, 4) not null default 0",
    );
  }

  if (!(await columnExists("quotes", "servico_mensal_id"))) {
    await sql.unsafe("alter table quotes add column servico_mensal_id integer");
  }
  if (!(await columnExists("quotes", "servico_mensal_nome"))) {
    await sql.unsafe("alter table quotes add column servico_mensal_nome varchar(200)");
  }
  if (!(await columnExists("quotes", "servico_mensal_valor"))) {
    await sql.unsafe("alter table quotes add column servico_mensal_valor numeric(15, 4)");
  }

  if (!(await tableExists("quote_monthly_services"))) {
    await sql`
      create table quote_monthly_services (
        id serial primary key,
        quote_id integer not null references quotes(id) on delete cascade,
        monthly_service_id integer,
        nome varchar(200) not null,
        valor numeric(15, 4) not null default 0,
        quantidade numeric(15, 4) not null default 1,
        sort_order integer not null default 0
      )
    `;
    // Migra orçamentos que já tinham um serviço único nas colunas antigas.
    await sql`
      insert into quote_monthly_services (quote_id, monthly_service_id, nome, valor, quantidade, sort_order)
      select
        id,
        servico_mensal_id,
        servico_mensal_nome,
        coalesce(servico_mensal_valor, 0),
        1,
        0
      from quotes
      where servico_mensal_nome is not null
        and trim(servico_mensal_nome) <> ''
    `;
  }

  if (!(await columnExists("quote_monthly_services", "quantidade"))) {
    await sql.unsafe(
      "alter table quote_monthly_services add column quantidade numeric(15, 4) not null default 1",
    );
  }

  if (!(await tableExists("facilities_posts"))) {
    await sql`
      create table facilities_posts (
        id serial primary key,
        nome varchar(200) not null,
        endereco varchar(255),
        cidade varchar(120),
        observacao text,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("facilities_collaborators"))) {
    await sql`
      create table facilities_collaborators (
        id serial primary key,
        nome varchar(200) not null,
        empresa varchar(32) not null,
        funcao varchar(32) not null,
        escala varchar(32) not null,
        posto_base_id integer references facilities_posts(id) on delete set null,
        telefone varchar(32),
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("facilities_substitutions"))) {
    await sql`
      create table facilities_substitutions (
        id serial primary key,
        data date not null,
        motivo varchar(32) not null,
        posto_id integer not null references facilities_posts(id),
        ausente_id integer not null references facilities_collaborators(id),
        substituto_id integer not null references facilities_collaborators(id),
        horas numeric(8, 2) not null default 12,
        observacao text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }
  if (!(await indexExists("facilities_substitutions_data_idx"))) {
    await sql.unsafe(
      "create index facilities_substitutions_data_idx on facilities_substitutions (data)",
    );
  }

  if (!(await tableExists("uniform_collaborators"))) {
    await sql`
      create table uniform_collaborators (
        id serial primary key,
        nome varchar(200) not null,
        matricula varchar(40),
        departamento varchar(120),
        cargo varchar(120),
        telefone varchar(32),
        tamanho_camisa varchar(12),
        tamanho_calca varchar(12),
        tamanho_calcado varchar(12),
        facilities_collaborator_id integer unique references facilities_collaborators(id) on delete set null,
        observacao text,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("uniform_items"))) {
    await sql`
      create table uniform_items (
        id serial primary key,
        nome varchar(200) not null,
        categoria varchar(60),
        tamanho varchar(20),
        quantidade integer not null default 0 check (quantidade >= 0),
        estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
        custo numeric(12, 2) not null default 0,
        vida_util_meses integer check (vida_util_meses is null or vida_util_meses > 0),
        foto text,
        foto_thumb text,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("uniform_movements"))) {
    await sql`
      create table uniform_movements (
        id serial primary key,
        collaborator_id integer not null references uniform_collaborators(id),
        tipo varchar(16) not null,
        observacao text,
        assinatura text,
        status varchar(16) not null default 'ativo',
        estorno_motivo text,
        estornado_em timestamptz,
        estornado_por integer references users(id) on delete set null,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }
  if (!(await indexExists("uniform_movements_collab_idx"))) {
    await sql.unsafe(
      "create index uniform_movements_collab_idx on uniform_movements (collaborator_id, created_at desc)",
    );
  }

  if (!(await tableExists("uniform_movement_items"))) {
    await sql`
      create table uniform_movement_items (
        id serial primary key,
        movement_id integer not null references uniform_movements(id) on delete cascade,
        item_id integer not null references uniform_items(id),
        direcao varchar(8) not null,
        condicao varchar(20),
        descricao varchar(200) not null,
        tamanho varchar(20),
        quantidade integer not null check (quantidade > 0),
        custo_unitario numeric(12, 2) not null default 0,
        proxima_troca date
      )
    `;
  }
  if (!(await indexExists("uniform_movement_items_movement_idx"))) {
    await sql.unsafe(
      "create index uniform_movement_items_movement_idx on uniform_movement_items (movement_id)",
    );
  }

  if (!(await tableExists("uniform_movement_photos"))) {
    await sql`
      create table uniform_movement_photos (
        id serial primary key,
        movement_id integer not null references uniform_movements(id) on delete cascade,
        foto text not null,
        thumb text not null,
        created_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("uniform_stock_moves"))) {
    await sql`
      create table uniform_stock_moves (
        id serial primary key,
        item_id integer not null references uniform_items(id),
        tipo varchar(16) not null,
        quantidade integer not null,
        saldo_apos integer not null,
        custo_unitario numeric(12, 2),
        fornecedor varchar(160),
        documento varchar(80),
        motivo text,
        movement_id integer references uniform_movements(id) on delete set null,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }
  if (!(await indexExists("uniform_stock_moves_item_idx"))) {
    await sql.unsafe(
      "create index uniform_stock_moves_item_idx on uniform_stock_moves (item_id, created_at desc)",
    );
  }

  for (const table of ["uniform_collaborators", "uniform_items", "uniform_movements"]) {
    if (!(await columnExists(table, "origem_id"))) {
      await sql.unsafe(`alter table ${table} add column origem_id varchar(64)`);
    }
    if (!(await indexExists(`${table}_origem_idx`))) {
      await sql.unsafe(
        `create unique index ${table}_origem_idx on ${table} (origem_id) where origem_id is not null`,
      );
    }
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
