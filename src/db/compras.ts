import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { effectiveCmc } from "@/lib/product-pricing";
import { updateLocalProduct, getOmieProductById, getOmieProductsByCodes } from "@/db/products";
import { listProductSupplierCodes } from "@/db/suppliers";
import { updateOsItemStatus } from "@/db/assistencia";

export type CompraOrigem = "manual" | "orcamento" | "os";
export type CompraStatus =
  | "aberta"
  | "em_cotacao"
  | "comprada"
  | "finalizado"
  | "cancelada";

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
    naoVisto:
      !row["visto_em"] &&
      ["aberta", "em_cotacao", "comprada"].includes(str(row["status"])),
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

/** Cria (ou reutiliza) solicitação de compra para item OS marcado como comprar. */
export async function ensureOsCompraSolicitacao(input: {
  osItemId: number;
  solicitadoPor?: number | null;
  solicitadoPorNome?: string;
}) {
  const db = await getDb();
  const existing = (await db`
    select *
    from compras_solicitacoes
    where os_item_id = ${input.osItemId}
      and status in ('aberta', 'em_cotacao')
    order by id desc
    limit 1
  `) as Record<string, unknown>[];
  if (existing[0]) return mapSolicitacao(existing[0]);

  const rows = (await db`
    select
      i.id as item_id,
      i.os_id,
      i.qtd,
      i.nome,
      i.product_id,
      o.num as os_num,
      o.quote_id,
      o.quote_numero,
      o.client_name
    from assist_os_items i
    join assist_os o on o.id = i.os_id
    where i.id = ${input.osItemId}
    limit 1
  `) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) throw new Error("Item da OS não encontrado.");

  const osNum = str(row["os_num"]);
  const clientName = nullableStr(row["client_name"]);
  return createCompraSolicitacao({
    origem: "os",
    descricao: str(row["nome"]),
    qtd: num(row["qtd"]) || 1,
    productId: row["product_id"] == null ? null : num(row["product_id"]),
    quoteId: row["quote_id"] == null ? null : num(row["quote_id"]),
    quoteNumero: nullableStr(row["quote_numero"]),
    osId: num(row["os_id"]),
    osItemId: num(row["item_id"]),
    motivo: `Compra da OS ${osNum}${clientName ? ` · ${clientName}` : ""}`,
    solicitadoPor: input.solicitadoPor ?? null,
    solicitadoPorNome: input.solicitadoPorNome?.trim() || "Assistência",
  });
}

