import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { effectiveCmc } from "@/lib/product-pricing";
import { updateLocalProduct, getOmieProductById, getOmieProductsByCodes } from "@/db/products";
import { listProductSupplierCodes } from "@/db/suppliers";
import { updateOsItemStatus } from "@/db/assistencia";

export type CompraOrigem = "manual" | "orcamento" | "os";
export type CompraStatus = "aberta" | "em_cotacao" | "comprada" | "cancelada";

export type CompraFornecedorSnap = {
  supplierId: number;
  supplierName: string;
  codigoFornecedor: string;
};

export type CompraSolicitacao = {
  id: number;
  origem: CompraOrigem;
  status: CompraStatus;
  productId: number | null;
  codigoProduto: number | null;
  descricao: string;
  unidade: string | null;
  qtd: number;
  quoteId: number | null;
  quoteNumero: string | null;
  osId: number | null;
  osItemId: number | null;
  cmcOmie: number | null;
  cmcInterno: number | null;
  cmcEfetivo: number | null;
  fornecedores: CompraFornecedorSnap[];
  motivo: string | null;
  links: string[];
  observacao: string | null;
  solicitadoPor: number | null;
  solicitadoPorNome: string;
  fornecedorNome: string | null;
  fornecedorId: number | null;
  valorCompra: number | null;
  cmcNovo: number | null;
  previsao: string | null;
  notasCompra: string | null;
  compradoPor: number | null;
  compradoPorNome: string | null;
  compradoEm: string | null;
  vistoEm: string | null;
  naoVisto: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OsCompraItem = {
  itemId: number;
  osId: number;
  osNum: string;
  clientName: string;
  stage: number;
  quoteNumero: string | null;
  nome: string;
  qtd: number;
  status: string;
  previsao: string | null;
  productId: number | null;
  cmcEfetivo: number | null;
  fornecedores: CompraFornecedorSnap[];
  updatedAt: string | null;
  compraVistoEm: string | null;
  naoVisto: boolean;
};

function str(v: unknown) {
  return v == null ? "" : String(v);
}
function nullableStr(v: unknown) {
  const s = str(v).trim();
  return s || null;
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function iso(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = str(v);
  return s || null;
}
function dateOnly(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  return s ? s.slice(0, 10) : null;
}

function parseFornecedores(raw: unknown): CompraFornecedorSnap[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        supplierId: num(row?.supplierId ?? row?.supplier_id),
        supplierName: str(row?.supplierName ?? row?.supplier_name),
        codigoFornecedor: str(row?.codigoFornecedor ?? row?.codigo_fornecedor),
      }))
      .filter((row) => row.supplierName || row.codigoFornecedor);
  } catch {
    return [];
  }
}

function parseLinks(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => str(v).trim())
      .filter((v) => /^https?:\/\//i.test(v))
      .slice(0, 10);
  } catch {
    return [];
  }
}

