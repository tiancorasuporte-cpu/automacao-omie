import "@tanstack/react-start/server-only";

import {
  createQuoteRecord,
  deleteQuoteById,
  getQuoteById,
  getQuoteItems,
  markQuoteError,
  markQuoteSent,
  updateQuoteRecord,
  type QuoteItemInput,
} from "@/db/quotes";
import { getSetting } from "@/db/settings";
import {
  formatOmieDate,
  listOmieApps,
  omieCall,
  type OmieAppConfig,
} from "@/server/omie/client";
import { clientDisplayName, normalizeCliente } from "@/server/omie/clients";

export type QuoteLineInput = QuoteItemInput;

function envKey(prefix: string, suffix: string) {
  return `OMIE_${prefix.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_${suffix}`;
}

async function resolveCategoria(app: OmieAppConfig) {
  const fromEnv = (process.env[envKey(app.id, "ORCAMENTO_CATEGORIA")] ?? "").trim();
  if (fromEnv) return fromEnv;
  const fromSettings = ((await getSetting(`orcamento.${app.id}.categoria`)) ?? "").trim();
  if (fromSettings) return fromSettings;
  return ((await getSetting("orcamento.categoria")) ?? "").trim() || "1.01.03";
}

async function resolveContaCorrente(app: OmieAppConfig) {
  const fromEnv = Number(process.env[envKey(app.id, "ORCAMENTO_CONTA_CORRENTE")] ?? 0);
  if (fromEnv > 0) return fromEnv;
  const fromSettings = Number(((await getSetting(`orcamento.${app.id}.conta_corrente`)) ?? "").trim() || 0);
  if (fromSettings > 0) return fromSettings;
  const global = Number(((await getSetting("orcamento.conta_corrente")) ?? "").trim() || 0);
  if (global > 0) return global;

  try {
    const response = await omieCall<{
      ListarContasCorrentes?: Array<Record<string, unknown>>;
      conta_corrente_lista?: Array<Record<string, unknown>>;
    }>(app, "/geral/contacorrente/", "ListarContasCorrentes", {
      pagina: 1,
      registros_por_pagina: 20,
    });
    const rows = response.ListarContasCorrentes ?? response.conta_corrente_lista ?? [];
    for (const row of rows) {
      const inactive = String(row["inativo"] ?? "N").toUpperCase() === "S";
      if (inactive) continue;
      const code = Number(row["nCodCC"] ?? row["codigo_conta_corrente"] ?? 0);
      if (code > 0) return code;
    }
  } catch {
    // sem conta
  }

  return null;
}

export async function searchOmieClients(app: OmieAppConfig, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];

  const attempts = [{ razao_social: q }, { nome_fantasia: q }];

  const out: Array<{ codigo: number; nome: string }> = [];
  const seen = new Set<number>();

  for (const filtro of attempts) {
    try {
      const response = await omieCall<{
        clientes_cadastro?: Record<string, unknown>[];
      }>(app, "/geral/clientes/", "ListarClientes", {
        pagina: 1,
        registros_por_pagina: 20,
        clientesFiltro: filtro,
      });

      for (const raw of response.clientes_cadastro ?? []) {
        const client = normalizeCliente(raw);
        if (!client || seen.has(client.codigo_cliente_omie)) continue;
        seen.add(client.codigo_cliente_omie);
        out.push({
          codigo: client.codigo_cliente_omie,
          nome: clientDisplayName(client) || client.razao_social,
        });
      }
      if (out.length > 0) break;
    } catch {
      // tenta próximo filtro
    }
  }

  return out;
}

function validateItems(items: QuoteLineInput[]) {
  if (!items.length) throw new Error("Inclua ao menos um produto no orçamento.");
  for (const item of items) {
    if (!item.codigoProduto || item.quantidade <= 0 || item.valorUnitario < 0) {
      throw new Error(`Item inválido: ${item.descricao || item.codigoProduto}`);
    }
  }
}

export async function saveLocalOrcamento(input: {
  quoteId?: number | null;
  omieAppId: string;
  clientCode: number;
  clientName?: string | null;
  observacao?: string | null;
  dataPrevisao?: string | null;
  createdBy?: number | null;
  items: QuoteLineInput[];
}) {
  const app = listOmieApps().find((entry) => entry.id === input.omieAppId);
  if (!app) throw new Error("Empresa Omie não configurada.");
  if (!input.clientCode) throw new Error("Selecione o cliente.");
  validateItems(input.items);

  const total = input.items.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
  const payload = {
    omieAppId: app.id,
    omieAppName: app.name,
    clientCode: input.clientCode,
    clientName: input.clientName ?? null,
    dataPrevisao: input.dataPrevisao ?? null,
    observacao: input.observacao ?? null,
    total,
    status: "draft",
    items: input.items.map((item) => ({
      codigoProduto: item.codigoProduto,
      descricao: item.descricao,
      unidade: item.unidade ?? "UN",
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      ncm: item.ncm ?? null,
    })),
  };

  if (input.quoteId && input.quoteId > 0) {
    const updated = await updateQuoteRecord(input.quoteId, payload);
    return { quoteId: updated.quoteId, numeroInterno: updated.numeroInterno, total };
  }

  const created = await createQuoteRecord({
    ...payload,
    createdBy: input.createdBy ?? null,
  });
  return { quoteId: created.quoteId, numeroInterno: created.numeroInterno, total };
}

