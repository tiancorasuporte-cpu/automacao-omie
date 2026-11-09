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
  /** Data de emissão no Omie (quando disponível). */
  issueDate: string | null;
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
  if (!(await columnExists("due_items", "issue_date"))) {
    await sql.unsafe("alter table due_items add column issue_date date");
  }
  if (!(await indexExists("due_items_issue_date_idx"))) {
    await sql.unsafe("create index due_items_issue_date_idx on due_items (issue_date)");
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

  if (!(await tableExists("waba_pending_docs"))) {
    await sql`
      create table waba_pending_docs (
        id serial primary key,
        phone varchar(32) not null,
        due_item_id integer references due_items(id) on delete cascade,
        test_filename varchar(200),
        test_mimetype varchar(120),
        test_base64 text,
        created_at timestamptz not null default now(),
        fulfilled_at timestamptz
      )
    `;
  }
  if (!(await indexExists("waba_pending_docs_phone_idx"))) {
    await sql.unsafe(
      "create index waba_pending_docs_phone_idx on waba_pending_docs (phone) where fulfilled_at is null",
    );
  }

  if (!(await tableExists("doc_links"))) {
    await sql`
      create table doc_links (
        token varchar(32) primary key,
        target_url text not null,
        due_item_id integer references due_items(id) on delete set null,
        phone varchar(32),
        label varchar(200),
        created_at timestamptz not null default now(),
        expires_at timestamptz,
        hits integer not null default 0
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
  if (!(await columnExists("omie_products", "estoque_fiscal"))) {
    await sql.unsafe(
      "alter table omie_products add column estoque_fiscal numeric(14, 4) not null default 0",
    );
  }
  if (!(await columnExists("omie_products", "estoque_fiscal_synced_at"))) {
    await sql.unsafe("alter table omie_products add column estoque_fiscal_synced_at timestamptz");
  }
  if (!(await indexExists("omie_products_estoque_fiscal_idx"))) {
    await sql.unsafe(
      "create index omie_products_estoque_fiscal_idx on omie_products (omie_app_id, estoque_fiscal)",
    );
  }

  if (!(await tableExists("product_stock"))) {
    await sql`
      create table product_stock (
        product_id integer primary key references omie_products(id) on delete cascade,
        quantidade_fisica numeric(14, 4) not null default 0 check (quantidade_fisica >= 0),
        estoque_minimo numeric(14, 4) not null default 0 check (estoque_minimo >= 0),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("product_stock_moves"))) {
    await sql`
      create table product_stock_moves (
        id serial primary key,
        product_id integer not null references omie_products(id) on delete cascade,
        tipo varchar(16) not null,
        quantidade numeric(14, 4) not null check (quantidade > 0),
        saldo_apos numeric(14, 4) not null check (saldo_apos >= 0),
        motivo text,
        observacao text,
        user_id integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }
  if (!(await indexExists("product_stock_moves_product_idx"))) {
    await sql.unsafe(
      "create index product_stock_moves_product_idx on product_stock_moves (product_id, created_at desc)",
    );
  }

  if (!(await tableExists("omie_suppliers"))) {
    await sql`
      create table omie_suppliers (
        id serial primary key,
        omie_app_id varchar(64) not null,
        omie_app_name varchar(160) not null,
        codigo_omie bigint not null,
        razao_social varchar(255) not null,
        nome_fantasia varchar(255),
        cnpj_cpf varchar(32),
        inactive boolean not null default false,
        synced_at timestamptz not null default now(),
        unique (omie_app_id, codigo_omie)
      )
    `;
  }
  if (!(await indexExists("omie_suppliers_nome_idx"))) {
    await sql.unsafe(
      "create index omie_suppliers_nome_idx on omie_suppliers (omie_app_id, razao_social)",
    );
  }

  if (!(await tableExists("product_supplier_codes"))) {
    await sql`
      create table product_supplier_codes (
        id serial primary key,
        product_id integer not null references omie_products(id) on delete cascade,
        supplier_id integer not null references omie_suppliers(id) on delete cascade,
        codigo_fornecedor varchar(120) not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (product_id, supplier_id),
        unique (product_id, codigo_fornecedor)
      )
    `;
  }
  if (!(await indexExists("product_supplier_codes_codigo_idx"))) {
    await sql.unsafe(
      "create index product_supplier_codes_codigo_idx on product_supplier_codes (codigo_fornecedor)",
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
  if (!(await columnExists("omie_clients", "endereco"))) {
    await sql.unsafe("alter table omie_clients add column endereco text");
  }
  if (!(await columnExists("omie_clients", "contato"))) {
    await sql.unsafe("alter table omie_clients add column contato varchar(160)");
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
  if (!(await columnExists("quotes", "contato"))) {
    await sql.unsafe("alter table quotes add column contato varchar(160)");
  }
  if (!(await columnExists("quotes", "client_address"))) {
    await sql.unsafe("alter table quotes add column client_address text");
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
  if (!(await columnExists("monthly_services", "descricao"))) {
    await sql.unsafe(
      "alter table monthly_services add column descricao text not null default ''",
    );
  }
  if (!(await columnExists("monthly_services", "show_in_orcamento"))) {
    await sql.unsafe(
      "alter table monthly_services add column show_in_orcamento boolean not null default true",
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
        horas numeric(10, 4) not null default 12,
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
  if (await tableExists("facilities_substitutions")) {
    await sql.unsafe(
      "alter table facilities_substitutions alter column horas type numeric(10, 4)",
    );
  }
  if (
    (await tableExists("facilities_substitutions")) &&
    !(await columnExists("facilities_substitutions", "paga_almoco"))
  ) {
    await sql.unsafe(
      "alter table facilities_substitutions add column paga_almoco boolean not null default false",
    );
  }
  if (
    (await tableExists("facilities_substitutions")) &&
    !(await columnExists("facilities_substitutions", "valor_almoco"))
  ) {
    await sql.unsafe(
      "alter table facilities_substitutions add column valor_almoco numeric(12, 2) not null default 0",
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

  // --- Frota (paridade Drivvo) ---
  if (!(await tableExists("fleet_vehicles"))) {
    await sql`
      create table fleet_vehicles (
        id serial primary key,
        name varchar(80) not null,
        brand varchar(80),
        model varchar(120),
        plate varchar(20),
        year integer,
        color varchar(40),
        fuel_capacity_liters numeric(10, 2),
        current_odometer numeric(12, 1) not null default 0,
        notes text,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("fleet_drivers"))) {
    await sql`
      create table fleet_drivers (
        id serial primary key,
        name varchar(160) not null,
        phone varchar(32),
        email varchar(160),
        cnh varchar(40),
        user_id integer references users(id) on delete set null,
        active boolean not null default true,
        created_at timestamptz not null default now()
      )
    `;
  }
  if (!(await columnExists("fleet_drivers", "user_id"))) {
    await sql`alter table fleet_drivers add column user_id integer references users(id) on delete set null`;
  }
  if (!(await indexExists("fleet_drivers_user_uidx"))) {
    await sql.unsafe(
      "create unique index fleet_drivers_user_uidx on fleet_drivers (user_id) where user_id is not null",
    );
  }

  if (!(await tableExists("fleet_catalog"))) {
    await sql`
      create table fleet_catalog (
        id serial primary key,
        kind varchar(32) not null,
        name varchar(160) not null,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        unique (kind, name)
      )
    `;
  }

  if (!(await tableExists("fleet_refuelings"))) {
    await sql`
      create table fleet_refuelings (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        driver_id integer references fleet_drivers(id) on delete set null,
        occurred_at timestamptz not null,
        odometer numeric(12, 1) not null,
        fuel_type varchar(80) not null,
        price_per_liter numeric(12, 4) not null default 0,
        total_amount numeric(12, 2) not null default 0,
        liters numeric(12, 3) not null default 0,
        full_tank boolean not null default false,
        station varchar(160),
        reason varchar(160),
        payment_method varchar(80),
        discount numeric(12, 2) not null default 0,
        previous_missing boolean not null default false,
        attachment_name varchar(200),
        attachment_data text,
        notes text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }
  if (!(await indexExists("fleet_refuelings_vehicle_idx"))) {
    await sql.unsafe(
      "create index fleet_refuelings_vehicle_idx on fleet_refuelings (vehicle_id, occurred_at desc)",
    );
  }

  if (!(await tableExists("fleet_expenses"))) {
    await sql`
      create table fleet_expenses (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        driver_id integer references fleet_drivers(id) on delete set null,
        occurred_at timestamptz not null,
        odometer numeric(12, 1),
        title varchar(160),
        expense_type varchar(120) not null,
        amount numeric(12, 2) not null default 0,
        discount numeric(12, 2) not null default 0,
        installments integer,
        location varchar(160),
        reason varchar(160),
        payment_method varchar(80),
        attachment_name varchar(200),
        attachment_data text,
        notes text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }
  if (!(await indexExists("fleet_expenses_vehicle_idx"))) {
    await sql.unsafe(
      "create index fleet_expenses_vehicle_idx on fleet_expenses (vehicle_id, occurred_at desc)",
    );
  }

  if (!(await tableExists("fleet_incomes"))) {
    await sql`
      create table fleet_incomes (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        driver_id integer references fleet_drivers(id) on delete set null,
        occurred_at timestamptz not null,
        odometer numeric(12, 1),
        title varchar(160),
        income_type varchar(120) not null default 'Receita',
        amount numeric(12, 2) not null default 0,
        location varchar(160),
        payment_method varchar(80),
        notes text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("fleet_services"))) {
    await sql`
      create table fleet_services (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        driver_id integer references fleet_drivers(id) on delete set null,
        occurred_at timestamptz not null,
        odometer numeric(12, 1),
        title varchar(160),
        service_type varchar(120) not null,
        amount numeric(12, 2) not null default 0,
        discount numeric(12, 2) not null default 0,
        installments integer,
        location varchar(160),
        payment_method varchar(80),
        attachment_name varchar(200),
        attachment_data text,
        notes text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("fleet_routes"))) {
    await sql`
      create table fleet_routes (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        driver_id integer references fleet_drivers(id) on delete set null,
        occurred_at timestamptz not null,
        odometer_start numeric(12, 1),
        odometer_end numeric(12, 1),
        distance_km numeric(12, 1),
        origin varchar(200),
        destination varchar(200),
        purpose varchar(160),
        freight_amount numeric(12, 2) not null default 0,
        notes text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("fleet_readings"))) {
    await sql`
      create table fleet_readings (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        driver_id integer references fleet_drivers(id) on delete set null,
        occurred_at timestamptz not null,
        odometer numeric(12, 1) not null,
        kind varchar(40) not null default 'daily_km',
        notes text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }
  if (!(await indexExists("fleet_readings_vehicle_idx"))) {
    await sql.unsafe(
      "create index fleet_readings_vehicle_idx on fleet_readings (vehicle_id, occurred_at desc)",
    );
  }
  if ((await tableExists("fleet_readings")) && !(await columnExists("fleet_readings", "previous_odometer"))) {
    await sql.unsafe("alter table fleet_readings add column previous_odometer numeric(12, 1)");
  }
  if ((await tableExists("fleet_readings")) && !(await columnExists("fleet_readings", "reason"))) {
    await sql.unsafe("alter table fleet_readings add column reason varchar(200)");
  }

  if (!(await tableExists("fleet_reminders"))) {
    await sql`
      create table fleet_reminders (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        title varchar(160) not null,
        trigger_kind varchar(16) not null default 'both',
        due_date date,
        due_odometer numeric(12, 1),
        last_done_at date,
        last_done_odometer numeric(12, 1),
        interval_days integer,
        interval_km integer,
        active boolean not null default true,
        notes text,
        created_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("fleet_checklists"))) {
    await sql`
      create table fleet_checklists (
        id serial primary key,
        vehicle_id integer not null references fleet_vehicles(id) on delete cascade,
        driver_id integer references fleet_drivers(id) on delete set null,
        occurred_at timestamptz not null,
        odometer numeric(12, 1),
        title varchar(160) not null default 'Checklist',
        items_json text not null default '[]',
        notes text,
        created_by integer references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("terceiros"))) {
    await sql`
      create table terceiros (
        id serial primary key,
        nome varchar(200) not null,
        documento varchar(32),
        contato varchar(200),
        observacao text not null default '',
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("terceiro_monitoramento"))) {
    await sql`
      create table terceiro_monitoramento (
        terceiro_id integer primary key references terceiros(id) on delete cascade,
        qtd_contas integer not null default 0,
        preco_unitario numeric(15, 4) not null default 0,
        observacao text not null default '',
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("terceiro_contas_excecao"))) {
    await sql`
      create table terceiro_contas_excecao (
        id serial primary key,
        terceiro_id integer not null references terceiros(id) on delete cascade,
        identificador varchar(200) not null,
        valor numeric(15, 4) not null default 0,
        observacao text not null default '',
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await tableExists("terceiro_servicos"))) {
    await sql`
      create table terceiro_servicos (
        id serial primary key,
        terceiro_id integer not null references terceiros(id) on delete cascade,
        nome varchar(200) not null,
        quantidade numeric(15, 4) not null default 1,
        valor numeric(15, 4) not null default 0,
        observacao text not null default '',
        active boolean not null default true,
        pending_review boolean not null default false,
        last_change_at timestamptz,
        last_change_by integer references users(id) on delete set null,
        last_change_by_name varchar(120),
        last_change_summary varchar(200),
        reviewed_at timestamptz,
        reviewed_by integer references users(id) on delete set null,
        reviewed_by_name varchar(120),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "pending_review"))) {
    await sql.unsafe(
      "alter table terceiro_servicos add column pending_review boolean not null default false",
    );
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "last_change_at"))) {
    await sql.unsafe("alter table terceiro_servicos add column last_change_at timestamptz");
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "last_change_by"))) {
    await sql.unsafe(
      "alter table terceiro_servicos add column last_change_by integer references users(id) on delete set null",
    );
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "last_change_by_name"))) {
    await sql.unsafe("alter table terceiro_servicos add column last_change_by_name varchar(120)");
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "last_change_summary"))) {
    await sql.unsafe("alter table terceiro_servicos add column last_change_summary varchar(200)");
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "reviewed_at"))) {
    await sql.unsafe("alter table terceiro_servicos add column reviewed_at timestamptz");
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "reviewed_by"))) {
    await sql.unsafe(
      "alter table terceiro_servicos add column reviewed_by integer references users(id) on delete set null",
    );
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "reviewed_by_name"))) {
    await sql.unsafe("alter table terceiro_servicos add column reviewed_by_name varchar(120)");
  }
  if ((await tableExists("terceiro_servicos")) && !(await columnExists("terceiro_servicos", "monthly_service_id"))) {
    await sql.unsafe(
      "alter table terceiro_servicos add column monthly_service_id integer references monthly_services(id) on delete set null",
    );
  }

  if (!(await tableExists("terceiro_contas_proporcionais"))) {
    await sql`
      create table terceiro_contas_proporcionais (
        id serial primary key,
        terceiro_id integer not null references terceiros(id) on delete cascade,
        identificador varchar(200) not null,
        valor_base_tipo varchar(32) not null,
        valor_mensal numeric(15, 4) not null default 0,
        data_inicio date not null,
        data_fim date not null,
        dias integer not null default 0,
        valor_proporcional numeric(15, 4) not null default 0,
        observacao text not null default '',
        status varchar(32) not null default 'aberta',
        lancada_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
  }

  if (!(await columnExists("terceiros", "omie_client_code"))) {
    await sql.unsafe("alter table terceiros add column omie_client_code bigint");
  } else {
    // Códigos Omie passam de 2^31-1; integer estoura (ex.: 4734509501).
    const typeRows = await sql<{ data_type: string }[]>`
      select data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'terceiros'
        and column_name = 'omie_client_code'
      limit 1
    `;
    if (typeRows[0]?.data_type === "integer") {
      await sql.unsafe(
        "alter table terceiros alter column omie_client_code type bigint using omie_client_code::bigint",
      );
    }
  }
  if (!(await columnExists("terceiros", "omie_app_id"))) {
    await sql.unsafe("alter table terceiros add column omie_app_id varchar(64)");
  }
  if (!(await columnExists("terceiros", "pending_review"))) {
    await sql.unsafe(
      "alter table terceiros add column pending_review boolean not null default false",
    );
  }
  if (!(await columnExists("terceiros", "last_change_at"))) {
    await sql.unsafe("alter table terceiros add column last_change_at timestamptz");
  }
  if (!(await columnExists("terceiros", "last_change_by"))) {
    await sql.unsafe(
      "alter table terceiros add column last_change_by integer references users(id) on delete set null",
    );
  }
  if (!(await columnExists("terceiros", "last_change_by_name"))) {
    await sql.unsafe("alter table terceiros add column last_change_by_name varchar(120)");
  }
  if (!(await columnExists("terceiros", "last_change_summary"))) {
    await sql.unsafe("alter table terceiros add column last_change_summary varchar(200)");
  }
  if (!(await columnExists("terceiros", "reviewed_at"))) {
    await sql.unsafe("alter table terceiros add column reviewed_at timestamptz");
  }
  if (!(await columnExists("terceiros", "reviewed_by"))) {
    await sql.unsafe(
      "alter table terceiros add column reviewed_by integer references users(id) on delete set null",
    );
  }
  if (!(await columnExists("terceiros", "reviewed_by_name"))) {
    await sql.unsafe("alter table terceiros add column reviewed_by_name varchar(120)");
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