function normalizeLinks(links?: string[] | null) {
  if (!links?.length) return [] as string[];
  return links
    .map((v) => str(v).trim())
    .map((v) => (/^https?:\/\//i.test(v) ? v : v ? `https://${v}` : ""))
    .filter(Boolean)
    .slice(0, 10);
}

function mapSolicitacao(row: Record<string, unknown>): CompraSolicitacao {
  return {
    id: num(row["id"]),
    origem: str(row["origem"]) as CompraOrigem,
    status: str(row["status"]) as CompraStatus,
    productId: row["product_id"] == null ? null : num(row["product_id"]),
    codigoProduto: row["codigo_produto"] == null ? null : num(row["codigo_produto"]),
    descricao: str(row["descricao"]),
    unidade: nullableStr(row["unidade"]),
    qtd: num(row["qtd"]),
    quoteId: row["quote_id"] == null ? null : num(row["quote_id"]),
    quoteNumero: nullableStr(row["quote_numero"]),
    osId: row["os_id"] == null ? null : num(row["os_id"]),
    osItemId: row["os_item_id"] == null ? null : num(row["os_item_id"]),
    cmcOmie: row["cmc_omie"] == null ? null : num(row["cmc_omie"]),
    cmcInterno: row["cmc_interno"] == null ? null : num(row["cmc_interno"]),
    cmcEfetivo: row["cmc_efetivo"] == null ? null : num(row["cmc_efetivo"]),
    fornecedores: parseFornecedores(row["fornecedores_json"]),
    motivo: nullableStr(row["motivo"]),
    links: parseLinks(row["links_json"]),
    observacao: nullableStr(row["observacao"]),
    solicitadoPor: row["solicitado_por"] == null ? null : num(row["solicitado_por"]),
    solicitadoPorNome: str(row["solicitado_por_nome"]),
    fornecedorNome: nullableStr(row["fornecedor_nome"]),
    fornecedorId: row["fornecedor_id"] == null ? null : num(row["fornecedor_id"]),
    valorCompra: row["valor_compra"] == null ? null : num(row["valor_compra"]),
    cmcNovo: row["cmc_novo"] == null ? null : num(row["cmc_novo"]),
    previsao: dateOnly(row["previsao"]),
    notasCompra: nullableStr(row["notas_compra"]),
    compradoPor: row["comprado_por"] == null ? null : num(row["comprado_por"]),
    compradoPorNome: nullableStr(row["comprado_por_nome"]),
    compradoEm: iso(row["comprado_em"]),
    vistoEm: iso(row["visto_em"]),
    naoVisto: !row["visto_em"] && ["aberta", "em_cotacao"].includes(str(row["status"])),
    createdAt: iso(row["created_at"]) ?? "",
    updatedAt: iso(row["updated_at"]) ?? "",
  };
}

async function productSnapshot(input: {
  productId?: number | null;
  omieAppId?: string | null;
  codigoProduto?: number | null;
}) {
  let product =
    input.productId != null ? await getOmieProductById(input.productId) : null;
  if (!product && input.omieAppId && input.codigoProduto) {
    const found = await getOmieProductsByCodes(input.omieAppId, [input.codigoProduto]);
    product = found[0] ?? null;
  }
  if (!product) {
    return {
      productId: null as number | null,
      codigoProduto: input.codigoProduto ?? null,
      descricao: null as string | null,
      unidade: null as string | null,
      cmcOmie: null as number | null,
      cmcInterno: null as number | null,
      cmcEfetivo: null as number | null,
      fornecedores: [] as CompraFornecedorSnap[],
    };
  }
  const links = await listProductSupplierCodes(product.id);
  return {
    productId: product.id,
    codigoProduto: product.codigoProduto,
    descricao: product.descricao,
    unidade: product.unidade,
    cmcOmie: product.cmc,
    cmcInterno: product.cmcInterno,
    cmcEfetivo: product.cmcEfetivo,
    fornecedores: links.map((l) => ({
      supplierId: l.supplierId,
      supplierName: l.supplierName,
      codigoFornecedor: l.codigoFornecedor,
    })),
  };
}

export async function createCompraSolicitacao(input: {
  origem: CompraOrigem;
  descricao?: string;
  unidade?: string | null;
  qtd: number;
  productId?: number | null;
  omieAppId?: string | null;
  codigoProduto?: number | null;
  quoteId?: number | null;
  quoteNumero?: string | null;
  osId?: number | null;
  osItemId?: number | null;
  motivo?: string | null;
  links?: string[] | null;
  observacao?: string | null;
  solicitadoPor: number | null;
  solicitadoPorNome: string;
}) {
  const snap = await productSnapshot({
    productId: input.productId ?? null,
    omieAppId: input.omieAppId ?? null,
    codigoProduto: input.codigoProduto ?? null,
  });
  const descricao = (input.descricao?.trim() || snap.descricao || "").trim();
  if (!descricao) throw new Error("Informe o produto / descrição.");
  if (!(input.qtd > 0)) throw new Error("Quantidade inválida.");
  const motivo = nullableStr(input.motivo);
  if (input.origem === "manual" && !motivo) {
    throw new Error("Informe o motivo da solicitação.");
  }
  const links = normalizeLinks(input.links);

  const db = await getDb();
  const [row] = (await db`
    insert into compras_solicitacoes (
      origem, status, product_id, codigo_produto, descricao, unidade, qtd,
      quote_id, quote_numero, os_id, os_item_id,
      cmc_omie, cmc_interno, cmc_efetivo, fornecedores_json,
      motivo, links_json, observacao, solicitado_por, solicitado_por_nome
    ) values (
      ${input.origem},
      'aberta',
      ${snap.productId},
      ${snap.codigoProduto},
      ${descricao},
      ${input.unidade ?? snap.unidade ?? null},
      ${input.qtd},
      ${input.quoteId ?? null},
      ${nullableStr(input.quoteNumero)},
      ${input.osId ?? null},
      ${input.osItemId ?? null},
      ${snap.cmcOmie},
      ${snap.cmcInterno},
      ${snap.cmcEfetivo},
      ${JSON.stringify(snap.fornecedores)},
      ${motivo},
      ${links.length ? JSON.stringify(links) : null},
      ${nullableStr(input.observacao)},
      ${input.solicitadoPor},
      ${input.solicitadoPorNome.trim() || "Usuário"}
    )
    returning *
  `) as Record<string, unknown>[];
  if (!row) throw new Error("Falha ao criar solicitação.");
  return mapSolicitacao(row);
}

export async function listCompraSolicitacoesForQuote(input: {
  quoteId?: number | null;
  quoteNumero?: string | null;
  limit?: number;
}) {
  const quoteId = input.quoteId ?? null;
  const quoteNumero = input.quoteNumero?.trim() || null;
  if (!quoteId && !quoteNumero) return [] as CompraSolicitacao[];
  const db = await getDb();
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
  const rows = (await db`
    select *
    from compras_solicitacoes
    where origem = 'orcamento'
      and (
        (${quoteId}::int is not null and quote_id = ${quoteId})
        or (${quoteNumero}::text is not null and quote_numero = ${quoteNumero})
      )
    order by created_at desc, id desc
    limit ${limit}
  `) as Record<string, unknown>[];
  return rows.map(mapSolicitacao);
}

export async function listCompraSolicitacoes(input?: {
  status?: CompraStatus[] | null;
  solicitadoPor?: number | null;
  limit?: number;
}) {
  const db = await getDb();
  const statuses = input?.status?.length ? input.status : null;
  const solicitadoPor = input?.solicitadoPor ?? null;
  const limit = Math.min(Math.max(input?.limit ?? 200, 1), 500);
  const rows = (
    statuses
      ? await db`
          select *
          from compras_solicitacoes
          where status in ${db(statuses)}
            and (${solicitadoPor}::int is null or solicitado_por = ${solicitadoPor})
          order by
            case when visto_em is null then 0 else 1 end,
            case status
              when 'aberta' then 0
              when 'em_cotacao' then 1
              when 'comprada' then 2
              else 3
            end,
            created_at desc
          limit ${limit}
        `
      : await db`
          select *
          from compras_solicitacoes
          where (${solicitadoPor}::int is null or solicitado_por = ${solicitadoPor})
          order by
            case when visto_em is null then 0 else 1 end,
            created_at desc
          limit ${limit}
        `
  ) as Record<string, unknown>[];
  return rows.map(mapSolicitacao);
}

export async function getCompraSolicitacao(id: number) {
  const db = await getDb();
  const [row] = (await db`
    select * from compras_solicitacoes where id = ${id} limit 1
  `) as Record<string, unknown>[];
  return row ? mapSolicitacao(row) : null;
}

export async function setCompraSolicitacaoStatus(input: {
  id: number;
  status: CompraStatus;
}) {
  const db = await getDb();
  const [row] = (await db`
    update compras_solicitacoes
    set status = ${input.status}, updated_at = now()
    where id = ${input.id}
    returning *
  `) as Record<string, unknown>[];
  return row ? mapSolicitacao(row) : null;
}

export async function concluirCompraSolicitacao(input: {
  id: number;
  fornecedorNome?: string | null;
  fornecedorId?: number | null;
  valorCompra?: number | null;
  cmcNovo?: number | null;
  previsao?: string | null;
  notasCompra?: string | null;
  updateCmcInterno?: boolean;
  compradoPor: number | null;
  compradoPorNome: string;
}) {
  const current = await getCompraSolicitacao(input.id);
  if (!current) throw new Error("Solicitação não encontrada.");
  if (current.status === "comprada") throw new Error("Solicitação já concluída.");
  if (current.status === "cancelada") throw new Error("Solicitação cancelada.");

  const cmcNovo =
    input.cmcNovo != null && Number.isFinite(input.cmcNovo) ? input.cmcNovo : input.valorCompra ?? null;

  if (input.updateCmcInterno !== false && current.productId != null && cmcNovo != null) {
    const product = await getOmieProductById(current.productId);
    if (product) {
      await updateLocalProduct({
        id: product.id,
        cmcInterno: cmcNovo,
        markup: product.markup,
        valorUnitario: product.valorUnitario,
      });
    }
  }

  const db = await getDb();
  const [row] = (await db`
    update compras_solicitacoes
    set status = 'comprada',
        fornecedor_nome = ${nullableStr(input.fornecedorNome)},
        fornecedor_id = ${input.fornecedorId ?? null},
        valor_compra = ${input.valorCompra ?? null},
        cmc_novo = ${cmcNovo},
        previsao = ${input.previsao ?? null},
        notas_compra = ${nullableStr(input.notasCompra)},
        comprado_por = ${input.compradoPor},
        comprado_por_nome = ${input.compradoPorNome.trim() || "Comprador"},
        comprado_em = now(),
        updated_at = now()
    where id = ${input.id}
    returning *
  `) as Record<string, unknown>[];
  return row ? mapSolicitacao(row) : null;
}

export async function listOsCompraQueue() {
  const db = await getDb();
  const rows = (await db`
    select
      i.id as item_id,
      i.os_id,
      i.qtd,
      i.nome,
      i.status,
      i.previsao,
      i.product_id,
      i.updated_at as item_updated_at,
      i.compra_visto_em,
      o.num as os_num,
      o.client_name,
      o.stage,
      o.quote_numero,
      p.cmc,
      p.cmc_interno
    from assist_os_items i
    join assist_os o on o.id = i.os_id
    left join omie_products p on p.id = i.product_id
    where i.status in ('comprar', 'comprado')
      and o.stage in (1, 2)
    order by
      case i.status when 'comprar' then 0 else 1 end,
      case when i.status = 'comprar' and i.compra_visto_em is null then 0 else 1 end,
      lower(i.nome) asc,
      o.num asc,
      i.id asc
  `) as Record<string, unknown>[];

  const out: OsCompraItem[] = [];
  for (const row of rows) {
    const productId = row["product_id"] == null ? null : num(row["product_id"]);
    const status = str(row["status"]);
    const compraVistoEm = iso(row["compra_visto_em"]);
    const fornecedores = productId
      ? (await listProductSupplierCodes(productId)).map((l) => ({
          supplierId: l.supplierId,
          supplierName: l.supplierName,
          codigoFornecedor: l.codigoFornecedor,
        }))
      : [];
    out.push({
      itemId: num(row["item_id"]),
      osId: num(row["os_id"]),
      osNum: str(row["os_num"]),
      clientName: str(row["client_name"]),
      stage: num(row["stage"]),
      quoteNumero: nullableStr(row["quote_numero"]),
      nome: str(row["nome"]),
      qtd: num(row["qtd"]),
      status,
      previsao: dateOnly(row["previsao"]),
      productId,
      cmcEfetivo: effectiveCmc(
        row["cmc"] == null ? null : num(row["cmc"]),
        row["cmc_interno"] == null ? null : num(row["cmc_interno"]),
      ),
      fornecedores,
      updatedAt: iso(row["item_updated_at"]),
      compraVistoEm,
      naoVisto: status === "comprar" && !compraVistoEm,
    });
  }
  return out;
}

export type ComprasUnreadSummary = {
  cotacoes: number;
  kanban: number;
  total: number;
};

export async function getComprasUnreadSummary(): Promise<ComprasUnreadSummary> {
  const db = await getDb();
  const [cotRows, kanbanRows] = await Promise.all([
    db`
      select count(*)::int as total
      from compras_solicitacoes
      where status in ('aberta', 'em_cotacao')
        and visto_em is null
    ` as Promise<Array<{ total: number }>>,
    db`
      select count(*)::int as total
      from assist_os_items i
      join assist_os o on o.id = i.os_id
      where i.status = 'comprar'
        and i.compra_visto_em is null
        and o.stage in (1, 2)
    ` as Promise<Array<{ total: number }>>,
  ]);
  const cotacoes = Number(cotRows[0]?.total ?? 0);
  const kanban = Number(kanbanRows[0]?.total ?? 0);
  return { cotacoes, kanban, total: cotacoes + kanban };
}

export async function markComprasAsSeen(input?: {
  cotacoes?: boolean;
  kanban?: boolean;
}): Promise<ComprasUnreadSummary> {
  const hasExplicit = input?.cotacoes != null || input?.kanban != null;
  const markCotacoes = hasExplicit ? Boolean(input?.cotacoes) : true;
  const markKanban = hasExplicit ? Boolean(input?.kanban) : true;
  const db = await getDb();
  if (markCotacoes) {
    await db`
      update compras_solicitacoes
      set visto_em = now(), updated_at = now()
      where status in ('aberta', 'em_cotacao')
        and visto_em is null
    `;
  }
  if (markKanban) {
    await db`
      update assist_os_items i
      set compra_visto_em = now(), updated_at = now()
      from assist_os o
      where o.id = i.os_id
        and i.status = 'comprar'
        and i.compra_visto_em is null
        and o.stage in (1, 2)
    `;
  }
  return getComprasUnreadSummary();
}

export async function markOsItemComprado(input: {
  itemId: number;
  previsao?: string | null;
  quem: string;
  userId?: number | null;
}) {
  return updateOsItemStatus({
    itemId: input.itemId,
    status: "comprado",
    previsao: input.previsao ?? new Date().toISOString().slice(0, 10),
    quem: input.quem,
    userId: input.userId,
  });
}