async function pushQuoteToOmie(quoteId: number) {
  const quote = await getQuoteById(quoteId);
  if (!quote) throw new Error("Orçamento não encontrado.");
  if (quote.status === "sent" && quote.omiePedidoCode) {
    throw new Error("Este orçamento já foi enviado à Omie.");
  }

  const items = await getQuoteItems(quoteId);
  if (!items.length) throw new Error("Orçamento sem itens.");

  const app = listOmieApps().find((entry) => entry.id === quote.omieAppId);
  if (!app) throw new Error("Empresa Omie não configurada.");

  const categoria = await resolveCategoria(app);
  const contaCorrente = await resolveContaCorrente(app);
  if (!contaCorrente) {
    throw new Error(
      "Nenhuma conta corrente encontrada. Configure OMIE_<EMPRESA>_ORCAMENTO_CONTA_CORRENTE no .env.",
    );
  }

  // Códigos só para a API Omie (máx. 30 no item) — sem vínculo com o nº interno nosso.
  const integrationCode = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    20,
  );
  const previsao =
    quote.dataPrevisao && /^\d{4}-\d{2}-\d{2}$/.test(quote.dataPrevisao)
      ? `${quote.dataPrevisao.slice(8, 10)}/${quote.dataPrevisao.slice(5, 7)}/${quote.dataPrevisao.slice(0, 4)}`
      : formatOmieDate(new Date());

  const observacaoOmie = quote.observacao?.trim().slice(0, 500) || "";

  try {
    const payload = {
      cabecalho: {
        codigo_cliente: quote.clientCode,
        codigo_pedido_integracao: integrationCode,
        data_previsao: previsao,
        etapa: "00",
        codigo_parcela: "999",
        quantidade_itens: items.length,
      },
      det: items.map((item, index) => ({
        ide: {
          codigo_item_integracao: `${integrationCode}${index + 1}`.slice(0, 30),
        },
        produto: {
          codigo_produto: item.codigoProduto,
          descricao: item.descricao,
          quantidade: item.quantidade,
          valor_unitario: item.valorUnitario,
          unidade: item.unidade || "UN",
          ...(item.ncm ? { ncm: item.ncm } : {}),
        },
      })),
      frete: {
        modalidade: "9",
      },
      informacoes_adicionais: {
        codigo_categoria: categoria,
        codigo_conta_corrente: contaCorrente,
        consumidor_final: "S",
        enviar_email: "N",
        ...(observacaoOmie ? { dados_adicionais_nf: observacaoOmie } : {}),
      },
    };

    const response = await omieCall<{
      codigo_pedido?: number;
      numero_pedido?: string;
      codigo_pedido_integracao?: string;
    }>(app, "/produtos/pedido/", "IncluirPedido", payload);

    const omiePedidoCode = Number(response.codigo_pedido ?? 0);
    if (!omiePedidoCode) {
      throw new Error("Omie não retornou o código do pedido.");
    }
    const numeroPedido = String(response.numero_pedido ?? "").trim() || null;
    await markQuoteSent(quoteId, {
      omiePedidoCode,
      integrationCode,
      numeroPedido,
    });

    return {
      ok: true as const,
      quoteId,
      numeroInterno: quote.numeroInterno,
      omiePedidoCode,
      numeroPedido,
      integrationCode,
      total: quote.total ?? items.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar orçamento para a Omie.";
    await markQuoteError(quoteId, message);
    throw new Error(message);
  }
}

/** Salva (se necessário) e envia à Omie. */
export async function createOmieOrcamento(input: {
  quoteId?: number | null;
  omieAppId: string;
  clientCode: number;
  clientName?: string | null;
  observacao?: string | null;
  dataPrevisao?: string | null;
  createdBy?: number | null;
  items: QuoteLineInput[];
}) {
  let quoteId = input.quoteId && input.quoteId > 0 ? input.quoteId : null;

  if (quoteId) {
    await saveLocalOrcamento({ ...input, quoteId });
  } else {
    const saved = await saveLocalOrcamento(input);
    quoteId = saved.quoteId;
  }

  return pushQuoteToOmie(quoteId);
}

export async function sendSavedOrcamentoToOmie(quoteId: number) {
  return pushQuoteToOmie(quoteId);
}

export async function excluirOmiePedido(input: {
  omieAppId: string;
  omiePedidoCode?: number | null;
  integrationCode?: string | null;
}) {
  const app = listOmieApps().find((entry) => entry.id === input.omieAppId);
  if (!app) throw new Error("Empresa Omie não configurada.");

  const codigoPedido = Number(input.omiePedidoCode ?? 0);
  const codigoIntegracao = (input.integrationCode ?? "").trim();
  if (!codigoPedido && !codigoIntegracao) {
    throw new Error("Orçamento sem referência na Omie para excluir.");
  }

  await omieCall(app, "/produtos/pedido/", "ExcluirPedido", {
    ...(codigoPedido > 0 ? { codigo_pedido: codigoPedido } : {}),
    ...(codigoIntegracao ? { codigo_pedido_integracao: codigoIntegracao } : {}),
  });

  return { ok: true as const, omiePedidoCode: codigoPedido || null };
}

export async function deleteOrcamento(input: {
  quoteId: number;
  alsoDeleteOmie?: boolean;
}) {
  const quote = await getQuoteById(input.quoteId);
  if (!quote) throw new Error("Orçamento não encontrado.");

  let omieDeleted = false;
  if (input.alsoDeleteOmie) {
    if (!quote.omiePedidoCode && !quote.integrationCode) {
      throw new Error("Este orçamento não tem vínculo na Omie para excluir.");
    }
    await excluirOmiePedido({
      omieAppId: quote.omieAppId,
      omiePedidoCode: quote.omiePedidoCode,
      integrationCode: quote.integrationCode,
    });
    omieDeleted = true;
  }

  const deleted = await deleteQuoteById(input.quoteId);
  return { ...deleted, omieDeleted };
}
