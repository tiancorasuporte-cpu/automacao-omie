import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import {
  DEFAULT_PRODUCT_MARKUP,
  effectiveCmc,
  suggestedPriceFromCmc,
} from "@/lib/product-pricing";

export type OmieProduct = {
  id: number;
  omieAppId: string;
  omieAppName: string;
  codigoProduto: number;
  codigoInterno: string | null;
  descricao: string;
  unidade: string | null;
  valorUnitario: number | null;
  /** CMC vindo da Omie (estoque). */
  cmc: number | null;
  /** CMC interno cadastrado por nós. */
  cmcInterno: number | null;
  /** Maior entre CMC Omie e CMC interno. */
  cmcEfetivo: number | null;
  markup: number;
  precoSugerido: number | null;
  ncm: string | null;
  inactive: boolean;
  syncedAt: string;
};

type ProductRow = {
  id: number;
  omie_app_id: string;
  omie_app_name: string;
  codigo_produto: string | number;
  codigo_interno: string | null;
  descricao: string;
  unidade: string | null;
  valor_unitario: string | number | null;
  cmc: string | number | null;
  cmc_interno: string | number | null;
  markup: string | number | null;
  ncm: string | null;
  inactive: boolean;
  synced_at: string | Date;
};

function toNumber(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toProduct(row: ProductRow): OmieProduct {
  const cmc = toNumber(row.cmc);
  const cmcInterno = toNumber(row.cmc_interno);
  const cmcEfetivo = effectiveCmc(cmc, cmcInterno);
  const markup = toNumber(row.markup) ?? DEFAULT_PRODUCT_MARKUP;
  return {
    id: row.id,
    omieAppId: row.omie_app_id,
    omieAppName: row.omie_app_name,
    codigoProduto: Number(row.codigo_produto),
    codigoInterno: row.codigo_interno,
    descricao: row.descricao,
    unidade: row.unidade,
    valorUnitario: toNumber(row.valor_unitario),
    cmc,
    cmcInterno,
    cmcEfetivo,
    markup,
    precoSugerido: suggestedPriceFromCmc(cmcEfetivo, markup),
    ncm: row.ncm,
    inactive: row.inactive,
    syncedAt: row.synced_at instanceof Date ? row.synced_at.toISOString() : String(row.synced_at),
  };
}

export async function upsertOmieProduct(input: {
  omieAppId: string;
  omieAppName: string;
  codigoProduto: number;
  codigoInterno: string | null;
  descricao: string;
  unidade: string | null;
  valorUnitario: number | null;
  cmc?: number | null;
  ncm: string | null;
  inactive: boolean;
}) {
  const db = await getDb();
  const cmc = input.cmc ?? null;
  await db`
    insert into omie_products (
      omie_app_id, omie_app_name, codigo_produto, codigo_interno, descricao,
      unidade, valor_unitario, cmc, markup, ncm, inactive, synced_at
    ) values (
      ${input.omieAppId}, ${input.omieAppName}, ${input.codigoProduto}, ${input.codigoInterno},
      ${input.descricao}, ${input.unidade}, ${input.valorUnitario}, ${cmc},
      ${DEFAULT_PRODUCT_MARKUP}, ${input.ncm}, ${input.inactive}, now()
    )
    on conflict (omie_app_id, codigo_produto) do update set
      omie_app_name = excluded.omie_app_name,
      codigo_interno = excluded.codigo_interno,
      descricao = excluded.descricao,
      unidade = excluded.unidade,
      valor_unitario = excluded.valor_unitario,
      cmc = coalesce(excluded.cmc, omie_products.cmc),
      ncm = excluded.ncm,
      inactive = excluded.inactive,
      synced_at = now()
  `;
}

export async function updateOmieProductCmc(
  omieAppId: string,
  codigoProduto: number,
  cmc: number | null,
) {
  if (cmc == null || !Number.isFinite(cmc)) return;
  const db = await getDb();
  await db`
    update omie_products
    set cmc = ${cmc}, synced_at = now()
    where omie_app_id = ${omieAppId} and codigo_produto = ${codigoProduto}
  `;
}

export async function updateLocalProduct(input: {
  id: number;
  cmcInterno: number | null;
  markup: number;
  valorUnitario: number | null;
}) {
  const db = await getDb();
  const markup =
    Number.isFinite(input.markup) && input.markup > 0 ? input.markup : DEFAULT_PRODUCT_MARKUP;
  const rows = (await db`
    update omie_products
    set
      cmc_interno = ${input.cmcInterno},
      markup = ${markup},
      valor_unitario = ${input.valorUnitario},
      synced_at = synced_at
    where id = ${input.id}
    returning *
  `) as ProductRow[];
  const row = rows[0];
  if (!row) throw new Error("Produto não encontrado.");
  return toProduct(row);
}

export async function getOmieProductById(id: number) {
  const db = await getDb();
  const rows = (await db`select * from omie_products where id = ${id} limit 1`) as ProductRow[];
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function listOmieProducts(input?: {
  omieAppId?: string;
  query?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  const limit = Math.min(Math.max(input?.limit ?? 80, 1), 500);
  const offset = Math.max(input?.offset ?? 0, 0);
  const q = input?.query?.trim() ?? "";
  const appId = input?.omieAppId?.trim() || null;
  const activeOnly = input?.activeOnly !== false;

  const rows = await db<ProductRow[]>`
    select *
    from omie_products
    where (${appId}::text is null or omie_app_id = ${appId})
      and (${activeOnly} = false or inactive = false)
      and (
        ${q} = ''
        or descricao ilike ${"%" + q + "%"}
        or coalesce(codigo_interno, '') ilike ${"%" + q + "%"}
        or cast(codigo_produto as text) ilike ${"%" + q + "%"}
      )
    order by descricao asc
    limit ${limit}
    offset ${offset}
  `;
  return rows.map(toProduct);
}

export async function countOmieProducts(omieAppId?: string, query?: string) {
  const db = await getDb();
  const appId = omieAppId?.trim() || null;
  const q = query?.trim() ?? "";
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count
    from omie_products
    where (${appId}::text is null or omie_app_id = ${appId})
      and inactive = false
      and (
        ${q} = ''
        or descricao ilike ${"%" + q + "%"}
        or coalesce(codigo_interno, '') ilike ${"%" + q + "%"}
        or cast(codigo_produto as text) ilike ${"%" + q + "%"}
      )
  `;
  return rows[0]?.count ?? 0;
}
