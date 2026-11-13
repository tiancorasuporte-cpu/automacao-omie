import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import {
  DEFAULT_PRODUCT_MARKUP,
  effectiveCmc,
  suggestedPriceFromCmc,
} from "@/lib/product-pricing";

export type OmieProductSupplierLink = {
  supplierId: number;
  supplierName: string;
  codigoFornecedor: string;
};

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
  /** Saldo físico local (módulo Estoque / product_stock). */
  quantidadeFisica: number;
  /** Vínculos com códigos de fornecedor (quando carregados). */
  supplierCodes?: OmieProductSupplierLink[];
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
    quantidadeFisica: 0,
  };
}

async function attachPhysicalStock(products: OmieProduct[]) {
  if (!products.length) return products;
  try {
    const db = await getDb();
    const ids = products.map((p) => p.id);
    const rows = await db<{ product_id: number; quantidade_fisica: string | number | null }[]>`
      select product_id, quantidade_fisica
      from product_stock
      where product_id in ${db(ids)}
    `;
    const byId = new Map(
      rows.map((r) => {
        const qty = Number(r.quantidade_fisica);
        return [Number(r.product_id), Number.isFinite(qty) ? qty : 0] as const;
      }),
    );
    for (const product of products) {
      product.quantidadeFisica = byId.get(product.id) ?? 0;
    }
  } catch {
    // product_stock pode não existir em ambientes antigos
  }
  return products;
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

export async function updateOmieProductFiscalStock(
  omieAppId: string,
  codigoProduto: number,
  estoqueFiscal: number,
  cmc: number | null,
) {
  const saldo = Number.isFinite(estoqueFiscal) ? Math.max(0, estoqueFiscal) : 0;
  const db = await getDb();
  if (cmc != null && Number.isFinite(cmc) && cmc >= 0) {
    await db`
      update omie_products
      set
        estoque_fiscal = ${saldo},
        estoque_fiscal_synced_at = now(),
        cmc = ${cmc},
        synced_at = now()
      where omie_app_id = ${omieAppId} and codigo_produto = ${codigoProduto}
    `;
    return;
  }
  await db`
    update omie_products
    set
      estoque_fiscal = ${saldo},
      estoque_fiscal_synced_at = now()
    where omie_app_id = ${omieAppId} and codigo_produto = ${codigoProduto}
  `;
}

export async function resetOmieProductFiscalStockAbsent(
  omieAppId: string,
  presentCodigoProdutos: number[],
) {
  const db = await getDb();
  const unique = [
    ...new Set(presentCodigoProdutos.filter((code) => Number.isFinite(code) && code > 0)),
  ];
  if (!unique.length) {
    await db`
      update omie_products
      set estoque_fiscal = 0, estoque_fiscal_synced_at = now()
      where omie_app_id = ${omieAppId} and estoque_fiscal <> 0
    `;
    return;
  }
  await db`
    update omie_products
    set estoque_fiscal = 0, estoque_fiscal_synced_at = now()
    where omie_app_id = ${omieAppId}
      and estoque_fiscal <> 0
      and codigo_produto not in ${db(unique)}
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

export async function getOmieProductsByCodes(omieAppId: string, codes: number[]) {
  const db = await getDb();
  const unique = [...new Set(codes.filter((code) => Number.isFinite(code) && code > 0))];
  if (!unique.length) return [] as OmieProduct[];
  const rows = await db<ProductRow[]>`
    select *
    from omie_products
    where omie_app_id = ${omieAppId}
      and codigo_produto in ${db(unique)}
  `;
  return rows.map(toProduct);
}

const productSearchFilter = (q: string) => {
  const like = `%${q}%`;
  return { like };
};

export async function listOmieProducts(input?: {
  omieAppId?: string;
  query?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
  includeSupplierCodes?: boolean;
}) {
  const db = await getDb();
  const limit = Math.min(Math.max(input?.limit ?? 80, 1), 500);
  const offset = Math.max(input?.offset ?? 0, 0);
  const q = input?.query?.trim() ?? "";
  const appId = input?.omieAppId?.trim() || null;
  const activeOnly = input?.activeOnly !== false;
  const includeSupplierCodes = input?.includeSupplierCodes !== false;
  const { like } = productSearchFilter(q);

  const rows = await db<ProductRow[]>`
    select p.*
    from omie_products p
    where (${appId}::text is null or p.omie_app_id = ${appId})
      and (${activeOnly} = false or p.inactive = false)
      and (
        ${q} = ''
        or p.descricao ilike ${like}
        or coalesce(p.codigo_interno, '') ilike ${like}
        or cast(p.codigo_produto as text) ilike ${like}
        or exists (
          select 1
          from product_supplier_codes psc
          join omie_suppliers s on s.id = psc.supplier_id
          where psc.product_id = p.id
            and (
              psc.codigo_fornecedor ilike ${like}
              or s.razao_social ilike ${like}
              or coalesce(s.nome_fantasia, '') ilike ${like}
            )
        )
      )
    order by p.descricao asc
    limit ${limit}
    offset ${offset}
  `;
  const products = await attachPhysicalStock(rows.map(toProduct));
  if (!includeSupplierCodes || !products.length) return products;

  const { listProductSupplierCodesForProducts } = await import("@/db/suppliers");
  const links = await listProductSupplierCodesForProducts(products.map((p) => p.id));
  const byProduct = new Map<number, OmieProductSupplierLink[]>();
  for (const link of links) {
    const list = byProduct.get(link.productId) ?? [];
    list.push({
      supplierId: link.supplierId,
      supplierName: link.supplierName,
      codigoFornecedor: link.codigoFornecedor,
    });
    byProduct.set(link.productId, list);
  }
  return products.map((product) => ({
    ...product,
    supplierCodes: byProduct.get(product.id) ?? [],
  }));
}

export async function countOmieProducts(omieAppId?: string, query?: string) {
  const db = await getDb();
  const appId = omieAppId?.trim() || null;
  const q = query?.trim() ?? "";
  const { like } = productSearchFilter(q);
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count
    from omie_products p
    where (${appId}::text is null or p.omie_app_id = ${appId})
      and p.inactive = false
      and (
        ${q} = ''
        or p.descricao ilike ${like}
        or coalesce(p.codigo_interno, '') ilike ${like}
        or cast(p.codigo_produto as text) ilike ${like}
        or exists (
          select 1
          from product_supplier_codes psc
          join omie_suppliers s on s.id = psc.supplier_id
          where psc.product_id = p.id
            and (
              psc.codigo_fornecedor ilike ${like}
              or s.razao_social ilike ${like}
              or coalesce(s.nome_fantasia, '') ilike ${like}
            )
        )
      )
  `;
  return rows[0]?.count ?? 0;
}