/** Garante solicitação para todo item OS ainda em 'comprar' sem pedido aberto. */
export async function backfillOsCompraSolicitacoes(input?: {
  solicitadoPor?: number | null;
  solicitadoPorNome?: string;
}) {
  const db = await getDb();
  const missing = (await db`
    select i.id
    from assist_os_items i
    join assist_os o on o.id = i.os_id
    where i.status = 'comprar'
      and o.stage in (1, 2)
      and not exists (
        select 1
        from compras_solicitacoes s
        where s.os_item_id = i.id
          and s.status in ('aberta', 'em_cotacao')
      )
    order by i.id asc
    limit 200
  `) as Array<{ id: number }>;
  const created: CompraSolicitacao[] = [];
  for (const row of missing) {
    try {
      created.push(
        await ensureOsCompraSolicitacao({
          osItemId: num(row.id),
          solicitadoPor: input?.solicitadoPor ?? null,
          solicitadoPorNome: input?.solicitadoPorNome,
        }),
      );
    } catch {
      // best-effort
    }
  }
  return created;
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
              when 'finalizado' then 3
              else 4
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

export type CotacaoProposta = {
  id: number;
  solicitacaoId: number;
  supplierId: number | null;
  supplierName: string;
  valorUnitario: number;
  previsao: string | null;
  observacao: string | null;
  createdBy: number | null;
  createdByName: string;
  createdAt: string;
};

function mapProposta(row: Record<string, unknown>): CotacaoProposta {
  return {
    id: num(row["id"]),
    solicitacaoId: num(row["solicitacao_id"]),
    supplierId: row["supplier_id"] == null ? null : num(row["supplier_id"]),
    supplierName: str(row["supplier_name"]),
    valorUnitario: num(row["valor_unitario"]),
    previsao: dateOnly(row["previsao"]),
    observacao: nullableStr(row["observacao"]),
    createdBy: row["created_by"] == null ? null : num(row["created_by"]),
    createdByName: str(row["created_by_name"]),
    createdAt: iso(row["created_at"]) ?? "",
  };
}

export async function listCotacaoPropostas(solicitacaoId: number) {
  const db = await getDb();
  const rows = (await db`
    select *
    from compras_cotacao_propostas
    where solicitacao_id = ${solicitacaoId}
    order by created_at asc, id asc
  `) as Record<string, unknown>[];
  return rows.map(mapProposta);
}

export async function listCotacaoPropostasForSolicitacoes(solicitacaoIds: number[]) {
  const ids = [...new Set(solicitacaoIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return [] as CotacaoProposta[];
  const db = await getDb();
  const rows = (await db`
    select *
    from compras_cotacao_propostas
    where solicitacao_id in ${db(ids)}
    order by created_at asc, id asc
  `) as Record<string, unknown>[];
  return rows.map(mapProposta);
}

export async function getCotacaoProposta(id: number) {
  const db = await getDb();
  const [row] = (await db`
    select * from compras_cotacao_propostas where id = ${id} limit 1
  `) as Record<string, unknown>[];
  return row ? mapProposta(row) : null;
}

export async function saveCotacaoProposta(input: {
  id?: number | null;
  solicitacaoId: number;
  supplierId?: number | null;
  supplierName: string;
  valorUnitario: number;
  previsao?: string | null;
  observacao?: string | null;
  createdBy: number | null;
  createdByName: string;
}) {
  const solicitacao = await getCompraSolicitacao(input.solicitacaoId);
  if (!solicitacao) throw new Error("Solicitação não encontrada.");
  if (solicitacao.status === "comprada" || solicitacao.status === "finalizado") {
    throw new Error("Solicitação já concluída.");
  }
  if (solicitacao.status === "cancelada") {
    throw new Error("Solicitação cancelada.");
  }
  const supplierName = input.supplierName.trim().slice(0, 200);
  if (!supplierName) throw new Error("Informe o fornecedor.");
  if (!(input.valorUnitario >= 0) || !Number.isFinite(input.valorUnitario)) {
    throw new Error("Valor unitário inválido.");
  }
  const previsao = nullableStr(input.previsao)?.slice(0, 10) ?? null;
  const observacao = nullableStr(input.observacao);
  const supplierId =
    input.supplierId != null && Number.isFinite(input.supplierId) && input.supplierId > 0
      ? Number(input.supplierId)
      : null;
  const db = await getDb();

  if (input.id != null && input.id > 0) {
    const [row] = (await db`
      update compras_cotacao_propostas
      set supplier_id = ${supplierId},
          supplier_name = ${supplierName},
          valor_unitario = ${input.valorUnitario},
          previsao = ${previsao},
          observacao = ${observacao}
      where id = ${input.id} and solicitacao_id = ${input.solicitacaoId}
      returning *
    `) as Record<string, unknown>[];
    if (!row) throw new Error("Proposta não encontrada.");
    return mapProposta(row);
  }

  const [row] = (await db`
    insert into compras_cotacao_propostas (
      solicitacao_id, supplier_id, supplier_name, valor_unitario, previsao, observacao,
      created_by, created_by_name
    ) values (
      ${input.solicitacaoId},
      ${supplierId},
      ${supplierName},
      ${input.valorUnitario},
      ${previsao},
      ${observacao},
      ${input.createdBy},
      ${input.createdByName.trim() || "Comprador"}
    )
    returning *
  `) as Record<string, unknown>[];
  if (!row) throw new Error("Falha ao salvar proposta.");

  if (solicitacao.status === "aberta") {
    await setCompraSolicitacaoStatus({ id: input.solicitacaoId, status: "em_cotacao" });
  }
  return mapProposta(row);
}

export async function deleteCotacaoProposta(input: { id: number; solicitacaoId?: number }) {
  const db = await getDb();
  const existing = await getCotacaoProposta(input.id);
  if (!existing) throw new Error("Proposta não encontrada.");
  if (input.solicitacaoId != null && existing.solicitacaoId !== input.solicitacaoId) {
    throw new Error("Proposta não pertence a esta solicitação.");
  }
  const solicitacao = await getCompraSolicitacao(existing.solicitacaoId);
  if (solicitacao?.status === "comprada" || solicitacao?.status === "finalizado") {
    throw new Error("Não é possível excluir proposta de compra já concluída.");
  }
  await db`delete from compras_cotacao_propostas where id = ${input.id}`;
  return true;
}

export async function concluirCompraSolicitacao(input: {
  id: number;
  propostaId?: number | null;
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
  if (current.status === "comprada" || current.status === "finalizado") {
    throw new Error("Solicitação já concluída.");
  }
  if (current.status === "cancelada") throw new Error("Solicitação cancelada.");

  let fornecedorNome = input.fornecedorNome ?? null;
  let fornecedorId = input.fornecedorId ?? null;
  let valorCompra = input.valorCompra ?? null;
  let previsao = input.previsao ?? null;
  let notasCompra = input.notasCompra ?? null;

  if (input.propostaId != null && input.propostaId > 0) {
    const proposta = await getCotacaoProposta(input.propostaId);
    if (!proposta || proposta.solicitacaoId !== current.id) {
      throw new Error("Cotação selecionada inválida.");
    }
    fornecedorNome = proposta.supplierName;
    fornecedorId = proposta.supplierId;
    valorCompra = proposta.valorUnitario;
    if (proposta.previsao) previsao = proposta.previsao;
    if (proposta.observacao) {
      notasCompra = notasCompra
        ? `${notasCompra}\n${proposta.observacao}`
        : proposta.observacao;
    }
  }

  const cmcNovo =
    input.cmcNovo != null && Number.isFinite(input.cmcNovo) ? input.cmcNovo : valorCompra ?? null;

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
        fornecedor_nome = ${nullableStr(fornecedorNome)},
        fornecedor_id = ${fornecedorId},
        valor_compra = ${valorCompra},
        cmc_novo = ${cmcNovo},
        previsao = ${previsao},
        notas_compra = ${nullableStr(notasCompra)},
        comprado_por = ${input.compradoPor},
        comprado_por_nome = ${input.compradoPorNome.trim() || "Comprador"},
        comprado_em = now(),
        updated_at = now()
    where id = ${input.id}
    returning *
  `) as Record<string, unknown>[];
  const result = row ? mapSolicitacao(row) : null;
  if (result?.osItemId) {
    try {
      await markOsItemComprado({
        itemId: result.osItemId,
        previsao: result.previsao,
        quem: input.compradoPorNome,
        userId: input.compradoPor,
      });
    } catch {
      // Compra já gravada; sync do Quadro de O.S é best-effort.
    }
  }
  return result;
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
  const cotRows = (await db`
    select count(*)::int as total
    from compras_solicitacoes
    where status in ('aberta', 'em_cotacao')
      and visto_em is null
  `) as Array<{ total: number }>;
  const open = Number(cotRows[0]?.total ?? 0);
  // Quadro unificado: badge do Quadro usa `kanban`; `cotacoes` permanece por compat.
  return { cotacoes: open, kanban: open, total: open };
}

export async function markComprasAsSeen(input?: {
  cotacoes?: boolean;
  kanban?: boolean;
}): Promise<ComprasUnreadSummary> {
  const hasExplicit = input?.cotacoes != null || input?.kanban != null;
  const markQuadro = hasExplicit
    ? Boolean(input?.cotacoes) || Boolean(input?.kanban)
    : true;
  const db = await getDb();
  if (markQuadro) {
    await db`
      update compras_solicitacoes
      set visto_em = now(), updated_at = now()
      where status in ('aberta', 'em_cotacao')
        and visto_em is null
    `;
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
