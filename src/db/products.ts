import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type OmieProduct = {
  id: number;
  omieAppId: string;
  omieAppName: string;
  codigoProduto: number;
  codigoInterno: string | null;
  descricao: string;
  unidade: string | null;
  valorUnitario: number | null;
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
  ncm: string | null;
  inactive: boolean;
  synced_at: string | Date;
};

function toProduct(row: ProductRow): OmieProduct {
  return {
    id: row.id,
    omieAppId: row.omie_app_id,
    omieAppName: row.omie_app_name,
    codigoProduto: Number(row.codigo_produto),
    codigoInterno: row.codigo_interno,
    descricao: row.descricao,
    unidade: row.unidade,
    valorUnitario: row.valor_unitario == null ? null : Number(row.valor_unitario),
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
  ncm: string | null;
  inactive: boolean;
}) {
  const db = await getDb();
  await db`
    insert into omie_products (
      omie_app_id, omie_app_name, codigo_produto, codigo_interno, descricao,
      unidade, valor_unitario, ncm, inactive, synced_at
    ) values (
      ${input.omieAppId}, ${input.omieAppName}, ${input.codigoProduto}, ${input.codigoInterno},
      ${input.descricao}, ${input.unidade}, ${input.valorUnitario}, ${input.ncm},
      ${input.inactive}, now()
    )
    on conflict (omie_app_id, codigo_produto) do update set
      omie_app_name = excluded.omie_app_name,
      codigo_interno = excluded.codigo_interno,
      descricao = excluded.descricao,
      unidade = excluded.unidade,
      valor_unitario = excluded.valor_unitario,
      ncm = excluded.ncm,
      inactive = excluded.inactive,
      synced_at = now()
  `;
}

export async function listOmieProducts(input?: {
  omieAppId?: string;
  query?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  const db = await getDb();
  const limit = Math.min(Math.max(input?.limit ?? 80, 1), 200);
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
  `;
  return rows.map(toProduct);
}

export async function countOmieProducts(omieAppId?: string) {
  const db = await getDb();
  const appId = omieAppId?.trim() || null;
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count
    from omie_products
    where (${appId}::text is null or omie_app_id = ${appId})
      and inactive = false
  `;
  return rows[0]?.count ?? 0;
}
