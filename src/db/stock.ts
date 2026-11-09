import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;

export type StockMoveTipo = "entrada" | "saida" | "ajuste";

export type ProductStockRow = {
  productId: number;
  omieAppId: string;
  omieAppName: string;
  codigoProduto: number;
  codigoInterno: string | null;
  descricao: string;
  unidade: string | null;
  inactive: boolean;
  estoqueFiscal: number;
  estoqueFiscalSyncedAt: string | null;
  quantidadeFisica: number;
  estoqueMinimo: number;
  diferenca: number;
  stockUpdatedAt: string | null;
  hasMoves: boolean;
};

export type ProductStockMove = {
  id: number;
  productId: number;
  tipo: StockMoveTipo;
  quantidade: number;
  saldoApos: number;
  motivo: string | null;
  observacao: string | null;
  userId: number | null;
  userName: string | null;
  createdAt: string;
};

type ListRow = {
  product_id: number;
  omie_app_id: string;
  omie_app_name: string;
  codigo_produto: string | number;
  codigo_interno: string | null;
  descricao: string;
  unidade: string | null;
  inactive: boolean;
  estoque_fiscal: string | number | null;
  estoque_fiscal_synced_at: string | Date | null;
  quantidade_fisica: string | number | null;
  estoque_minimo: string | number | null;
  stock_updated_at: string | Date | null;
  has_moves: boolean;
};

type MoveRow = {
  id: number;
  product_id: number;
  tipo: string;
  quantidade: string | number;
  saldo_apos: string | number;
  motivo: string | null;
  observacao: string | null;
  user_id: number | null;
  user_name: string | null;
  created_at: string | Date;
};

function toNumber(value: string | number | null | undefined, fallback = 0) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toIso(value: string | Date | null | undefined) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapStockRow(row: ListRow): ProductStockRow {
  const estoqueFiscal = toNumber(row.estoque_fiscal);
  const quantidadeFisica = toNumber(row.quantidade_fisica);
  return {
    productId: row.product_id,
    omieAppId: row.omie_app_id,
    omieAppName: row.omie_app_name,
    codigoProduto: Number(row.codigo_produto),
    codigoInterno: row.codigo_interno,
    descricao: row.descricao,
    unidade: row.unidade,
    inactive: Boolean(row.inactive),
    estoqueFiscal,
    estoqueFiscalSyncedAt: toIso(row.estoque_fiscal_synced_at),
    quantidadeFisica,
    estoqueMinimo: toNumber(row.estoque_minimo),
    diferenca: quantidadeFisica - estoqueFiscal,
    stockUpdatedAt: toIso(row.stock_updated_at),
    hasMoves: Boolean(row.has_moves),
  };
}

