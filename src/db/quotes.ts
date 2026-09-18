import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type QuoteItemInput = {
  codigoProduto: number;
  descricao: string;
  unidade?: string | null;
  quantidade: number;
  valorUnitario: number;
  ncm?: string | null;
};

export type Quote = {
  id: number;
  omieAppId: string;
  omieAppName: string;
  clientCode: number;
  clientName: string | null;
  numeroInterno: string;
  omiePedidoCode: number | null;
  integrationCode: string | null;
  numeroPedido: string | null;
  etapa: string;
  dataPrevisao: string | null;
  observacao: string | null;
  total: number | null;
  status: string;
  error: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteItem = {
  id: number;
  quoteId: number;
  codigoProduto: number;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number;
  ncm: string | null;
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapQuote(r: Record<string, unknown>): Quote {
  return {
    id: toNumber(r["id"]),
    omieAppId: String(r["omie_app_id"] ?? ""),
    omieAppName: String(r["omie_app_name"] ?? ""),
    clientCode: toNumber(r["client_code"]),
    clientName: r["client_name"] == null ? null : String(r["client_name"]),
    numeroInterno: String(r["numero_interno"] ?? ""),
    omiePedidoCode: r["omie_pedido_code"] == null ? null : toNumber(r["omie_pedido_code"]),
    integrationCode: r["integration_code"] == null ? null : String(r["integration_code"]),
    numeroPedido: r["numero_pedido"] == null ? null : String(r["numero_pedido"]),
    etapa: String(r["etapa"] ?? "00"),
    dataPrevisao: r["data_previsao"] == null ? null : String(r["data_previsao"]),
    observacao: r["observacao"] == null ? null : String(r["observacao"]),
    total: r["total"] == null ? null : toNumber(r["total"]),
    status: String(r["status"] ?? "draft"),
    error: r["error"] == null ? null : String(r["error"]),
    createdBy: r["created_by"] == null ? null : toNumber(r["created_by"]),
    createdByName: r["created_by_name"] == null ? null : String(r["created_by_name"]),
    createdAt: String(r["created_at"] ?? ""),
    updatedAt: String(r["updated_at"] ?? ""),
  };
}

export async function nextNumeroInterno(): Promise<string> {
  const db = await getDb();
  const year = new Date().getFullYear();
  const prefix = `ORC-${year}-`;
  const rows = (await db`
    select numero_interno
    from quotes
    where numero_interno like ${`${prefix}%`}
    order by id desc
    limit 1
  `) as Array<{ numero_interno: string }>;

  let seq = 1;
  const last = rows[0]?.numero_interno;
  if (last) {
    const part = last.slice(prefix.length);
    const n = Number.parseInt(part, 10);
    if (Number.isFinite(n) && n >= 1) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

export async function createQuoteRecord(input: {
  omieAppId: string;
  omieAppName: string;
  clientCode: number;
  clientName?: string | null;
  numeroInterno?: string;
  dataPrevisao?: string | null;
  observacao?: string | null;
  total: number;
  status?: string;
  createdBy?: number | null;
  items: QuoteItemInput[];
}) {
  const db = await getDb();
  const numeroInterno = input.numeroInterno?.trim() || (await nextNumeroInterno());
  const rows = (await db`
    insert into quotes (
      omie_app_id, omie_app_name, client_code, client_name,
      numero_interno, data_previsao, observacao, total, status, created_by, updated_at
    ) values (
      ${input.omieAppId}, ${input.omieAppName}, ${input.clientCode}, ${input.clientName ?? null},
      ${numeroInterno}, ${input.dataPrevisao ?? null}, ${input.observacao ?? null},
      ${input.total}, ${input.status ?? "draft"}, ${input.createdBy ?? null}, now()
    )
    returning id, numero_interno
  `) as Array<{ id: number; numero_interno: string }>;
  const quoteId = Number(rows[0]?.id);
  const savedNumero = String(rows[0]?.numero_interno ?? numeroInterno);
  if (!Number.isFinite(quoteId) || quoteId <= 0) {
    throw new Error("Não foi possível salvar o orçamento.");
  }

  for (const item of input.items) {
    await db`
      insert into quote_items (
        quote_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, ncm
      ) values (
        ${quoteId}, ${item.codigoProduto}, ${item.descricao}, ${item.unidade ?? null},
        ${item.quantidade}, ${item.valorUnitario}, ${item.ncm ?? null}
      )
    `;
  }

  return { quoteId, numeroInterno: savedNumero };
}

export async function replaceQuoteItems(quoteId: number, items: QuoteItemInput[]) {
  const db = await getDb();
  await db`delete from quote_items where quote_id = ${quoteId}`;
  for (const item of items) {
    await db`
      insert into quote_items (
        quote_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, ncm
      ) values (
        ${quoteId}, ${item.codigoProduto}, ${item.descricao}, ${item.unidade ?? null},
        ${item.quantidade}, ${item.valorUnitario}, ${item.ncm ?? null}
      )
    `;
  }
}

export async function updateQuoteRecord(
  quoteId: number,
  input: {
    omieAppId: string;
    omieAppName: string;
    clientCode: number;
    clientName?: string | null;
    dataPrevisao?: string | null;
    observacao?: string | null;
    total: number;
    status?: string;
    items: QuoteItemInput[];
  },
) {
  const existing = await getQuoteById(quoteId);
  if (!existing) throw new Error("Orçamento não encontrado.");
  if (existing.status === "sent" && existing.omiePedidoCode) {
    throw new Error("Orçamento já enviado à Omie. Crie um novo para alterar.");
  }

  const db = await getDb();
  const nextStatus =
    input.status ?? (existing.status === "error" ? "draft" : existing.status === "sending" ? "draft" : existing.status);

  await db`
    update quotes
    set
      omie_app_id = ${input.omieAppId},
      omie_app_name = ${input.omieAppName},
      client_code = ${input.clientCode},
      client_name = ${input.clientName ?? null},
      data_previsao = ${input.dataPrevisao ?? null},
      observacao = ${input.observacao ?? null},
      total = ${input.total},
      status = ${nextStatus},
      error = null,
      updated_at = now()
    where id = ${quoteId}
  `;
  await replaceQuoteItems(quoteId, input.items);
  return { quoteId, numeroInterno: existing.numeroInterno };
}

export async function markQuoteSent(
  quoteId: number,
  data: {
    omiePedidoCode: number;
    integrationCode: string;
    numeroPedido?: string | null;
  },
) {
  const db = await getDb();
  await db`
    update quotes
    set
      omie_pedido_code = ${data.omiePedidoCode},
      integration_code = ${data.integrationCode},
      numero_pedido = ${data.numeroPedido ?? null},
      status = 'sent',
      error = null,
      updated_at = now()
    where id = ${quoteId}
  `;
}

export async function markQuoteError(quoteId: number, error: string) {
  const db = await getDb();
  await db`
    update quotes
    set status = 'error', error = ${error}, updated_at = now()
    where id = ${quoteId}
  `;
}

export async function deleteQuoteById(quoteId: number) {
  const existing = await getQuoteById(quoteId);
  if (!existing) throw new Error("Orçamento não encontrado.");
  const db = await getDb();
  await db`delete from quotes where id = ${quoteId}`;
  return { quoteId, numeroInterno: existing.numeroInterno };
}

export async function listQuotes(limit = 50, omieAppId?: string): Promise<Quote[]> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const appId = omieAppId?.trim() || null;
  const rows = (await db`
    select
      q.id, q.omie_app_id, q.omie_app_name, q.client_code, q.client_name,
      q.numero_interno, q.omie_pedido_code, q.integration_code, q.numero_pedido,
      q.etapa, q.data_previsao::text as data_previsao, q.observacao, q.total::text as total,
      q.status, q.error, q.created_by,
      coalesce(nullif(trim(u.name), ''), u.username) as created_by_name,
      q.created_at::text as created_at,
      coalesce(q.updated_at::text, q.created_at::text) as updated_at
    from quotes q
    left join users u on u.id = q.created_by
    where (${appId}::text is null or q.omie_app_id = ${appId})
    order by q.id desc
    limit ${safeLimit}
  `) as Array<Record<string, unknown>>;

  return rows.map(mapQuote);
}

export async function getQuoteById(quoteId: number): Promise<Quote | null> {
  const db = await getDb();
  const rows = (await db`
    select
      q.id, q.omie_app_id, q.omie_app_name, q.client_code, q.client_name,
      q.numero_interno, q.omie_pedido_code, q.integration_code, q.numero_pedido,
      q.etapa, q.data_previsao::text as data_previsao, q.observacao, q.total::text as total,
      q.status, q.error, q.created_by,
      coalesce(nullif(trim(u.name), ''), u.username) as created_by_name,
      q.created_at::text as created_at,
      coalesce(q.updated_at::text, q.created_at::text) as updated_at
    from quotes q
    left join users u on u.id = q.created_by
    where q.id = ${quoteId}
    limit 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  return r ? mapQuote(r) : null;
}

export async function getQuoteItems(quoteId: number): Promise<QuoteItem[]> {
  const db = await getDb();
  const rows = (await db`
    select
      id, quote_id, codigo_produto, descricao, unidade,
      quantidade::text as quantidade, valor_unitario::text as valor_unitario, ncm
    from quote_items
    where quote_id = ${quoteId}
    order by id asc
  `) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: toNumber(r["id"]),
    quoteId: toNumber(r["quote_id"]),
    codigoProduto: toNumber(r["codigo_produto"]),
    descricao: String(r["descricao"] ?? ""),
    unidade: r["unidade"] == null ? null : String(r["unidade"]),
    quantidade: toNumber(r["quantidade"]),
    valorUnitario: toNumber(r["valor_unitario"]),
    ncm: r["ncm"] == null ? null : String(r["ncm"]),
  }));
}
