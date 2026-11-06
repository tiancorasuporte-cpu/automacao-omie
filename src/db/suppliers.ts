import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type OmieSupplier = {
  id: number;
  omieAppId: string;
  omieAppName: string;
  codigoOmie: number;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpjCpf: string | null;
  inactive: boolean;
  syncedAt: string;
};

export type ProductSupplierCode = {
  id: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  supplierCodigoOmie: number;
  codigoFornecedor: string;
};

type SupplierRow = {
  id: number;
  omie_app_id: string;
  omie_app_name: string;
  codigo_omie: string | number;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  inactive: boolean;
  synced_at: string | Date;
};

type ProductSupplierCodeRow = {
  id: number;
  product_id: number;
  supplier_id: number;
  codigo_fornecedor: string;
  supplier_name: string;
  supplier_codigo_omie: string | number;
};

function toSupplier(row: SupplierRow): OmieSupplier {
  return {
    id: row.id,
    omieAppId: row.omie_app_id,
    omieAppName: row.omie_app_name,
    codigoOmie: Number(row.codigo_omie),
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    cnpjCpf: row.cnpj_cpf,
    inactive: Boolean(row.inactive),
    syncedAt: row.synced_at instanceof Date ? row.synced_at.toISOString() : String(row.synced_at),
  };
}

function supplierDisplayName(razao: string, fantasia: string | null) {
  const f = fantasia?.trim() || "";
  return f || razao;
}

function toProductSupplierCode(row: ProductSupplierCodeRow): ProductSupplierCode {
  return {
    id: row.id,
    productId: Number(row.product_id),
    supplierId: Number(row.supplier_id),
    supplierName: row.supplier_name,
    supplierCodigoOmie: Number(row.supplier_codigo_omie),
    codigoFornecedor: row.codigo_fornecedor,
  };
}

export async function upsertOmieSupplier(input: {
  omieAppId: string;
  omieAppName: string;
  codigoOmie: number;
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnpjCpf?: string | null;
  inactive?: boolean;
}) {
  const db = await getDb();
  const razao = input.razaoSocial.trim().slice(0, 255);
  if (!razao || !input.codigoOmie) return;
  await db`
    insert into omie_suppliers (
      omie_app_id, omie_app_name, codigo_omie, razao_social, nome_fantasia, cnpj_cpf, inactive, synced_at
    ) values (
      ${input.omieAppId}, ${input.omieAppName}, ${input.codigoOmie}, ${razao},
      ${input.nomeFantasia?.trim().slice(0, 255) || null},
      ${input.cnpjCpf?.trim().slice(0, 32) || null},
      ${Boolean(input.inactive)}, now()
    )
    on conflict (omie_app_id, codigo_omie) do update set
      omie_app_name = excluded.omie_app_name,
      razao_social = excluded.razao_social,
      nome_fantasia = excluded.nome_fantasia,
      cnpj_cpf = excluded.cnpj_cpf,
      inactive = excluded.inactive,
      synced_at = now()
  `;
}

export async function listOmieSuppliers(input?: {
  omieAppId?: string;
  query?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  const db = await getDb();
  const appId = input?.omieAppId?.trim() || null;
  const q = input?.query?.trim() ?? "";
  const activeOnly = input?.activeOnly !== false;
  const limit = Math.min(Math.max(input?.limit ?? 200, 1), 1000);
  const rows = await db<SupplierRow[]>`
    select *
    from omie_suppliers
    where (${appId}::text is null or omie_app_id = ${appId})
      and (${activeOnly} = false or inactive = false)
      and (
        ${q} = ''
        or razao_social ilike ${"%" + q + "%"}
        or coalesce(nome_fantasia, '') ilike ${"%" + q + "%"}
        or coalesce(cnpj_cpf, '') ilike ${"%" + q + "%"}
        or cast(codigo_omie as text) ilike ${"%" + q + "%"}
      )
    order by coalesce(nullif(trim(nome_fantasia), ''), razao_social) asc
    limit ${limit}
  `;
  return rows.map(toSupplier);
}

export async function countOmieSuppliers(omieAppId?: string) {
  const db = await getDb();
  const appId = omieAppId?.trim() || null;
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count
    from omie_suppliers
    where (${appId}::text is null or omie_app_id = ${appId})
      and inactive = false
  `;
  return rows[0]?.count ?? 0;
}

export async function listProductSupplierCodes(productId: number) {
  const db = await getDb();
  const rows = await db<ProductSupplierCodeRow[]>`
    select
      psc.id,
      psc.product_id,
      psc.supplier_id,
      psc.codigo_fornecedor,
      coalesce(nullif(trim(s.nome_fantasia), ''), s.razao_social) as supplier_name,
      s.codigo_omie as supplier_codigo_omie
    from product_supplier_codes psc
    join omie_suppliers s on s.id = psc.supplier_id
    where psc.product_id = ${productId}
    order by supplier_name asc, psc.codigo_fornecedor asc
  `;
  return rows.map(toProductSupplierCode);
}

export async function listProductSupplierCodesForProducts(productIds: number[]) {
  const db = await getDb();
  const unique = [...new Set(productIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!unique.length) return [] as ProductSupplierCode[];
  const rows = await db<ProductSupplierCodeRow[]>`
    select
      psc.id,
      psc.product_id,
      psc.supplier_id,
      psc.codigo_fornecedor,
      coalesce(nullif(trim(s.nome_fantasia), ''), s.razao_social) as supplier_name,
      s.codigo_omie as supplier_codigo_omie
    from product_supplier_codes psc
    join omie_suppliers s on s.id = psc.supplier_id
    where psc.product_id in ${db(unique)}
    order by psc.product_id asc, supplier_name asc
  `;
  return rows.map(toProductSupplierCode);
}

export async function replaceProductSupplierCodes(
  productId: number,
  links: Array<{ supplierId: number; codigoFornecedor: string }>,
) {
  const db = await getDb();
  const cleaned = links
    .map((link) => ({
      supplierId: Number(link.supplierId),
      codigoFornecedor: String(link.codigoFornecedor ?? "").trim().slice(0, 120),
    }))
    .filter((link) => link.supplierId > 0 && link.codigoFornecedor);

  const seenSuppliers = new Set<number>();
  const seenCodes = new Set<string>();
  for (const link of cleaned) {
    if (seenSuppliers.has(link.supplierId)) {
      throw new Error("Não é possível vincular o mesmo fornecedor duas vezes no produto.");
    }
    const codeKey = link.codigoFornecedor.toLowerCase();
    if (seenCodes.has(codeKey)) {
      throw new Error("Código de fornecedor duplicado neste produto.");
    }
    seenSuppliers.add(link.supplierId);
    seenCodes.add(codeKey);
  }

  await db.begin(async (tx) => {
    await tx`delete from product_supplier_codes where product_id = ${productId}`;
    for (const link of cleaned) {
      await tx`
        insert into product_supplier_codes (product_id, supplier_id, codigo_fornecedor, created_at, updated_at)
        values (${productId}, ${link.supplierId}, ${link.codigoFornecedor}, now(), now())
      `;
    }
  });

  return listProductSupplierCodes(productId);
}

export { supplierDisplayName };