function mapMove(row: MoveRow): ProductStockMove {
  return {
    id: row.id,
    productId: row.product_id,
    tipo: row.tipo as StockMoveTipo,
    quantidade: toNumber(row.quantidade),
    saldoApos: toNumber(row.saldo_apos),
    motivo: row.motivo,
    observacao: row.observacao,
    userId: row.user_id,
    userName: row.user_name,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

async function transaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return (await db.begin((tx) => fn(tx as unknown as Db))) as T;
}

export async function listProductStock(input?: {
  omieAppId?: string;
  query?: string;
  onlyDivergent?: boolean;
  onlyBelowMin?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  const omieAppId = input?.omieAppId?.trim() || null;
  const query = input?.query?.trim() || null;
  const like = query ? `%${query}%` : null;
  const onlyDivergent = Boolean(input?.onlyDivergent);
  const onlyBelowMin = Boolean(input?.onlyBelowMin);
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
  const offset = Math.max(input?.offset ?? 0, 0);

  const rows = await db<ListRow[]>`
    select
      p.id as product_id,
      p.omie_app_id,
      p.omie_app_name,
      p.codigo_produto,
      p.codigo_interno,
      p.descricao,
      p.unidade,
      p.inactive,
      coalesce(p.estoque_fiscal, 0) as estoque_fiscal,
      p.estoque_fiscal_synced_at,
      coalesce(s.quantidade_fisica, 0) as quantidade_fisica,
      coalesce(s.estoque_minimo, 0) as estoque_minimo,
      s.updated_at as stock_updated_at,
      exists (
        select 1 from product_stock_moves m where m.product_id = p.id
      ) as has_moves
    from omie_products p
    left join product_stock s on s.product_id = p.id
    where p.inactive = false
      and (
        coalesce(p.estoque_fiscal, 0) > 0
        or coalesce(s.quantidade_fisica, 0) > 0
        or exists (select 1 from product_stock_moves m where m.product_id = p.id)
      )
      and (${omieAppId}::text is null or p.omie_app_id = ${omieAppId})
      and (
        ${like}::text is null
        or p.descricao ilike ${like}
        or coalesce(p.codigo_interno, '') ilike ${like}
        or cast(p.codigo_produto as text) ilike ${like}
      )
      and (
        ${onlyDivergent} = false
        or coalesce(s.quantidade_fisica, 0) <> coalesce(p.estoque_fiscal, 0)
      )
      and (
        ${onlyBelowMin} = false
        or (
          coalesce(s.estoque_minimo, 0) > 0
          and coalesce(s.quantidade_fisica, 0) <= coalesce(s.estoque_minimo, 0)
        )
      )
    order by p.descricao asc, p.codigo_produto asc
    limit ${limit}
    offset ${offset}
  `;

  return rows.map(mapStockRow);
}

export async function countProductStock(input?: {
  omieAppId?: string;
  query?: string;
  onlyDivergent?: boolean;
  onlyBelowMin?: boolean;
}) {
  const db = await getDb();
  const omieAppId = input?.omieAppId?.trim() || null;
  const query = input?.query?.trim() || null;
  const like = query ? `%${query}%` : null;
  const onlyDivergent = Boolean(input?.onlyDivergent);
  const onlyBelowMin = Boolean(input?.onlyBelowMin);

  const rows = await db<{ count: string | number }[]>`
    select count(*)::int as count
    from omie_products p
    left join product_stock s on s.product_id = p.id
    where p.inactive = false
      and (
        coalesce(p.estoque_fiscal, 0) > 0
        or coalesce(s.quantidade_fisica, 0) > 0
        or exists (select 1 from product_stock_moves m where m.product_id = p.id)
      )
      and (${omieAppId}::text is null or p.omie_app_id = ${omieAppId})
      and (
        ${like}::text is null
        or p.descricao ilike ${like}
        or coalesce(p.codigo_interno, '') ilike ${like}
        or cast(p.codigo_produto as text) ilike ${like}
      )
      and (
        ${onlyDivergent} = false
        or coalesce(s.quantidade_fisica, 0) <> coalesce(p.estoque_fiscal, 0)
      )
      and (
        ${onlyBelowMin} = false
        or (
          coalesce(s.estoque_minimo, 0) > 0
          and coalesce(s.quantidade_fisica, 0) <= coalesce(s.estoque_minimo, 0)
        )
      )
  `;
  return toNumber(rows[0]?.count);
}

async function lockProductStock(tx: Db, productId: number) {
  const productRows = await tx<{ id: number }[]>`
    select id from omie_products where id = ${productId} for update
  `;
  if (!productRows[0]) throw new Error("Produto não encontrado.");

  await tx`
    insert into product_stock (product_id, quantidade_fisica, estoque_minimo, updated_at)
    values (${productId}, 0, 0, now())
    on conflict (product_id) do nothing
  `;

  const stockRows = await tx<
    { product_id: number; quantidade_fisica: string | number; estoque_minimo: string | number }[]
  >`
    select product_id, quantidade_fisica, estoque_minimo
    from product_stock
    where product_id = ${productId}
    for update
  `;
  const row = stockRows[0];
  if (!row) throw new Error("Falha ao preparar estoque físico.");
  return {
    productId: row.product_id,
    quantidadeFisica: toNumber(row.quantidade_fisica),
    estoqueMinimo: toNumber(row.estoque_minimo),
  };
}

export async function moveProductStock(input: {
  productId: number;
  tipo: StockMoveTipo;
  quantidade: number;
  motivo?: string | null;
  observacao?: string | null;
  userId: number;
}) {
  const qty = Number(input.quantidade);
  if (!Number.isFinite(qty)) {
    throw new Error("Quantidade inválida.");
  }
  if (input.tipo !== "ajuste" && qty <= 0) {
    throw new Error("Informe uma quantidade maior que zero.");
  }
  if (input.tipo === "ajuste" && qty < 0) {
    throw new Error("A nova quantidade não pode ser negativa.");
  }
  const motivo = input.motivo?.trim() || null;
  const observacao = input.observacao?.trim() || null;
  if ((input.tipo === "saida" || input.tipo === "ajuste") && !motivo) {
    throw new Error("Informe o motivo da movimentação.");
  }

  const db = await getDb();
  return transaction(db, async (tx) => {
    const stock = await lockProductStock(tx, input.productId);
    let saldoApos = stock.quantidadeFisica;
    let moveQty = qty;

    if (input.tipo === "entrada") {
      saldoApos = stock.quantidadeFisica + qty;
    } else if (input.tipo === "saida") {
      if (qty > stock.quantidadeFisica) {
        throw new Error("Saldo físico insuficiente para a saída.");
      }
      saldoApos = stock.quantidadeFisica - qty;
    } else {
      // ajuste: quantidade de entrada = nova quantidade absoluta; no movimento grava |delta|
      saldoApos = qty;
      const delta = Math.abs(saldoApos - stock.quantidadeFisica);
      if (delta === 0) {
        return { saldo: saldoApos };
      }
      moveQty = delta;
    }

    await tx`
      update product_stock
      set quantidade_fisica = ${saldoApos}, updated_at = now()
      where product_id = ${input.productId}
    `;
    await tx`
      insert into product_stock_moves (
        product_id, tipo, quantidade, saldo_apos, motivo, observacao, user_id
      ) values (
        ${input.productId}, ${input.tipo}, ${moveQty}, ${saldoApos},
        ${motivo}, ${observacao}, ${input.userId}
      )
    `;
    return { saldo: saldoApos };
  });
}

export async function updateProductStockMinimo(productId: number, estoqueMinimo: number) {
  const minimo = Number(estoqueMinimo);
  if (!Number.isFinite(minimo) || minimo < 0) {
    throw new Error("Estoque mínimo inválido.");
  }
  const db = await getDb();
  return transaction(db, async (tx) => {
    await lockProductStock(tx, productId);
    await tx`
      update product_stock
      set estoque_minimo = ${minimo}, updated_at = now()
      where product_id = ${productId}
    `;
    return { estoqueMinimo: minimo };
  });
}

export async function listProductStockMoves(productId: number, limit = 100) {
  const db = await getDb();
  const rows = await db<MoveRow[]>`
    select
      m.id,
      m.product_id,
      m.tipo,
      m.quantidade,
      m.saldo_apos,
      m.motivo,
      m.observacao,
      m.user_id,
      coalesce(nullif(trim(u.name), ''), u.username) as user_name,
      m.created_at
    from product_stock_moves m
    left join users u on u.id = m.user_id
    where m.product_id = ${productId}
    order by m.created_at desc, m.id desc
    limit ${Math.min(Math.max(limit, 1), 500)}
  `;
  return rows.map(mapMove);
}
